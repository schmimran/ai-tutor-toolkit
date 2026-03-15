-- Initial schema for ai-tutor-toolkit.
-- No auth tables.  The service-role key is used for all server-side queries.
-- RLS is not enabled; access control is enforced at the API layer.

-- Sessions track one student's tutoring session from start to finish.
CREATE TABLE sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at         timestamptz NOT NULL DEFAULT now(),
  last_activity_at   timestamptz NOT NULL DEFAULT now(),
  client_ip          text,
  client_geo         jsonb,
  client_user_agent  text,
  email_sent         boolean     NOT NULL DEFAULT false
);

-- Messages stores each user and assistant turn.
-- The content column holds plain text for the transcript view.
-- The thinking column stores serialized extended-thinking blocks when available;
-- null when extended thinking is off or for user messages.
CREATE TABLE messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  thinking    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Feedback stores post-session ratings and comments from the student or parent.
CREATE TABLE feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  rating      integer     CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the most common query patterns.
CREATE INDEX messages_session_id_created_at ON messages (session_id, created_at);
CREATE INDEX feedback_session_id            ON feedback (session_id);
CREATE INDEX sessions_last_activity_at      ON sessions (last_activity_at);
