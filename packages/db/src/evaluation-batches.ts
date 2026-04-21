import type { SupabaseClient } from "@supabase/supabase-js";
import { assertRow } from "./assert.js";

export type EvaluationBatchStatus = "submitted" | "ended" | "processed" | "failed";

export interface DbEvaluationBatch {
  id: string;
  anthropic_batch_id: string;
  status: EvaluationBatchStatus;
  session_ids: string[];
  request_counts: Record<string, unknown> | null;
  submitted_by: string | null;
  submitted_at: string;
  ended_at: string | null;
  processed_at: string | null;
  error_message: string | null;
}

export interface DbEvaluationBatchInsert {
  anthropic_batch_id: string;
  status: EvaluationBatchStatus;
  session_ids: string[];
  submitted_by?: string | null;
  request_counts?: Record<string, unknown> | null;
}

export type DbEvaluationBatchUpdate = Partial<
  Omit<DbEvaluationBatch, "id" | "anthropic_batch_id" | "session_ids" | "submitted_at" | "submitted_by">
>;

export async function createEvaluationBatch(
  client: SupabaseClient,
  insert: DbEvaluationBatchInsert,
): Promise<DbEvaluationBatch> {
  const { data, error } = await client
    .from("evaluation_batches")
    .insert(insert)
    .select()
    .single();

  return assertRow(data, error, "createEvaluationBatch");
}

export async function getEvaluationBatch(
  client: SupabaseClient,
  id: string,
): Promise<DbEvaluationBatch | null> {
  const { data, error } = await client
    .from("evaluation_batches")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getEvaluationBatch: ${error.message}`);
  return data;
}

export async function updateEvaluationBatch(
  client: SupabaseClient,
  id: string,
  update: DbEvaluationBatchUpdate,
): Promise<DbEvaluationBatch> {
  const { data, error } = await client
    .from("evaluation_batches")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  return assertRow(data, error, "updateEvaluationBatch");
}

export async function listEvaluationBatches(
  client: SupabaseClient,
  limit = 50,
): Promise<DbEvaluationBatch[]> {
  const { data, error } = await client
    .from("evaluation_batches")
    .select()
    .order("submitted_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listEvaluationBatches: ${error.message}`);
  return data ?? [];
}

/**
 * Return the set of session IDs currently claimed by batches still in flight
 * (`submitted` or `ended` — i.e. not yet `processed` or `failed`). Used by the
 * "sessions needing evaluation" query to avoid resubmitting a session that is
 * already in an active batch.
 */
export async function getInFlightBatchedSessionIds(
  client: SupabaseClient,
): Promise<Set<string>> {
  const { data, error } = await client
    .from("evaluation_batches")
    .select("session_ids")
    .in("status", ["submitted", "ended"]);

  if (error) throw new Error(`getInFlightBatchedSessionIds: ${error.message}`);

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ session_ids: string[] }>) {
    for (const id of row.session_ids) ids.add(id);
  }
  return ids;
}
