# Web Tutor

Express server with a single-page chat interface.  The student types messages and the tutor responds.  Supports file uploads, transcript export, and session management.  The API key stays server-side — the student never sees it.

## Technology

- **Runtime:** Node.js 18+
- **Language:** JavaScript (ES modules)
- **Server:** Express 4
- **File uploads:** Multer (in-memory storage)
- **Email:** Resend SDK
- **Geo lookup:** geoip-lite (local database, no external API)
- **Frontend:** Single HTML file — no build step, no dependencies, no framework

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@ai-tutor/core` | workspace | Shared tutor logic (Anthropic SDK, session management, config) |
| `express` | ^4.21.0 | HTTP server and routing |
| `geoip-lite` | ^1.4.10 | IP-to-location lookup (local database) |
| `multer` | ^1.4.5-lts.1 | Multipart file upload handling |
| `resend` | ^4.0.0 | Email delivery for session summaries |

## Design methodology

The web app is a thin HTTP layer over the shared core.  Express handles routing and static file serving.  Multer handles file uploads in memory — files are stored in the session for later email attachment.  Sessions are stored in memory keyed by UUID, generated client-side.  Restarting the server clears all sessions.

When a session ends (via "End session" button, "New session" button, tab close, or 10-minute inactivity timeout), the server packages the full transcript and any uploaded files into an email and sends it via Resend.  The `emailSent` flag on each session prevents double-sends.

The frontend is a single `index.html` file containing HTML, CSS, and JavaScript together.  This was a deliberate choice: no build step means no toolchain to maintain, and the chat interface is simple enough that a framework would add complexity without value.

## Setup

From the repository root:

```bash
npm install
```

Or from this directory:

```bash
npm install
```

### Configure

```bash
cp .env.example .env
```

Set your `ANTHROPIC_API_KEY` in `.env`.

## Usage

From the repository root:

```bash
npm run serve
```

Or from this directory:

```bash
npm run serve
```

Open `http://localhost:3000` in your browser.

### Features

- **Chat interface** — student messages on the right, tutor on the left.
- **File uploads** — click the paperclip icon or drag-and-drop to attach images (jpg, png, gif, webp) or PDFs.  Up to 5 files per message, 10 MB max each.
- **Transcript export** — click "Transcript" to view the full session, copy it to clipboard.
- **End session** — click "End session" to email the session summary and start fresh.
- **New session** — click "New session" to clear the conversation and start fresh (also emails the summary).
- **Model indicator** — shows which model and whether extended thinking is active.
- **Automatic session capture** — sessions idle for 10 minutes are emailed and reaped server-side.

### Using a specific prompt

```bash
SYSTEM_PROMPT_PATH=examples/physics-geometry-9th-grade.md npm run serve
```

Or set it in your `.env` file.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send a message with optional file attachments |
| `GET` | `/api/transcript/:sessionId` | Export a session transcript |
| `POST` | `/api/end-session` | Email session summary and delete session |
| `POST` | `/api/reset` | Clear a session (also emails summary if not already sent) |
| `GET` | `/api/config` | Expose non-sensitive config (model, extended thinking) |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key |
| `SYSTEM_PROMPT_PATH` | `templates/tutor-prompt.md` | Path to the system prompt, resolved from the repo root |
| `MODEL` | `claude-sonnet-4-6` | Model to use |
| `EXTENDED_THINKING` | `true` | Enable extended thinking (set to `false` to disable) |
| `PORT` | `3000` | Port for the web server |
| `RESEND_API_KEY` | (required for email) | Resend API key for session email summaries |
| `PARENT_EMAIL` | `me@schmim.com` | Email address for session summaries |
