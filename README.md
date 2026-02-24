# Inkfolio Frontend

Inkfolio frontend built with Next.js (App Router) and Tailwind CSS.
It provides a paper-style workspace to:

- Upload and improve resumes
- Edit generated resume HTML
- Export resume and portfolio code
- Trigger portfolio deploy flow

## Features

- Resume upload with file validation (`PDF`/`DOCX`/`TXT`, max `10MB`)
- Usage-aware generation flow (`remaining_today`)
- Inline editable resume HTML surface
- Resume export (`.html`)
- Portfolio code export (`index.html + style.css` in `.zip`)
- Theme switching for portfolio CSS (`minimal`, `professional`, `creative`)
- Deploy flow with pre-deploy auth nudge and guest continuation

## Tech Stack

- Next.js (App Router)
- React
- Tailwind CSS
- JSZip (for portfolio export bundles)

## Prerequisites

- Node.js 18+
- npm

## Quick Start

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Scripts

- `npm run dev` - start development server
- `npm run build` - create production build
- `npm run start` - run production server
- `npm run lint` - run lint script

## Routes

- `/` - landing page
- `/workspace` - resume + portfolio workspace
- `/auth/signin` - sign-in page

## API Contract (Integrated)

Upload + generate are orchestrated through frontend API route:

1. `POST /api/improve` (frontend route)
   - Accepts `multipart/form-data` with `file` (+ optional `theme`, `color`)
   - Proxies to backend:
     - `POST /v1/resume/upload`
     - `POST /v1/generate` with `Idempotency-Key`
   - Does **not** manually construct multipart boundaries.

Other frontend calls target `inkfolio-be` directly (default: `http://localhost:3001`).
Implemented backend endpoints:

1. `GET /v1/portfolio/themes`
2. `GET /v1/auth/me` (if JWT exists in local storage key `inkfolio_supabase_jwt`)
3. `POST /v1/resume/upload`
4. `POST /v1/generate` (with `Idempotency-Key`)
5. `GET /v1/generations/:id/status` (polling for pending jobs)
6. `GET /v1/generations/:id` (detail hydration)
7. `POST /v1/generations/:id/retry`
8. `GET /v1/generations` (logged-in history only)
9. `GET /v1/public/portfolio/:slug` (live portfolio URL resolution)

Behavior notes:

- Anonymous mode is supported via cookie-backed session (`credentials: include`).
- Logged-in mode is used automatically when a bearer token is present.
- Upload supports `PDF`, `DOCX`, and `TXT` up to `10MB`.

## Environment Variables

Set backend URL in Vercel for reliable routing:

```env
BACKEND_URL=https://your-backend-domain
NEXT_PUBLIC_BACKEND_URL=https://your-backend-domain
```

Resolution order:

1. `BACKEND_URL` (server routes like `/api/improve`)
2. `NEXT_PUBLIC_BACKEND_URL` (browser + server fallback)
3. `NEXT_PUBLIC_API_BASE_URL` (legacy fallback)
4. default `http://localhost:3001`

## Project Structure

```text
app/
  page.jsx               # landing
  workspace/page.jsx     # main workspace
  auth/signin/page.jsx   # sign-in
components/              # UI components
lib/                     # shared helpers
```

## Contributing

Contributions are welcome. For consistent reviews:

1. Fork the repo and create a feature branch.
2. Keep changes scoped and include rationale in PR description.
3. Run local checks before opening PR:
   - `npm run dev`
   - `npm run build`
4. Include screenshots/GIFs for UI-affecting changes.
5. Link related issues in the PR.

## Security

- Do not commit secrets, keys, or production credentials.
- Report security issues privately to maintainers (add contact details here).

## License

No license file is currently included in this repository.
Add a `LICENSE` file (for example, MIT/Apache-2.0) before public open-source distribution.
