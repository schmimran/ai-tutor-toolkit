# @ai-tutor/db

Supabase client and CRUD operations for sessions, messages, session feedback, session evaluations, and profiles. Used by `apps/api`.

## Overview

This package wraps `@supabase/supabase-js` and provides typed CRUD functions for the database tables. Server-side queries use the service-role key and bypass RLS; the anon key is used for client-side interaction (via supabase-js in the browser) and respects the RLS policies installed by migration 005.

Supabase is used as a managed Postgres database only — no Edge Functions, no Realtime, no Storage.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.43.0 | Supabase client |

## API reference

### `createSupabaseClient()`

```typescript
import { createSupabaseClient } from "@ai-tutor/db";
const db = createSupabaseClient();
```

Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from environment.  Returns a Supabase client configured with the service role key (no session persistence, no auto-refresh token).

Throws if either env var is missing.

---

### Sessions

```typescript
import { createSession, getSession, updateSession, markSessionEnded } from "@ai-tutor/db";
```

#### `createSession(client, insert): Promise<DbSession>`

Inserts a new session row.  Returns the created row.

```typescript
const session = await createSession(db, {
  id: "uuid",
  client_ip: "1.2.3.4",
  client_geo: { city: "...", country: "..." },
  client_user_agent: "Mozilla/...",
});
```

#### `getSession(client, id): Promise<DbSession | null>`

Fetches one session by ID.  Returns `null` if not found.

#### `updateSession(client, id, update): Promise<DbSession>`

Partial update.  Accepts any subset of `DbSessionUpdate` fields.

```typescript
await updateSession(db, sessionId, {
  last_activity_at: new Date().toISOString(),
  email_sent: true,
});
```

#### `markSessionEnded(client, id): Promise<void>`

Sets `ended_at` to now.  Session data (messages, feedback) is retained for analysis.

---

### Messages

```typescript
import { createMessage, getMessagesBySession } from "@ai-tutor/db";
```

#### `createMessage(client, insert): Promise<DbMessage>`

Inserts a message.

```typescript
await createMessage(db, {
  session_id: sessionId,
  role: "user",
  content: "I got v = 10 m/s",
  thinking: null,
  input_tokens: null,
  output_tokens: null,
});
```

#### `getMessagesBySession(client, sessionId): Promise<DbMessage[]>`

Returns all messages for a session, ordered by `created_at` ascending.

---

### Session feedback

```typescript
import { createSessionFeedback, getSessionFeedback } from "@ai-tutor/db";
```

#### `createSessionFeedback(client, insert): Promise<DbSessionFeedback>`

Inserts a `session_feedback` row and returns it.

```typescript
const fb = await createSessionFeedback(db, {
  session_id: sessionId,
  source: "student",
  outcome: "solved",
  experience: "positive",
  comment: "Really helpful, thanks!",
});
```

#### `getSessionFeedback(client, sessionId): Promise<DbSessionFeedback | null>`

Fetches the feedback row for a session.  Returns `null` if not found.  The UNIQUE constraint on `session_id` guarantees at most one row.

---

### Session evaluations

```typescript
import { createSessionEvaluation, getSessionEvaluation } from "@ai-tutor/db";
```

#### `createSessionEvaluation(client, insert): Promise<DbSessionEvaluation>`

Inserts a `session_evaluations` row and returns it.

```typescript
const ev = await createSessionEvaluation(db, {
  session_id: sessionId,
  model: "claude-sonnet-4-6",
  mode_handling: "pass",
  problem_confirmation: "pass",
  never_gave_answer: "pass",
  probe_reasoning: "partial",
  understood_where_student_was: "pass",
  one_question: "pass",
  worked_at_edge: "pass",
  followed_student_lead: "pass",
  adaptive_tone: "pass",
  parallel_problems: "na",
  step_feedback: "pass",
  resolution: "resolved",
  has_failures: false,
  rationale: { probe_reasoning: "Tutor asked twice but not consistently." },
});
```

#### `getSessionEvaluation(client, sessionId): Promise<DbSessionEvaluation | null>`

Fetches the evaluation row for a session.  Returns `null` if not found.  The UNIQUE constraint on `session_id` guarantees at most one row.

---

### Profiles

```typescript
import { getProfile } from "@ai-tutor/db";
```

#### `getProfile(client, userId): Promise<{ emailTranscriptsEnabled } | null>`

Returns the caller's profile preferences. The row is created automatically by the `on_auth_user_created` trigger (migration 005); application code never needs to insert it.

---

### Evaluation batches

```typescript
import {
  createEvaluationBatch,
  getEvaluationBatch,
  updateEvaluationBatch,
  listEvaluationBatches,
  getInFlightBatchedSessionIds,
} from "@ai-tutor/db";
```

CRUD for the `evaluation_batches` table used by the admin-gated batched evaluation subsystem.

#### `createEvaluationBatch(client, insert): Promise<DbEvaluationBatch>`

Inserts a new batch row (status `submitted`).

#### `getEvaluationBatch(client, id): Promise<DbEvaluationBatch | null>`

Fetches one batch row by UUID.

#### `updateEvaluationBatch(client, id, update): Promise<DbEvaluationBatch>`

Partial update — used to flip status, set `request_counts`, `ended_at`, `processed_at`, and `error_message`.

#### `listEvaluationBatches(client, limit?): Promise<DbEvaluationBatch[]>`

Returns the most recent batch rows (newest first).  Default limit: 50.

#### `getInFlightBatchedSessionIds(client): Promise<string[]>`

Returns session IDs claimed by any batch in `submitted` or `ended` state.  Used by the "pick pending sessions" query to avoid double-submitting.

---

## Types

```typescript
import type {
  DbSession,
  DbMessage,
  DbSessionFeedback,
  DbSessionEvaluation,
  DbEvaluationBatch,
} from "@ai-tutor/db";
```

| Type | Description |
|------|-------------|
| `DbSession` | Full session row (all columns) |
| `DbSessionInsert` | Insert shape (auto-generated fields optional) |
| `DbSessionUpdate` | Partial update shape |
| `DbMessage` | Full message row |
| `DbMessageInsert` | Insert shape |
| `DbSessionFeedback` | Full session_feedback row |
| `DbSessionFeedbackInsert` | Insert shape |
| `DbSessionEvaluation` | Full session_evaluations row |
| `DbSessionEvaluationInsert` | Insert shape |
| `DbEvaluationBatch` | Full evaluation_batches row |
| `DbEvaluationBatchInsert` | Insert shape |
| `DbEvaluationBatchUpdate` | Partial update shape |
| `EvaluationBatchStatus` | `"submitted" \| "ended" \| "processed" \| "failed"` |

---

## Database schema

See the [Database schema reference](../../CLAUDE.md#database-schema-reference) in CLAUDE.md.

---

## Configuration

This package reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` from environment variables. The first two are required; the anon key is used by callers that need to authenticate client-scoped operations. For defaults and full descriptions, see [CLAUDE.md](../../CLAUDE.md#configsecrets-management).

## Setup

Run the migrations against your Supabase project before starting the API server.  From the repo root: `supabase db push`.  See [docs/deployment.md](../../docs/deployment.md) for step-by-step instructions.

This package is not run directly — it is imported by `apps/api`.
