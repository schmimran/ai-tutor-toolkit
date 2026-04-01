import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbSessionFeedback, DbSessionFeedbackInsert } from "./types.js";
import { assertRow } from "./assert.js";

/** Insert a session_feedback row and return it. */
export async function createSessionFeedback(
  client: SupabaseClient,
  insert: DbSessionFeedbackInsert
): Promise<DbSessionFeedback> {
  const { data, error } = await client
    .from("session_feedback")
    .insert(insert)
    .select()
    .single();

  return assertRow(data, error, "createSessionFeedback");
}

/** Fetch the feedback row for a session.  Returns null if not found. */
export async function getSessionFeedback(
  client: SupabaseClient,
  sessionId: string
): Promise<DbSessionFeedback | null> {
  const { data, error } = await client
    .from("session_feedback")
    .select()
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw new Error(`getSessionFeedback: ${error.message}`);
  return data;
}
