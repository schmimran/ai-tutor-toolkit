import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Create a Supabase client using the service-role key.
 *
 * Required env vars:
 *   SUPABASE_URL              — project URL (https://<ref>.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY — secret key with full DB access
 *
 * The service-role key bypasses Row Level Security.  Never expose it to the
 * browser or the frontend.  All Supabase queries run server-side only.
 */
export function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create a Supabase client using the anon (public) key.
 *
 * Used only for the authentication endpoints (signInWithPassword,
 * refreshSession) that must run against the public-facing auth API rather
 * than the service role.  JWT verification still uses the service-role
 * client via `db.auth.getUser(token)`.
 *
 * Required env vars:
 *   SUPABASE_URL       — project URL
 *   SUPABASE_ANON_KEY  — anon/public key
 *
 * Despite the name, this key is still held server-side only in this project.
 * It is never sent to the browser or surfaced through /api/config.
 */
export function createSupabaseAnonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set in the environment."
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
