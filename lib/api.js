// Backend API client — matches FRONTEND_INTEGRATION_PLAN.md exactly.
//
// All requests go through the Next.js proxy at /api/backend/* (defined in
// next.config.js). This avoids CORS entirely: the browser calls the same
// Vercel origin, and Next.js forwards the request to the backend server-side.

function getBaseUrl() {
  // In a browser context use the same-origin proxy path.
  // In a server/build context fall back to the direct backend URL.
  if (typeof window !== "undefined") {
    return "/api/backend";
  }
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:3001";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor({ code, message, requestId, status }) {
    super(message || "Request failed");
    this.name = "ApiError";
    this.code = code || "UNKNOWN_ERROR";
    this.requestId = requestId || "";
    this.status = status || 0;
  }
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function request(path, { method = "GET", body, token, idempotencyKey, signal } = {}) {
  const headers = new Headers();
  const isFormData = body instanceof FormData;

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }
  if (body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    credentials: "include", // keeps inkfolio_anon cookie for anonymous sessions
    signal,
  });

  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : null;

  const requestId =
    res.headers.get("x-request-id") || payload?.error?.requestId || "";

  if (!res.ok) {
    throw new ApiError({
      code: payload?.error?.code || "HTTP_ERROR",
      message: payload?.error?.message || `HTTP ${res.status}`,
      requestId,
      status: res.status,
    });
  }

  return { payload, requestId };
}

// ---------------------------------------------------------------------------
// Idempotency key helper (section 6.1 of plan)
// ---------------------------------------------------------------------------

export function makeIdempotencyKey(prefix = "gen") {
  return `${prefix}-${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// 4.4  GET /v1/auth/me  (requires Bearer token)
export async function getAuthMe({ token, signal } = {}) {
  return request("/v1/auth/me", { token, signal });
}

// 4.6  GET /v1/portfolio/themes
export async function getPortfolioThemes(signal) {
  return request("/v1/portfolio/themes", { signal });
}

// 4.5  POST /v1/resume/upload
export async function uploadResume({ file, token, signal }) {
  const form = new FormData();
  form.append("file", file);
  return request("/v1/resume/upload", { method: "POST", body: form, token, signal });
}

// 4.7  POST /v1/generate
export async function createGeneration({
  resumeUploadId,
  theme,
  color,
  token,
  idempotencyKey,
  signal,
}) {
  const body = { resumeUploadId, theme };
  if (color) body.color = color;
  return request("/v1/generate", { method: "POST", body, token, idempotencyKey, signal });
}

// 4.8  GET /v1/generations/:id/status  (poll until DONE or FAILED)
export async function getGenerationStatus({ generationId, token, signal }) {
  return request(`/v1/generations/${generationId}/status`, { token, signal });
}

// 4.9  GET /v1/generations/:id
export async function getGeneration({ generationId, token, signal }) {
  return request(`/v1/generations/${generationId}`, { token, signal });
}

// 4.10 POST /v1/generations/:id/retry
export async function retryGeneration({ generationId, token, signal }) {
  return request(`/v1/generations/${generationId}/retry`, { method: "POST", token, signal });
}

// 4.11 GET /v1/generations  (logged-in only)
export async function listGenerations({ token, limit = 20, cursor, signal } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return request(`/v1/generations?${params.toString()}`, { token, signal });
}

// 4.12 GET /v1/public/portfolio/:slug  (public)
export async function resolvePublicPortfolio({ slug, signal }) {
  return request(`/v1/public/portfolio/${encodeURIComponent(slug)}`, { signal });
}
