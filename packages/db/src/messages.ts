import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbMessage, DbMessageInsert } from "./types.js";
import { assertRow } from "./assert.js";

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
