# @ai-tutor/api

Express API server — serves the web frontend, handles chat streaming, session management, transcript retrieval, and feedback collection.

## Overview

This is the only process that runs in production.  It:

- Serves `apps/web/public/index.html` (and static assets) at `/`
- Exposes REST/SSE endpoints under `/api/`
- Holds the in-memory session store
- Connects to Supabase (Postgres) for persistence
- Sends emails via Resend when sessions end (transcript + evaluation + feedback)
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
| `express-rate-limit` | Per-endpoint rate limiting for auth routes |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Stream a tutor response (SSE, multipart/form-data with optional file uploads). Requires auth. |
| `GET` | `/api/config` | Non-secret runtime config (model, extended thinking, inactivity timeout, supabase URL + anon key) |
| `GET` | `/api/sessions/:id` | Session metadata from DB. Requires auth + ownership. |
| `DELETE` | `/api/sessions/:id` | End session; runs evaluation, sends transcript email, sets `ended_at`. Requires auth + ownership. |
| `GET` | `/api/transcript/:id` | Conversation transcript. Requires auth + ownership. |
| `POST` | `/api/feedback` | Submit end-of-session feedback. Requires auth + ownership. |
| `GET` | `/api/history` | List the authenticated user's past ended sessions. |
| `POST` | `/api/auth/register` | Create a new user account (email verification required) |
| `POST` | `/api/auth/login` | Sign in with email and password |
| `POST` | `/api/auth/forgot-password` | Send password-reset email |

All other auth operations (session refresh, logout, change-password, change-email, resend-verification, /me, settings) are handled client-side via `@supabase/supabase-js` — see `apps/web/public/auth.js`.

For full request/response schemas, see the [API endpoint reference](../../CLAUDE.md#api-endpoint-reference) in CLAUDE.md.

---

## Configuration

Required environment variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SUPABASE_ANON_KEY` | Supabase anon/public key (required for auth flow) |

For the full table with defaults and optional variables, see the [environment variables reference](../../README.md#environment-variables--full-reference) in the root README.

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
│   ├── history.ts          ← GET  /api/history
│   └── auth.ts             ← POST /api/auth/register, /login, /forgot-password (rate-limited proxies only)
├── middleware/
│   ├── cors.ts             ← CORS (origin from CORS_ORIGIN env var)
│   ├── errors.ts           ← Global error handler
│   └── require-auth.ts     ← Bearer token verification middleware
└── lib/
    ├── evaluation.ts       ← runSessionEvaluation(), buildEvaluationPayload()
    ├── session-store.ts    ← In-memory Map<sessionId, Session>
    ├── stream.ts           ← SSE helpers (initSSE, sendEvent, sendHeartbeat)
    ├── geo.ts              ← extractClientInfo() — IP, geolocation, user-agent
    └── validation.ts       ← Shared validation constants (UUID regex)
```
