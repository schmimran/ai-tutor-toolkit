-- Migration 007: add client_session_id to disclaimer_acceptances.
--
-- Stores the client-generated session UUID at disclaimer acceptance time.
-- This is a plain text column (no FK) so it can be written before the
-- sessions row exists.  After the first POST /api/chat creates the session
-- row, the server backfills session_id by matching on client_session_id.

ALTER TABLE disclaimer_acceptances
  ADD COLUMN client_session_id text;

CREATE INDEX disclaimer_acceptances_client_session_id
  ON disclaimer_acceptances (client_session_id)
  WHERE client_session_id IS NOT NULL;
