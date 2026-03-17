# @ai-tutor/api

Express API server — serves the web frontend, handles chat streaming, session management, transcript retrieval, and feedback collection.

## Overview

This is the only process that runs in production.  It:

- Serves `apps/web/public/index.html` (and static assets) at `/`
- Exposes REST/SSE endpoints under `/api/`
- Holds the in-memory session store
- Connects to Supabase (Postgres) for persistence
- Sends emails via Resend when sessions end or feedback is submitted
- Runs an inactivity sweep every 60 seconds to reap idle sessions

## Dependencies

| Package | Purpose |
|---------|---------|
| `@ai-tutor/core` | Tutor logic, Anthropic SDK wrapper, session management |
| `@ai-tutor/db` | Supabase CRUD operations |
| `@ai-tutor/email` | Transcript and feedback emails |
| `express` | HTTP server |
| `cors` | CORS middleware |
| `multer` | Multipart file uploads |
| `geoip-lite` | IP → city/country lookup (local database) |

## API reference

### POST /api/chat

Stream a tutor response.

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sessionId` | string (UUID) | yes | Client-generated; use `crypto.randomUUID()` |
| `message` | string | yes | Student's message text |
| `files[]` | File | no | Max 5; max 10 MB each; JPEG/PNG/GIF/WebP/PDF |

**Response:** `text/event-stream`

```
data: {"type":"text_delta","text":"Let's look at..."}

data: {"type":"text_delta","text":" that equation."}

data: {"type":"message_stop","messageId":"<uuid or null>","tokenUsage":{"inputTokens":N,"outputTokens":N}}
```

On error: `data: {"type":"error","message":"..."}` then connection closes.

**Side effects:**
- On first message: captures client IP, geolocation, user-agent; creates session in DB
- After streaming: persists user and assistant messages to DB; assistant message row includes per-call `input_tokens` and `output_tokens`; updates session `last_activity_at`, `total_input_tokens`, and `total_output_tokens`

---

### GET /api/config

Get non-secret runtime config.

**Response:**

```json
{ "model": "claude-sonnet-4-6", "extendedThinking": true, "inactivityMs": 600000 }
```

---

### GET /api/sessions/:sessionId

Get session metadata from DB.

**Response:**

```json
{
  "id": "uuid",
  "started_at": "2024-01-01T00:00:00Z",
  "last_activity_at": "2024-01-01T00:10:00Z",
  "client_ip": "1.2.3.4",
  "client_geo": { "city": "...", "country": "..." },
  "client_user_agent": "Mozilla/5.0...",
  "email_sent": false,
  "total_input_tokens": 1234,
  "total_output_tokens": 567
}
```

Returns `404` if not found.

---

### DELETE /api/sessions/:sessionId

End a session.

**Behavior:**
1. If session is in memory, transcript exists, and email not yet sent → send transcript email
2. Remove from in-memory store
3. Set `ended_at` on the DB session row (soft delete — session data is retained for analysis)

**Response:**

```json
{ "ok": true }
```

---

### GET /api/transcript/:sessionId

Get conversation transcript.

Prefers in-memory session (most recent); falls back to DB if session was removed.

**Response:**

```json
{
  "transcript": [
    { "role": "Student", "text": "I got v = 10 m/s" },
    { "role": "Tutor", "text": "Walk me through how you set that up." }
  ]
}
```

---

### POST /api/feedback

Submit session feedback.

**Request:** `application/json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sessionId` | string (UUID) | yes | |
| `rating` | integer | no | 1–5 |
| `comment` | string | no | |

**Response:**

```json
{ "ok": true, "id": "uuid" }
```

**Side effects:** Inserts into `feedback` table; sends feedback email (fire-and-forget).

---

### POST /api/disclaimer/accept

Record that the user accepted the disclaimer overlay.

**Request:** `application/json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `sessionId` | string (UUID) | no | Client's current session ID; links acceptance to the session |

**Response:**

```json
{ "ok": true }
```

Always returns `200 { ok: true }`.  DB errors are caught and logged — never surfaced to the client.  Call fire-and-forget from the frontend.

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | **yes** | — | Anthropic API key |
| `SUPABASE_URL` | **yes** | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | — | Supabase service role key |
| `RESEND_API_KEY` | no | — | Resend API key |
| `PARENT_EMAIL` | no | — | Email recipient |
| `EMAIL_FROM` | no | `tutor@tutor.schmim.com` | Sender address |
| `CORS_ORIGIN` | no | `*` | Allowed CORS origin |
| `MODEL` | no | `claude-sonnet-4-6` | Claude model ID |
| `EXTENDED_THINKING` | no | `true` | Set `"false"` to disable |
| `SYSTEM_PROMPT_PATH` | no | `templates/tutor-prompt.md` | Path from repo root |
| `PORT` | no | `3000` | HTTP listen port |

## Setup

```bash
# From the repo root
npm install
npm run build

# Export env vars
export ANTHROPIC_API_KEY=sk-ant-...

# Start the server
npm run api
```

Or in watch mode:

```bash
npm run dev
```

The server listens on `http://localhost:3000` by default.  The web frontend is served at `/`.

## Source structure

```
apps/api/src/
├── index.ts                ← Server entry, middleware, inactivity sweep
├── routes/
│   ├── chat.ts             ← POST /api/chat
│   ├── config.ts           ← GET /api/config
│   ├── sessions.ts         ← GET/DELETE /api/sessions/:id
│   ├── transcript.ts       ← GET /api/transcript/:id
│   ├── feedback.ts         ← POST /api/feedback
│   └── disclaimer.ts       ← POST /api/disclaimer/accept
├── middleware/
│   ├── cors.ts             ← CORS (origin from CORS_ORIGIN env var)
│   └── errors.ts           ← Global error handler
└── lib/
    ├── session-store.ts    ← In-memory Map<sessionId, Session>
    ├── stream.ts           ← SSE helpers (initSSE, sendEvent, sendHeartbeat)
    ├── geo.ts              ← extractClientInfo() — IP, geolocation, user-agent
    └── validation.ts       ← Shared validation constants (UUID regex)
```
