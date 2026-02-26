"use client";

import { useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import MinimalLayout from "@/components/MinimalLayout";
import {
  ApiError,
  createGeneration,
  getAuthMe,
  getGeneration,
  getGenerationStatus,
  getPortfolioThemes,
  listGenerations,
  makeIdempotencyKey,
  resolvePublicPortfolio,
  retryGeneration,
  uploadResume,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { focusRing } from "@/lib/ui";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 75000;
const DEFAULT_COLOR = "#2563eb";

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const ACCEPTED_EXT = new Set(["pdf", "docx", "txt"]);

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const fileInputRef = useRef(null);

  // Auth
  const [token, setToken] = useState(null); // null = not yet loaded
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // UI
  const [stage, setStage] = useState("upload"); // "upload" | "processing" | "results"
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Themes
  const [themeOptions, setThemeOptions] = useState([]);
  const [theme, setTheme] = useState("minimal-clean");

  // Active tab in results
  const [activeTab, setActiveTab] = useState("resume");

  // Generation
  const [generation, setGeneration] = useState(null);
  const [resumeHtml, setResumeHtml] = useState("");
  const [editedHtml, setEditedHtml] = useState("");

  // History
  const [historyItems, setHistoryItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Action states
  const [retrying, setRetrying] = useState(false);
  const [resolvingSlug, setResolvingSlug] = useState("");

  const isAuthenticated = !!user;
  const requestToken = isAuthenticated ? token : undefined;

  // ── 1. Supabase session bootstrap + auth state listener ──────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? "");
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? "");
      if (!session) setUser(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── 2. Validate token with backend whenever it changes ───────────────────

  useEffect(() => {
    if (!authReady) return;
    if (!token) {
      setUser(null);
      setHistoryItems([]);
      setNextCursor(null);
      return;
    }

    const controller = new AbortController();
    getAuthMe({ token, signal: controller.signal })
      .then(({ payload }) => setUser(payload.user))
      .catch(() => setUser(null));

    return () => controller.abort();
  }, [token, authReady]);

  // ── 3. Load history whenever auth state resolves ─────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !requestToken) return;
    void loadHistory({ token: requestToken, setHistoryItems, setNextCursor, setHistoryLoading });
  }, [isAuthenticated, requestToken]);

  // ── 4. Fetch themes on mount ──────────────────────────────────────────────

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

  // ── 5. Keep editedHtml in sync with fetched resumeHtml ───────────────────

  useEffect(() => {
    setEditedHtml(resumeHtml);
  }, [resumeHtml]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) void handleFileSelected(file);
    event.target.value = "";
  };

  const handleFileSelected = async (file) => {
    setErrorMessage("");

    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage("File size exceeds 10 MB.");
      return;
    }
    if (!isFileSupported(file)) {
      setErrorMessage("Only PDF, DOCX, or TXT files are supported.");
      return;
    }

    setStage("processing");
    setStatusMessage("Uploading resume...");
    setGeneration(null);
    setResumeHtml("");

    try {
      // Step 1 — Upload resume (§4.5)
      const { payload: uploadPayload } = await uploadResume({
        file,
        token: requestToken,
      });
      const { resumeUploadId } = uploadPayload;

      // Step 2 — Generate portfolio (§4.7)
      // Generate runs synchronously and can take up to ~30 seconds.
      setStatusMessage("Generating portfolio — this can take up to 30 seconds...");
      const idempotencyKey = makeIdempotencyKey("gen");

      const { payload: genPayload } = await createGeneration({
        resumeUploadId,
        theme,
        color: DEFAULT_COLOR,
        token: requestToken,
        idempotencyKey,
      });

      // Step 3 — Poll if PENDING (§3.1, §6.2)
      let result = genPayload;
      if (result.status === "PENDING" && result.generationId) {
        setStatusMessage("Processing, please wait...");
        result = (await pollUntilDone(result.generationId, requestToken)) ?? result;
      }

      // Step 4 — Hydrate and show results
      await applyGeneration(result, requestToken, setGeneration, setResumeHtml);
      setStage("results");
      setStatusMessage("");

      if (requestToken) {
        void loadHistory({ token: requestToken, setHistoryItems, setNextCursor, setHistoryLoading });
      }
    } catch (err) {
      setStage("upload");
      setStatusMessage("");
      setErrorMessage(friendlyError(err, "Failed to process resume."));
    }
  };

  const handleRetry = async () => {
    if (!generation?.generationId || retrying) return;
    setRetrying(true);
    setStage("processing");
    setStatusMessage("Retrying generation...");
    setErrorMessage("");

    try {
      const { payload } = await retryGeneration({
        generationId: generation.generationId,
        token: requestToken,
      });

      let result = payload;
      if (result.status === "PENDING" && result.generationId) {
        setStatusMessage("Processing, please wait...");
        result = (await pollUntilDone(result.generationId, requestToken)) ?? result;
      }

      await applyGeneration(result, requestToken, setGeneration, setResumeHtml);
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
      const url = payload?.url;
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

  const handleLoadGeneration = async (generationId) => {
    if (!generationId) return;
    setStage("processing");
    setStatusMessage("Loading...");
    setErrorMessage("");

    try {
      let { payload } = await getGeneration({ generationId, token: requestToken });
      if (payload.status === "PENDING") {
        setStatusMessage("Still processing, polling...");
        payload = (await pollUntilDone(generationId, requestToken)) ?? payload;
      }
      await applyGeneration(payload, requestToken, setGeneration, setResumeHtml);
      setStage("results");
      setStatusMessage("");
    } catch (err) {
      setStage("results");
      setStatusMessage("");
      setErrorMessage(friendlyError(err, "Failed to load generation."));
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([editedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "resume.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <MinimalLayout>
      <main className="min-h-screen py-8 sm:py-10">
        <section className="w-full max-w-[820px]">

          {/* Header row */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
              Resume
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

            {stage === "processing" && (
              <ProcessingSection statusMessage={statusMessage} />
            )}

            {stage === "results" && (
              <ResultsSection
                activeTab={activeTab}
                editedHtml={editedHtml}
                errorMessage={errorMessage}
                generation={generation}
                historyItems={historyItems}
                historyLoading={historyLoading}
                isAuthenticated={isAuthenticated}
                isRetrying={retrying}
                nextCursor={nextCursor}
                resolvingSlug={resolvingSlug}
                theme={theme}
                themeOptions={themeOptions}
                onDownloadHtml={handleDownloadHtml}
                onEditHtml={setEditedHtml}
                onLoadGeneration={handleLoadGeneration}
                onLoadMore={() =>
                  loadHistory({
                    token: requestToken,
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
                onTabChange={setActiveTab}
                onThemeChange={setTheme}
                onUploadAnother={() => {
                  setStage("upload");
                  setErrorMessage("");
                  setGeneration(null);
                  setResumeHtml("");
                }}
              />
            )}
          </div>
        </section>
      </main>

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
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">Upload</p>
      <div className="mt-3 border border-dashed border-[#D7D0BD] bg-[#EFE7CF] px-5 py-10">
        <p className="text-base font-medium text-[#111111]">Upload your resume</p>
        <p className="mt-1 text-sm text-[#555555]">PDF, DOCX, or TXT · Max 10 MB</p>
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
        <p className="mt-2 text-xs text-[#555555]">{errorMessage}</p>
      )}
    </div>
  );
}

function ProcessingSection({ statusMessage }) {
  return (
    <div className="border border-dashed border-[#D7D0BD] bg-[#EFE7CF] px-5 py-10">
      <p className="inline-flex items-center gap-1 text-sm text-[#555555]">
        <span>{statusMessage || "Processing"}</span>
        <Dots />
      </p>
    </div>
  );
}

function ResultsSection({
  activeTab,
  editedHtml,
  errorMessage,
  generation,
  historyItems,
  historyLoading,
  isAuthenticated,
  isRetrying,
  nextCursor,
  resolvingSlug,
  theme,
  themeOptions,
  onDownloadHtml,
  onEditHtml,
  onLoadGeneration,
  onLoadMore,
  onOpenPortfolio,
  onOpenSignIn,
  onRetry,
  onTabChange,
  onThemeChange,
  onUploadAnother,
}) {
  const hasSlug = Boolean(generation?.portfolio?.slug);

  return (
    <div>
      {/* Tabs */}
      <div className="border-b border-[#E5E5E5]">
        <div className="-mb-px flex items-end gap-6">
          <TabButton active={activeTab === "resume"} onClick={() => onTabChange("resume")}>
            Resume Editor
          </TabButton>
          <TabButton active={activeTab === "portfolio"} onClick={() => onTabChange("portfolio")}>
            Portfolio Builder
          </TabButton>
        </div>
      </div>

      {/* Tab panels */}
      <div className="mt-6 border border-[#E5E5E5] bg-white px-8 py-10">
        {activeTab === "resume" ? (
          <>
            <div
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: editedHtml }}
              onInput={(e) => onEditHtml(e.currentTarget.innerHTML)}
              className={`min-h-[260px] text-[#111111] focus-visible:outline-none ${focusRing}`}
            />
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onDownloadHtml}
                className={`inline-flex items-center rounded-md bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] ${focusRing}`}
              >
                Download HTML
              </button>
              <button
                type="button"
                onClick={onUploadAnother}
                className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
              >
                Upload another
              </button>
            </div>
          </>
        ) : (
          <>
            {themeOptions.length > 0 && (
              <fieldset className="mb-6 space-y-2">
                <legend className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
                  Theme
                </legend>
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
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!hasSlug || Boolean(resolvingSlug)}
                onClick={() => onOpenPortfolio(generation?.portfolio?.slug)}
                className={`inline-flex items-center rounded-md bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
              >
                {resolvingSlug ? "Resolving..." : "Open Live Portfolio"}
              </button>

              {generation?.status === "FAILED" && (
                <button
                  type="button"
                  disabled={isRetrying}
                  onClick={onRetry}
                  className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] disabled:opacity-60 ${focusRing}`}
                >
                  {isRetrying ? "Retrying..." : "Retry"}
                </button>
              )}

              <button
                type="button"
                onClick={onUploadAnother}
                className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
              >
                Upload another
              </button>
            </div>

            {generation?.portfolio?.slug && (
              <p className="mt-3 text-xs text-[#555555]">
                Slug: <span className="font-mono">{generation.portfolio.slug}</span>
              </p>
            )}

            {errorMessage && (
              <p className="mt-3 text-xs text-[#555555]">{errorMessage}</p>
            )}
          </>
        )}
      </div>

      {/* Generation history */}
      <div className="mt-6 border border-[#E5E5E5] bg-white px-6 py-6">
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
              <p className="text-xs text-[#555555]">No generations yet.</p>
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
                  <button
                    type="button"
                    onClick={() => onLoadGeneration(item.generationId)}
                    className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-xs text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                  >
                    Open
                  </button>
                  {item.portfolio?.slug && (
                    <button
                      type="button"
                      onClick={() => onOpenPortfolio(item.portfolio.slug)}
                      className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-xs text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                    >
                      View Portfolio
                    </button>
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

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-0 py-2 text-sm font-medium transition-colors ${focusRing} ${
        active
          ? "border-[#1E3A8A] text-[#111111]"
          : "border-transparent text-[#555555] hover:text-[#111111]"
      }`}
    >
      {children}
    </button>
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
  return null; // timed out
}

async function applyGeneration(payload, token, setGeneration, setResumeHtml) {
  // Fetch full details if createdAt is missing (e.g. came from generate/retry)
  let gen = payload;
  if (gen?.generationId && !gen?.createdAt) {
    try {
      const { payload: detail } = await getGeneration({ generationId: gen.generationId, token });
      gen = { ...gen, ...detail };
    } catch {
      // non-fatal — use what we have
    }
  }
  setGeneration(gen ?? null);

  // Fetch HTML content for resume editor
  if (gen?.resume?.htmlUrl) {
    try {
      const res = await fetch(gen.resume.htmlUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch resume HTML");
      setResumeHtml(await res.text());
    } catch {
      setResumeHtml("");
    }
  }
}

async function loadHistory({
  token,
  cursor,
  append = false,
  setHistoryItems,
  setNextCursor,
  setHistoryLoading,
}) {
  if (!token) return;
  setHistoryLoading(true);
  try {
    const { payload } = await listGenerations({ token, limit: 20, cursor });
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

// Maps ApiError codes to user-facing messages (§6.4 of plan)
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
      default:
        return `${err.message || fallback}${suffix}`;
    }
  }
  return err instanceof Error ? err.message : fallback;
}
