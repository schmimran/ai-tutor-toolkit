-- Add model and prompt_name columns to sessions table.
-- Both nullable; existing rows remain NULL (server default applies going forward).
ALTER TABLE sessions
  ADD COLUMN model TEXT,
  ADD COLUMN prompt_name TEXT;
