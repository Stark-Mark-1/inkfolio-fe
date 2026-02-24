"use client";

import { useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import MinimalLayout from "@/components/MinimalLayout";
import { focusRing } from "@/lib/ui";

const STAGE_UPLOAD = "upload";
const STAGE_PROCESSING = "processing";
const STAGE_RESULTS = "results";

const TAB_RESUME_EDITOR = "resume-editor";
const TAB_PORTFOLIO_BUILDER = "portfolio-builder";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ACCEPTED_EXTENSIONS = new Set(["pdf", "docx"]);

export default function WorkspacePage() {
  const fileInputRef = useRef(null);
  const [stage, setStage] = useState(STAGE_UPLOAD);
  const [activeTab, setActiveTab] = useState(TAB_RESUME_EDITOR);
  const [theme, setTheme] = useState("minimal");
  const [isAuthenticated] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [remainingToday, setRemainingToday] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [improvedHtml, setImprovedHtml] = useState("");
  const [structuredJson, setStructuredJson] = useState(null);
  const hasResultData = improvedHtml.length > 0 || structuredJson !== null;

  useEffect(() => {
    const controller = new AbortController();

    const fetchUsage = async () => {
      try {
        const response = await fetch("/api/usage", {
          method: "GET",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed usage fetch");
        }

        const payload = await response.json();
        const remaining = Number(payload?.remaining_today);

        setRemainingToday(Number.isFinite(remaining) ? Math.max(0, remaining) : 0);
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrorMessage("Unable to load usage right now. Please try again.");
      }
    };

    fetchUsage();

    return () => controller.abort();
  }, []);

  const processSelectedFile = async (file) => {
    if (!file) return;

    setIsDragging(false);
    setErrorMessage("");

    if (remainingToday === 0) {
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage("File size exceeds 5MB. Please upload a smaller file.");
      return;
    }

    if (!isSupportedFile(file)) {
      setErrorMessage("Only PDF or DOCX files are supported.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setStage(STAGE_PROCESSING);

    try {
      const response = await fetch("/api/improve", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed improve request");
      }

      const payload = await response.json();
      setImprovedHtml(payload?.improved_html ?? "");
      setStructuredJson(payload?.structured_json ?? null);

      if (typeof remainingToday === "number") {
        setRemainingToday(Math.max(0, remainingToday - 1));
      }

      setStage(STAGE_RESULTS);
    } catch (error) {
      setStage(STAGE_UPLOAD);
      setErrorMessage("Unable to improve resume right now. Please try again.");
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0];
    void processSelectedFile(file);
    event.target.value = "";
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    if (remainingToday === 0) return;
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    if (remainingToday === 0) {
      setIsDragging(false);
      return;
    }
    const file = event.dataTransfer.files?.[0];
    void processSelectedFile(file);
  };

  return (
    <MinimalLayout>
      <main className="min-h-screen py-8 sm:py-10">
        <section className="w-full max-w-[820px]">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
            Resume
          </p>

          <div className="mt-3 border-t border-[#E5E5E5] pt-5">
            {stage === STAGE_RESULTS ? (
              <ResultsSection
                activeTab={activeTab}
                hasResultData={hasResultData}
                improvedHtml={improvedHtml}
                isAuthenticated={isAuthenticated}
                setTheme={setTheme}
                theme={theme}
                onTabChange={setActiveTab}
              />
            ) : (
              <UploadProcessingSection
                fileInputRef={fileInputRef}
                isDragging={isDragging}
                remainingToday={remainingToday}
                errorMessage={errorMessage}
                stage={stage}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onFileInputChange={handleFileInputChange}
              />
            )}
          </div>
        </section>
      </main>
    </MinimalLayout>
  );
}

function UploadProcessingSection({
  fileInputRef,
  remainingToday,
  errorMessage,
  isDragging,
  stage,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileInputChange,
}) {
  const isUploadStage = stage === STAGE_UPLOAD;
  const isLimitReached = remainingToday === 0;
  const remainingText = typeof remainingToday === "number" ? remainingToday : "--";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
          Upload
        </p>
        <p className="text-xs text-[#555555]">{remainingText} generations remaining today</p>
      </div>

      <div
        onDragOver={isUploadStage && !isLimitReached ? onDragOver : undefined}
        onDragLeave={isUploadStage && !isLimitReached ? onDragLeave : undefined}
        onDrop={isUploadStage && !isLimitReached ? onDrop : undefined}
        className={`mt-3 border border-dashed px-5 py-8 ${
          isUploadStage && isDragging
            ? "border-[#1E3A8A] bg-[#EEE5CB]"
            : "border-[#D7D0BD] bg-[#EFE7CF]"
        }`}
      >
        {isUploadStage ? (
          <>
            <p className="text-base font-medium text-[#111111]">Drag and drop your resume</p>
            <p className="mt-1 text-sm text-[#555555]">PDF or DOCX &bull; Max 5MB</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLimitReached}
              className={`mt-4 inline-flex items-center border border-[#CFC7B2] bg-[#F1E9D2] px-3 py-2 text-sm font-medium text-[#111111] transition-colors hover:bg-[#EBE1C5] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#F1E9D2] ${focusRing}`}
            >
              Choose file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onFileInputChange}
              className="sr-only"
              disabled={isLimitReached}
            />
          </>
        ) : (
          <p className="inline-flex items-center gap-1 text-sm text-[#555555]">
            <span>Improving your resume</span>
            <AnimatedDots />
          </p>
        )}
      </div>

      {isUploadStage && isLimitReached && (
        <p className="mt-2 text-xs text-[#555555]">
          Daily generation limit reached. Try again tomorrow.
        </p>
      )}

      {isUploadStage && errorMessage && <p className="mt-2 text-xs text-[#555555]">{errorMessage}</p>}
    </div>
  );
}

function ResultsSection({
  activeTab,
  hasResultData,
  improvedHtml,
  isAuthenticated,
  setTheme,
  theme,
  onTabChange,
}) {
  const [editedHtml, setEditedHtml] = useState(improvedHtml);
  const [exportError, setExportError] = useState("");
  const [deployError, setDeployError] = useState("");
  const [deployProcessing, setDeployProcessing] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalVariant, setAuthModalVariant] = useState("predeploy");
  const deployInFlightRef = useRef(false);
  const copyResetTimeoutRef = useRef(null);
  const hasResumeContent = improvedHtml.trim().length > 0;

  useEffect(() => {
    setEditedHtml(improvedHtml);
  }, [improvedHtml]);

  useEffect(() => {
    setDeployedUrl("");
    setDeployError("");
    setDeploySuccess(false);
    setIsCopied(false);
  }, [editedHtml]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleDownloadHtml = () => {
    const titleText = getFirstHeadingText(editedHtml);
    const slug = slugify(titleText);
    const fileName = slug ? `${slug}-resume.html` : "resume.html";

    const htmlString = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Resume</title>
<style>
body { font-family: Arial, Helvetica, sans-serif; margin: 40px auto; max-width: 800px; line-height: 1.5; color: #000; }
h1 { font-size: 24px; margin-bottom: 6px; }
h2 { font-size: 14px; margin-top: 18px; border-bottom: 1px solid #000; padding-bottom: 4px; }
p { margin: 6px 0; }
ul { margin: 6px 0 6px 18px; }
li { margin-bottom: 4px; }
a { color: #000; text-decoration: none; }
</style>
</head>
<body>
${editedHtml}
</body>
</html>`;

    const blob = new Blob([htmlString], { type: "text/html" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  const handleExportCode = async () => {
    try {
      setExportError("");

      const titleText = getFirstHeadingText(editedHtml);
      const portfolioTitle = titleText ? `${titleText} - Portfolio` : "Portfolio";
      const slug = slugify(titleText);
      const zipName = slug ? `${slug}-portfolio.zip` : "portfolio.zip";
      const JSZip = (await import("jszip")).default;

      const indexHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${portfolioTitle}</title>
<link rel="stylesheet" href="style.css" />
</head>
<body>
<div class="container">
${editedHtml}
</div>
</body>
</html>`;

      const styleCss = getThemeCss(theme);

      const zip = new JSZip();
      zip.file("index.html", indexHtml);
      zip.file("style.css", styleCss);

      const blob = await zip.generateAsync({ type: "blob" });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = zipName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      setExportError("Unable to export portfolio code right now. Please try again.");
    }
  };

  const deployPortfolio = async () => {
    if (deployInFlightRef.current) return;

    try {
      deployInFlightRef.current = true;
      setAuthModalOpen(false);
      setDeployError("");
      setIsCopied(false);
      setDeployedUrl("");
      setDeploySuccess(false);
      setDeployProcessing(true);

      const response = await fetch("/api/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          html: editedHtml,
          theme: theme,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed deploy request");
      }

      const payload = await response.json();
      const deployedUrlValue = payload?.deployed_url;

      if (typeof deployedUrlValue !== "string" || !deployedUrlValue) {
        throw new Error("Missing deployed url");
      }

      setDeployedUrl(deployedUrlValue);
      setDeploySuccess(true);
    } catch (error) {
      setDeployError("Unable to deploy portfolio right now. Please try again.");
      setDeploySuccess(false);
    } finally {
      setDeployProcessing(false);
      deployInFlightRef.current = false;
    }
  };

  const handleDeploy = () => {
    if (deployProcessing) return;

    if (!isAuthenticated) {
      setAuthModalVariant("predeploy");
      setAuthModalOpen(true);
      return;
    }

    void deployPortfolio();
  };

  const handlePredeploySignIn = () => {
    setAuthModalVariant("signin");
  };

  const handleContinueAsGuest = () => {
    void deployPortfolio();
  };

  const handleCopyLink = async () => {
    if (!deployedUrl) return;

    try {
      await navigator.clipboard.writeText(deployedUrl);
      setIsCopied(true);
      if (copyResetTimeoutRef.current) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (error) {
      setIsCopied(false);
    }
  };

  const handleOpenLink = () => {
    if (!deployedUrl) return;
    window.open(deployedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div>
      <div className="border-b border-[#E5E5E5]">
        <div className="-mb-px flex items-end gap-6">
          <TabButton
            isActive={activeTab === TAB_RESUME_EDITOR}
            onClick={() => onTabChange(TAB_RESUME_EDITOR)}
          >
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

      <div
        className="mx-auto mt-6 max-w-[820px] border border-[#E5E5E5] bg-white px-10 py-12"
        data-result-ready={hasResultData ? "true" : "false"}
      >
        {activeTab === TAB_RESUME_EDITOR ? (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
              Editor
            </p>
            <div className="mt-3 border-t border-[#E5E5E5] pt-6">
              <div
                contentEditable
                suppressContentEditableWarning
                dangerouslySetInnerHTML={{ __html: editedHtml }}
                onPaste={(event) => {
                  event.preventDefault();

                  const text = event.clipboardData.getData("text/plain");
                  document.execCommand("insertText", false, text);
                }}
                onInput={(event) => {
                  const clean = event.currentTarget.innerHTML
                    .replace(/ style="[^"]*"/g, "")
                    .replace(/ class="[^"]*"/g, "");

                  setEditedHtml(clean);
                }}
                className={`min-h-[260px] text-[#111111] focus-visible:outline-none ${focusRing}`}
              />
            </div>

            <div className="mt-8 border-t border-[#E5E5E5] pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  className={`inline-flex items-center rounded-md bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] ${focusRing}`}
                >
                  Download HTML
                </button>
                <button
                  type="button"
                  className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2 text-sm font-medium text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => onTabChange(TAB_PORTFOLIO_BUILDER)}
                  className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-4 py-2 text-sm font-medium text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                >
                  Generate Portfolio
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#555555]">
              Portfolio
            </p>
            <div className="mt-3 border-t border-[#E5E5E5] pt-6">
              <fieldset className="space-y-3">
                <legend className="sr-only">Theme</legend>
                <label className="flex items-center gap-2 text-sm text-[#111111]">
                  <input
                    checked={theme === "minimal"}
                    className={focusRing}
                    name="portfolio-theme"
                    onChange={() => setTheme("minimal")}
                    type="radio"
                    value="minimal"
                  />
                  <span>Minimal</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-[#111111]">
                  <input
                    checked={theme === "professional"}
                    className={focusRing}
                    name="portfolio-theme"
                    onChange={() => setTheme("professional")}
                    type="radio"
                    value="professional"
                  />
                  <span>Professional</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-[#111111]">
                  <input
                    checked={theme === "creative"}
                    className={focusRing}
                    name="portfolio-theme"
                    onChange={() => setTheme("creative")}
                    type="radio"
                    value="creative"
                  />
                  <span>Creative</span>
                </label>
              </fieldset>
            </div>

            <div className="mt-8 border-t border-[#E5E5E5] pt-5">
              <div className="flex flex-col items-start gap-3">
                <button
                  type="button"
                  disabled={deployProcessing || !hasResumeContent}
                  onClick={handleExportCode}
                  className={`inline-flex items-center rounded-md bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#1E3A8A] ${focusRing}`}
                >
                  Export Code
                </button>
                <button
                  type="button"
                  disabled={deployProcessing || !hasResumeContent}
                  onClick={handleDeploy}
                  className={`inline-flex items-center rounded-md bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1C347C] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#1E3A8A] ${focusRing}`}
                >
                  Deploy Portfolio
                </button>
              </div>
            </div>

            {!hasResumeContent && (
              <p className="mt-3 text-xs text-[#555555]">
                Improve your resume first to generate a portfolio.
              </p>
            )}

            {deployProcessing && (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-[#555555]">
                <span>Deploying portfolio</span>
                <AnimatedDots />
              </p>
            )}

            {exportError && <p className="mt-3 text-xs text-[#555555]">{exportError}</p>}
            {deployError && <p className="mt-3 text-xs text-[#555555]">{deployError}</p>}

            {deploySuccess && deployedUrl && (
              <div className="mt-4 border border-[#E5E5E5] bg-white p-4">
                <p className="text-sm text-[#555555]">Portfolio deployed successfully.</p>
                <p className="mt-1 break-all text-sm text-[#555555]">{deployedUrl}</p>
                <p className="mt-1 text-xs text-[#555555]">Deployed just now.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                  >
                    {isCopied ? "Copied" : "Copy Link"}
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenLink}
                    className={`inline-flex items-center rounded-md border border-[#E5E5E5] px-3 py-1.5 text-sm text-[#111111] transition-colors hover:bg-[#F7F4EC] ${focusRing}`}
                  >
                    Open in new tab
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthModalVariant("predeploy");
        }}
        variant={authModalVariant}
        onContinueGuest={handleContinueAsGuest}
        onSignIn={handlePredeploySignIn}
      />
    </div>
  );
}

function getThemeCss(theme) {
  if (theme === "professional") {
    return `body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #F3F4F6; color: #111111; line-height: 1.55; }
.container { max-width: 900px; margin: 36px auto; padding: 32px; background: #FFFFFF; }
h1 { font-size: 30px; margin: 0 0 8px; font-weight: 700; }
h2 { font-size: 14px; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #D1D5DB; letter-spacing: 0.04em; text-transform: uppercase; }
p { margin: 8px 0; }
ul { margin: 8px 0 8px 20px; }
li { margin-bottom: 5px; }
a { color: #111111; text-decoration: none; }`;
  }

  if (theme === "creative") {
    return `body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #F8F3E7; color: #111111; line-height: 1.6; }
.container { max-width: 900px; margin: 40px auto; padding: 0 20px; }
h1 { font-size: 34px; margin: 0 0 8px; color: #1E3A8A; }
h2 { font-size: 20px; margin: 20px 0 10px; color: #1E3A8A; }
p { margin: 8px 0; }
ul { margin: 8px 0 8px 20px; }
li { margin-bottom: 5px; }
a { color: #1E3A8A; text-decoration: none; }`;
  }

  return `body { font-family: Arial, Helvetica, sans-serif; margin: 0; background: #FFFFFF; color: #000000; line-height: 1.5; }
.container { max-width: 900px; margin: 40px auto; padding: 0 20px; }
h1 { font-size: 30px; margin: 0 0 8px; }
h2 { font-size: 18px; margin: 18px 0 8px; }
p { margin: 6px 0; }
ul { margin: 6px 0 6px 18px; }
li { margin-bottom: 4px; }
a { color: #000000; text-decoration: none; }`;
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

function isSupportedFile(file) {
  const fileName = file.name?.toLowerCase() ?? "";
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";

  return ACCEPTED_MIME_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(extension);
}

function getFirstHeadingText(html) {
  if (!html) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const firstHeading = doc.querySelector("h1");
  return firstHeading?.textContent?.trim() || "";
}

function slugify(value) {
  if (!value) return "";

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
