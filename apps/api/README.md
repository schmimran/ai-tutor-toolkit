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

For full endpoint reference (request/response schemas, auth requirements, error codes), see the [API endpoint reference](../../CLAUDE.md#api-endpoint-reference) in CLAUDE.md.

---

## Configuration

The API binary reads the following environment variables:

- **Required:** `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.
- **Optional:** `RESEND_API_KEY`, `ADMIN_EMAIL`, `EMAIL_FROM`, `CORS_ORIGIN`, `CONTACT_EMAIL`, `ALLOW_PROMPT_SELECTION`, `MODEL`, `EXTENDED_THINKING`, `EVALUATION_MODEL`, `SYSTEM_PROMPT_PATH`, `PORT`.

For defaults and full descriptions, see [CLAUDE.md](../../CLAUDE.md#configsecrets-management).

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
│   ├── transcript-email.ts ← POST /api/transcript/:id/email
│   ├── feedback.ts         ← POST /api/feedback
│   ├── history.ts          ← GET /api/history
│   ├── admin-evaluations.ts ← POST/GET /api/admin/evaluations/batches (admin-gated)
│   └── auth.ts             ← POST /api/auth/register, /login, /forgot-password (rate-limited proxies only)
├── middleware/
│   ├── cors.ts             ← CORS (origin from CORS_ORIGIN env var)
│   ├── errors.ts           ← Global error handler
│   ├── require-auth.ts     ← Bearer token verification middleware
│   └── require-admin.ts    ← Admin-only gating (chains after require-auth)
└── lib/
    ├── evaluation.ts       ← buildEvaluationPayload(), getOrCreateTimeoutFeedback(), sendUserTranscriptIfApplicable()
    ├── batch-evaluation.ts ← findPendingEvaluations(), createEvaluationBatchForPending(), processBatchResults()
    ├── session-store.ts    ← In-memory Map<sessionId, Session>
    ├── stream.ts           ← SSE helpers (initSSE, sendEvent, sendHeartbeat)
    ├── geo.ts              ← extractClientInfo() — IP, geolocation, user-agent
    └── validation.ts       ← Shared validation constants (UUID regex)
```
