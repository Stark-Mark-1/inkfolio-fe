# Frontend Integration Plan

This document is the implementation handoff for frontend teams integrating with `inkfolio-be`.

## 1. Base Setup

- Base API URL:
  - Local: `http://localhost:3001`
  - Production: your deployed API domain
- Response errors are consistently shaped as:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human-readable message",
    "requestId": "uuid"
  }
}
```

- Every response includes `x-request-id` header. Log it on frontend for support/debug.
- Enable credentials for anonymous session flows:
  - `fetch(..., { credentials: "include" })`
  - axios: `withCredentials: true`

## 2. Auth Modes

There are two valid client modes.

1. Logged-in mode (Supabase JWT)
- Send `Authorization: Bearer <SUPABASE_JWT>`.
- Used for user-specific history endpoint (`GET /v1/generations`).

2. Anonymous mode (cookie-backed session)
- Do not send Authorization header.
- Backend sets/uses `inkfolio_anon` cookie.
- Keep cookie jar enabled across requests.

Important:
- Session-scoped routes (`/v1/resume/upload`, `/v1/generate`, `/v1/generations/:id*`) work with either mode.
- List route (`/v1/generations`) requires logged-in mode.

## 3. End-to-End UX Flows

## 3.1 Anonymous quick flow
1. Upload resume (`POST /v1/resume/upload`) with cookies enabled.
2. Generate (`POST /v1/generate`) with `Idempotency-Key`.
3. If status is `PENDING`, poll `GET /v1/generations/:id/status`.
4. Read `portfolio.slug` and resolve URL via `GET /v1/public/portfolio/:slug`.
5. Redirect user to returned Cloudinary URL.

## 3.2 Logged-in flow
1. Optional profile check (`GET /v1/auth/me`).
2. Upload resume with bearer token.
3. Generate with bearer token + `Idempotency-Key`.
4. Poll status if needed.
5. Show history from `GET /v1/generations`.
6. Resolve slug URL via public endpoint for "View Portfolio".

## 4. Endpoint Contracts

## 4.1 `GET /health`
Purpose:
- Health check and environment metadata.

cURL:
```bash
curl http://localhost:3001/health
```

Response 200:
```json
{
  "ok": true,
  "uptime": 123.456,
  "version": "1.0.0",
  "environment": "development"
}
```

## 4.2 `GET /openapi.json`
Purpose:
- Machine-readable API schema for tooling.

cURL:
```bash
curl http://localhost:3001/openapi.json
```

## 4.3 `GET /docs`
Purpose:
- Swagger UI.

cURL:
```bash
curl http://localhost:3001/docs
```

## 4.4 `GET /v1/auth/me` (requires Bearer token)
Purpose:
- Validate token and fetch/create mapped backend user.

cURL:
```bash
curl http://localhost:3001/v1/auth/me \
  -H "Authorization: Bearer SUPABASE_JWT"
```

Response 200:
```json
{
  "user": {
    "id": "uuid",
    "supabaseUserId": "uuid",
    "email": "user@example.com",
    "createdAt": "2026-02-24T12:00:00.000Z"
  }
}
```

Common errors:
- `401 UNAUTHORIZED`

## 4.5 `POST /v1/resume/upload`
Purpose:
- Upload resume file and parse text preview.

Headers:
- Optional: `Authorization: Bearer <token>`
- Content type: `multipart/form-data`

File constraints:
- Allowed MIME: PDF, DOCX, TXT
- Max file size: 10MB

cURL (anonymous):
```bash
curl -X POST http://localhost:3001/v1/resume/upload \
  -F "file=@./resume.pdf" \
  -c cookies.txt -b cookies.txt
```

cURL (logged-in):
```bash
curl -X POST http://localhost:3001/v1/resume/upload \
  -H "Authorization: Bearer SUPABASE_JWT" \
  -F "file=@./resume.pdf"
```

Response 201:
```json
{
  "resumeUploadId": "uuid",
  "fileUrl": "https://res.cloudinary.com/...",
  "parseStatus": "SUCCESS",
  "extractedTextPreview": "First 500 chars..."
}
```

Common errors:
- `400 FILE_REQUIRED`
- `400 UNSUPPORTED_FILE_TYPE`
- `400 FILE_TOO_LARGE`
- `429 QUOTA_EXCEEDED`

## 4.6 `GET /v1/portfolio/themes`
Purpose:
- Returns selectable theme catalog for generation UI.

cURL:
```bash
curl http://localhost:3001/v1/portfolio/themes
```

Response 200:
```json
{
  "themes": [
    {
      "id": "minimal-clean",
      "name": "Minimal Clean",
      "description": "Neutral palette, clean spacing, and ATS-safe typography."
    },
    {
      "id": "bold-brutalist",
      "name": "Bold Brutalist",
      "description": "High-contrast layout with heavy borders and geometric blocks."
    },
    {
      "id": "elegant-serif",
      "name": "Elegant Serif",
      "description": "Editorial-style serif theme with restrained accents."
    }
  ]
}
```

## 4.7 `POST /v1/generate`
Purpose:
- Create generation with strict idempotency.

Headers:
- Required: `Idempotency-Key: <string>`
- Optional auth: `Authorization: Bearer <token>`

Body:
```json
{
  "resumeUploadId": "uuid",
  "theme": "minimal-clean",
  "color": "#2563eb"
}
```

cURL (anonymous):
```bash
curl -X POST http://localhost:3001/v1/generate \
  -H "Idempotency-Key: gen-key-001" \
  -H "Content-Type: application/json" \
  -d "{\"resumeUploadId\":\"YOUR_UPLOAD_ID\",\"theme\":\"minimal-clean\",\"color\":\"#2563eb\"}" \
  -c cookies.txt -b cookies.txt
```

cURL (logged-in):
```bash
curl -X POST http://localhost:3001/v1/generate \
  -H "Authorization: Bearer SUPABASE_JWT" \
  -H "Idempotency-Key: gen-key-002" \
  -H "Content-Type: application/json" \
  -d "{\"resumeUploadId\":\"YOUR_UPLOAD_ID\",\"theme\":\"elegant-serif\"}"
```

Response 200:
```json
{
  "generationId": "uuid",
  "status": "DONE",
  "resume": {
    "htmlUrl": "https://res.cloudinary.com/..."
  },
  "portfolio": {
    "slug": "john-doe",
    "zipUrl": "https://res.cloudinary.com/...",
    "theme": "minimal-clean"
  }
}
```

Notes:
- If `ENABLE_ASYNC_CONTINUATION=true`, response may be:
```json
{
  "generationId": "uuid",
  "status": "PENDING"
}
```
- If same idempotency key + same payload: returns existing generation response.
- If same idempotency key + different payload: `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`.

Common errors:
- `400 IDEMPOTENCY_KEY_REQUIRED`
- `404 RESUME_NOT_FOUND`
- `409 IDEMPOTENCY_KEY_REUSE_MISMATCH`
- `429 GENERATE_COOLDOWN`
- `429 QUOTA_EXCEEDED`
- `500 GENERATION_CREATE_FAILED`

## 4.8 `GET /v1/generations/:id/status`
Purpose:
- Poll generation completion/status.

Auth/session:
- Same actor/session that created generation must be used.

cURL (anonymous):
```bash
curl http://localhost:3001/v1/generations/YOUR_GENERATION_ID/status \
  -c cookies.txt -b cookies.txt
```

cURL (logged-in):
```bash
curl http://localhost:3001/v1/generations/YOUR_GENERATION_ID/status \
  -H "Authorization: Bearer SUPABASE_JWT"
```

Response 200:
```json
{
  "generationId": "uuid",
  "status": "PENDING|DONE|FAILED",
  "failureReason": "AI_TIMEOUT",
  "resume": {
    "htmlUrl": "https://res.cloudinary.com/..."
  },
  "portfolio": {
    "slug": "john-doe",
    "zipUrl": "https://res.cloudinary.com/...",
    "theme": "minimal-clean"
  }
}
```

Common errors:
- `404 GENERATION_NOT_FOUND`

## 4.9 `GET /v1/generations/:id`
Purpose:
- Fetch final details plus `createdAt`.

Auth/session:
- Same actor/session that created generation must be used.

cURL:
```bash
curl http://localhost:3001/v1/generations/YOUR_GENERATION_ID \
  -c cookies.txt -b cookies.txt
```

Response 200:
```json
{
  "generationId": "uuid",
  "status": "DONE",
  "createdAt": "2026-02-24T12:00:00.000Z",
  "resume": {
    "htmlUrl": "https://res.cloudinary.com/..."
  },
  "portfolio": {
    "slug": "john-doe",
    "zipUrl": "https://res.cloudinary.com/...",
    "theme": "minimal-clean"
  }
}
```

## 4.10 `POST /v1/generations/:id/retry`
Purpose:
- Retry only failed generations.

Auth/session:
- Same actor/session that owns failed generation.

cURL:
```bash
curl -X POST http://localhost:3001/v1/generations/YOUR_FAILED_GENERATION_ID/retry \
  -c cookies.txt -b cookies.txt
```

Response 200:
```json
{
  "generationId": "uuid",
  "status": "PENDING|DONE|FAILED"
}
```

Common errors:
- `400 GENERATION_NOT_RETRYABLE`
- `400 GENERATION_THEME_MISSING`
- `404 GENERATION_NOT_FOUND`
- `429 QUOTA_EXCEEDED`

## 4.11 `GET /v1/generations` (logged-in only)
Purpose:
- Paginated generation history for authenticated users.

Query params:
- `limit` (1..50, default 20)
- `cursor` (generation ID from previous page)

cURL:
```bash
curl "http://localhost:3001/v1/generations?limit=20" \
  -H "Authorization: Bearer SUPABASE_JWT"
```

Response 200:
```json
{
  "items": [
    {
      "generationId": "uuid",
      "status": "DONE",
      "failureReason": null,
      "createdAt": "2026-02-24T12:00:00.000Z",
      "resume": {
        "htmlUrl": "https://res.cloudinary.com/..."
      },
      "portfolio": {
        "slug": "john-doe",
        "zipUrl": "https://res.cloudinary.com/...",
        "theme": "minimal-clean"
      }
    }
  ],
  "nextCursor": "uuid-or-null"
}
```

Common errors:
- `401 UNAUTHORIZED`
- `400 INVALID_CURSOR`

## 4.12 `GET /v1/public/portfolio/:slug` (public)
Purpose:
- Resolve current published portfolio URL for slug.
- Intended for separate portfolio host app.

cURL:
```bash
curl http://localhost:3001/v1/public/portfolio/john-doe
```

Response 200:
```json
{
  "slug": "john-doe",
  "url": "https://res.cloudinary.com/<cloud>/raw/upload/inkfolio/portfolios/john-doe/v3/index.html"
}
```

Common errors:
- `404 PORTFOLIO_NOT_FOUND`

## 5. Portfolio Host Integration (Important)

Portfolio host app (`portfolio-inkfolio.vercel.app`) should:

1. Read slug from route (`/:slug`).
2. Call API: `GET /v1/public/portfolio/:slug`.
3. If success, redirect browser to returned `url`.
4. If 404, show custom not-found page.
5. Log `requestId` on failures.

Server-side redirect example behavior:
- `302 Location: <url from API>`

## 6. Frontend Reliability Rules

1. Generate idempotency key per submit click.
- Reuse the same key only when retrying the exact same payload.

2. Polling strategy for `PENDING`.
- Poll `/v1/generations/:id/status` every 2-3 seconds.
- Stop on `DONE` or `FAILED`.
- Timeout client polling around 60-90 seconds with fallback UI.

3. Always preserve actor context.
- Anonymous: keep cookies enabled.
- Logged-in: keep bearer token attached.

4. Handle quotas and cooldown explicitly.
- `429 QUOTA_EXCEEDED`: show daily quota message.
- `429 GENERATE_COOLDOWN`: ask user to wait 5 seconds.

5. Use request IDs for support.
- Capture `x-request-id` and backend `error.requestId`.

## 7. Known Limits and Behavior

- Upload route rate limit: 30 requests/minute per IP.
- Generate route rate limit: 20 requests/minute per IP.
- User quota: 10 resume uploads/day, 10 generations/day.
- Anonymous quota: 5 generations/day.
- Generation API can return `DONE` inline or `PENDING` depending on `ENABLE_ASYNC_CONTINUATION`.

