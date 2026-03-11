"use client";

import { useEffect, useRef, useState } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import AuthModal from "@/components/AuthModal";
import MinimalLayout from "@/components/MinimalLayout";
import {
  ApiError,
  createGeneration,
  getGenerationStatus,
  getPortfolioThemes,
  improveResume,
  listGenerations,
  makeIdempotencyKey,
  resolvePublicPortfolio,
  retryGeneration,
  uploadResume,
} from "@/lib/api";
import { auth } from "@/lib/firebase";
import { focusRing } from "@/lib/ui";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90000;
const DEFAULT_COLOR = "#2563eb";

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const ACCEPTED_EXT = new Set(["pdf", "docx", "txt"]);

// ─── Helper: get a fresh Firebase token (or undefined for anon) ───────────

async function getFreshToken() {
  if (!auth.currentUser) return undefined;
  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return undefined;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const fileInputRef = useRef(null);

  // Auth
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // UI stages: "upload" | "improving" | "review" | "generating" | "results"
  const [stage, setStage] = useState("upload");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAuthNudge, setShowAuthNudge] = useState(false);

  // File processing
  const [pendingFile, setPendingFile] = useState(null);
  const [resumeUploadId, setResumeUploadId] = useState(null);
  const [improvedHtml, setImprovedHtml] = useState("");
  const [editedHtml, setEditedHtml] = useState("");
  const [editMode, setEditMode] = useState(false);

  // Themes
  const [themeOptions, setThemeOptions] = useState([]);
  const [theme, setTheme] = useState("minimal-clean");

  // Generation result
  const [generation, setGeneration] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [resolvingSlug, setResolvingSlug] = useState("");

  // History
  const [historyItems, setHistoryItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isAuthenticated = !!user;

  // ── Firebase auth listener ────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
      if (!firebaseUser) {
        setHistoryItems([]);
        setNextCursor(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // ── Load history when authenticated ──────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !authReady) return;
    void loadHistory({ setHistoryItems, setNextCursor, setHistoryLoading });
  }, [isAuthenticated, authReady]);

  // ── Fetch themes on mount ─────────────────────────────────────────────────

  useEffect(() => {
    const controller = new AbortController();
    getPortfolioThemes(controller.signal)
      .then(({ payload }) => {
        const themes = Array.isArray(payload?.themes) ? payload.themes : [];
        setThemeOptions(themes);
        if (themes.length && !themes.some((t) => t.id === theme)) {
          setTheme(themes[0].id);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep editedHtml in sync when improved HTML arrives ───────────────────

  useEffect(() => {
    setEditedHtml(improvedHtml);
    setEditMode(false);
  }, [improvedHtml]);

  // ─── File handling ─────────────────────────────────────────────────────────

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) void handleFileSelected(file);
    event.target.value = "";
  };

  const handleFileSelected = (file) => {
    setErrorMessage("");

    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage("File size exceeds 10 MB.");
      return;
    }
    if (!isFileSupported(file)) {
      setErrorMessage("Only PDF, DOCX, or TXT files are supported.");
      return;
    }

    // Show skippable auth nudge if not signed in
    if (!isAuthenticated) {
      setPendingFile(file);
      setShowAuthNudge(true);
      return;
    }

    void processFile(file);
  };

  const handleAuthNudgeDone = () => {
    setShowAuthNudge(false);
    if (pendingFile) {
      const file = pendingFile;
      setPendingFile(null);
      void processFile(file);
    }
  };

  // ─── Core processing steps ────────────────────────────────────────────────

  const processFile = async (file) => {
    setStage("improving");
    setStatusMessage("Uploading resume...");
    setGeneration(null);
    setImprovedHtml("");
    setResumeUploadId(null);
    setErrorMessage("");

    try {
      const tok = await getFreshToken();

      // Step 1 — Upload
      const { payload: uploadPayload } = await uploadResume({ file, token: tok });
      const uploadId = uploadPayload.resumeUploadId;
      setResumeUploadId(uploadId);

      // Step 2 — Improve
      setStatusMessage("Improving your resume with AI...");
      const { payload: improvePayload } = await improveResume({
        resumeUploadId: uploadId,
        token: tok,
      });
      setImprovedHtml(improvePayload.resumeHtml || "");
      setStage("review");
      setStatusMessage("");
    } catch (err) {
      setStage("upload");
      setStatusMessage("");
      setErrorMessage(friendlyError(err, "Failed to process resume."));
    }
  };

  const handleGenerate = async () => {
    if (!resumeUploadId || !editedHtml) return;

    setStage("generating");
    setStatusMessage("Generating your portfolio — this can take up to 30 seconds...");
    setErrorMessage("");

    const idempotencyKey = makeIdempotencyKey("gen");

    try {
      const tok = await getFreshToken();

      const { payload: genPayload } = await createGeneration({
        resumeUploadId,
        finalizedResumeHtml: editedHtml,
        theme,
        color: DEFAULT_COLOR,
        token: tok,
        idempotencyKey,
      });

      let result = genPayload;
      if (result.status === "PENDING" && result.generationId) {
        setStatusMessage("Processing, please wait...");
        result = (await pollUntilDone(result.generationId, tok)) ?? result;
      }

      setGeneration(result ?? null);
      setStage("results");
      setStatusMessage("");

      if (isAuthenticated) {
        void loadHistory({ setHistoryItems, setNextCursor, setHistoryLoading });
      }
    } catch (err) {
      setStage("review");
      setStatusMessage("");
      setErrorMessage(friendlyError(err, "Failed to generate portfolio."));
    }
  };

  const handleRetry = async () => {
    if (!generation?.generationId || retrying || !editedHtml) return;
    setRetrying(true);
    setStage("generating");
    setStatusMessage("Retrying generation...");
    setErrorMessage("");

    try {
      const tok = await getFreshToken();

      const { payload } = await retryGeneration({
        generationId: generation.generationId,
        finalizedResumeHtml: editedHtml,
        token: tok,
      });

      let result = payload;
      if (result.status === "PENDING" && result.generationId) {
        setStatusMessage("Processing, please wait...");
        result = (await pollUntilDone(result.generationId, tok)) ?? result;
      }

      setGeneration(result ?? null);
      setStage("results");
      setStatusMessage("");
    } catch (err) {
      setStage("results");
      setStatusMessage("");
      setErrorMessage(friendlyError(err, "Retry failed."));
    } finally {
      setRetrying(false);
    }
  };

  const handleOpenPortfolio = async (slug) => {
    if (!slug || resolvingSlug === slug) return;
    setResolvingSlug(slug);
    try {
      const { payload } = await resolvePublicPortfolio({ slug });
      const url = payload?.hostedUrl || payload?.cloudinaryUrl;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setErrorMessage("Portfolio URL not found.");
      }
    } catch (err) {
      setErrorMessage(friendlyError(err, "Unable to open portfolio."));
    } finally {
      setResolvingSlug("");
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleStartOver = () => {
    setStage("upload");
    setErrorMessage("");
    setGeneration(null);
    setImprovedHtml("");
    setResumeUploadId(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <MinimalLayout>
      <main className="min-h-screen py-8 sm:py-10">
        <section className="w-full max-w-[860px]">

          {/* Header row */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
              Inkfolio
            </p>
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <span className="text-xs text-[#555555]">{user?.email}</span>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className={`rounded-md border border-[#E5E5E5] px-3 py-1 text-xs text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className={`rounded-md border border-[#E5E5E5] px-3 py-1 text-xs text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
                >
                  Sign in
                </button>
              )}
            </div>
          </div>

          <div className="border-t border-[#E5E5E5] pt-5">
            {stage === "upload" && (
              <UploadSection
                fileInputRef={fileInputRef}
                errorMessage={errorMessage}
                onChoose={() => fileInputRef.current?.click()}
                onFileChange={handleFileChange}
              />
            )}

            {(stage === "improving" || stage === "generating") && (
              <ProcessingSection statusMessage={statusMessage} />
            )}

            {stage === "review" && (
              <ReviewSection
                editedHtml={editedHtml}
                editMode={editMode}
                errorMessage={errorMessage}
                theme={theme}
                themeOptions={themeOptions}
                onEditHtml={setEditedHtml}
                onToggleEdit={() => setEditMode((m) => !m)}
                onThemeChange={setTheme}
                onGenerate={handleGenerate}
                onStartOver={handleStartOver}
              />
            )}

            {stage === "results" && (
              <ResultsSection
                errorMessage={errorMessage}
                generation={generation}
                historyItems={historyItems}
                historyLoading={historyLoading}
                isAuthenticated={isAuthenticated}
                isRetrying={retrying}
                nextCursor={nextCursor}
                resolvingSlug={resolvingSlug}
                onLoadMore={() =>
                  loadHistory({
                    cursor: nextCursor,
                    append: true,
                    setHistoryItems,
                    setNextCursor,
                    setHistoryLoading,
                  })
                }
                onOpenPortfolio={handleOpenPortfolio}
                onOpenSignIn={() => setShowAuthModal(true)}
                onRetry={handleRetry}
                onStartOver={handleStartOver}
              />
            )}
          </div>
        </section>
      </main>

      {/* Auth nudge — shown after file selection, skippable */}
      <AuthModal
        open={showAuthNudge}
        onClose={handleAuthNudgeDone}
        variant="nudge"
        onContinueGuest={handleAuthNudgeDone}
        onSignInSuccess={handleAuthNudgeDone}
      />

      {/* Sign-in modal — manually triggered */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        variant="signin"
        onContinueGuest={() => setShowAuthModal(false)}
      />
    </MinimalLayout>
  );
}

// ─── Section components ────────────────────────────────────────────────────

function UploadSection({ fileInputRef, errorMessage, onChoose, onFileChange }) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">Upload</p>
      <div className="border border-dashed border-[#D7D0BD] bg-[#EFE7CF] px-5 py-12">
        <p className="text-base font-medium text-[#111111]">Upload your resume</p>
        <p className="mt-1 text-sm text-[#555555]">
          PDF, DOCX, or TXT · Max 10 MB · We&apos;ll improve it with AI
        </p>
        <button
          type="button"
          onClick={onChoose}
          className={`mt-4 inline-flex items-center border border-[#CFC7B2] bg-[#F1E9D2] px-3 py-2 text-sm font-medium text-[#111111] transition-colors hover:bg-[#EBE1C5] ${focusRing}`}
        >
          Choose file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={onFileChange}
          className="sr-only"
        />
      </div>
      {errorMessage && (
        <p className="mt-2 text-xs text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}

function ProcessingSection({ statusMessage }) {
  return (
    <div className="border border-dashed border-[#D7D0BD] bg-[#EFE7CF] px-5 py-12">
      <p className="inline-flex items-center gap-1 text-sm text-[#555555]">
        <span>{statusMessage || "Processing"}</span>
        <Dots />
      </p>
    </div>
  );
}

function ReviewSection({
  editedHtml,
  editMode,
  errorMessage,
  theme,
  themeOptions,
  onEditHtml,
  onToggleEdit,
  onThemeChange,
  onGenerate,
  onStartOver,
}) {
  return (
    <div className="space-y-6">
      {/* Resume preview / editor */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
            Improved Resume
          </p>
          <button
            type="button"
            onClick={onToggleEdit}
            className={`rounded-md border border-[#E5E5E5] px-3 py-1 text-xs text-[#111111] transition-colors hover:bg-[#EFEFEB] ${focusRing}`}
          >
            {editMode ? "Preview" : "Edit HTML"}
          </button>
        </div>

        {editMode ? (
          <textarea
            value={editedHtml}
            onChange={(e) => onEditHtml(e.target.value)}
            className={`h-[600px] w-full resize-y border border-[#E5E5E5] bg-white px-3 py-2 font-mono text-xs text-[#111111] focus-visible:outline-none ${focusRing}`}
            spellCheck={false}
          />
        ) : (
          <iframe
            srcDoc={editedHtml}
            title="Resume preview"
            className="h-[800px] w-full border border-[#E5E5E5] bg-white"
            sandbox="allow-same-origin"
          />
        )}
      </div>

      {/* Theme selector */}
      {themeOptions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
            Portfolio Theme
          </p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Select theme</legend>
            {themeOptions.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-[#111111]">
                <input
                  checked={theme === t.id}
                  name="theme"
                  onChange={() => onThemeChange(t.id)}
                  type="radio"
                  value={t.id}
                  className={focusRing}
                />
                <span>{t.name}</span>
                {t.description && (
                  <span className="text-xs text-[#555555]">— {t.description}</span>
                )}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {errorMessage && (
        <p className="text-xs text-red-600">{errorMessage}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGenerate}
          className={`rounded-md bg-[#1E3A8A] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] ${focusRing}`}
        >
          Finalize &amp; Generate Portfolio
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className={`rounded-md border border-[#E5E5E5] px-4 py-2.5 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
        >
          Start over
        </button>
      </div>
    </div>
  );
}

function ResultsSection({
  errorMessage,
  generation,
  historyItems,
  historyLoading,
  isAuthenticated,
  isRetrying,
  nextCursor,
  resolvingSlug,
  onLoadMore,
  onOpenPortfolio,
  onOpenSignIn,
  onRetry,
  onStartOver,
}) {
  const portfolioSlug = generation?.portfolio?.slug;
  const resumeHtmlUrl = generation?.resume?.htmlUrl;

  return (
    <div className="space-y-6">
      {/* Results panel */}
      <div className="border border-[#E5E5E5] bg-white px-8 py-8">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
          Your Portfolio is Ready
        </p>

        <div className="flex flex-wrap gap-2">
          {portfolioSlug && (
            <button
              type="button"
              disabled={Boolean(resolvingSlug)}
              onClick={() => onOpenPortfolio(portfolioSlug)}
              className={`inline-flex items-center rounded-md bg-[#1E3A8A] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
            >
              {resolvingSlug ? "Resolving..." : "Open Live Portfolio"}
            </button>
          )}

          {resumeHtmlUrl && (
            <a
              href={resumeHtmlUrl}
              download="resume.html"
              className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2.5 text-sm font-medium text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
            >
              Download Resume
            </a>
          )}

          {generation?.status === "FAILED" && (
            <button
              type="button"
              disabled={isRetrying}
              onClick={onRetry}
              className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2.5 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] disabled:opacity-60 ${focusRing}`}
            >
              {isRetrying ? "Retrying..." : "Retry"}
            </button>
          )}

          <button
            type="button"
            onClick={onStartOver}
            className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2.5 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
          >
            Upload another
          </button>
        </div>

        {portfolioSlug && (
          <p className="mt-3 text-xs text-[#555555]">
            Slug: <span className="font-mono">{portfolioSlug}</span>
          </p>
        )}

        {errorMessage && (
          <p className="mt-3 text-xs text-red-600">{errorMessage}</p>
        )}
      </div>

      {/* Generation history */}
      <div className="border border-[#E5E5E5] bg-white px-6 py-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
            Generation History
          </p>
          {!isAuthenticated && (
            <button
              type="button"
              onClick={onOpenSignIn}
              className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-xs text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
            >
              Sign in to load history
            </button>
          )}
        </div>

        {isAuthenticated ? (
          <>
            {historyItems.length === 0 && !historyLoading && (
              <p className="text-xs text-[#555555]">No previous generations.</p>
            )}
            {historyItems.map((item) => (
              <div key={item.generationId} className="mb-2 border border-[#E5E5E5] px-3 py-2">
                <p className="text-xs text-[#555555]">
                  <span className="font-medium">{item.status}</span>
                  {item.createdAt && (
                    <> · {new Date(item.createdAt).toLocaleString()}</>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.portfolio?.slug && (
                    <button
                      type="button"
                      onClick={() => onOpenPortfolio(item.portfolio.slug)}
                      className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-xs text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                    >
                      View Portfolio
                    </button>
                  )}
                  {item.resume?.htmlUrl && (
                    <a
                      href={item.resume.htmlUrl}
                      download="resume.html"
                      className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-xs text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                    >
                      Download Resume
                    </a>
                  )}
                </div>
              </div>
            ))}
            {historyLoading && (
              <p className="text-xs text-[#555555]">Loading history...</p>
            )}
            {nextCursor && !historyLoading && (
              <button
                type="button"
                onClick={onLoadMore}
                className={`mt-2 inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-xs text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
              >
                Load more
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-[#555555]">Sign in to view your generation history.</p>
        )}
      </div>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-px text-[#555555]">
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="animate-[dotFade_1.2s_infinite]"
        >
          .
        </span>
      ))}
      <style jsx>{`
        @keyframes dotFade {
          0%, 80%, 100% { opacity: 0.15; }
          40% { opacity: 1; }
        }
      `}</style>
    </span>
  );
}

// ─── Async helpers ─────────────────────────────────────────────────────────

async function pollUntilDone(generationId, token) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const { payload } = await getGenerationStatus({ generationId, token });
    if (payload?.status && payload.status !== "PENDING") return payload;
  }
  return null;
}

async function loadHistory({
  cursor,
  append = false,
  setHistoryItems,
  setNextCursor,
  setHistoryLoading,
}) {
  const tok = await getFreshToken();
  if (!tok) return;
  setHistoryLoading(true);
  try {
    const { payload } = await listGenerations({ token: tok, limit: 20, cursor });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    setHistoryItems((prev) => (append ? [...prev, ...items] : items));
    setNextCursor(payload?.nextCursor ?? null);
  } catch {
    // history load failure is non-fatal
  } finally {
    setHistoryLoading(false);
  }
}

function isFileSupported(file) {
  const ext = file.name?.toLowerCase().split(".").pop() ?? "";
  return ACCEPTED_MIME.has(file.type) || ACCEPTED_EXT.has(ext);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function friendlyError(err, fallback) {
  if (err instanceof ApiError) {
    const suffix = err.requestId ? ` (ID: ${err.requestId})` : "";
    switch (err.code) {
      case "FILE_TOO_LARGE":
        return `File exceeds 10 MB.${suffix}`;
      case "UNSUPPORTED_FILE_TYPE":
        return `Only PDF, DOCX, or TXT files are supported.${suffix}`;
      case "GENERATE_COOLDOWN":
        return `Please wait 5 seconds before generating again.${suffix}`;
      case "QUOTA_EXCEEDED":
        return `Daily quota reached. Try again tomorrow.${suffix}`;
      case "RESUME_NOT_FOUND":
        return `Resume upload not found. Please upload again.${suffix}`;
      case "INVALID_AI_RESPONSE":
        return `AI failed to process your resume. Please try again.${suffix}`;
      case "AI_TIMEOUT":
        return `AI took too long to respond. Please try again.${suffix}`;
      default:
        return `${err.message || fallback}${suffix}`;
    }
  }
  return err instanceof Error ? err.message : fallback;
}
