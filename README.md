# Inkfolio Frontend

Inkfolio frontend built with Next.js (App Router) and Tailwind CSS.
It provides a paper-style workspace to:

- Upload and improve resumes
- Edit generated resume HTML
- Export resume and portfolio code
- Trigger portfolio deploy flow

## Features

- Resume upload with file validation (`PDF`/`DOCX`, max `5MB`)
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

## API Contract (Expected by Frontend)

The UI expects these backend endpoints:

1. `GET /api/usage`
```json
{
  "resume_count": 0,
  "generations_today": 0,
  "remaining_today": 5
}
```

2. `POST /api/improve` (multipart `FormData`, field: `file`)
```json
{
  "improved_html": "<h1>Jane Doe</h1>",
  "structured_json": {}
}
```

3. `POST /api/deploy`
```json
{
  "deployed_url": "https://example.com/portfolio"
}
```

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
