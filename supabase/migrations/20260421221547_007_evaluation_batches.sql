-- Add evaluation_batches table for the batched evaluation subsystem.
--
-- An admin triggers batch submission via POST /api/admin/evaluations/batches.
-- This row persists the Anthropic batch_id and the session_ids submitted so a
-- subsequent GET can poll Anthropic and finalize results (write evaluations,
-- send admin transcript emails) idempotently.
--
-- State machine: submitted -> ended -> processed. 'failed' is terminal.

CREATE TABLE evaluation_batches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anthropic_batch_id    text NOT NULL UNIQUE,
  status                text NOT NULL CHECK (status IN ('submitted','ended','processed','failed')),
  session_ids           uuid[] NOT NULL,
  request_counts        jsonb,
  submitted_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  ended_at              timestamptz,
  processed_at          timestamptz,
  error_message         text
);

CREATE INDEX evaluation_batches_status ON evaluation_batches(status);

ALTER TABLE evaluation_batches ENABLE ROW LEVEL SECURITY;
-- No policies; service role bypasses RLS. Admin-only table.

-- One-time backfill: reconcile sessions.evaluated with existing session_evaluations rows.
-- Migration 006 added `evaluated` with DEFAULT false, so any session evaluated before
-- that migration — or any session whose inline evaluation succeeded but whose flag
-- update failed for any reason — currently reads as evaluated=false. Without this,
-- the new batch subsystem would resubmit those sessions on its first run. Idempotent.
UPDATE sessions
   SET evaluated = true
 WHERE evaluated = false
   AND id IN (SELECT session_id FROM session_evaluations);
