# @ai-tutor/db

Supabase client and CRUD operations for sessions, messages, and feedback.  Used by `apps/api`.

## Overview

This package wraps `@supabase/supabase-js` and provides typed CRUD functions for the three database tables.  All queries run server-side using the service role key, which bypasses row-level security.  There is no RLS on any table.

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
import { createSession, getSession, updateSession, deleteSession } from "@ai-tutor/db";
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

#### `deleteSession(client, id): Promise<void>`

Deletes session by ID.  Cascades to `messages` and `feedback`.

---

### Messages

```typescript
import { createMessage, getMessagesBySession, deleteMessagesBySession } from "@ai-tutor/db";
```

#### `createMessage(client, insert): Promise<DbMessage>`

Inserts a message.

```typescript
await createMessage(db, {
  session_id: sessionId,
  role: "user",
  content: "I got v = 10 m/s",
  thinking: null,
});
```

#### `getMessagesBySession(client, sessionId): Promise<DbMessage[]>`

Returns all messages for a session, ordered by `created_at` ascending.

#### `deleteMessagesBySession(client, sessionId): Promise<void>`

Deletes all messages for a session (rarely needed directly — `deleteSession` cascades).

---

### Feedback

```typescript
import { createFeedback, getFeedbackBySession } from "@ai-tutor/db";
```

#### `createFeedback(client, insert): Promise<DbFeedback>`

Inserts a feedback row.

```typescript
const fb = await createFeedback(db, {
  session_id: sessionId,
  rating: 4,
  comment: "Very helpful!",
});
```

#### `getFeedbackBySession(client, sessionId): Promise<DbFeedback[]>`

Returns all feedback for a session, ordered by `created_at` ascending.

---

## Types

```typescript
import type { DbSession, DbMessage, DbFeedback } from "@ai-tutor/db";
```

| Type | Description |
|------|-------------|
| `DbSession` | Full session row (all columns) |
| `DbSessionInsert` | Insert shape (auto-generated fields optional) |
| `DbSessionUpdate` | Partial update shape |
| `DbMessage` | Full message row |
| `DbMessageInsert` | Insert shape |
| `DbFeedback` | Full feedback row |
| `DbFeedbackInsert` | Insert shape |

---

## Database schema

Managed by `supabase/migrations/001_initial_schema.sql`.

### sessions

```sql
CREATE TABLE sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at         timestamptz DEFAULT now(),
  last_activity_at   timestamptz DEFAULT now(),
  client_ip          text,
  client_geo         jsonb,
  client_user_agent  text,
  email_sent         boolean DEFAULT false
);
```

### messages

```sql
CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  thinking    text,
  created_at  timestamptz DEFAULT now()
);
```

### feedback

```sql
CREATE TABLE feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  rating      integer CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz DEFAULT now()
);
```

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | **yes** | Supabase project URL (**Settings → API → Project URL**) |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Service role key (**Settings → API → service_role**) |

## Setup

Run the migration against your Supabase project before starting the API server:

```bash
# Via Supabase SQL Editor (paste supabase/migrations/001_initial_schema.sql)
# Or via Supabase CLI:
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

This package is not run directly — it is imported by `apps/api`.
