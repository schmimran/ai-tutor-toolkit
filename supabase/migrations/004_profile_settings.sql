ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_transcripts_enabled boolean NOT NULL DEFAULT true;
