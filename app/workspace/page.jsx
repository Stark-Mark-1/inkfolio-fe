"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import MinimalLayout from "@/components/MinimalLayout";
import {
  ApiError,
  getAuthMe,
  getGeneration,
  getGenerationStatus,
  getPortfolioThemes,
  getStoredAuthToken,
  listGenerations,
  resolvePublicPortfolio,
  retryGeneration,
} from "@/lib/backend";
import { focusRing } from "@/lib/ui";

const STAGE_UPLOAD = "upload";
const STAGE_PROCESSING = "processing";
const STAGE_RESULTS = "results";

const TAB_RESUME_EDITOR = "resume-editor";
const TAB_PORTFOLIO_BUILDER = "portfolio-builder";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 75000;

const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const ACCEPTED_EXTENSIONS = new Set(["pdf", "docx", "txt"]);

export default function WorkspacePage() {
  const fileInputRef = useRef(null);
  const [stage, setStage] = useState(STAGE_UPLOAD);
  const [activeTab, setActiveTab] = useState(TAB_RESUME_EDITOR);
  const [theme, setTheme] = useState("minimal-clean");
  const [themeOptions, setThemeOptions] = useState([]);
  const [token, setToken] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [improvedHtml, setImprovedHtml] = useState("");
  const [generation, setGeneration] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [nextCursor, setNextCursor] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [resolvingSlug, setResolvingSlug] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);

  const requestToken = isAuthenticated ? token : undefined;
  const hasPortfolioSlug = Boolean(generation?.portfolio?.slug);

  useEffect(() => {
    setToken(getStoredAuthToken());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      try {
        const { payload } = await getPortfolioThemes(controller.signal);
        const themes = Array.isArray(payload?.themes) ? payload.themes : [];
        setThemeOptions(themes);
        if (themes.length && !themes.some((item) => item.id === theme)) {
          setTheme(themes[0].id);
        }
      } catch {}
    };
    void run();
    return () => controller.abort();
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      if (!token) {
        setIsAuthenticated(false);
        return;
      }
      try {
        await getAuthMe({ token, signal: controller.signal });
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!requestToken) {
      setHistoryItems([]);
      setNextCursor("");
      return;
    }
    void loadHistory({ token: requestToken, setHistoryItems, setNextCursor, setHistoryLoading });
  }, [requestToken]);

  const sessionLabel = useMemo(
    () => (isAuthenticated ? "Logged-in session" : "Anonymous session"),
    [isAuthenticated]
  );

  const processSelectedFile = async (file) => {
    if (!file) return;

    setErrorMessage("");
    setStatusMessage("");

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage("File size exceeds 10MB.");
      return;
    }

    if (!isSupportedFile(file)) {
      setErrorMessage("Only PDF, DOCX, or TXT files are supported.");
      return;
    }

    setStage(STAGE_PROCESSING);
    setStatusMessage("Uploading resume...");
    setImprovedHtml("");
    setGeneration(null);

    try {
      const improveFormData = new FormData();
      improveFormData.set("file", file, file.name || "resume.pdf");
      improveFormData.set("theme", theme);
      improveFormData.set("color", "#1e3a8a");

      const headers = new Headers();
      if (requestToken) {
        const bearerValue = requestToken.startsWith("Bearer ")
          ? requestToken
          : `Bearer ${requestToken}`;
        headers.set("authorization", bearerValue);
      }
      headers.set("idempotency-key", createClientIdempotencyKey("gen"));

      setStatusMessage("Generating portfolio...");

      const improveResponse = await fetch("/api/improve", {
        method: "POST",
        headers,
        body: improveFormData,
        credentials: "include",
      });

      if (!improveResponse.ok) {
        throw await createProxyError(improveResponse);
      }

      const improvePayload = await improveResponse.json();

      let next = improvePayload;
      if (next?.status === "PENDING" && next?.generationId) {
        next = (await pollGeneration(next.generationId, requestToken)) || next;
      }

      await hydrateGeneration(next, requestToken, setGeneration, setImprovedHtml);
      setStage(STAGE_RESULTS);
      setStatusMessage(next?.status === "PENDING" ? "Still pending." : "");

      if (requestToken) {
        await loadHistory({ token: requestToken, setHistoryItems, setNextCursor, setHistoryLoading });
      }
    } catch (error) {
      setStage(STAGE_UPLOAD);
      setStatusMessage("");
      setErrorMessage(getFriendlyErrorMessage(error, "Unable to process resume."));
    }
  };

  const handleRetry = async () => {
    if (!generation?.generationId || retrying) return;

    setRetrying(true);
    setStage(STAGE_PROCESSING);
    setStatusMessage("Retrying generation...");
    setErrorMessage("");

    try {
      const retry = await retryGeneration({
        generationId: generation.generationId,
        token: requestToken,
      });

      let next = retry.payload;
      if (next?.status === "PENDING" && next?.generationId) {
        next = (await pollGeneration(next.generationId, requestToken)) || next;
      }

      await hydrateGeneration(next, requestToken, setGeneration, setImprovedHtml);
      setStage(STAGE_RESULTS);
      setStatusMessage("");
    } catch (error) {
      setStage(STAGE_RESULTS);
      setStatusMessage("");
      setErrorMessage(getFriendlyErrorMessage(error, "Unable to retry generation."));
    } finally {
      setRetrying(false);
    }
  };

  const handleOpenPortfolio = async (slug) => {
    if (!slug || resolvingSlug === slug) return;
    setResolvingSlug(slug);
    try {
      const { payload } = await resolvePublicPortfolio({ slug });
      const portfolioUrl = payload?.hostedUrl || payload?.cloudinaryUrl || payload?.url;
      if (portfolioUrl) {
        window.open(portfolioUrl, "_blank", "noopener,noreferrer");
      } else {
        throw new Error("Portfolio URL not found");
      }
    } catch (error) {
      setErrorMessage(getFriendlyErrorMessage(error, "Unable to open portfolio URL."));
    } finally {
      setResolvingSlug("");
    }
  };

  const handleLoadGeneration = async (generationId) => {
    if (!generationId) return;
    setStage(STAGE_PROCESSING);
    setStatusMessage("Loading generation...");
    setErrorMessage("");
    try {
      let { payload } = await getGeneration({ generationId, token: requestToken });
      if (payload?.status === "PENDING") {
        payload = (await pollGeneration(generationId, requestToken)) || payload;
      }
      await hydrateGeneration(payload, requestToken, setGeneration, setImprovedHtml);
      setStage(STAGE_RESULTS);
      setStatusMessage("");
    } catch (error) {
      setStage(STAGE_RESULTS);
      setStatusMessage("");
      setErrorMessage(getFriendlyErrorMessage(error, "Unable to load generation."));
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0];
    void processSelectedFile(file);
    event.target.value = "";
  };

  return (
    <MinimalLayout>
      <main className="min-h-screen py-8 sm:py-10">
        <section className="w-full max-w-[820px]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">Resume</p>
            <p className="text-xs text-[#555555]">{sessionLabel}</p>
          </div>

          <div className="mt-3 border-t border-[#E5E5E5] pt-5">
            {stage !== STAGE_RESULTS ? (
              <UploadSection
                fileInputRef={fileInputRef}
                stage={stage}
                statusMessage={statusMessage}
                errorMessage={errorMessage}
                onFileInputChange={handleFileInputChange}
                onSelectFile={() => fileInputRef.current?.click()}
              />
            ) : (
              <ResultsSection
                activeTab={activeTab}
                generation={generation}
                improvedHtml={improvedHtml}
                isAuthenticated={isAuthenticated}
                isResolvingPortfolio={Boolean(resolvingSlug)}
                isRetrying={retrying}
                nextCursor={nextCursor}
                onLoadGeneration={handleLoadGeneration}
                onLoadMoreHistory={() =>
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
                setTheme={setTheme}
                theme={theme}
                themeOptions={themeOptions}
                historyItems={historyItems}
                historyLoading={historyLoading}
                hasPortfolioSlug={hasPortfolioSlug}
                statusMessage={statusMessage}
              />
            )}
          </div>

          {stage === STAGE_RESULTS && errorMessage && (
            <p className="mt-3 text-xs text-[#555555]">{errorMessage}</p>
          )}
        </section>
      </main>

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        variant="signin"
        onContinueGuest={() => setShowAuthModal(false)}
        onSignIn={() => {}}
      />
    </MinimalLayout>
  );
}

function UploadSection({
  fileInputRef,
  stage,
  statusMessage,
  errorMessage,
  onFileInputChange,
  onSelectFile,
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">Upload</p>
      <div className="mt-3 border border-dashed border-[#D7D0BD] bg-[#EFE7CF] px-5 py-8">
        {stage === STAGE_UPLOAD ? (
          <>
            <p className="text-base font-medium text-[#111111]">Upload your resume</p>
            <p className="mt-1 text-sm text-[#555555]">PDF, DOCX, or TXT • Max 10MB</p>
            <button
              type="button"
              onClick={onSelectFile}
              className={`mt-4 inline-flex items-center border border-[#CFC7B2] bg-[#F1E9D2] px-3 py-2 text-sm font-medium text-[#111111] transition-colors hover:bg-[#EBE1C5] ${focusRing}`}
            >
              Choose file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={onFileInputChange}
              className="sr-only"
            />
          </>
        ) : (
          <p className="inline-flex items-center gap-1 text-sm text-[#555555]">
            <span>{statusMessage || "Processing"}</span>
            <AnimatedDots />
          </p>
        )}
      </div>
      {errorMessage && <p className="mt-2 text-xs text-[#555555]">{errorMessage}</p>}
    </div>
  );
}

function ResultsSection({
  activeTab,
  generation,
  improvedHtml,
  isAuthenticated,
  isResolvingPortfolio,
  isRetrying,
  nextCursor,
  onLoadGeneration,
  onLoadMoreHistory,
  onOpenPortfolio,
  onOpenSignIn,
  onRetry,
  onTabChange,
  setTheme,
  theme,
  themeOptions,
  historyItems,
  historyLoading,
  hasPortfolioSlug,
  statusMessage,
}) {
  const [editedHtml, setEditedHtml] = useState(improvedHtml);

  useEffect(() => {
    setEditedHtml(improvedHtml);
  }, [improvedHtml]);

  const exportHtml = () => {
    const blob = new Blob([editedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "resume.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="border-b border-[#E5E5E5]">
        <div className="-mb-px flex items-end gap-6">
          <TabButton isActive={activeTab === TAB_RESUME_EDITOR} onClick={() => onTabChange(TAB_RESUME_EDITOR)}>
            Resume Editor
          </TabButton>
          <TabButton
            isActive={activeTab === TAB_PORTFOLIO_BUILDER}
            onClick={() => onTabChange(TAB_PORTFOLIO_BUILDER)}
          >
            Portfolio Builder
          </TabButton>
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-[820px] border border-[#E5E5E5] bg-white px-8 py-10">
        {activeTab === TAB_RESUME_EDITOR ? (
          <>
            <div
              contentEditable
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: editedHtml }}
              onInput={(event) => setEditedHtml(event.currentTarget.innerHTML)}
              className={`min-h-[260px] text-[#111111] focus-visible:outline-none ${focusRing}`}
            />
            <button
              type="button"
              onClick={exportHtml}
              className={`mt-6 inline-flex items-center rounded-md bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] ${focusRing}`}
            >
              Download HTML
            </button>
          </>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">Theme</legend>
              {themeOptions.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm text-[#111111]">
                  <input
                    checked={theme === item.id}
                    className={focusRing}
                    name="theme"
                    onChange={() => setTheme(item.id)}
                    type="radio"
                    value={item.id}
                  />
                  <span>{item.name}</span>
                </label>
              ))}
            </fieldset>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!hasPortfolioSlug || isResolvingPortfolio}
                onClick={() => onOpenPortfolio(generation?.portfolio?.slug)}
                className={`inline-flex items-center rounded-md bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
              >
                {isResolvingPortfolio ? "Resolving..." : "Open Live Portfolio"}
              </button>
              {generation?.status === "FAILED" && (
                <button
                  type="button"
                  disabled={isRetrying}
                  onClick={onRetry}
                  className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                >
                  {isRetrying ? "Retrying..." : "Retry"}
                </button>
              )}
            </div>
            {statusMessage && <p className="mt-3 text-xs text-[#555555]">{statusMessage}</p>}
          </>
        )}
      </div>

      <div className="mx-auto mt-6 max-w-[820px] border border-[#E5E5E5] bg-white px-6 py-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">Generation History</p>
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
            {historyItems.map((item) => (
              <div key={item.generationId} className="mb-2 border border-[#E5E5E5] px-3 py-2">
                <p className="text-xs text-[#555555]">
                  {item.status} • {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown date"}
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
            {historyLoading && <p className="text-xs text-[#555555]">Loading history...</p>}
            {nextCursor && !historyLoading && (
              <button
                type="button"
                onClick={onLoadMoreHistory}
                className={`mt-2 inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-xs text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
              >
                Load More
              </button>
            )}
          </>
        ) : (
          <p className="text-xs text-[#555555]">`GET /v1/generations` requires a bearer token.</p>
        )}
      </div>
    </div>
  );
}

function TabButton({ children, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-0 py-2 text-sm font-medium transition-colors ${focusRing} ${
        isActive
          ? "border-[#1E3A8A] text-[#111111]"
          : "border-transparent text-[#555555] hover:text-[#111111]"
      }`}
    >
      {children}
    </button>
  );
}

function AnimatedDots() {
  return (
    <span className="inline-flex items-center text-[#555555]">
      <span className="workspace-dot">.</span>
      <span className="workspace-dot workspace-dot-delay-1">.</span>
      <span className="workspace-dot workspace-dot-delay-2">.</span>
      <style jsx>{`
        .workspace-dot {
          opacity: 0.15;
          animation: workspace-dot-fade 1.2s infinite;
        }
        .workspace-dot-delay-1 {
          animation-delay: 0.2s;
        }
        .workspace-dot-delay-2 {
          animation-delay: 0.4s;
        }
        @keyframes workspace-dot-fade {
          0%,
          80%,
          100% {
            opacity: 0.15;
          }
          40% {
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}

async function hydrateGeneration(payload, token, setGeneration, setImprovedHtml) {
  let next = payload;
  if (next?.generationId && !next?.createdAt) {
    try {
      const detail = await getGeneration({ generationId: next.generationId, token });
      next = { ...next, ...detail.payload };
    } catch {}
  }
  setGeneration(next || null);

  if (next?.resume?.htmlUrl) {
    try {
      const response = await fetch(next.resume.htmlUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("Resume preview load failed");
      setImprovedHtml(await response.text());
    } catch {
      setImprovedHtml("");
    }
  }
}

async function pollGeneration(generationId, token) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);
    const result = await getGenerationStatus({ generationId, token });
    latest = result.payload;
    if (latest?.status && latest.status !== "PENDING") {
      return latest;
    }
  }
  return latest;
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
    const result = await listGenerations({
      token,
      limit: 20,
      cursor,
    });
    const items = Array.isArray(result?.payload?.items) ? result.payload.items : [];
    setHistoryItems((prev) => (append ? [...prev, ...items] : items));
    setNextCursor(result?.payload?.nextCursor || "");
  } finally {
    setHistoryLoading(false);
  }
}

function isSupportedFile(file) {
  const fileName = file.name?.toLowerCase() ?? "";
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return ACCEPTED_MIME_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(extension);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClientIdempotencyKey(prefix = "gen") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
}

async function createProxyError(response) {
  let message = `Request failed with status ${response.status}`;

  try {
    const payload = await response.json();
    const backendMessage = payload?.error?.message;
    const requestId = payload?.error?.requestId || response.headers.get("x-request-id");
    if (backendMessage) {
      message = backendMessage;
    }
    if (requestId) {
      message = `${message} (Request ID: ${requestId})`;
    }
  } catch {
    const text = await response.text().catch(() => "");
    if (text) {
      message = text;
    }
  }

  return new Error(message);
}

function getFriendlyErrorMessage(error, fallbackMessage) {
  if (error instanceof ApiError) {
    const requestIdSuffix = error.requestId ? ` (Request ID: ${error.requestId})` : "";
    switch (error.code) {
      case "FILE_TOO_LARGE":
        return `File size exceeds 10MB.${requestIdSuffix}`;
      case "UNSUPPORTED_FILE_TYPE":
        return `Only PDF, DOCX, or TXT files are supported.${requestIdSuffix}`;
      case "GENERATE_COOLDOWN":
        return `Please wait 5 seconds before generating again.${requestIdSuffix}`;
      case "QUOTA_EXCEEDED":
        return `Daily quota reached. Please try again tomorrow.${requestIdSuffix}`;
      default:
        return `${error.message || fallbackMessage}${requestIdSuffix}`;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallbackMessage;
}
