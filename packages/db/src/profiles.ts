import type { SupabaseClient } from "@supabase/supabase-js";

export interface DbProfile {
  user_id: string;
  is_admin: boolean;
  email_transcripts_enabled: boolean;
  created_at: string;
}

export interface DbProfileUpdate {
  emailTranscriptsEnabled?: boolean;
}

/**
 * Create a profile row for a newly registered user.
 * Defaults to `is_admin: false`.
 */
export async function createProfile(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await client
    .from("profiles")
    .insert({ user_id: userId });
  if (error) throw new Error(`createProfile: ${error.message}`);
}

/**
 * Get a user's profile. Returns `null` for legacy users who registered
 * before the profiles table existed — callers must handle the null case.
 */
export async function getProfile(
  client: SupabaseClient,
  userId: string,
): Promise<{ isAdmin: boolean; emailTranscriptsEnabled: boolean } | null> {
  const { data, error } = await client
    .from("profiles")
    .select("is_admin, email_transcripts_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getProfile: ${error.message}`);
  if (!data) return null;
  return {
    isAdmin: data.is_admin as boolean,
    emailTranscriptsEnabled: data.email_transcripts_enabled as boolean,
  };
}

/**
 * Update a user's profile settings. Uses upsert semantics so it works for
 * legacy users who may not have a profiles row yet.
 */
export async function updateProfile(
  client: SupabaseClient,
  userId: string,
  patch: DbProfileUpdate,
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId };
  if (patch.emailTranscriptsEnabled !== undefined) {
    row.email_transcripts_enabled = patch.emailTranscriptsEnabled;
  }
  const { error } = await client
    .from("profiles")
    .upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(`updateProfile: ${error.message}`);
}
