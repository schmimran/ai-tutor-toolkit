-- Migration 005: add token tracking columns.
--
-- sessions: cumulative totals (input + output) across all turns in a session.
--   Updated after each assistant message via updateSession().
--
-- messages: per-call token cost for assistant messages.
--   Null for user messages and for legacy assistant rows created before this
--   migration.

ALTER TABLE sessions
  ADD COLUMN total_input_tokens  integer NOT NULL DEFAULT 0,
  ADD COLUMN total_output_tokens integer NOT NULL DEFAULT 0;

ALTER TABLE messages
  ADD COLUMN input_tokens  integer,
  ADD COLUMN output_tokens integer;
