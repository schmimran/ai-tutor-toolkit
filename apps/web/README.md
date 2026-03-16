# @ai-tutor/web

Static web frontend for the AI Tutor.  No framework, no build step — a single HTML file served directly by the API server.

## Structure

```
apps/web/
├── public/
│   └── index.html   ← All HTML, CSS, and JS in one file
├── package.json
└── README.md
```

## Usage

Start the API server — it serves this frontend automatically:

```bash
npm run api          # from monorepo root
```

Then open <http://localhost:3000>.

## CDN dependencies

Loaded via `<script>` and `<link>` tags in `index.html`:

| Library | Purpose |
|---------|---------|
| [KaTeX](https://katex.org/) | Render LaTeX math in tutor responses |
| [marked](https://marked.js.org/) | Render Markdown in tutor responses |

## Features

- **Streaming chat** — responses stream token-by-token via SSE
- **Markdown + math** — marked + KaTeX auto-render after each message
- **File attachments** — images and PDFs via click or drag-and-drop
- **Transcript viewer** — modal with copy-to-clipboard
- **Session end detection** — sentinel-based with inline wrap-up banner
- **Inactivity timeout** — auto-emails transcript after 10 minutes of idle
- **Per-message feedback** — thumbs up/down shown after session ends
- **New session** — one-click reset with automatic prior session cleanup
- **Model indicator** — shows current model and extended thinking status
