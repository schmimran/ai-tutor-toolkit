-- Migration 008: feedback redesign.
--
-- The original feedback table (per-message, per-category rows) is replaced by
-- two purpose-built tables:
--
--   session_feedback    — one student-submitted record per session
--   session_evaluations — one automated evaluation record per session
--
-- The old table is renamed to feedback_legacy so historical data is preserved
-- without being actively used.  Its indexes are renamed to match.

-- ── 1. Archive the old feedback table ────────────────────────────────────────

ALTER TABLE feedback RENAME TO feedback_legacy;
ALTER INDEX feedback_session_id RENAME TO feedback_legacy_session_id;
ALTER INDEX feedback_message_id RENAME TO feedback_legacy_message_id;
ALTER INDEX feedback_category   RENAME TO feedback_legacy_category;

-- ── 2. session_feedback ───────────────────────────────────────────────────────
-- One row per session.  Written when the student submits the end-of-session
-- feedback overlay, or when the inactivity sweep ends the session without a
-- student submission (source = 'timeout', skipped = true).

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

CREATE INDEX session_feedback_session_id ON session_feedback (session_id);

-- ── 3. session_evaluations ────────────────────────────────────────────────────
-- One row per session.  Written by an automated transcript evaluation job.
-- Each rubric column uses pass/partial/fail/na to match the evaluation checklist.
-- has_failures is a pre-computed flag for fast filtering of sessions that need
-- review.

CREATE TABLE session_evaluations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  model               text        NOT NULL,
  opening_sequence    text        NOT NULL CHECK (opening_sequence    IN ('pass', 'partial', 'fail', 'na')),
  one_question        text        NOT NULL CHECK (one_question        IN ('pass', 'partial', 'fail', 'na')),
  asked_why           text        NOT NULL CHECK (asked_why           IN ('pass', 'partial', 'fail', 'na')),
  worked_at_edge      text        NOT NULL CHECK (worked_at_edge      IN ('pass', 'partial', 'fail', 'na')),
  parallel_problems   text        NOT NULL CHECK (parallel_problems   IN ('pass', 'partial', 'fail', 'na')),
  step_feedback       text        NOT NULL CHECK (step_feedback       IN ('pass', 'partial', 'fail', 'na')),
  never_gave_answer   text        NOT NULL CHECK (never_gave_answer   IN ('pass', 'partial', 'fail', 'na')),
  clarity             text        NOT NULL CHECK (clarity             IN ('pass', 'partial', 'fail', 'na')),
  tone                text        NOT NULL CHECK (tone                IN ('pass', 'partial', 'fail', 'na')),
  resolution          text        NOT NULL CHECK (resolution          IN ('resolved', 'partial', 'unresolved', 'abandoned')),
  has_failures        boolean     NOT NULL DEFAULT false,
  rationale           jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_evaluations_unique_session UNIQUE (session_id)
);

CREATE INDEX session_evaluations_session_id  ON session_evaluations (session_id);
CREATE INDEX session_evaluations_has_failures ON session_evaluations (has_failures) WHERE has_failures = true;
