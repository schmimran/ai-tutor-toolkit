# Repository Quality Audit — 2026-03-17

## Summary

The ai-tutor-toolkit is a well-structured monorepo with strong type safety, consistent error handling, and clean dependency boundaries.  This audit found one critical documentation error that misrepresents a hard startup dependency, one dormant frontend feature with no corresponding prompt instruction, two dead exports in the DB package, and a cluster of stale inline comments and documentation gaps.  No security vulnerabilities, no dependency rule violations, no test or migration integrity issues.  The codebase is production-capable; the issues found are documentation and hygiene items, not correctness defects — with one exception noted in Critical.

---

## Artifacts to remove

### `apps/ios/` — placeholder directory
- **File:** `apps/ios/README.md`
- **What:** Contains only a placeholder README describing a planned Swift/SwiftUI app.  No Swift code, no Xcode project, no package manifest.  The directory is not referenced in CLAUDE.md's file-level reference table.
- **Why it matters:** A placeholder in `apps/` that looks like a real package but contains no code creates confusion for contributors and CI tools.  The roadmap entry in `README.md` ("Future: iOS app") suffices to track intent.
- **Recommendation:** Remove the directory, or keep it and add it to the CLAUDE.md file table with a "placeholder — no code" note.

### `.DS_Store` files
- **Files:** Present throughout the repo tree (root, `apps/`, `packages/`, `supabase/`, etc.)
- **What:** macOS Finder metadata files.  They are correctly gitignored and not tracked in git.
- **Why it matters:** No impact on builds or collaborators, but `find` surfaces them, and they represent a local hygiene gap.
- **Recommendation:** `find . -name .DS_Store -delete` from the repo root.  They will re-appear when browsed with Finder, but the gitignore already prevents them from being committed.

---

## Critical (fix before next feature)

### 1. Supabase client throws at startup — "silently fails" claim in docs is false

- **Files:** `packages/db/src/client.ts:18-22`, `apps/api/src/index.ts:26`, `CLAUDE.md` (config table, architecture section), `README.md:69`
- **What:** `createSupabaseClient()` throws `Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.")` if either env var is absent.  This call is at the top level of `apps/api/src/index.ts` (line 26), outside any try/catch.  If the vars are missing the server process exits immediately — it never becomes ready to serve requests.

  CLAUDE.md (config table) lists both vars as optional and says: *"If `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is absent, the API server starts but all DB operations silently fail."*

  `README.md` line 69 repeats the same claim: *"If you skip Supabase setup, the API server still runs and the web/CLI interfaces still work."*

  Both statements are false under the current code.

- **Why it matters:** A contributor following the docs, or a new deployment without Supabase credentials, will encounter a crashed server with no obvious explanation.  The CLI (`apps/cli`) does not use the DB package and is genuinely runnable without Supabase — but the API server is not.
- **Fix:** Either (a) wrap `createSupabaseClient()` in `index.ts` in a try/catch that allows the server to start with a null `db` and skip DB calls, or (b) update all documentation to state that Supabase is **required** for the API server.  The documentation fix is simpler and more honest about the design.

---

## Important (fix soon)

### 2. ~~`END_SENTINEL` feature is unreachable~~ — RESOLVED

- **Resolved:** 2026-04-04.  The sentinel instruction now lives in `templates/system-instructions.md` (appended to every prompt at load time).  PR #39 restored the frontend detection; this change moved the instruction out of individual prompts into a global file and broadened the trigger to cover all session types (direct questions, conceptual clarifications, not just problem-solving).

### 3. `deleteSession` exported but never called by any app

- **Files:** `packages/db/src/sessions.ts:75-81`, `packages/db/src/index.ts:3`, `packages/db/README.md:35,66`
- **What:** `deleteSession()` is defined as a hard-delete operation and is exported from the package index and documented in the README.  No file in `apps/` imports it.  The `DELETE /api/sessions/:id` route calls `markSessionEnded()` (soft delete), not `deleteSession()`.  The comment on the function says "For admin use only" but there is no admin tool.
- **Why it matters:** Dead public API creates confusion about intended session lifecycle.  The "for admin use only" comment implies a future admin interface that doesn't exist.
- **Fix:** Keep the function if an admin interface is planned (Phase 5 roadmap).  If not, remove the export and the README entry, or at minimum add a note that there is no consumer.

### 4. `deleteMessagesBySession` exported but never called by any app

- **Files:** `packages/db/src/messages.ts:47-56`, `packages/db/src/index.ts:8`, `packages/db/README.md:95`
- **What:** Same pattern as `deleteSession`.  The function is exported and documented but nothing imports it.  Message deletion is handled indirectly via `ON DELETE CASCADE` from session deletion.
- **Why it matters:** Same as above.
- **Fix:** Remove the export and README entry, or add a note explaining when a caller would use it directly.

### 5. `sessions.ts` DELETE route comment says "deletes the database row" — false

- **File:** `apps/api/src/routes/sessions.ts:42`
- **What:** The JSDoc comment for `DELETE /:sessionId` reads: *"Ends a session: sends the transcript email (if not already sent), removes the in-memory session, and **deletes the database row**."*  The implementation at line 67 calls `markSessionEnded(db, sessionId)`, which sets `ended_at` to now and leaves the row intact.  The row is a soft delete.
- **Why it matters:** A contributor reading only the comment will believe the DB row is removed and may write dependent logic on that assumption.
- **Fix:** Update the comment to say "marks the session as ended in the database (sets `ended_at`); session data is retained for analysis."

### 6. `chat.ts` inline comment uses wrong SSE field name

- **File:** `apps/api/src/routes/chat.ts:97`
- **What:** The JSDoc comment for `POST /` describes the `message_stop` event as `{ type: "message_stop", message_id: "..." }` (snake\_case).  The actual `sendEvent()` call at lines 201-208 sends `messageId` (camelCase) plus a `tokenUsage` object.  The comment is wrong on both field name and completeness.
- **Why it matters:** The comment is the first reference a reader consults.  Incorrect field names cause bugs in client implementations.
- **Fix:** Update the comment to match the actual event shape: `{ type: "message_stop", messageId: "...", tokenUsage: { inputTokens: N, outputTokens: N } }`.

### 7. `packages/db/src/types.ts` comment references only the first migration

- **File:** `packages/db/src/types.ts:2`
- **What:** The file-level comment says *"manually maintained to match `supabase/migrations/001_initial_schema.sql`."*  The types now reflect all seven migrations (columns added in 002–007 are present: `ended_at`, `message_id`, `category`, `input_tokens`, `output_tokens`, `total_input_tokens`, `total_output_tokens`, `disclaimer_acceptances` table, `client_session_id`).
- **Why it matters:** A contributor updating the types might look only at `001_initial_schema.sql` and miss later migrations.
- **Fix:** Update the comment to say "manually maintained to match the full migration set in `supabase/migrations/`."

---

## Minor (fix when convenient)

### 8. `INACTIVITY_MS` duplicated across frontend and backend

- **Files:** `apps/web/public/index.html:1015`, `apps/api/src/index.ts:54`
- **What:** Both files independently define `INACTIVITY_MS = 10 * 60 * 1000` (10 minutes).  These are different systems (client-side auto-end vs. server-side sweep), so they do not need to be identical.  But if someone changes one without knowing the other exists, the behavior becomes inconsistent.
- **Why it matters:** Minor maintenance risk.
- **Recommendation:** Add a comment on each explaining that the other has a matching value, so they are changed in tandem.

### 9. IP/geo extraction duplicated

- **Files:** `apps/api/src/routes/chat.ts:119-122`, `apps/api/src/routes/disclaimer.ts` (same pattern)
- **What:** The three-line pattern to extract IP from `x-forwarded-for` and run `geoip.lookup()` is repeated identically.
- **Why it matters:** If the extraction logic changes (e.g., support for `x-real-ip`), both files must be updated.
- **Recommendation:** Extract to `apps/api/src/lib/geo.ts`.

### 10. UUID regex duplicated

- **Files:** `apps/api/src/routes/feedback.ts:91`, `apps/api/src/routes/disclaimer.ts` (same regex)
- **What:** `UUID_RE` defined locally in two route files.
- **Why it matters:** Same as above — one change point vs. two.
- **Recommendation:** Move to `apps/api/src/lib/validation.ts`.

### 11. Error handler leaks internal error messages

- **File:** `apps/api/src/middleware/errors.ts:17-20`
- **What:** The global error handler returns `err.message` verbatim in the JSON response body.  If a Supabase or multer error bubbles up, its message (which may include table names, column names, or SDK internals) is visible to the client.
- **Why it matters:** Low risk for a single-student personal tool, but worth noting for future multi-tenant use.
- **Recommendation:** Return a generic message (`"An unexpected error occurred."`) for 5xx responses in production; log the real error server-side only.

---

## Template, test, and example drift

### `END_SENTINEL` feature has no prompt counterpart

- **Frontend:** `apps/web/public/index.html:1016` — defines `END_SENTINEL = '[END_SESSION_AVAILABLE]'`
- **Templates:** `templates/tutor-prompt.md` — no mention of `[END_SESSION_AVAILABLE]`
- **Examples:** `examples/physics-geometry-9th-grade.md` — no mention of `[END_SESSION_AVAILABLE]`
- **What:** The frontend implements a complete UI flow for a tutor-triggered end-of-session suggestion (banner activation, state management).  The tutor prompt contains no instruction to emit the sentinel.  The feature is unreachable from the prompt side.
- **Assessment:** Intentional dormancy or missed connection.  See Critical finding #2 above.

### `examples/physics-geometry-9th-grade.md` has no `## Begin prompt` marker

- **File:** `examples/physics-geometry-9th-grade.md`
- **What:** `prompt-loader.ts` strips everything before `## Begin prompt` in the loaded file.  `templates/tutor-prompt.md` has this marker at line 20.  The example file has no such marker — it is its own complete prompt without the variable documentation header.  `prompt-loader.ts` would load the entire file as the system prompt (nothing to strip), which is the correct behavior for the example.
- **Assessment:** Not a bug — the example is designed to be used as-is.  But it creates an inconsistency: if a contributor copies the example and adds a documentation header, they would need to add the marker too.
- **Recommendation:** A brief note in the example file header explaining that it requires no marker (because it has no documentation preamble) would prevent confusion.

### `evaluation-checklist.md` and test briefs are consistent with current prompt

- All six principles in `templates/tutor-prompt.md` correspond to checklist items.
- All five test scenario briefs reference behaviors the current prompt explicitly demonstrates.
- No drift found.

---

## Documentation gaps (to be addressed in documentation review)

### 1. CLAUDE.md and README.md: Supabase optional — claim is false

See Critical finding #1.  Both `CLAUDE.md` (config table, architecture section) and `README.md` (line 69) state the server runs without Supabase env vars.  The code does not support this.

### 2. CLAUDE.md: `message_stop` event shape is incomplete

- **Location:** CLAUDE.md "SSE streaming" section, "Event types" bullet list
- **What:** Documents `{ type: "message_stop", messageId: "<uuid or null>" }`.  Actual event (see `chat.ts:201-208`) is:
  ```json
  {
    "type": "message_stop",
    "messageId": "<uuid or null>",
    "tokenUsage": { "inputTokens": N, "outputTokens": N }
  }
  ```
  The `tokenUsage` field is consumed by the frontend (index.html:1252-1256) and is clearly part of the contract.  The omission leaves the API endpoint reference incomplete.

### 3. CLAUDE.md: `POST /api/feedback/batch` item shape is incomplete

- **Location:** CLAUDE.md API endpoint reference, `POST /api/feedback/batch` section
- **What:** Documents item fields as `{ msgId, category, sentiment, rating }`.  The actual request payload (see `index.html:1386-1392` and `feedback.ts:111-119`) also includes `msgText` (used by the server for email display).  The `msgText` field is missing from the documented schema.

### 4. `docs/deployment.md`: Migration list truncated at 4

- **Location:** `docs/deployment.md:251-257`, under "Supabase migrations" in the Local Development section
- **What:** Lists only migrations 001–004.  Migrations 005 (`token_tracking`), 006 (`disclaimer_acceptances`), and 007 (`disclaimer_client_session_id`) are not listed.  A developer following this guide would set up an incomplete schema that would cause `updateSession()` (writing token columns) to fail silently.
- **Note:** The root `README.md` (lines 90-96) correctly lists all seven migrations.

### 5. CLAUDE.md file-level reference table: missing entries

The following files exist in the repo but are absent from the CLAUDE.md file-level reference table:

| Missing path | What it is |
|---|---|
| `apps/ios/README.md` | Placeholder README for future iOS app |
| `supabase/config.toml` | Supabase CLI local development config |
| `env.sh.template` | Template for local environment variable setup |

### 6. `supabase/config.toml` is unreferenced everywhere

- **File:** `supabase/config.toml`
- **What:** Standard Supabase CLI config file (sets `project_id`, DB ports, Studio port).  Not referenced in CLAUDE.md, README, deployment docs, or any other guide.
- **Assessment:** Needs clarification — it may be intentional (for contributors who want to run a local Supabase instance) or incidental.

### 7. `packages/db/README.md`: `deleteSession` and `deleteMessagesBySession` documented but orphaned

- **File:** `packages/db/README.md:35,66,95`
- **What:** Both functions are documented as part of the package's public API.  Neither is called by any consumer.  See Important finding #3 and #4.

---

## CLAUDE.md drift

| Area | What CLAUDE.md says | What the code does | Verdict |
|------|--------------------|--------------------|---------|
| Config table: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | "Optional — API server starts if absent, DB operations silently fail" | `createSupabaseClient()` throws at startup if absent; server crashes | **Wrong** |
| SSE event types: `message_stop` | `{ type: "message_stop", messageId: "..." }` | `{ type: "message_stop", messageId: "...", tokenUsage: { inputTokens: N, outputTokens: N } }` | **Incomplete** |
| POST /api/feedback/batch item fields | `{ msgId, category, sentiment, rating }` | Also includes `msgText` | **Incomplete** |
| File-level reference table | Lists files present in repo | Missing `apps/ios/README.md`, `supabase/config.toml`, `env.sh.template` | **Incomplete** |
| DELETE /api/sessions/:id response description | "Removes the in-memory session and sets `ended_at` on the DB row" | Accurate — but the in-code JSDoc says "deletes the database row" | **Code comment wrong; CLAUDE.md is correct** |

No schema inaccuracies found: all seven migrations are correctly reflected in the CLAUDE.md schema tables.  All API routes documented in CLAUDE.md match the actual route implementations.

---

## Observations

These are patterns working well that should be preserved:

1. **Dependency graph is clean.** All five package/app dependency rules from CLAUDE.md are respected.  No circular imports.  The email package's inline `{ inputTokens, outputTokens }` type (instead of importing `TokenUsage` from `@ai-tutor/core`) is a clean solution to the circular dependency constraint.

2. **Session lifecycle is correct.** Client-generated UUIDs, idempotent `email_sent` flag, soft deletes preserving session data, inactivity sweep with proper cleanup — all work as documented.

3. **SSE implementation is by the book.** `initSSE()`, heartbeat, `text_delta` streaming, `message_stop` finalization, and error-followed-by-`res.end()` are all implemented correctly (CLAUDE.md rule 9 is honored).

4. **Migrations are additive and annotated.** Seven migrations, no gaps, each building cleanly on the last, with correct `ON DELETE CASCADE` and `ON DELETE SET NULL` behaviors.  Indexes are appropriate for the actual query patterns.

5. **Type safety is rigorous.** Strict TypeScript throughout, all `any` uses have explanatory comments, union types used where appropriate.  The `DbFeedbackInsert` interface correctly models the legacy/nullable evolution of the feedback table.

6. **Error handling is consistent.** All API routes use `try/catch` with `next(err)` delegation.  Email failures are fire-and-forget.  DB failures in `chat.ts` are caught and logged without crashing the session.  No empty catch blocks.

7. **Frontend uses `/api/config` for runtime values.** Model name and extended thinking status are fetched from the server; the frontend does not hardcode model IDs or feature flags.

8. **The `END_SENTINEL` logic, though dormant, is cleanly implemented.** When the prompt side is connected, the frontend code requires no changes — the sentinel detection, state management, and banner activation are all in place.
