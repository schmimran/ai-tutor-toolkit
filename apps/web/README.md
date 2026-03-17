# @ai-tutor/web

Static web frontend for the AI Tutor.  No framework, no build step — a single HTML file served directly by the API server.

## Overview

`apps/web/public/index.html` is the entire frontend.  It is served as a static file by `apps/api`.  No compilation required — edit the file and refresh the browser.

## Structure

```
apps/web/
├── public/
│   └── index.html   ← All HTML, CSS, and JavaScript in one file
├── package.json
└── README.md
```

## Usage

Start the API server — it serves this frontend automatically:

```bash
npm run api          # from monorepo root
```

Then open `http://localhost:3000`.

## CDN dependencies

Loaded via `<script>` and `<link>` tags in `index.html` — no npm install needed:

| Library | Purpose |
|---------|---------|
| [KaTeX](https://katex.org/) | Render LaTeX math expressions in tutor responses |
| [marked](https://marked.js.org/) | Render Markdown in tutor responses |
| [Google Fonts](https://fonts.google.com/) | Nunito, Plus Jakarta Sans, JetBrains Mono typefaces |

## Features

| Feature | Description |
|---------|-------------|
| Streaming chat | Responses stream token-by-token via SSE (`/api/chat`) |
| Markdown + math | marked + KaTeX auto-render after each message |
| File attachments | Images and PDFs via click or drag-and-drop (up to 5 files, 10 MB each) |
| Transcript viewer | Modal with copy-to-clipboard |
| Session end detection | Sentinel-based: tutor includes `[END_SESSION_AVAILABLE]` to trigger wrap-up banner |
| Inactivity timeout | Auto-ends session after 10 minutes idle; triggers transcript email |
| Per-message feedback | Thumbs up/down per category (Accuracy, Usefulness, Tone) collected at session end |
| New session | One-click reset with automatic prior session cleanup (`DELETE /api/sessions/:id`) |
| Model indicator | Shows current model and extended thinking status (from `/api/config`) |
| Disclaimer overlay | Shown on first visit; acceptance recorded via `POST /api/disclaimer/accept` |

## API calls made by the frontend

| Endpoint | When |
|----------|------|
| `GET /api/config` | On page load |
| `POST /api/chat` | On each message send |
| `GET /api/transcript/:sessionId` | When transcript modal is opened |
| `POST /api/feedback/batch` | When end-of-session feedback is submitted |
| `POST /api/disclaimer/accept` | When disclaimer overlay is accepted |
| `DELETE /api/sessions/:sessionId` | On inactivity timeout, session end, or new session button |

## Design notes

- Dark color scheme; purple (`#7c6af7`) and cyan (`#22d3ee`) accent colors
- Single-column flex layout; responsive on mobile
- Student messages: dark purple-tinted bubbles; tutor messages: dark teal-tinted bubbles
- Session ID is a client-generated UUID (`crypto.randomUUID()`), stored in memory (not localStorage)

## Contributing

Do not add a build step or a framework to this package.  The single-file constraint is intentional — it keeps the frontend auditable, deployable without tooling, and easy to hand to a non-developer.

If the file grows significantly, split CSS and JS into separate files in `public/` before reaching for a framework.
