-- Add extended_thinking column to sessions table.
--
-- Captures whether extended thinking was enabled for a particular session.
-- Default true matches the existing server-side default behaviour, so all
-- pre-existing rows will be set to true and no backfill is required.

ALTER TABLE sessions
  ADD COLUMN extended_thinking boolean NOT NULL DEFAULT true;
