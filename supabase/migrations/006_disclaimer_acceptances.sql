-- Migration 006: disclaimer acceptance tracking.
--
-- Records each time a user accepts the disclaimer overlay in the web UI.
-- No PII is stored — only IP address, approximate geo, user agent, and the
-- session ID from the same page load.
--
-- session_id is a nullable FK.  The sessions row is only created on the first
-- POST /api/chat call, which may come after the disclaimer is accepted.
-- ON DELETE SET NULL preserves the acceptance record even if the session is
-- later purged.

CREATE TABLE disclaimer_acceptances (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  client_ip         text,
  client_geo        jsonb,
  client_user_agent text,
  session_id        uuid        REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX disclaimer_acceptances_accepted_at
  ON disclaimer_acceptances (accepted_at);

CREATE INDEX disclaimer_acceptances_session_id
  ON disclaimer_acceptances (session_id)
  WHERE session_id IS NOT NULL;
