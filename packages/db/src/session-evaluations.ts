import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbSessionEvaluation, DbSessionEvaluationInsert } from "./types.js";

function assertRow<T>(
  data: T | null,
  error: { message: string } | null,
  context: string
): T {
  if (error) throw new Error(`${context}: ${error.message}`);
  if (!data) throw new Error(`${context}: no row returned`);
  return data;
}

/** Insert a session_evaluations row and return it. */
export async function createSessionEvaluation(
  client: SupabaseClient,
  insert: DbSessionEvaluationInsert
): Promise<DbSessionEvaluation> {
  const { data, error } = await client
    .from("session_evaluations")
    .insert(insert)
    .select()
    .single();

  return assertRow(data, error, "createSessionEvaluation");
}

/** Fetch the evaluation row for a session.  Returns null if not found. */
export async function getSessionEvaluation(
  client: SupabaseClient,
  sessionId: string
): Promise<DbSessionEvaluation | null> {
  const { data, error } = await client
    .from("session_evaluations")
    .select()
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw new Error(`getSessionEvaluation: ${error.message}`);
  return data;
}
