# Teagasc Automation Portal

A modern, monochrome portal that showcases Teagasc data automation solutions with an iOS‑style liquid glass UI. Includes a submission form that emails the ICT Research & Innovation team with automation ideas.

## Features

- Glassmorphism UI with dynamic refraction filters and motion
- 3‑column app grid with icons, descriptions, and CTA buttons
- Idea submission form with server‑side email (and mailto fallback)

## Quick start

1. Install dependencies:
   - `npm install`
2. (Optional) Configure email:
   - Copy `.env.example` to `.env` and set your SMTP details.
   - For an insecure/internal relay, try `SMTP_PORT=25` + `SMTP_IGNORE_TLS=true`.
3. Run:
   - `npm start`
4. Open:
   - `http://localhost:3000`

## Email configuration

The form posts to `POST /api/ideas` and sends an email to `IDEA_RECIPIENT` (defaults to `TeagascICTResearchInnovationteam@teagasc.ie`).

- Only `SMTP_HOST` is required. `SMTP_USER` / `SMTP_PASS` are optional for relays that allow unauthenticated sending.
- The portal **always** sends from `SMTP_FROM`. The user’s email is used only as `Reply‑To`.
- Debug tip: set `SMTP_DEBUG=true` to include safe SMTP error details in the API response and enable `SMTP_VERIFY_ON_START=true` to verify on boot.

## Scripts

- `npm start` — run the server
- `npm run dev` — run with file watching
