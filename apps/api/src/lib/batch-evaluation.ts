import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildEvaluationRequestParams,
  submitEvaluationBatch,
  retrieveBatch,
  iterateBatchEvaluationResults,
  type EvaluationResult,
  type EvaluationBatchRequest,
} from "@ai-tutor/core";
import type { TranscriptEmailPayload, TranscriptEmailConfig } from "@ai-tutor/email";
import { sendTranscript } from "@ai-tutor/email";
import {
  updateSession,
  getMessagesBySession,
  upsertSessionEvaluation,
  getUserProfileForSession,
  createEvaluationBatch,
  updateEvaluationBatch,
  getInFlightBatchedSessionIds,
  type DbSession,
  type DbMessage,
  type DbSessionFeedback,
  type DbEvaluationBatch,
  type UserSessionProfile,
} from "@ai-tutor/db";
import { buildEvaluationPayload, getOrCreateTimeoutFeedback } from "./evaluation.js";

/** Hard cap on sessions per batch — defensive ceiling well below Anthropic's 10k limit. */
export const MAX_BATCH_SIZE = 100;

/**
 * Find sessions that need evaluation:
 *   - evaluated = false
 *   - ended_at IS NOT NULL
 *   - not claimed by an in-flight batch (status submitted/ended)
 *   - has at least one assistant message (checked after message fetch)
 *
 * Returns session IDs + transcripts ready to feed into `buildEvaluationRequestParams()`.
 */
export async function findPendingEvaluations(
  db: SupabaseClient,
  limit: number,
): Promise<Array<{ sessionId: string; transcript: Array<{ role: string; text: string }> }>> {
  const inFlight = await getInFlightBatchedSessionIds(db);

  // Query candidate sessions. Can't express "NOT IN arbitrary set" via PostgREST
  // cleanly when the set is large, so we fetch `limit + inFlight.size` rows
  // worst-case then filter in code. In practice inFlight is tiny (only active batches).
  const fetchLimit = Math.min(limit + inFlight.size, limit * 2 + 20);

  const { data, error } = await db
    .from("sessions")
    .select("id")
    .eq("evaluated", false)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: true })
    .limit(fetchLimit);

  if (error) throw new Error(`findPendingEvaluations: ${error.message}`);

  const candidates = (data ?? [])
    .map((row) => (row as { id: string }).id)
    .filter((id) => !inFlight.has(id))
    .slice(0, limit);

  const messagesByCandidate = await Promise.all(
    candidates.map((id) => getMessagesBySession(db, id)),
  );

  const results: Array<{ sessionId: string; transcript: Array<{ role: string; text: string }> }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const messages = messagesByCandidate[i];
    if (messages.length === 0) continue;
    if (!messages.some((m) => m.role === "assistant")) continue;

    const transcript = messages.map((m) => ({
      role: m.role === "assistant" ? "Tutor" : "Student",
      text: m.content,
    }));
    results.push({ sessionId: candidates[i], transcript });
  }

  return results;
}

/**
 * Submit a batch of evaluation requests to Anthropic and persist the batch row.
 * Returns null if no sessions are pending evaluation.
 */
export async function createEvaluationBatchForPending(
  db: SupabaseClient,
  opts: { limit: number; evaluationModel: string; submittedBy: string | null },
): Promise<{ batch: DbEvaluationBatch; sessionCount: number } | null> {
  const capped = Math.max(1, Math.min(opts.limit, MAX_BATCH_SIZE));
  const pending = await findPendingEvaluations(db, capped);

  if (pending.length === 0) return null;

  const requests: EvaluationBatchRequest[] = pending.map((p) => ({
    customId: p.sessionId,
    params: buildEvaluationRequestParams(p.transcript, opts.evaluationModel),
  }));

  const submitted = await submitEvaluationBatch(requests);

  const batch = await createEvaluationBatch(db, {
    anthropic_batch_id: submitted.anthropicBatchId,
    status: "submitted",
    session_ids: pending.map((p) => p.sessionId),
    submitted_by: opts.submittedBy,
    request_counts: submitted.requestCounts,
  });

  console.log(
    `[batch-eval] Submitted batch ${batch.id} (anthropic ${submitted.anthropicBatchId}) with ${pending.length} session(s).`,
  );

  return { batch, sessionCount: pending.length };
}

/**
 * Poll a batch's state on Anthropic and mirror it into our row. Returns the
 * (possibly updated) local row. Safe to call on any batch — short-circuits
 * if the batch is already in a terminal local state.
 */
export async function refreshBatchStatus(
  db: SupabaseClient,
  batch: DbEvaluationBatch,
): Promise<DbEvaluationBatch> {
  if (batch.status === "processed" || batch.status === "failed") return batch;

  const remote = await retrieveBatch(batch.anthropic_batch_id);
  const updates: Partial<DbEvaluationBatch> = {
    request_counts: remote.requestCounts,
  };

  if (remote.processingStatus === "ended" && batch.status === "submitted") {
    updates.status = "ended";
    updates.ended_at = new Date().toISOString();
  }

  return updateEvaluationBatch(db, batch.id, updates);
}

/** Re-shape DB messages into the TranscriptEntry[] shape used by the email payload. */
function transcriptFromMessages(messages: DbMessage[]): TranscriptEmailPayload["transcript"] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "Tutor" : "Student",
    text: m.content,
  }));
}

/**
 * Assemble the admin transcript email payload from DB rows.
 * Files are always empty — they're not persisted beyond the live session.
 */
function buildTranscriptEmailPayloadFromDb(
  session: DbSession,
  messages: DbMessage[],
  evalResult: EvaluationResult | null,
  feedback: DbSessionFeedback | null,
  userProfile: UserSessionProfile | null,
): TranscriptEmailPayload {
  const startedAt = new Date(session.started_at);
  const lastActivityAt = new Date(session.last_activity_at);
  const durationMs = Math.max(0, lastActivityAt.getTime() - startedAt.getTime());

  return {
    transcript: transcriptFromMessages(messages),
    files: [],
    clientInfo: {
      ip: session.client_ip ?? undefined,
      geo: session.client_geo,
      userAgent: session.client_user_agent ?? undefined,
    },
    startedAt,
    lastActivityAt,
    durationMs,
    sessionId: session.id,
    tokenUsage: {
      inputTokens: session.total_input_tokens,
      outputTokens: session.total_output_tokens,
    },
    model: session.model ?? undefined,
    promptName: session.prompt_name ?? undefined,
    extendedThinking: session.extended_thinking,
    evaluation: evalResult ? buildEvaluationPayload(evalResult) : null,
    studentFeedback: feedback ?? null,
    userInfo: userProfile ? { email: userProfile.email, name: userProfile.name } : null,
  };
}

export interface BatchProcessingOutcome {
  succeeded: number;
  errored: number;
  skipped: number;
  emailsSent: number;
}

/**
 * Download batch results and, for each succeeded entry, write the evaluation
 * row, flip `sessions.evaluated=true`, and send the admin transcript email
 * (plus a student copy if applicable). Mirrors the DELETE-handler orchestration
 * but loaded entirely from the database — there is no in-memory `Session`.
 *
 * Marks the local batch row `processed` on success, or `failed` on a fatal error.
 */
export async function processBatchResults(
  db: SupabaseClient,
  batch: DbEvaluationBatch,
  opts: { emailConfig: TranscriptEmailConfig; evaluationModel: string },
): Promise<BatchProcessingOutcome> {
  const outcome: BatchProcessingOutcome = {
    succeeded: 0,
    errored: 0,
    skipped: 0,
    emailsSent: 0,
  };

  try {
    for await (const entry of iterateBatchEvaluationResults(
      batch.anthropic_batch_id,
      opts.evaluationModel,
    )) {
      const sessionId = entry.customId;

      if (!entry.evaluation) {
        outcome.errored += 1;
        console.warn(
          `[batch-eval] Session ${sessionId} skipped (${entry.status}): ${entry.reason ?? "no evaluation"}`,
        );
        continue;
      }

      const evalResult: EvaluationResult = entry.evaluation;

      let dbSession: DbSession;
      try {
        await upsertSessionEvaluation(db, {
          session_id: sessionId,
          model: evalResult.model,
          mode_handling: evalResult.mode_handling,
          problem_confirmation: evalResult.problem_confirmation,
          never_gave_answer: evalResult.never_gave_answer,
          probe_reasoning: evalResult.probe_reasoning,
          understood_where_student_was: evalResult.understood_where_student_was,
          one_question: evalResult.one_question,
          worked_at_edge: evalResult.worked_at_edge,
          followed_student_lead: evalResult.followed_student_lead,
          adaptive_tone: evalResult.adaptive_tone,
          parallel_problems: evalResult.parallel_problems,
          step_feedback: evalResult.step_feedback,
          resolution: evalResult.resolution,
          has_failures: evalResult.has_failures,
          rationale: evalResult.rationale,
        });
        // `updateSession` throws if the row is gone (cascade delete, etc.) — the catch
        // records it as errored and we move on without emailing.
        dbSession = await updateSession(db, sessionId, { evaluated: true });
        outcome.succeeded += 1;
      } catch (err) {
        outcome.errored += 1;
        console.error(`[batch-eval] Failed to persist evaluation for ${sessionId}:`, err);
        continue;
      }

      const [messages, userProfile, feedback] = await Promise.all([
        getMessagesBySession(db, sessionId),
        getUserProfileForSession(db, sessionId).catch(() => null),
        getOrCreateTimeoutFeedback(db, sessionId, "batch-eval"),
      ]);

      const payload = buildTranscriptEmailPayloadFromDb(
        dbSession,
        messages,
        evalResult,
        feedback,
        userProfile,
      );

      if (opts.emailConfig.apiKey && opts.emailConfig.to) {
        try {
          // Admin-only: student already got their transcript at session end.
          await sendTranscript(opts.emailConfig, payload);
          await updateSession(db, sessionId, { email_sent: true });
          outcome.emailsSent += 1;
        } catch (err) {
          console.error(`[batch-eval] Failed to send admin transcript for ${sessionId}:`, err);
        }
      } else {
        outcome.skipped += 1;
      }
    }

    const processed = await updateEvaluationBatch(db, batch.id, {
      status: "processed",
      processed_at: new Date().toISOString(),
    });

    console.log(
      `[batch-eval] Processed batch ${processed.id}: ${outcome.succeeded} succeeded, ${outcome.errored} errored, ${outcome.skipped} skipped, ${outcome.emailsSent} emails sent.`,
    );

    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateEvaluationBatch(db, batch.id, {
      status: "failed",
      error_message: message,
    }).catch(() => {});
    console.error(`[batch-eval] Fatal error processing batch ${batch.id}:`, err);
    throw err;
  }
}
