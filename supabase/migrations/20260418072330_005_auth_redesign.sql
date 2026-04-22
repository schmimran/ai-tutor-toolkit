-- 005_auth_redesign.sql — Full auth/session redesign.
--
-- System is pre-launch, no real users, so this migration is intentionally
-- destructive. It:
--   1. Wipes existing app data and auth.users.
--   2. Drops the disclaimer_acceptances table.
--   3. Drops profiles.is_admin (moves to auth.users.app_metadata.is_admin).
--   4. Installs a trigger that creates a profiles row on auth.users insert.
--   5. Makes sessions.user_id NOT NULL (no more anonymous sessions).
--   6. Enables RLS on all user-facing tables with auth.uid() policies.
--
-- After running this, set app_metadata.is_admin = true via SQL for any
-- admin accounts (one-off):
--   UPDATE auth.users
--     SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
--     WHERE email = 'admin@example.com';

-- ── 1. Reset data ─────────────────────────────────────────────────────────
TRUNCATE session_evaluations, session_feedback, messages, sessions, profiles, disclaimer_acceptances CASCADE;
DELETE FROM auth.users;

-- ── 2. Drop disclaimer_acceptances ────────────────────────────────────────
DROP TABLE IF EXISTS public.disclaimer_acceptances;

-- ── 3. Drop profiles.is_admin (moves to app_metadata) ─────────────────────
DROP INDEX IF EXISTS profiles_is_admin;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_admin;

-- ── 4. Trigger-based profile creation ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 5. sessions.user_id NOT NULL ──────────────────────────────────────────
ALTER TABLE public.sessions ALTER COLUMN user_id SET NOT NULL;

-- Replace the partial index with a full one (no NULLs to exclude now).
DROP INDEX IF EXISTS sessions_user_id;
CREATE INDEX sessions_user_id ON public.sessions (user_id);

-- ── 6. Enable RLS + policies ──────────────────────────────────────────────
-- Service role bypasses RLS by default, so sweeps/evaluations/admin queries
-- continue to work unchanged.

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_feedback    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_evaluations ENABLE ROW LEVEL SECURITY;

-- profiles: user can read/update their own row.
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- sessions: user owns rows where user_id = auth.uid().
CREATE POLICY sessions_select_own ON public.sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY sessions_insert_own ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY sessions_update_own ON public.sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- messages / session_feedback / session_evaluations: read-only for the
-- owning user via the parent session join. Inserts/updates remain
-- service-role only (server-side writes from the chat/evaluation paths).
CREATE POLICY messages_select_own ON public.messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = messages.session_id AND s.user_id = auth.uid()
  ));

CREATE POLICY session_feedback_select_own ON public.session_feedback
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_feedback.session_id AND s.user_id = auth.uid()
  ));

CREATE POLICY session_evaluations_select_own ON public.session_evaluations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = session_evaluations.session_id AND s.user_id = auth.uid()
  ));
