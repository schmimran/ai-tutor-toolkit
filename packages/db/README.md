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

## Types

```typescript
import type { DbSession, DbMessage, DbSessionFeedback, DbSessionEvaluation } from "@ai-tutor/db";
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

---

## Database schema

Managed by `supabase/migrations/000_schema.sql`.

### sessions

```sql
CREATE TABLE sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at           timestamptz NOT NULL DEFAULT now(),
  last_activity_at     timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  client_ip            text,
  client_geo           jsonb,
  client_user_agent    text,
  email_sent           boolean NOT NULL DEFAULT false,
  total_input_tokens   integer NOT NULL DEFAULT 0,
  total_output_tokens  integer NOT NULL DEFAULT 0,
  model                text,
  prompt_name          text
);
```

### messages

```sql
CREATE TABLE messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user', 'assistant')),
  content       text NOT NULL,
  thinking      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  input_tokens  integer,
  output_tokens integer
);
```

### session_feedback

One student-submitted feedback record per session.  Added in migration 008.

```sql
CREATE TABLE session_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  source      text        NOT NULL CHECK (source IN ('student', 'timeout')),
  outcome     text        CHECK (outcome IN ('solved', 'partial', 'stuck')),
  experience  text        CHECK (experience IN ('positive', 'neutral', 'negative')),
  comment     text,
  skipped     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_feedback_unique_session UNIQUE (session_id)
);
```

### session_evaluations

One automated evaluation record per session.

```sql
CREATE TABLE session_evaluations (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                      uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  model                           text        NOT NULL,
  mode_handling                   text        CHECK (mode_handling                   IN ('pass', 'partial', 'fail', 'na')),
  problem_confirmation            text        CHECK (problem_confirmation            IN ('pass', 'partial', 'fail', 'na')),
  never_gave_answer               text        NOT NULL CHECK (never_gave_answer      IN ('pass', 'partial', 'fail', 'na')),
  probe_reasoning                 text        CHECK (probe_reasoning                 IN ('pass', 'partial', 'fail', 'na')),
  understood_where_student_was    text        CHECK (understood_where_student_was    IN ('pass', 'partial', 'fail', 'na')),
  one_question                    text        NOT NULL CHECK (one_question           IN ('pass', 'partial', 'fail', 'na')),
  worked_at_edge                  text        NOT NULL CHECK (worked_at_edge         IN ('pass', 'partial', 'fail', 'na')),
  followed_student_lead           text        CHECK (followed_student_lead           IN ('pass', 'partial', 'fail', 'na')),
  adaptive_tone                   text        CHECK (adaptive_tone                   IN ('pass', 'partial', 'fail', 'na')),
  parallel_problems               text        NOT NULL CHECK (parallel_problems      IN ('pass', 'partial', 'fail', 'na')),
  step_feedback                   text        NOT NULL CHECK (step_feedback          IN ('pass', 'partial', 'fail', 'na')),
  resolution                      text        NOT NULL CHECK (resolution             IN ('resolved', 'partial', 'unresolved', 'abandoned')),
  has_failures                    boolean     NOT NULL DEFAULT false,
  rationale                       jsonb       NOT NULL DEFAULT '{}',
  created_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_evaluations_unique_session UNIQUE (session_id)
);
```

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | **yes** | Supabase project URL (**Settings → API → Project URL**) |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Service role key (**Settings → API → service_role**) |

## Setup

Run the schema migration against your Supabase project before starting the API server.  Open the Supabase SQL Editor, paste the contents of `supabase/migrations/000_schema.sql`, and click **Run**.

This package is not run directly — it is imported by `apps/api`.
