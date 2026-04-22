-- 003_profiles.sql — User profiles with admin flag.
-- One row per auth.users user; created at registration time.

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for potential future admin-listing queries.
CREATE INDEX IF NOT EXISTS profiles_is_admin ON public.profiles (is_admin) WHERE is_admin = true;
