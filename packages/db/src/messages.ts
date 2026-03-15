import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbMessage, DbMessageInsert } from "./types.js";

function assertRow<T>(
  data: T | null,
  error: { message: string } | null,
  context: string
): T {
  if (error) throw new Error(`${context}: ${error.message}`);
  if (!data) throw new Error(`${context}: no row returned`);
  return data;
}

/** Insert a single message row and return it. */
export async function createMessage(
  client: SupabaseClient,
  insert: DbMessageInsert
): Promise<DbMessage> {
  const { data, error } = await client
    .from("messages")
    .insert(insert)
    .select()
    .single();

  return assertRow(data, error, "createMessage");
}

/**
 * Fetch all messages for a session, ordered by creation time ascending.
 * Returns an empty array if the session has no messages.
 */
export async function getMessagesBySession(
  client: SupabaseClient,
  sessionId: string
): Promise<DbMessage[]> {
  const { data, error } = await client
    .from("messages")
    .select()
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getMessagesBySession: ${error.message}`);
  return data ?? [];
}

/** Delete all messages for a session (used when resetting a session). */
export async function deleteMessagesBySession(
  client: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { error } = await client
    .from("messages")
    .delete()
    .eq("session_id", sessionId);

  if (error) throw new Error(`deleteMessagesBySession: ${error.message}`);
}
