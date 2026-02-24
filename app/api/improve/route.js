import { NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/server/backend-url";

export const runtime = "nodejs";

const DEFAULT_THEME = "minimal-clean";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: {
            code: "FILE_REQUIRED",
            message: "A resume file is required under form field 'file'.",
          },
        },
        { status: 400 }
      );
    }

    const theme = normalizeText(formData.get("theme")) || DEFAULT_THEME;
    const color = normalizeText(formData.get("color"));
    const idempotencyKey =
      normalizeText(request.headers.get("idempotency-key")) || `gen-${crypto.randomUUID()}`;

    const backendUrl = getBackendBaseUrl();
    const authHeader = normalizeText(request.headers.get("authorization"));
    const cookieJar = createCookieJar(request.headers.get("cookie"));
    const passthroughSetCookies = [];

    const uploadFormData = new FormData();
    uploadFormData.set("file", file, file.name || "resume.pdf");

    const uploadResponse = await fetch(`${backendUrl}/v1/resume/upload`, {
      method: "POST",
      headers: buildForwardHeaders({ authHeader, cookieJar }),
      body: uploadFormData,
      cache: "no-store",
    });

    harvestSetCookies(uploadResponse, cookieJar, passthroughSetCookies);

    if (!uploadResponse.ok) {
      return passthroughBackendResponse(uploadResponse, passthroughSetCookies);
    }

    const uploadPayload = await parseJsonSafe(uploadResponse);
    const resumeUploadId = uploadPayload?.resumeUploadId;

    if (!resumeUploadId) {
      return withSetCookies(
        NextResponse.json(
          {
            error: {
              code: "UPLOAD_RESPONSE_INVALID",
              message: "Backend upload succeeded but did not return resumeUploadId.",
            },
          },
          { status: 502 }
        ),
        passthroughSetCookies
      );
    }

    const generateBody = {
      resumeUploadId,
      theme,
    };

    if (color) {
      generateBody.color = color;
    }

    const generateHeaders = buildForwardHeaders({ authHeader, cookieJar });
    generateHeaders.set("content-type", "application/json");
    generateHeaders.set("idempotency-key", idempotencyKey);

    const generateResponse = await fetch(`${backendUrl}/v1/generate`, {
      method: "POST",
      headers: generateHeaders,
      body: JSON.stringify(generateBody),
      cache: "no-store",
    });

    harvestSetCookies(generateResponse, cookieJar, passthroughSetCookies);

    if (!generateResponse.ok) {
      return passthroughBackendResponse(generateResponse, passthroughSetCookies);
    }

    const generatePayload = await parseJsonSafe(generateResponse);
    const response = NextResponse.json(
      {
        resumeUploadId,
        ...generatePayload,
      },
      { status: 200 }
    );

    const requestId = normalizeText(generateResponse.headers.get("x-request-id"));
    if (requestId) {
      response.headers.set("x-request-id", requestId);
    }

    return withSetCookies(response, passthroughSetCookies);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "IMPROVE_PROXY_FAILED",
          message: error instanceof Error ? error.message : "Unexpected improve proxy error.",
        },
      },
      { status: 500 }
    );
  }
}

function normalizeText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function createCookieJar(cookieHeaderValue) {
  const jar = new Map();
  if (!cookieHeaderValue) return jar;

  const pairs = cookieHeaderValue.split(";");
  for (const pair of pairs) {
    const [rawName, ...rawValue] = pair.split("=");
    const name = rawName?.trim();
    const value = rawValue.join("=").trim();
    if (!name) continue;
    jar.set(name, value);
  }
  return jar;
}

function serializeCookieJar(cookieJar) {
  const parts = [];
  for (const [name, value] of cookieJar.entries()) {
    parts.push(`${name}=${value}`);
  }
  return parts.join("; ");
}

function buildForwardHeaders({ authHeader, cookieJar }) {
  const headers = new Headers();

  if (authHeader) {
    headers.set("authorization", authHeader);
  }

  const cookieHeader = serializeCookieJar(cookieJar);
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  return headers;
}

function harvestSetCookies(response, cookieJar, passthroughSetCookies) {
  const setCookies = getSetCookies(response.headers);
  for (const setCookie of setCookies) {
    passthroughSetCookies.push(setCookie);
    const firstPart = setCookie.split(";")[0];
    const separator = firstPart.indexOf("=");
    if (separator === -1) continue;
    const name = firstPart.slice(0, separator).trim();
    const value = firstPart.slice(separator + 1).trim();
    if (!name) continue;
    cookieJar.set(name, value);
  }
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const fallback = headers.get("set-cookie");
  return fallback ? [fallback] : [];
}

async function parseJsonSafe(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function passthroughBackendResponse(backendResponse, passthroughSetCookies) {
  const headers = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  const requestId = backendResponse.headers.get("x-request-id");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (requestId) {
    headers.set("x-request-id", requestId);
  }

  for (const setCookie of passthroughSetCookies) {
    headers.append("set-cookie", setCookie);
  }

  const body = await backendResponse.text();
  return new Response(body, {
    status: backendResponse.status,
    headers,
  });
}

function withSetCookies(response, passthroughSetCookies) {
  for (const setCookie of passthroughSetCookies) {
    response.headers.append("set-cookie", setCookie);
  }
  return response;
}
