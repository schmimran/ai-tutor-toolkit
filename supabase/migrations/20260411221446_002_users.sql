-- Add user_id column to sessions for individual user login (issue #73).
--
-- This migration adds a nullable user_id column that references Supabase's
-- built-in auth.users table. Existing rows (pre-login flow) remain NULL.
-- On user deletion, user_id is set to NULL so session rows are retained
-- for analysis rather than cascading away.
--
-- Note: this is a parallel entry point to the existing passcode access wall.
-- Most sessions will still have user_id NULL for the foreseeable future.

ALTER TABLE sessions
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index — only index rows where user_id is populated.
CREATE INDEX sessions_user_id ON sessions (user_id) WHERE user_id IS NOT NULL;
