import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbFeedback, DbFeedbackInsert } from "./types.js";

function assertRow<T>(
  data: T | null,
  error: { message: string } | null,
  context: string
): T {
  if (error) throw new Error(`${context}: ${error.message}`);
  if (!data) throw new Error(`${context}: no row returned`);
  return data;
}

/** Insert a feedback row and return it. */
export async function createFeedback(
  client: SupabaseClient,
  insert: DbFeedbackInsert
): Promise<DbFeedback> {
  const { data, error } = await client
    .from("feedback")
    .insert(insert)
    .select()
    .single();

  return assertRow(data, error, "createFeedback");
}

/** Insert multiple feedback rows in a single request and return them. */
export async function createFeedbackBatch(
  client: SupabaseClient,
  inserts: DbFeedbackInsert[]
): Promise<DbFeedback[]> {
  if (inserts.length === 0) return [];
  const { data, error } = await client
    .from("feedback")
    .insert(inserts)
    .select();

  if (error) throw new Error(`createFeedbackBatch: ${error.message}`);
  return data ?? [];
}

/** Fetch all feedback for a session. */
export async function getFeedbackBySession(
  client: SupabaseClient,
  sessionId: string
): Promise<DbFeedback[]> {
  const { data, error } = await client
    .from("feedback")
    .select()
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getFeedbackBySession: ${error.message}`);
  return data ?? [];
}
