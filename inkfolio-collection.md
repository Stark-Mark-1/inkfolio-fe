 Use this backend endpoint collection (base URL = your deployed backend, e.g. https://inkfolio-be.onrender.com).

  1. Public / Utility

  - GET /health
  - GET /docs
  - GET /openapi.json
  - GET /v1/portfolio/themes
  - GET /v1/public/portfolio/:slug
    Response:

    {
      "slug": "john-doe",
      "hostedUrl": "https://portfolio-inkfolio.vercel.app/john-doe",
      "cloudinaryUrl": "https://res.cloudinary.com/.../index.html"
    }

  2. Upload / Generate (anonymous via cookies or logged-in via JWT)

  - POST /v1/resume/upload
    multipart/form-data with field file
  - POST /v1/generate
    Headers:
      - Idempotency-Key: <unique-key>
      - Content-Type: application/json
        Body:

    {
      "resumeUploadId": "uuid",
      "theme": "minimal-clean",
      "color": "#2563eb"
    }
  - GET /v1/generations/:id/status
  - GET /v1/generations/:id
  - POST /v1/generations/:id/retry

  3. Auth-required

  - GET /v1/auth/me
    Header: Authorization: Bearer <SUPABASE_JWT>
  - GET /v1/generations?limit=20&cursor=
    Header: Authorization: Bearer <SUPABASE_JWT>

  4. Session/Auth behavior

  - Anonymous flow: use cookie jar (-c cookies.txt -b cookies.txt)
  - Logged-in flow: send Authorization: Bearer <token>
  - Do not call frontend /api/improve directly for backend testing; call these backend routes.