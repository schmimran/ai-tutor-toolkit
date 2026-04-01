import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbSessionEvaluation, DbSessionEvaluationInsert } from "./types.js";
import { assertRow } from "./assert.js";

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

/** Insert or replace a session_evaluations row (upsert on session_id). */
export async function upsertSessionEvaluation(
  client: SupabaseClient,
  insert: DbSessionEvaluationInsert
): Promise<DbSessionEvaluation> {
  const { data, error } = await client
    .from("session_evaluations")
    .upsert(insert, { onConflict: "session_id" })
    .select()
    .single();

  return assertRow(data, error, "upsertSessionEvaluation");
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
