import type { SupabaseClient } from "@supabase/supabase-js";

export interface DbProfile {
  user_id: string;
  email_transcripts_enabled: boolean;
  created_at: string;
}

/**
 * Get a user's profile preferences.
 *
 * A row is guaranteed to exist once the user is created (the
 * `on_auth_user_created` trigger in migration 005 inserts a default row),
 * but we still tolerate null for robustness — callers should assume the
 * defaults below when the row is missing.
 */
export async function getProfile(
  client: SupabaseClient,
  userId: string,
): Promise<{ emailTranscriptsEnabled: boolean } | null> {
  const { data, error } = await client
    .from("profiles")
    .select("email_transcripts_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getProfile: ${error.message}`);
  if (!data) return null;
  return {
    emailTranscriptsEnabled: data.email_transcripts_enabled as boolean,
  };
}
