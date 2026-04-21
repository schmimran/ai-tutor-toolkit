-- Add `evaluated` column to sessions.
--
-- Tracks whether the session has been run through the automated evaluation.
-- Used when AUTO_EVALUATE is disabled (and evaluations are run out-of-band
-- by a separate job) to tell already-evaluated sessions apart from
-- not-yet-evaluated ones. Existing rows default to false; sessions that
-- already have a row in session_evaluations can be backfilled separately
-- via scripts/backfill-evaluations.ts.

ALTER TABLE sessions
  ADD COLUMN evaluated boolean NOT NULL DEFAULT false;
