# Inkfolio UI/UX + Frontend Skills

This project is **Inkfolio** — a minimalist, professional resume + portfolio utility.
The UI must feel like a well-built internal tool used by engineers.

## 1) Visual Identity Rules (Non-negotiable)

### Never use
- Gradients
- Glow / neon / bloom
- Glassmorphism / blur cards
- “AI sparkles” or futuristic motifs
- Illustrations / mascots / hero graphics
- Dribbble-style concept visuals
- Over-animated transitions

### Color system
- Background: `#F8F8F6`
- Primary text: `#111111`
- Muted text: `#555555`
- Border: `#E5E5E5`
- Accent (restrained): Deep Ink Blue `#1E3A8A`

Accent usage:
- Primary CTA only
- Key links only
- Avoid large accent surfaces

### Typography
- Inter preferred, else system stack
- Strong hierarchy via spacing + weight
- No decorative fonts

### Layout
- Max-width container (e.g. 960–1100px)
- Whitespace-first
- Thin borders + subtle dividers
- Calm, quiet composition

## 2) Product Tone & Copy
- Serious, utility-first, professional
- No hype, no startup pitch
- No “AI magic” words
- Error copy is specific and calm

## 3) Frontend Stack Constraints
- Next.js (App Router)
- Tailwind CSS
- Keep bundle minimal
- No heavy UI libraries
- Components should be reusable and simple

## 4) Required Pages & Components

### Landing (`/`)
- Headline: “Write better. Launch smarter.”
- Subtext: “Improve your resume. Generate a portfolio. Deploy instantly.”
- CTA: “Upload Resume” (primary)
- Secondary: “Sign In”
- Top dismissible banner:
  - “Sign in to save your progress.”
  - Buttons: Sign In / Continue as Guest / Dismiss
- Sticky footer button:
  - “Support Indian Army Families”
  - Opens modal with official link + UPI QR placeholder

### Auth
- Fallback page: `/auth/signin`
- AuthModal component usable anywhere
- Methods:
  - Email OTP (send code → verify code)
  - Google OAuth button
- “Before deploy” guest nudge modal:
  - “Deploying creates a permanent URL. Sign in to manage it later.”
  - Buttons: Sign In / Continue as Guest

## 5) Accessibility & UX Quality
- Labels for inputs
- Clear focus rings (subtle)
- Keyboard navigable modals
- Proper aria for dialogs
- Loading + disabled states that are quiet and consistent

## 6) Implementation Principles
- Semantic HTML first
- Minimal DOM
- Consistent spacing scale
- Buttons: primary/secondary/ghost
- Components: Layout, Banner, Footer, Modal, Forms
- No unnecessary abstractions