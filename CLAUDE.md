# CLAUDE.md


Agent context for AI contributors.  Read this before modifying any file.

---

## Project origin

Built by a parent who wanted a better homework helper for his 9th grader — and found that building a good AI tutor is mostly about building a good feedback loop.  The core asset is a parameterized tutor prompt built on Khan Academy/Khanmigo research and Socratic tutoring literature, tested with real student interactions over five iterations.

The toolkit started as a single prompt file and grew into a full monorepo: a CLI, a web app, and an API server, all sharing the same tutor logic and session model.

---

## Quick Start

```bash
npm run build              # Compile all TypeScript packages and apps (run from repo root)
npm run api                # Start the Express API server (default port 3000)
npm run dev                # Start API with file-watch (development)
npm run cli                # Launch the terminal REPL
npm run backfill:evaluations  # Backfill session_evaluations for sessions missing a row
```

> Copy `env.sh.template` to `env.sh`, fill in your values, then `source env.sh` before running any command.  `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are required for the API server.  Without `SUPABASE_ANON_KEY` the auth router will not register and the app will be inaccessible.

---

## Architecture decisions

### Monorepo (npm workspaces)

All packages and apps live in one repo and share a single `node_modules/`.  Build artifacts go to each package's `dist/` directory.  The workspace root does not have runtime code — only tooling scripts.

### Plain HTML frontend — no build step

`apps/web/public/` is a set of plain files served as static assets: `index.html` (structure), `styles.css` (core styles), `app.js` (chat logic), `gallery.css` (gallery pane styles), `gallery.js` (gallery pane logic), `manifest.json` (PWA web app manifest), and `icons/` (PWA app icons).  Libraries (KaTeX, marked) are loaded from CDN.  There is no bundler, no transpilation, no framework.  The API server serves these files as static assets.  Changes to the frontend are edit-and-refresh; no build command required.

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
- `{ type: "message_stop", messageId: "<uuid or null>", tokenUsage: { inputTokens: N, outputTokens: N } }` — signals end of response; `messageId` is the DB UUID of the persisted assistant message, or `null` if DB persistence failed
- `{ type: "error", message: "..." }` — on failure

### End-of-session sentinel

The model appends `[END_SESSION_AVAILABLE]` on its own line when a conversation reaches a natural end.  The instruction lives in `templates/system-instructions.md` (appended to every prompt at load time), not in individual tutor prompts.  A hard rule requires the student to have sent at least two messages before the sentinel may be emitted — it is never allowed on the first tutor response.  Explicit done signals (e.g., "thanks, that's all") trigger immediate emission; ambiguous signals (e.g., "ok") prompt the tutor to ask "anything else?" first.  The frontend (`apps/web/public/app.js`) detects the sentinel during SSE streaming, strips it before display, and shows a green banner (`#end-banner`) suggesting the student end the session.  The `endAvailable` flag prevents re-triggering.

### Global system instructions

`templates/system-instructions.md` contains protocol-level instructions appended to every tutor prompt by `loadSystemPrompt()`.  These are system/frontend contracts (sentinel token, image-ref format) — not tutoring methodology.  Tutor prompts should not duplicate these instructions.

### In-memory session store + database

Sessions live in memory (`apps/api/src/lib/session-store.ts`) during an active conversation.  After each turn, messages are also persisted to Supabase so nothing is lost if the server restarts.  The inactivity sweep runs every 60 seconds and reaps sessions idle longer than 10 minutes — running an automated evaluation, recording a `source: 'timeout'` feedback row if none exists, sending an email transcript (including evaluation and feedback), and marking the session ended in the DB.  When a session is explicitly ended via `DELETE /api/sessions/:id`, the same evaluation + feedback fetch happens before the transcript email is sent.  Session rows, messages, and feedback are **not deleted** — they are retained for analysis.  `ended_at` is set on the session row to mark completion.

The inactivity timeout (`INACTIVITY_MS`) is defined as a constant in `apps/api/src/index.ts` and served via `GET /api/config` as `inactivityMs` so the frontend stays in sync with the server-side sweep.  The frontend uses the same value to trigger its own auto-end flow after the same duration of client-side inactivity.

Token usage (input and output tokens) is accumulated per session after each API call and included in transcript emails alongside the session ID.

### Extended thinking

Enabled by default.  The Anthropic SDK is called with `thinking: { type: "enabled", budget_tokens: 10000 }` and `max_tokens: 16000`.  Thinking blocks are stored in the session (so the model can reference its own prior reasoning) but are never sent to the client or stored in transcript emails.

---

## Development environment notes

### Git worktree builds

When working inside a git worktree (`.claude/worktrees/<name>/`), TypeScript resolves `@ai-tutor/*` packages by traversing up to the main repo's `node_modules/@ai-tutor/` — which points to stale compiled `dist/` files that don't include changes in the worktree.

**Required one-time setup before `npm run build` in any worktree:**

```bash
mkdir -p node_modules/@ai-tutor
ln -sf ../../packages/core  node_modules/@ai-tutor/core
ln -sf ../../packages/db    node_modules/@ai-tutor/db
ln -sf ../../packages/email node_modules/@ai-tutor/email
ln -sf ../../apps/api       node_modules/@ai-tutor/api
ln -sf ../../apps/cli       node_modules/@ai-tutor/cli
ln -sf ../../apps/web       node_modules/@ai-tutor/web
# Also link the email package's local node_modules (contains resend):
ln -sf /Users/imran/GitRepos/ai-tutor-toolkit/packages/email/node_modules packages/email/node_modules
```

Without these symlinks, `tsc --build` silently compiles against stale types and produces confusing "property does not exist" errors that don't match the actual source.

---

## Package boundaries and dependency rules

```
packages/core    ← @anthropic-ai/sdk
packages/db      ← @supabase/supabase-js
packages/email   ← resend

apps/api         ← packages/core, packages/db, packages/email, express, cors, multer, geoip-lite, express-rate-limit
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

Managed via `supabase/migrations/000_schema.sql`.  No RLS.  All queries run server-side with the service role key.

### sessions

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| started_at | timestamptz | now() | |
| last_activity_at | timestamptz | now() | Indexed |
| ended_at | timestamptz | null | Set on session end; indexed. |
| client_ip | text | null | |
| client_geo | jsonb | null | From geoip-lite |
| client_user_agent | text | null | |
| email_sent | boolean | false | Prevents duplicate emails |
| total_input_tokens | integer | 0 | Cumulative input tokens across all turns. Updated after each assistant message. |
| total_output_tokens | integer | 0 | Cumulative output tokens across all turns. Updated after each assistant message. |
| model | text | null | Claude model ID used for this session (e.g. "claude-sonnet-4-6"). Set on first message. |
| prompt_name | text | null | Tutor prompt filename stem used for this session (e.g. "tutor-prompt-v7"). Set on first message. |
| extended_thinking | boolean | true | Whether extended thinking was enabled for this session. Set on first message; user-controllable via the header thinking badge. |
| user_id | uuid | null | FK → auth.users(id) ON DELETE SET NULL. Populated for sessions initiated by authenticated users via the Supabase auth flow. Partial index `sessions_user_id` on non-null values. |

### messages

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| session_id | uuid | FK → sessions(id) ON DELETE CASCADE |
| role | text | CHECK IN ('user', 'assistant') |
| content | text | Plain text of the message |
| thinking | text | Serialized thinking blocks (null if extended thinking off) |
| input_tokens | integer | Nullable. Input tokens for this API call. Null for user messages. |
| output_tokens | integer | Nullable. Output tokens for this API call. Null for user messages. |
| created_at | timestamptz | Indexed with session_id |

### session_feedback

One row per session.  Written when the student submits the end-of-session feedback overlay, or when the inactivity sweep ends the session without a student submission.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| session_id | uuid | | FK → sessions(id) ON DELETE CASCADE. UNIQUE. |
| source | text | | CHECK IN ('student', 'timeout'). |
| outcome | text | null | CHECK IN ('solved', 'partial', 'stuck'). Nullable — not collected on timeout. |
| experience | text | null | CHECK IN ('positive', 'neutral', 'negative'). Nullable — not collected on timeout. |
| comment | text | null | Nullable free-text comment. |
| skipped | boolean | false | True when the student dismissed the overlay without submitting. |
| created_at | timestamptz | now() | |

### session_evaluations

One row per session.  Written by an automated transcript evaluation job using the rubric in `packages/core/src/evaluation-prompt.md`.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| session_id | uuid | | FK → sessions(id) ON DELETE CASCADE. UNIQUE — one record per session. |
| model | text | | Model ID used to run the evaluation. |
| mode_handling | text | null | CHECK IN ('pass', 'partial', 'fail', 'na'). Did the tutor correctly identify and follow the session mode? |
| problem_confirmation | text | null | CHECK IN ('pass', 'partial', 'fail', 'na'). Did the tutor restate the problem before proceeding? |
| never_gave_answer | text | | CHECK IN ('pass', 'partial', 'fail', 'na'). NON-NEGOTIABLE. |
| probe_reasoning | text | null | CHECK IN ('pass', 'partial', 'fail', 'na'). NON-NEGOTIABLE. Did the tutor ask why, not just what? |
| understood_where_student_was | text | null | CHECK IN ('pass', 'partial', 'fail', 'na'). NON-NEGOTIABLE. Did the tutor establish how far the student had gotten? |
| one_question | text | | CHECK IN ('pass', 'partial', 'fail', 'na'). One question per message? |
| worked_at_edge | text | | CHECK IN ('pass', 'partial', 'fail', 'na'). Working at the student's actual gap? |
| followed_student_lead | text | null | CHECK IN ('pass', 'partial', 'fail', 'na'). Did the tutor follow when the student redirected? |
| adaptive_tone | text | null | CHECK IN ('pass', 'partial', 'fail', 'na'). Did the tutor read student state and adjust? |
| parallel_problems | text | | CHECK IN ('pass', 'partial', 'fail', 'na'). Tried a parallel problem when looping? |
| step_feedback | text | | CHECK IN ('pass', 'partial', 'fail', 'na'). Feedback at each step? |
| resolution | text | | CHECK IN ('resolved', 'partial', 'unresolved', 'abandoned'). |
| has_failures | boolean | false | Pre-computed flag: true if any non-negotiable dimension is 'fail', or if 3+ other dimensions are 'fail'. Indexed. |
| rationale | jsonb | {} | Per-criterion rationale strings keyed by column name. |
| created_at | timestamptz | now() | |

### profiles

One row per registered user.  Created at registration time.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| user_id | uuid | | PK. FK → auth.users(id) ON DELETE CASCADE. |
| is_admin | boolean | false | Grants access to model/prompt/thinking selectors in the chat header. |
| email_transcripts_enabled | boolean | true | Whether to email session transcripts to the user. User-controllable via the settings page. |
| created_at | timestamptz | now() | |

### disclaimer_acceptances

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| accepted_at | timestamptz | Indexed |
| client_ip | text | Nullable |
| client_geo | jsonb | Nullable. From geoip-lite |
| client_user_agent | text | Nullable |
| session_id | uuid | FK → sessions(id) ON DELETE SET NULL. Nullable; backfilled after first /api/chat call via linkDisclaimerAcceptance(). |
| client_session_id | text | Nullable. The client-generated session UUID stored at acceptance time (no FK constraint). Used to backfill session_id. |
| email | text | Nullable. Email address submitted through the disclaimer overlay. |

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
| model | string | no | Override the server default model. Validated against `ALLOWED_MODELS`. |
| promptName | string | no | Override the server default tutor prompt. Validated against the loaded prompt map. |
| extendedThinking | string | no | `"true"` or `"false"`. Enables or disables extended thinking for this session. Anything else falls back to the server default. Set only on the first message of the session. |
| files[] | File | no | Max 5 files, 10 MB each; JPEG/PNG/GIF/WebP/PDF |

**Response**: `text/event-stream`

```
data: {"type":"text_delta","text":"Let's look at..."}

data: {"type":"text_delta","text":" that equation."}

data: {"type":"message_stop","messageId":"<uuid or null>","tokenUsage":{"inputTokens":N,"outputTokens":N}}
```

On error: `data: {"type":"error","message":"..."}` followed by connection close.

Side effects: Creates or updates session in DB; persists user and assistant messages after stream completes. Assistant message row includes per-call `input_tokens` and `output_tokens`. Session row is updated with cumulative `total_input_tokens` and `total_output_tokens`.

---

### GET /api/config

Get non-secret runtime config.

**Response**: `application/json`

```json
{
  "model": "claude-sonnet-4-6",
  "extendedThinking": true,
  "inactivityMs": 600000,
  "contactEmail": "wax.spirits8d@icloud.com",
  "availableModels": ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"],
  "availablePrompts": ["tutor-prompt-v7", "tutor-prompt-v6"],
  "defaultPrompt": "tutor-prompt-v7",
  "buildVersion": "abc1234",
  "buildDate": "2026-04-05T12:00:00.000Z"
}
```

`buildVersion` is the short Git commit SHA and `buildDate` is the ISO timestamp of the build.  Both are `null` in local dev if `npm run build` has not been run for the API package.  The values come from `apps/api/build-info.json`, which is generated at build time by `apps/api/scripts/gen-build-info.js` and gitignored.

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

**Query parameters**

| Param | Value | Notes |
|-------|-------|-------|
| discard | `true` | Skip evaluation and email entirely; just remove from memory and set `ended_at`. Used when the user switches model/prompt mid-session and the transcript should be discarded. |

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

Submit end-of-session feedback.  Saves one row to `session_feedback`.  No email is sent on submission — feedback is included in the transcript email sent when the session ends.

**Request**: `application/json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| sessionId | string (UUID) | yes | |
| source | string | no | `'student'` (default) or `'timeout'` |
| outcome | string | no | `'solved'` / `'partial'` / `'stuck'` |
| experience | string | no | `'positive'` / `'neutral'` / `'negative'` |
| comment | string | no | Free text |
| skipped | boolean | no | `false` (default); `true` if student dismissed the overlay |

**Response**: `application/json`

```json
{ "ok": true }
```

---

### POST /api/disclaimer/accept

Record that the user accepted the disclaimer overlay.

**Request**: `application/json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| sessionId | string (UUID) | no | Client's current session ID; links the acceptance to the session for analysis |
| email | string | no | Email address submitted through the disclaimer overlay; stored in disclaimer_acceptances.email |

**Response**: `application/json`

```json
{ "ok": true }
```

Always returns `200 { ok: true }` — DB errors are caught and logged server-side, never surfaced to the client.  The client should call this fire-and-forget.

---

### POST /api/auth/register, POST /api/auth/login, POST /api/auth/resend-verification, POST /api/auth/forgot-password, POST /api/auth/change-password, POST /api/auth/refresh, POST /api/auth/logout, GET /api/auth/me

Supabase-backed individual-user login flow. **These endpoints are only registered if `SUPABASE_ANON_KEY` is set.** They do not gate `/api/chat`, `/api/sessions`, `/api/transcript`, or `/api/feedback` — the auth gate is enforced client-side via a JWT check in `app.js` that redirects unauthenticated users to `/login.html`.

- `POST /api/auth/register` — body `{ email, password, name, birthdate, gradeLevel, state?, country? }`. Server-side validation (valid email, password ≥ 8, age ≥ 13, valid grade level). Calls `db.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: {...} })`, then immediately sends the Supabase signup verification email via `anonDb.auth.resend({ type: "signup", email })`. Returns `{ ok: true }` on success, `{ ok: false, error: "underage" }` if age < 13, or `{ ok: false, error: "registration_failed" }` for other errors.
- `POST /api/auth/login` — body `{ email, password }`. Calls `anonDb.auth.signInWithPassword(...)`. Returns `{ ok: true, accessToken, refreshToken, expiresAt }` on success. On failure, returns `{ ok: false, error: "email_not_confirmed" }` (HTTP 401) when the account is unconfirmed so the client can show a "Resend verification" affordance. All other failures return the opaque `{ ok: false, error: "invalid_credentials" }`.
- `POST /api/auth/resend-verification` — body `{ email }`. Re-sends the Supabase signup confirmation email via `anonDb.auth.resend({ type: "signup", email })`. Always returns `{ ok: true }` regardless of whether the address is registered (anti-enumeration). Errors logged server-side only.
- `POST /api/auth/forgot-password` — body `{ email }`. Sends a Supabase password-reset email via `anonDb.auth.resetPasswordForEmail(email, { redirectTo })`. Always returns `{ ok: true }` regardless of whether the address is registered (anti-enumeration). The `redirectTo` URL is derived from `req.headers.origin` (or `req.headers.host`). No new env vars required. Errors logged server-side only.
- `POST /api/auth/change-password` — requires `Authorization: Bearer <accessToken>`. Body `{ newPassword, refreshToken? }`. Validates `newPassword` >= 8 characters. Calls `db.auth.admin.updateUserById(userId, { password: newPassword })`. If `refreshToken` is supplied, calls `anonDb.auth.refreshSession` after the update (Supabase admin API invalidates existing tokens on password change) and returns `{ ok: true, accessToken, refreshToken, expiresAt }` so the client can stay authenticated. Without `refreshToken` returns `{ ok: true }`. Returns `{ ok: false, error: "weak_password" }` if validation fails. Note: current password is not verified server-side (Supabase admin API limitation); the bearer token provides sufficient authorization.
- `POST /api/auth/refresh` — body `{ refreshToken }`. Calls `anonDb.auth.refreshSession(...)`. Returns `{ ok, accessToken?, refreshToken?, expiresAt? }`.
- `POST /api/auth/logout` — requires `Authorization: Bearer <accessToken>`. Calls `db.auth.admin.signOut(userId)` (service-role admin API). Returns `{ ok: true }`.
- `GET /api/auth/me` — requires `Authorization: Bearer <accessToken>`. Returns `{ ok: true, userId, isAdmin: boolean, email, name }`. `isAdmin` is read from the `profiles` table; returns `false` for legacy users without a profile row (fail-closed). `email` is the user's email; `name` is from `user_metadata.name` (null if unset).

JWT verification is handled by `createRequireAuth()` (in `apps/api/src/middleware/require-auth.ts`), which reads the bearer token and calls `db.auth.getUser(token)`. The middleware populates `userId`, `userEmail`, and `userName` on the request object. There is no `SUPABASE_JWT_SECRET` — Supabase's own verification API is used.

Rate limiting is applied via `express-rate-limit` to protect auth endpoints from abuse.  Per-endpoint limits:
- `POST /api/auth/login` — 10 requests per 15 minutes per IP
- `POST /api/auth/register` — 5 requests per hour per IP
- `POST /api/auth/resend-verification` — 3 requests per 15 minutes per IP
- `POST /api/auth/forgot-password` — 3 requests per 15 minutes per IP (shares the `resendLimiter`)
- `POST /api/auth/change-password` — 3 requests per 15 minutes per IP (shares the `resendLimiter`)

All rate-limited endpoints return `429 { ok: false, error: "too_many_requests" }` when the limit is exceeded.  The server sets `trust proxy` to `1` (in `apps/api/src/index.ts`) so `express-rate-limit` keys on the real client IP behind Render's proxy.

---

## Config/secrets management

All configuration comes from environment variables.  No `.env` files are committed.  No secrets are read by client-side code.

| Variable | Required | Default | Used by | Purpose |
|----------|----------|---------|---------|---------|
| ANTHROPIC_API_KEY | **yes** | — | core, api, cli | Anthropic API authentication |
| SUPABASE_URL | **yes (API)** | — | db, api | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | **yes (API)** | — | db, api | Supabase service role (bypasses RLS) |
| RESEND_API_KEY | no | — | email, api | Resend API key (email skipped if absent) |
| PARENT_EMAIL | no | — | api | Recipient for transcript/feedback emails |
| EMAIL_FROM | no | tutor@tutor.schmim.com | email, api | Sender address |
| CORS_ORIGIN | no | * | api | Allowed CORS origin |
| MODEL | no | claude-sonnet-4-6 | core | Claude model ID |
| EXTENDED_THINKING | no | true | core | Set "false" to disable |
| SYSTEM_PROMPT_PATH | no | templates/tutor-prompt-v7.md | core | Path from repo root |
| PORT | no | 3000 | api | HTTP listen port |
| CONTACT_EMAIL | no | wax.spirits8d@icloud.com | api | Contact email returned by GET /api/config and shown on the login page |
| ALLOW_PROMPT_SELECTION | no | — (locked) | api | Set `"true"` to allow users to switch prompt versions via the header badge; omitting locks the picker (fail-closed). Surfaced as `promptSelectionEnabled` in `GET /api/config`. |
| SUPABASE_ANON_KEY | **yes (API)** | — | db, api | Supabase anon/public key. Required for the `/api/auth/*` endpoints that back the login flow at `/login.html`. Still held server-side only — never exposed via `/api/config`. When unset, the auth router is not registered and the app will be inaccessible (the login page cannot authenticate). |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` are required for the API server.  If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is absent, the server will not start.  If `SUPABASE_ANON_KEY` is absent, the auth router is not registered and the app will be inaccessible.  The CLI (`apps/cli`) does not use the database and runs without these variables.  If `RESEND_API_KEY` or `PARENT_EMAIL` is absent, emails are silently skipped.

The evaluation model (`claude-sonnet-4-6`) is hardcoded in `packages/core/src/evaluate-transcript.ts`, not configurable via environment variable.

---

## Frontend approach

`apps/web/public/` contains the entire frontend — split across `index.html` (structure), `styles.css` (core styles), `app.js` (chat logic), `gallery.css` (gallery pane styles), and `gallery.js` (gallery pane logic).  No bundler.  No framework.  No compilation.

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
7. **Do not modify** `templates/tutor-prompt-v7.md`, `templates/tutor-prompt-v6.md`, `examples/physics-geometry-9th-grade-v6.md`, `tests/`, `docs/methodology.md`, `docs/model-selection.md`, or `docs/lessons-learned.md` without explicit instruction.  These are source-of-truth documents.
8. **Transcript emails must be idempotent.**  The `email_sent` flag and `markEmailSent()` method exist precisely to prevent duplicate emails during the inactivity sweep and explicit session deletion.
9. **SSE errors must close the connection.**  If you add a new error path in a streaming route, send the error event and then call `res.end()`.
10. **In-memory session IDs are client-generated UUIDs.**  Never generate them server-side.  The client owns the session ID lifecycle.

---

## Behavioral rules for AI contributors

These apply to every Claude Code session in this repo.

1. **Documentation targets.**  When updating docs per the global documentation rule, this includes: CLAUDE.md schema tables, API reference, and file-level reference table; the relevant package or app README; and `docs/deployment.md` if deployment config changed.
2. **Respect protected files.**  Do not modify `templates/tutor-prompt-v7.md`, `templates/tutor-prompt-v6.md`, `examples/physics-geometry-9th-grade-v6.md`, `tests/`, `docs/methodology.md`, `docs/model-selection.md`, or `docs/lessons-learned.md` without explicit instruction.  This rule is already in the consistency section — it bears repeating because it is the most important guardrail in the repo.
3. **No silent additions.**  Do not add new files, directories, or environment variables without stating what you are adding and why.  New env vars must be added to the config table in this CLAUDE.md and to `docs/deployment.md`.
4. **Test what you changed.**  If you modified a route, show a curl or describe how to verify it.  If you modified the frontend, describe what the user should see.  If you modified a package, show that downstream consumers still build.
---

## File-level reference table

| Path | Purpose |
|------|---------|
| `package.json` | Workspace root; defines `npm run build`, `npm run api`, `npm run cli`, `npm run dev`, `npm run backfill:evaluations` |
| `tsconfig.base.json` | Shared TypeScript compiler options (strict, ES2022, composite) |
| `supabase/migrations/000_schema.sql` | Consolidated database schema (sessions, messages, session_feedback, session_evaluations, disclaimer_acceptances) |
| `supabase/migrations/001_extended_thinking.sql` | Adds `extended_thinking boolean NOT NULL DEFAULT true` column to the sessions table |
| `supabase/migrations/002_users.sql` | Adds nullable `user_id uuid` column to sessions referencing `auth.users(id) ON DELETE SET NULL`, with partial index `sessions_user_id`. Backs the parallel Supabase-auth login flow (issue #73). |
| `supabase/migrations/003_profiles.sql` | Creates `profiles` table keyed on `user_id` with `is_admin boolean NOT NULL DEFAULT false`. One row per registered user. |
| `supabase/migrations/004_profile_settings.sql` | Adds `email_transcripts_enabled boolean NOT NULL DEFAULT true` column to the `profiles` table. Backs the settings page toggle for opting out of transcript emails. |
| `templates/tutor-prompt-v7.md` | Production tutor prompt — current version; loaded at runtime via `SYSTEM_PROMPT_PATH` |
| `templates/tutor-prompt-v6.md` | Tutor prompt v6 — retained as rollback target |
| `templates/system-instructions.md` | Global system instructions appended to every tutor prompt at load time (sentinel token, image-ref format) |
| `templates/evaluation-checklist.md` | Manual scoring rubric for test evaluation (v6-era; automated evaluation now uses `packages/core/src/evaluation-prompt.md`) |
| `examples/physics-geometry-9th-grade-v6.md` | Physics & geometry example prompt v6 — retained as rollback reference |
| `tests/README.md` | Test harness usage guide |
| `tests/*.md` | Character briefs for simulating student sessions |
| `docs/methodology.md` | Prompt development methodology — v7 (archived v1 version at `docs/archive/methodology-v1.md`) |
| `docs/model-selection.md` | Model selection analysis — v7 (archived v1 version at `docs/archive/model-selection-v1.md`) |
| `docs/lessons-learned.md` | Key findings — v7 (archived v1 version at `docs/archive/lessons-learned-v1.md`) |
| `docs/archive/` | Archived versions of superseded docs |
| `docs/deployment.md` | Render, AWS, and local deployment instructions |
| `packages/core/src/config.ts` | `loadConfig()` — reads and validates all env vars |
| `packages/core/src/prompt-loader.ts` | `loadPromptFile()` — loads and strips a prompt file; `loadSystemPrompt()` — wraps `loadPromptFile()` and appends global system instructions |
| `packages/core/src/tutor-client.ts` | `createTutorClient()` — Anthropic SDK wrapper (streaming + blocking) |
| `packages/core/src/session.ts` | `Session` class — message history, transcript, file attachments, token usage tracking (`TokenUsage` interface) |
| `packages/core/src/evaluate-transcript.ts` | Automated transcript evaluation against twelve tutoring dimensions (v7) |
| `packages/core/src/evaluation-prompt.md` | Evaluation prompt for automated transcript scoring — v7 framework |
| `packages/db/src/assert.ts` | `assertRow()` — shared Supabase query result assertion helper |
| `packages/db/src/client.ts` | `createSupabaseClient()` — Supabase initialization |
| `packages/db/src/sessions.ts` | Session CRUD (create, get, update, markSessionEnded) |
| `packages/db/src/messages.ts` | Message CRUD (create, list by session) |
| `packages/db/src/session-feedback.ts` | `createSessionFeedback()`, `getSessionFeedback()` — session_feedback table CRUD |
| `packages/db/src/session-evaluations.ts` | `createSessionEvaluation()`, `getSessionEvaluation()` — session_evaluations table CRUD |
| `packages/db/src/disclaimer-acceptances.ts` | `createDisclaimerAcceptance()` — inserts a disclaimer acceptance row; `linkDisclaimerAcceptance()` — backfills session_id after session is created |
| `packages/db/src/profiles.ts` | `createProfile(client, userId)` — inserts a profile row for a new user; `getProfile(client, userId)` — returns `{ isAdmin }` or `null` for legacy users |
| `packages/email/src/transcript.ts` | `sendTranscript()` — session summary email via Resend; includes session ID, token usage, evaluation results, and student feedback |
| `apps/api/src/index.ts` | Express server entry — routes, middleware, inactivity sweep |
| `apps/api/src/routes/chat.ts` | `POST /api/chat` — streaming chat with file upload |
| `apps/api/src/routes/sessions.ts` | `GET/DELETE /api/sessions/:id` |
| `apps/api/src/routes/transcript.ts` | `GET /api/transcript/:id` |
| `apps/api/src/routes/feedback.ts` | `POST /api/feedback` — saves one `session_feedback` row |
| `apps/api/src/routes/disclaimer.ts` | `POST /api/disclaimer/accept` — records disclaimer acceptance with IP/geo/user-agent/email |
| `apps/api/src/routes/auth.ts` | `createAuthRouter(db, anonDb)` — POST `/register`, `/login`, `/resend-verification`, `/forgot-password`, `/refresh`, `/logout` and GET `/me` for the Supabase auth login flow. Registered only if `SUPABASE_ANON_KEY` is set. The frontend redirects unauthenticated users to `/login.html`. |
| `apps/api/src/middleware/require-auth.ts` | `createRequireAuth(db)` — middleware that verifies `Authorization: Bearer <token>` via `db.auth.getUser(token)` and sets `req.userId`. Used by the `/api/auth/me` and `/api/auth/logout` routes. |
| `apps/api/scripts/gen-build-info.js` | Generates `build-info.json` (commit SHA + timestamp) at build time; called by the API `build` script |
| `apps/api/build-info.json` | Generated build metadata (gitignored); read at startup by the config route |
| `apps/api/src/routes/config.ts` | `GET /api/config` |
| `apps/api/src/lib/evaluation.ts` | `runSessionEvaluation()` — calls `evaluateTranscript`, saves to DB, returns result; `buildEvaluationPayload()` — maps result to email shape; `buildTranscriptEmailPayload()` — assembles full email payload from session data |
| `apps/api/src/lib/session-store.ts` | In-memory session cache (`Map<id, Session>`) |
| `apps/api/src/lib/stream.ts` | SSE helpers (`initSSE`, `sendEvent`, `sendHeartbeat`) |
| `apps/api/src/lib/geo.ts` | `extractClientInfo()` — IP, geolocation, user-agent extraction |
| `apps/api/src/lib/validation.ts` | Shared validation constants (UUID regex) |
| `apps/api/src/middleware/cors.ts` | CORS middleware (origin from `CORS_ORIGIN` env var) |
| `apps/api/src/middleware/errors.ts` | Global Express error handler |
| `apps/web/public/index.html` | Frontend HTML structure; loads styles.css, gallery.css, app.js, gallery.js |
| `apps/web/public/styles.css` | Core layout (flex-row main + chat-column) and all component CSS |
| `apps/web/public/app.js` | Chat application logic; exposes `sessionUploads` global for gallery.js |
| `apps/web/public/gallery.css` | Gallery pane styles, thumbnail strip, img-ref pills, mobile drawer |
| `apps/web/public/gallery.js` | Gallery pane logic; exposes `openGallery`, `closeGallery`, `focusUpload`, `addToGallery`, `resetGallery` globals |
| `apps/web/public/login.html` | Login/register page for the Supabase auth flow. Unauthenticated users are redirected here from `/`. |
| `apps/web/public/login.css` | Styles for `login.html`. Self-contained dark theme mirroring `styles.css` palette. |
| `apps/web/public/login.js` | Client logic for the login page: tabbed login/register forms, forgot-password panel, `/api/auth/*` calls, `sessionStorage` under key `authSession`. Handles Supabase hash callbacks (`type=signup`, `type=recovery`) on page load. Redirects to `/` on successful login; redirects immediately if a valid session already exists. |
| `apps/web/public/maintenance.html` | Static maintenance page; served manually when the app is down for planned maintenance |
| `apps/web/public/manifest.json` | PWA web app manifest — standalone display, theme colors, icon references |
| `apps/web/public/icons/` | PWA app icons (192×192 and 512×512 PNGs) for home-screen and manifest |
| `apps/cli/src/index.ts` | Terminal REPL — readline loop, `sendMessage()`, transcript export |
| `render.yaml` | Render.com deployment config |
| `supabase/config.toml` | Supabase CLI local development config |
| `env.sh.template` | Template for local environment variable setup |
| `scripts/backfill-evaluations.ts` | Backfills session evaluations for sessions without evaluation rows. Run via: `npm run backfill:evaluations` |
| `reports/` | Audit reports and analysis artifacts — checked into git; generated ad hoc for analysis, not build artifacts |
