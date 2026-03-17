# CLAUDE.md

Agent context for AI contributors.  Read this before modifying any file.

---

## Project origin

Built by a parent who wanted a better homework helper for his 9th grader — and found that building a good AI tutor is mostly about building a good feedback loop.  The core asset is a parameterized tutor prompt built on Khan Academy/Khanmigo research and Socratic tutoring literature, tested with real student interactions over five iterations.

The toolkit started as a single prompt file and grew into a full monorepo: a CLI, a web app, and an API server, all sharing the same tutor logic and session model.

---

## Architecture decisions

### Monorepo (npm workspaces)

All packages and apps live in one repo and share a single `node_modules/`.  Build artifacts go to each package's `dist/` directory.  The workspace root does not have runtime code — only tooling scripts.

### Plain HTML frontend — no build step

`apps/web/public/index.html` is a single self-contained file.  Libraries (KaTeX, marked) are loaded from CDN.  There is no bundler, no transpilation, no framework.  The API server serves this file as a static asset.  Changes to the frontend are edit-and-refresh; no build command required.

### Separate API server

The Express server in `apps/api/` is the only process that runs in production.  It:
- Serves the static frontend from `apps/web/public/`
- Handles all API routes under `/api/`
- Holds the in-memory session store
- Connects to Supabase and Resend

### SSE streaming

Chat responses stream token-by-token over Server-Sent Events.  The client opens a `fetch()` connection and reads the response body as a stream.  The API uses `text/event-stream` with `no-cache` and `keep-alive` headers.  Each event is a JSON object on a `data:` line.

Event types:
- `{ type: "text_delta", text: "..." }` — one per token
- `{ type: "message_stop", messageId: "<uuid or null>" }` — signals end of response; `messageId` is the DB UUID of the persisted assistant message, or `null` if DB persistence failed
- `{ type: "error", message: "..." }` — on failure

### In-memory session store + database

Sessions live in memory (`apps/api/src/lib/session-store.ts`) during an active conversation.  After each turn, messages are also persisted to Supabase so nothing is lost if the server restarts.  The inactivity sweep runs every 60 seconds and reaps sessions idle longer than 10 minutes — sending an email transcript and marking the session ended in the DB.  Session rows, messages, and feedback are **not deleted** — they are retained for analysis.  `ended_at` is set on the session row to mark completion.

Token usage (input and output tokens) is accumulated per session after each API call and included in transcript emails alongside the session ID.

### Extended thinking

Enabled by default.  The Anthropic SDK is called with `thinking: { type: "enabled", budget_tokens: 10000 }` and `max_tokens: 16000`.  Thinking blocks are stored in the session (so the model can reference its own prior reasoning) but are never sent to the client or stored in transcript emails.

---

## Package boundaries and dependency rules

```
packages/core    ← @anthropic-ai/sdk
packages/db      ← @supabase/supabase-js
packages/email   ← resend

apps/api         ← packages/core, packages/db, packages/email, express, cors, multer, geoip-lite
apps/cli         ← packages/core
apps/web         ← (no npm deps — CDN only)
```

Rules:
- `packages/` must not import from `apps/`
- `packages/core` must not import from `packages/db` or `packages/email`
- `apps/cli` must not import from `packages/db` or `packages/email`
- `apps/web` has no npm dependencies at all — it is served as static HTML
- Cross-package imports use the workspace package name (e.g., `@ai-tutor/core`), not relative paths

---

## Database schema reference

Managed via migrations in `supabase/migrations/`.  No RLS.  All queries run server-side with the service role key.

### sessions

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| started_at | timestamptz | now() | |
| last_activity_at | timestamptz | now() | Indexed |
| ended_at | timestamptz | null | Set on session end; indexed. Added in migration 002. |
| client_ip | text | null | |
| client_geo | jsonb | null | From geoip-lite |
| client_user_agent | text | null | |
| email_sent | boolean | false | Prevents duplicate emails |
| total_input_tokens | integer | 0 | Cumulative input tokens across all turns. Updated after each assistant message. Added in migration 005. |
| total_output_tokens | integer | 0 | Cumulative output tokens across all turns. Updated after each assistant message. Added in migration 005. |

### messages

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| session_id | uuid | FK → sessions(id) ON DELETE CASCADE |
| role | text | CHECK IN ('user', 'assistant') |
| content | text | Plain text of the message |
| thinking | text | Serialized thinking blocks (null if extended thinking off) |
| input_tokens | integer | Nullable. Input tokens for this API call. Null for user messages and legacy rows. Added in migration 005. |
| output_tokens | integer | Nullable. Output tokens for this API call. Null for user messages and legacy rows. Added in migration 005. |
| created_at | timestamptz | Indexed with session_id |

### feedback

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| session_id | uuid | FK → sessions(id) ON DELETE CASCADE |
| message_id | uuid | FK → messages(id) ON DELETE SET NULL. Nullable; links per-message feedback to the assistant turn being rated. Added in migration 003. |
| category | text | "accuracy" \| "usefulness" \| "tone". One row per category per message. Nullable for legacy rows. Added in migration 004. |
| rating | integer | CHECK 1–5, nullable. Null means the category was not rated (N/A). |
| comment | text | Nullable |
| created_at | timestamptz | |

### disclaimer_acceptances

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| accepted_at | timestamptz | Indexed |
| client_ip | text | Nullable |
| client_geo | jsonb | Nullable. From geoip-lite |
| client_user_agent | text | Nullable |
| session_id | uuid | FK → sessions(id) ON DELETE SET NULL. Nullable; backfilled after first /api/chat call via linkDisclaimerAcceptance(). Added in migration 006. |
| client_session_id | text | Nullable. The client-generated session UUID stored at acceptance time (no FK constraint). Used to backfill session_id. Added in migration 007. |

---

## API endpoint reference

Base URL: `http://localhost:3000` (or the deployed origin).

### POST /api/chat

Stream a tutor response.

**Request**: `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| sessionId | string (UUID) | yes | Client-generated; create with `crypto.randomUUID()` |
| message | string | yes | Student's message text |
| files[] | File | no | Max 5 files, 10 MB each; JPEG/PNG/GIF/WebP/PDF |

**Response**: `text/event-stream`

```
data: {"type":"text_delta","text":"Let's look at..."}

data: {"type":"text_delta","text":" that equation."}

data: {"type":"message_stop","messageId":"<uuid or null>"}
```

On error: `data: {"type":"error","message":"..."}` followed by connection close.

Side effects: Creates or updates session in DB; persists user and assistant messages after stream completes. Assistant message row includes per-call `input_tokens` and `output_tokens`. Session row is updated with cumulative `total_input_tokens` and `total_output_tokens`.

---

### GET /api/config

Get non-secret runtime config.

**Response**: `application/json`

```json
{ "model": "claude-sonnet-4-6", "extendedThinking": true }
```

---

### GET /api/sessions/:sessionId

Get session metadata.

**Response**: `application/json`

```json
{
  "id": "uuid",
  "started_at": "2024-01-01T00:00:00Z",
  "last_activity_at": "2024-01-01T00:10:00Z",
  "client_ip": "1.2.3.4",
  "client_geo": { "city": "...", "country": "..." },
  "client_user_agent": "Mozilla/...",
  "email_sent": false
}
```

Returns `404` if not found.

---

### DELETE /api/sessions/:sessionId

End a session.  Sends transcript email if transcript exists and email not yet sent.  Removes the in-memory session and sets `ended_at` on the DB row.  Session data (messages, feedback) is **retained** for analysis.

**Response**: `application/json`

```json
{ "ok": true }
```

---

### GET /api/transcript/:sessionId

Get conversation transcript.  Prefers in-memory session; falls back to DB.

**Response**: `application/json`

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

Submit a single feedback record.

**Request**: `application/json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| sessionId | string (UUID) | yes | |
| rating | integer | no | 1–5 |
| comment | string | no | |

**Response**: `application/json`

```json
{ "ok": true, "id": "uuid" }
```

---

### POST /api/feedback/batch

Submit all feedback for a session at once (used by the end-of-session feedback overlay).  Saves all records in a single DB round-trip and sends one summary email.

**Request**: `application/json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| sessionId | string (UUID) | yes | |
| items | array | yes | Non-empty array of `{ msgId, category, sentiment, rating }` |

Each item: `msgId` (string), `category` (`accuracy`/`usefulness`/`tone`), `sentiment` (`up`/`down`), `rating` (`5` for up, `1` for down).

**Response**: `application/json`

```json
{ "ok": true, "count": 6 }
```

---

### POST /api/disclaimer/accept

Record that the user accepted the disclaimer overlay.

**Request**: `application/json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| sessionId | string (UUID) | no | Client's current session ID; links the acceptance to the session for analysis |

**Response**: `application/json`

```json
{ "ok": true }
```

Always returns `200 { ok: true }` — DB errors are caught and logged server-side, never surfaced to the client.  The client should call this fire-and-forget.

---

## Config/secrets management

All configuration comes from environment variables.  No `.env` files are committed.  No secrets are read by client-side code.

| Variable | Required | Default | Used by | Purpose |
|----------|----------|---------|---------|---------|
| ANTHROPIC_API_KEY | **yes** | — | core, api, cli | Anthropic API authentication |
| SUPABASE_URL | no | — | db, api | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | no | — | db, api | Supabase service role (bypasses RLS) |
| RESEND_API_KEY | no | — | email, api | Resend API key (email skipped if absent) |
| PARENT_EMAIL | no | — | api | Recipient for transcript/feedback emails |
| EMAIL_FROM | no | tutor@tutor.schmim.com | email, api | Sender address |
| CORS_ORIGIN | no | * | api | Allowed CORS origin |
| MODEL | no | claude-sonnet-4-6 | core | Claude model ID |
| EXTENDED_THINKING | no | true | core | Set "false" to disable |
| SYSTEM_PROMPT_PATH | no | templates/tutor-prompt.md | core | Path from repo root |
| PORT | no | 3000 | api | HTTP listen port |

If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is absent, the API server starts but all DB operations silently fail.  If `RESEND_API_KEY` or `PARENT_EMAIL` is absent, emails are silently skipped.

---

## Frontend approach

`apps/web/public/index.html` is the entire frontend — HTML, CSS, and JavaScript in one file.  No bundler.  No framework.  No compilation.

CDN libraries loaded at runtime:
- **KaTeX** — renders LaTeX math (`$...$`, `$$...$$`)
- **marked** — renders Markdown in tutor responses

The API server serves this file from the root path (`/`).  Any path not matching `/api/*` returns `index.html`.

Do not add a build step to this package.  Do not introduce a framework.  If complexity grows to the point where a framework is warranted, that is an architectural decision requiring explicit discussion — not a refactor to do inline.

---

## Consistency rules for contributors

1. **TypeScript everywhere** in `packages/` and `apps/api/` and `apps/cli/`.  Strict mode.  No `any` without a comment explaining why.
2. **No `.env` files committed.**  Export env vars in your shell or use a secrets manager for deployment.
3. **No RLS** on Supabase tables — all queries are server-side with the service role key.  Do not add RLS without updating `packages/db/src/client.ts` to match.
4. **No new npm dependencies in `apps/web/`.**  It is intentionally dependency-free.  Use CDN if you must add a library.
5. **Build before testing API changes.**  Run `npm run build` from the root, then `npm run api`.
6. **Never expose secrets through `/api/config`.**  That route is intentionally public.
7. **Do not modify** `templates/`, `examples/`, `tests/`, `docs/methodology.md`, `docs/model-selection.md`, or `docs/lessons-learned.md` without explicit instruction.  These are source-of-truth documents.
8. **Transcript emails must be idempotent.**  The `email_sent` flag and `markEmailSent()` method exist precisely to prevent duplicate emails during the inactivity sweep and explicit session deletion.
9. **SSE errors must close the connection.**  If you add a new error path in a streaming route, send the error event and then call `res.end()`.
10. **In-memory session IDs are client-generated UUIDs.**  Never generate them server-side.  The client owns the session ID lifecycle.

---

## File-level reference table

| Path | Purpose |
|------|---------|
| `package.json` | Workspace root; defines `npm run build`, `npm run api`, `npm run cli`, `npm run dev` |
| `tsconfig.base.json` | Shared TypeScript compiler options (strict, ES2022, composite) |
| `supabase/migrations/001_initial_schema.sql` | Initial DB schema (sessions, messages, feedback) |
| `supabase/migrations/002_soft_session_end.sql` | Adds `ended_at` column to sessions; enables data retention |
| `templates/tutor-prompt.md` | Parameterized tutor prompt (source of truth) |
| `templates/evaluation-checklist.md` | Scoring rubric for test evaluation |
| `examples/physics-geometry-9th-grade.md` | Real production prompt (reference) |
| `tests/README.md` | Test harness usage guide |
| `tests/*.md` | Character briefs for simulating student sessions |
| `docs/methodology.md` | How to build a tutor from scratch |
| `docs/model-selection.md` | Model and extended thinking analysis |
| `docs/lessons-learned.md` | Key findings from five iterations |
| `docs/deployment.md` | Render, AWS, and local deployment instructions |
| `packages/core/src/config.ts` | `loadConfig()` — reads and validates all env vars |
| `packages/core/src/prompt-loader.ts` | `loadSystemPrompt()` — loads prompt file from repo root |
| `packages/core/src/tutor-client.ts` | `createTutorClient()` — Anthropic SDK wrapper (streaming + blocking) |
| `packages/core/src/session.ts` | `Session` class — message history, transcript, file attachments, token usage tracking (`TokenUsage` interface) |
| `packages/db/src/client.ts` | `createSupabaseClient()` — Supabase initialization |
| `packages/db/src/sessions.ts` | Session CRUD (create, get, update, markSessionEnded, delete) |
| `packages/db/src/messages.ts` | Message CRUD (create, list by session, delete by session) |
| `packages/db/src/feedback.ts` | Feedback CRUD (create, createBatch, list by session) |
| `packages/db/src/disclaimer-acceptances.ts` | `createDisclaimerAcceptance()` — inserts a disclaimer acceptance row; `linkDisclaimerAcceptance()` — backfills session_id after session is created |
| `packages/email/src/transcript.ts` | `sendTranscript()` — session summary email via Resend; includes session ID and token usage |
| `packages/email/src/feedback.ts` | `sendFeedback()` — feedback notification email via Resend; batch table uses category columns (Accuracy, Usefulness, Tone) with sentiment badges |
| `apps/api/src/index.ts` | Express server entry — routes, middleware, inactivity sweep |
| `apps/api/src/routes/chat.ts` | `POST /api/chat` — streaming chat with file upload |
| `apps/api/src/routes/sessions.ts` | `GET/DELETE /api/sessions/:id` |
| `apps/api/src/routes/transcript.ts` | `GET /api/transcript/:id` |
| `apps/api/src/routes/feedback.ts` | `POST /api/feedback` |
| `apps/api/src/routes/disclaimer.ts` | `POST /api/disclaimer/accept` — records disclaimer acceptance with IP/geo/user-agent |
| `apps/api/src/routes/config.ts` | `GET /api/config` |
| `apps/api/src/lib/session-store.ts` | In-memory session cache (`Map<id, Session>`) |
| `apps/api/src/lib/stream.ts` | SSE helpers (`initSSE`, `sendEvent`, `sendHeartbeat`) |
| `apps/api/src/middleware/cors.ts` | CORS middleware (origin from `CORS_ORIGIN` env var) |
| `apps/api/src/middleware/errors.ts` | Global Express error handler |
| `apps/web/public/index.html` | Entire frontend — HTML, CSS, JS in one file |
| `apps/cli/src/index.ts` | Terminal REPL — readline loop, `sendMessage()`, transcript export |
| `Dockerfile` | Multi-stage build: deps → build → production runtime |
| `render.yaml` | Render.com deployment config |
