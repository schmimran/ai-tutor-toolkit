-- Add new v7 dimension columns
ALTER TABLE session_evaluations
  ADD COLUMN IF NOT EXISTS mode_handling text,
  ADD COLUMN IF NOT EXISTS problem_confirmation text,
  ADD COLUMN IF NOT EXISTS probe_reasoning text,
  ADD COLUMN IF NOT EXISTS understood_where_student_was text,
  ADD COLUMN IF NOT EXISTS followed_student_lead text,
  ADD COLUMN IF NOT EXISTS adaptive_tone text;

-- Backfill new columns from old ones where data exists
UPDATE session_evaluations SET
  probe_reasoning = asked_why,
  understood_where_student_was = opening_sequence,
  adaptive_tone = tone
WHERE asked_why IS NOT NULL OR opening_sequence IS NOT NULL OR tone IS NOT NULL;

-- Retain old columns (do not drop) — existing rows retain their original scores
-- for historical comparison. New evaluations will write to the new columns only.
-- The old columns (opening_sequence, asked_why, clarity, tone) are now legacy.

COMMENT ON COLUMN session_evaluations.mode_handling IS
  'v7: Did the tutor correctly identify the session mode and behave accordingly?';
COMMENT ON COLUMN session_evaluations.problem_confirmation IS
  'v7: Did the tutor restate its understanding of the problem before proceeding? na for direct-question sessions.';
COMMENT ON COLUMN session_evaluations.probe_reasoning IS
  'v7: Did the tutor ask why the student chose their approach, not just what they computed? Replaces asked_why. na for direct-question and solution-review sessions.';
COMMENT ON COLUMN session_evaluations.understood_where_student_was IS
  'v7: Did the tutor establish how far the student had gotten before guiding? Replaces opening_sequence. na for direct-question and conceptual-clarification sessions.';
COMMENT ON COLUMN session_evaluations.followed_student_lead IS
  'v7: When the student redirected or declared done, did the tutor follow without resistance?';
COMMENT ON COLUMN session_evaluations.adaptive_tone IS
  'v7: Did the tutor read the student state and adjust — backing off on frustration, trusting readiness? Replaces tone.';
