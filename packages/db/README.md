# @ai-tutor/db

Supabase client and CRUD operations for sessions, messages, feedback, and disclaimer acceptances.  Used by `apps/api`.

## Overview

This package wraps `@supabase/supabase-js` and provides typed CRUD functions for the database tables.  All queries run server-side using the service role key, which bypasses row-level security.  There is no RLS on any table.

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

### Feedback

```typescript
import { createFeedback, createFeedbackBatch, getFeedbackBySession } from "@ai-tutor/db";
```

#### `createFeedback(client, insert): Promise<DbFeedback>`

Inserts a single feedback row.

```typescript
const fb = await createFeedback(db, {
  session_id: sessionId,
  message_id: messageId,
  category: "accuracy",
  rating: 5,
  comment: "Very helpful!",
});
```

#### `createFeedbackBatch(client, inserts): Promise<DbFeedback[]>`

Inserts multiple feedback rows in a single DB round-trip.  Returns the created rows.  Returns `[]` if `inserts` is empty.

#### `getFeedbackBySession(client, sessionId): Promise<DbFeedback[]>`

Returns all feedback for a session, ordered by `created_at` ascending.

---

### Disclaimer acceptances

```typescript
import { createDisclaimerAcceptance, linkDisclaimerAcceptance } from "@ai-tutor/db";
```

#### `createDisclaimerAcceptance(client, insert): Promise<DbDisclaimerAcceptance>`

Inserts a disclaimer acceptance record and returns the created row.

#### `linkDisclaimerAcceptance(client, sessionId): Promise<void>`

Backfills `session_id` on disclaimer acceptance rows that were recorded before the session row existed.  Called after `createSession()` on the first chat turn.  Matches on `client_session_id` and sets the real FK.  Safe to call when no matching rows exist.

---

## Types

```typescript
import type {
  DbSession,
  DbSessionInsert,
  DbSessionUpdate,
  DbMessage,
  DbMessageInsert,
  DbFeedback,
  DbFeedbackInsert,
  DbDisclaimerAcceptance,
  DbDisclaimerAcceptanceInsert,
} from "@ai-tutor/db";
```

| Type | Description |
|------|-------------|
| `DbSession` | Full session row (all columns) |
| `DbSessionInsert` | Insert shape (auto-generated fields optional) |
| `DbSessionUpdate` | Partial update shape |
| `DbMessage` | Full message row |
| `DbMessageInsert` | Insert shape |
| `DbFeedback` | Full feedback row |
| `DbFeedbackInsert` | Insert shape (`message_id`, `category`, `rating`, `comment` all optional) |
| `DbDisclaimerAcceptance` | Full disclaimer_acceptances row |
| `DbDisclaimerAcceptanceInsert` | Insert shape (all fields optional) |

---

## Database schema

Managed by migrations in `supabase/migrations/`.

### sessions

```sql
CREATE TABLE sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at           timestamptz DEFAULT now(),
  last_activity_at     timestamptz DEFAULT now(),
  client_ip            text,
  client_geo           jsonb,
  client_user_agent    text,
  email_sent           boolean DEFAULT false,
  -- migration 002
  ended_at             timestamptz,
  -- migration 005
  total_input_tokens   integer NOT NULL DEFAULT 0,
  total_output_tokens  integer NOT NULL DEFAULT 0
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
  created_at    timestamptz DEFAULT now(),
  -- migration 005
  input_tokens  integer,
  output_tokens integer
);
```

### feedback

```sql
CREATE TABLE feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rating      integer CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz DEFAULT now(),
  -- migration 003
  message_id  uuid REFERENCES messages(id) ON DELETE SET NULL,
  -- migration 004
  category    text
);
```

### disclaimer_acceptances

```sql
-- migration 006
CREATE TABLE disclaimer_acceptances (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  client_ip         text,
  client_geo        jsonb,
  client_user_agent text,
  session_id        uuid        REFERENCES sessions(id) ON DELETE SET NULL,
  -- migration 007: plain text copy of the client session UUID (no FK).
  -- Used to backfill session_id after the sessions row is created.
  client_session_id text
);
```

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | **yes** | Supabase project URL (**Settings → API → Project URL**) |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Service role key (**Settings → API → service_role**) |

## Setup

Run all migrations against your Supabase project before starting the API server.  Use the Supabase SQL Editor (paste each file in order) or the Supabase CLI:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Migrations must be applied in order: `001` through `007`.

This package is not run directly — it is imported by `apps/api`.
