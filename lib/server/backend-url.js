const DEFAULT_BACKEND_URL = "http://localhost:3001";

export function getBackendBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  const baseUrl = configured || DEFAULT_BACKEND_URL;
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}
