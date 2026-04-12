import type { SupabaseClient } from "@supabase/supabase-js";

export interface DbProfile {
  user_id: string;
  is_admin: boolean;
  created_at: string;
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
): Promise<{ isAdmin: boolean } | null> {
  const { data, error } = await client
    .from("profiles")
    .select("is_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getProfile: ${error.message}`);
  if (!data) return null;
  return { isAdmin: data.is_admin as boolean };
}
