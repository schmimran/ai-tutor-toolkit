-- Consolidated database schema for ai-tutor-toolkit.
--
-- Run this once in a fresh Supabase project (SQL Editor → paste → Run).
-- If you previously set up the database with the individual numbered
-- migrations (001–012), no action is needed — your schema is already
-- in place.
--
-- No RLS.  The service-role key is used for all server-side queries.
-- Access control is enforced at the API layer.

-- ── sessions ──────────────────────────────────────────────────────────────
-- Tracks one student's tutoring session from start to finish.

CREATE TABLE sessions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at            timestamptz NOT NULL DEFAULT now(),
  last_activity_at      timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,
  client_ip             text,
  client_geo            jsonb,
  client_user_agent     text,
  email_sent            boolean     NOT NULL DEFAULT false,
  total_input_tokens    integer     NOT NULL DEFAULT 0,
  total_output_tokens   integer     NOT NULL DEFAULT 0,
  model                 text,
  prompt_name           text
);

CREATE INDEX sessions_last_activity_at ON sessions (last_activity_at);
CREATE INDEX sessions_ended_at         ON sessions (ended_at) WHERE ended_at IS NOT NULL;

-- ── messages ──────────────────────────────────────────────────────────────
-- Stores each user and assistant turn.
-- The content column holds plain text for the transcript view.
-- The thinking column stores serialized extended-thinking blocks when
-- available; null when extended thinking is off or for user messages.

CREATE TABLE messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content       text        NOT NULL,
  thinking      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  input_tokens  integer,
  output_tokens integer
);

CREATE INDEX messages_session_id_created_at ON messages (session_id, created_at);

-- ── session_feedback ──────────────────────────────────────────────────────
-- One row per session.  Written when the student submits the end-of-session
-- feedback overlay, or when the inactivity sweep ends the session without a
-- student submission (source = 'timeout').

CREATE TABLE session_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  source      text        NOT NULL CHECK (source IN ('student', 'timeout')),
  outcome     text        CHECK (outcome IN ('solved', 'partial', 'stuck')),
  experience  text        CHECK (experience IN ('positive', 'neutral', 'negative')),
  comment     text,
  skipped     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_feedback_unique_session UNIQUE (session_id)
);


-- ── session_evaluations ───────────────────────────────────────────────────
-- One row per session.  Written by an automated transcript evaluation job
-- using the v7 evaluation framework (11 dimensions + resolution).

CREATE TABLE session_evaluations (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                      uuid        NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
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

CREATE INDEX session_evaluations_has_failures ON session_evaluations (has_failures) WHERE has_failures = true;

-- ── disclaimer_acceptances ────────────────────────────────────────────────
-- Records each time a user accepts the access-wall overlay.
-- session_id is nullable — the sessions row is only created on the first
-- POST /api/chat call, which may come after the disclaimer is accepted.
-- client_session_id is used to backfill session_id after the session is created.

CREATE TABLE disclaimer_acceptances (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  accepted_at         timestamptz NOT NULL DEFAULT now(),
  client_ip           text,
  client_geo          jsonb,
  client_user_agent   text,
  session_id          uuid        REFERENCES sessions (id) ON DELETE SET NULL,
  client_session_id   text,
  email               text
);

CREATE INDEX disclaimer_acceptances_accepted_at
  ON disclaimer_acceptances (accepted_at);

CREATE INDEX disclaimer_acceptances_session_id
  ON disclaimer_acceptances (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX disclaimer_acceptances_client_session_id
  ON disclaimer_acceptances (client_session_id)
  WHERE client_session_id IS NOT NULL;
