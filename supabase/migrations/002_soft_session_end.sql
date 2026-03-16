-- Migration 002: soft session end
-- Sessions are no longer hard-deleted when a conversation ends.
-- Instead, ended_at is set so session data (messages, feedback) is retained for analysis.

ALTER TABLE sessions ADD COLUMN ended_at timestamptz;

CREATE INDEX sessions_ended_at ON sessions (ended_at) WHERE ended_at IS NOT NULL;
