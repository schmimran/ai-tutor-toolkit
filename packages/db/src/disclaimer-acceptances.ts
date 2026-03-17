import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DbDisclaimerAcceptance,
  DbDisclaimerAcceptanceInsert,
} from "./types.js";

/**
 * Backfill session_id on disclaimer acceptance rows that were recorded before
 * the session row existed.  Called after createSession() on the first chat turn.
 *
 * Matches on client_session_id (plain text, no FK) and sets the real FK.
 * Safe to call even if no matching rows exist.
 */
export async function linkDisclaimerAcceptance(
  client: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { error } = await client
    .from("disclaimer_acceptances")
    .update({ session_id: sessionId })
    .eq("client_session_id", sessionId)
    .is("session_id", null);

  if (error) throw new Error(`linkDisclaimerAcceptance: ${error.message}`);
}

/**
 * Insert a disclaimer acceptance record and return the created row.
 */
export async function createDisclaimerAcceptance(
  client: SupabaseClient,
  insert: DbDisclaimerAcceptanceInsert
): Promise<DbDisclaimerAcceptance> {
  const { data, error } = await client
    .from("disclaimer_acceptances")
    .insert(insert)
    .select()
    .single();

  if (error) throw new Error(`createDisclaimerAcceptance: ${error.message}`);
  if (!data) throw new Error("createDisclaimerAcceptance: no row returned");
  return data as DbDisclaimerAcceptance;
}
