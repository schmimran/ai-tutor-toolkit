import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbSession, DbSessionInsert, DbSessionUpdate } from "./types.js";

function assertRow<T>(
  data: T | null,
  error: { message: string } | null,
  context: string
): T {
  if (error) throw new Error(`${context}: ${error.message}`);
  if (!data) throw new Error(`${context}: no row returned`);
  return data;
}

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
