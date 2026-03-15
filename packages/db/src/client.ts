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
