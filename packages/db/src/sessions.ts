import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbSession, DbSessionInsert, DbSessionUpdate } from "./types.js";
import { assertRow } from "./assert.js";

/** Insert a new session row.  Returns the created row. */
export async function createSession(
  client: SupabaseClient,
  insert: DbSessionInsert
): Promise<DbSession> {
  const { data, error } = await client
    .from("sessions")
    .insert(insert)
    .select()
    .single();

  return assertRow(data, error, "createSession");
}

/** Fetch a single session by ID.  Returns null if not found. */
export async function getSession(
  client: SupabaseClient,
  id: string
): Promise<DbSession | null> {
  const { data, error } = await client
    .from("sessions")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getSession: ${error.message}`);
  return data;
}

/** Apply a partial update to a session row.  Returns the updated row. */
export async function updateSession(
  client: SupabaseClient,
  id: string,
  update: DbSessionUpdate
): Promise<DbSession> {
  const { data, error } = await client
    .from("sessions")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  return assertRow(data, error, "updateSession");
}

/**
 * Look up the email address of the authenticated user who owns a session.
 * Returns null if the session has no user_id or if any lookup fails.
 */
export async function getUserEmailForSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<string | null> {
  try {
    const session = await getSession(client, sessionId);
    if (!session?.user_id) return null;

    const { data, error } = await client.auth.admin.getUserById(session.user_id);
    if (error || !data?.user?.email) return null;

    return data.user.email;
  } catch {
    return null;
  }
}

/**
 * Return ended sessions belonging to a specific user, most recent first.
 * Used by the history page to list past tutoring sessions.
 */
export async function getSessionsByUser(
  client: SupabaseClient,
  userId: string,
): Promise<DbSession[]> {
  const { data, error } = await client
    .from("sessions")
    .select()
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`getSessionsByUser: ${error.message}`);
  return data ?? [];
}

/**
 * Mark a session as ended by setting ended_at to now.
 * Session data (messages, feedback) is retained for analysis.
 */
export async function markSessionEnded(
  client: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await client
    .from("sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`markSessionEnded: ${error.message}`);
}
