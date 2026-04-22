# @ai-tutor/web

Static web frontend for the AI Tutor.  No framework, no build step — plain HTML, CSS, and JavaScript served directly by the API server.

## Overview

The frontend lives in `apps/web/public/` and is served as static files by `apps/api`.  No compilation required — edit a file and refresh the browser.

## Structure

```
apps/web/
├── public/
│   ├── index.html     ← Main chat page (HTML structure and CDN references)
│   ├── styles.css     ← Core layout and component CSS
│   ├── app.js         ← Chat application logic
│   ├── gallery.css    ← Gallery pane styles (loaded after styles.css)
│   ├── gallery.js     ← Gallery pane logic (loaded after app.js)
│   ├── auth.js        ← Centralized auth module (window.auth, authedFetch, supabase-js init)
│   ├── login.html     ← Login / register / forgot-password page
│   ├── login.css      ← Login page styles
│   ├── login.js       ← Login page logic (tabs, server-side proxies, hash callbacks)
│   ├── settings.html  ← Account settings page (password, email, preferences)
│   ├── settings.css   ← Settings page styles
│   ├── settings.js    ← Settings page logic (supabase-js direct updates)
│   ├── history.html   ← Session history page
│   ├── history.css    ← Session history page styles
│   ├── history.js     ← Session history logic
│   ├── admin.html     ← Admin panel (evaluation batch management)
│   ├── mockup.html    ← Static UI reference implementation (docs/ui-style-guide.md)
│   ├── manifest.json  ← PWA web app manifest
│   └── icons/         ← PWA app icons (192×192 and 512×512 PNGs)
├── package.json
└── README.md
```

Each page has a matching CSS file (`page.html` + `page.css`) and, where needed, a page JS module (`page.js`). `styles.css` and `auth.js` are shared.

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
| Chat bubble thumbnails | Uploaded images shown as 48×48 clickable thumbnails in user message bubbles; PDFs shown as a 📄 pill |
| Image gallery pane | Collapsible left-side pane showing all uploads for the session; opens on thumbnail click or toggle button |
| Tutor image references | When the tutor response contains `[IMG:filename.ext]`, it renders as a clickable pill that opens the gallery focused on that file. Protocol definition: [templates/system-instructions.md](../../templates/system-instructions.md). |
| Transcript viewer | Modal with copy-to-clipboard |
| Inactivity timeout | Auto-ends session after 10 minutes idle; triggers transcript email |
| End-session banner | When the tutor resolves a problem or finishes a question, a green banner suggests ending the session; driven by the `[END_SESSION_AVAILABLE]` sentinel defined in [templates/system-instructions.md](../../templates/system-instructions.md). |
| Session feedback | Session-level outcome, experience, and comment collected at session end. |
| New session | One-click reset with automatic prior session cleanup (`DELETE /api/sessions/:id`) |
| Model indicator | Shows current model and extended thinking status (from `/api/config`) |
| Auth gate | Unauthenticated users are redirected to `/login.html`. Auth is required everywhere. |

## API calls made by the frontend

| Endpoint | When |
|----------|------|
| `GET /api/config` | On page load |
| `POST /api/chat` | On each message send |
| `GET /api/transcript/:sessionId` | When transcript modal is opened |
| `POST /api/feedback` | When end-of-session feedback is submitted or skipped. |
| `DELETE /api/sessions/:sessionId` | On inactivity timeout or new session button |

## Gallery pane

The gallery pane is a collapsible `<aside>` to the left of the chat column.  It opens when:
- The student clicks a thumbnail in a chat bubble
- The student clicks the 🖼 toggle button in the header
- The tutor's response contains an `[IMG:filename.ext]` reference marker

On viewports ≤ 768px it renders as a fixed-position slide-over drawer with a semi-transparent backdrop.

`gallery.js` exposes these globals for `app.js` to call:
- `openGallery()` / `closeGallery()` / `isGalleryOpen()`
- `focusUpload(uploadId)` — focuses a specific upload in the viewer
- `addToGallery(entry)` — adds a thumbnail to the strip
- `resetGallery()` — clears all thumbnails (called on new session)

`app.js` exposes `sessionUploads` as a global array that `gallery.js` reads to resolve upload IDs to entries.

### `[IMG:filename]` reference protocol

When the tutor model is instructed to reference an uploaded file, it should use the exact filename in the format `[IMG:filename.ext]`.  The frontend replaces this marker with a clickable pill:

```html
<span class="img-ref" data-upload-id="upload-0" title="View: homework.jpg">📎 homework.jpg</span>
```

Clicking the pill calls `focusUpload()` with the upload's ID and opens the gallery.  If the filename doesn't match any upload in `sessionUploads`, the pill renders as muted and non-interactive.

## Configuration

This app has no env vars of its own. It fetches non-secret runtime config from `GET /api/config` on page load (model, available prompts, contact email, Supabase URL + anon key for supabase-js). Secrets live in `apps/api`. For the full config table, see [CLAUDE.md](../../CLAUDE.md#configsecrets-management).

## Design notes

- Active design system: [docs/ui-style-guide.md](../../docs/ui-style-guide.md) (Warm Red palette).
- Flex-row layout: gallery pane (0 width when closed, 320px when open) + chat column (flex: 1).
- Session ID is a client-generated UUID (`crypto.randomUUID()`), stored in memory (not localStorage).

## Contributing

Do not add a build step or a framework to this package.  The no-tooling constraint is intentional — it keeps the frontend auditable, deployable without tooling, and easy to hand to a non-developer.

CSS lives in `styles.css` and JavaScript in `app.js`.  New feature modules (e.g., gallery, auth) should be added as separate files in `public/` and loaded via `<script>` tags in `index.html`.
