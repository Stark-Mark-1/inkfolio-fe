const DEFAULT_API_BASE_URL = "http://localhost:3001";
const AUTH_TOKEN_STORAGE_KEY = "inkfolio_supabase_jwt";

function getApiBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const baseUrl = configured || DEFAULT_API_BASE_URL;
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function toUrl(path) {
  if (!path.startsWith("/")) {
    throw new Error(`Backend path must start with '/': ${path}`);
  }

  return `${getApiBaseUrl()}${path}`;
}

export class ApiError extends Error {
  constructor({ code, message, requestId, status }) {
    super(message || "Request failed");
    this.name = "ApiError";
    this.code = code || "UNKNOWN_ERROR";
    this.requestId = requestId || "";
    this.status = status || 0;
  }
}

export function getStoredAuthToken() {
  if (typeof window === "undefined") return "";

  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

async function request(path, { method = "GET", body, signal, token, idempotencyKey } = {}) {
  const headers = new Headers();
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  let requestBody = body;

  if (body && !isFormData && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(toUrl(path), {
    method,
    headers,
    body: requestBody,
    credentials: "include",
    signal,
  });

  const payload = await parseResponseBody(response);
  const headerRequestId = response.headers.get("x-request-id") || "";
  const payloadRequestId =
    payload && typeof payload === "object" && payload.error?.requestId ? payload.error.requestId : "";
  const requestId = headerRequestId || payloadRequestId;

  if (!response.ok) {
    const errorCode =
      payload && typeof payload === "object" && payload.error?.code ? payload.error.code : "HTTP_ERROR";
    const errorMessage =
      payload && typeof payload === "object" && payload.error?.message
        ? payload.error.message
        : `Request failed with status ${response.status}`;

    throw new ApiError({
      code: errorCode,
      message: errorMessage,
      requestId,
      status: response.status,
    });
  }

  return {
    payload,
    requestId,
  };
}

export function createIdempotencyKey(prefix = "gen") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
}

export async function getHealth(signal) {
  return request("/health", { signal });
}

export async function getAuthMe({ token, signal } = {}) {
  return request("/v1/auth/me", { token, signal });
}

export async function getPortfolioThemes(signal) {
  return request("/v1/portfolio/themes", { signal });
}

export async function uploadResume({ file, token, signal }) {
  const formData = new FormData();
  formData.append("file", file);

  return request("/v1/resume/upload", {
    method: "POST",
    body: formData,
    token,
    signal,
  });
}

export async function createGeneration({
  resumeUploadId,
  theme,
  color,
  token,
  idempotencyKey,
  signal,
}) {
  return request("/v1/generate", {
    method: "POST",
    token,
    idempotencyKey,
    signal,
    body: {
      resumeUploadId,
      theme,
      color,
    },
  });
}

export async function getGenerationStatus({ generationId, token, signal }) {
  return request(`/v1/generations/${generationId}/status`, { token, signal });
}

export async function getGeneration({ generationId, token, signal }) {
  return request(`/v1/generations/${generationId}`, { token, signal });
}

export async function retryGeneration({ generationId, token, signal }) {
  return request(`/v1/generations/${generationId}/retry`, {
    method: "POST",
    token,
    signal,
  });
}

export async function listGenerations({ token, limit = 20, cursor, signal } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);

  return request(`/v1/generations?${params.toString()}`, { token, signal });
}

export async function resolvePublicPortfolio({ slug, signal }) {
  return request(`/v1/public/portfolio/${encodeURIComponent(slug)}`, { signal });
}
