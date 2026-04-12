import { evaluateTranscript } from "@ai-tutor/core";
import type { EvaluationResult, Session } from "@ai-tutor/core";
import type { TranscriptEmailPayload } from "@ai-tutor/email";
import { sendUserTranscript } from "@ai-tutor/email";
import { upsertSessionEvaluation, updateSession, getSessionFeedback, createSessionFeedback, getUserEmailForSession } from "@ai-tutor/db";
import type { DbSessionFeedback } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";

const DIMENSION_LABELS: Record<string, string> = {
  mode_handling: "Mode handling",
  problem_confirmation: "Problem confirmation",
  never_gave_answer: "Never gave the answer",
  probe_reasoning: "Probed reasoning",
  understood_where_student_was: "Understood where student was",
  one_question: "One question at a time",
  worked_at_edge: "Worked at student's edge",
  followed_student_lead: "Followed student's lead",
  adaptive_tone: "Adaptive tone",
  parallel_problems: "Parallel problems",
  step_feedback: "Step-level feedback",
  resolution: "Resolution",
};

const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as (keyof typeof DIMENSION_LABELS)[];

export function buildEvaluationPayload(result: EvaluationResult) {
  return {
    dimensions: DIMENSION_KEYS.map(key => ({
      label: DIMENSION_LABELS[key],
      score: result[key as keyof EvaluationResult] as string,
      rationale: result.rationale[key],
    })),
    hasFailures: result.has_failures,
  };
}

/**
 * Build the email payload from session data, evaluation, and feedback.
 * Used by both the DELETE handler and the inactivity sweep.
 */
export function buildTranscriptEmailPayload(
  session: Session,
  sessionId: string,
  evalResult: EvaluationResult | null,
  feedback: DbSessionFeedback | null,
  fallbacks?: { model?: string; promptName?: string; extendedThinking?: boolean },
): TranscriptEmailPayload {
  const summary = session.getSessionSummary();
  return {
    transcript: summary.transcript,
    files: session.files,
    clientInfo: summary.clientInfo,
    startedAt: summary.startedAt,
    lastActivityAt: summary.lastActivityAt,
    durationMs: summary.durationMs,
    sessionId,
    tokenUsage: summary.tokenUsage,
    evaluation: evalResult ? buildEvaluationPayload(evalResult) : null,
    studentFeedback: feedback ?? null,
    model: session.model ?? fallbacks?.model,
    promptName: session.promptName ?? fallbacks?.promptName,
    extendedThinking: session.extendedThinking ?? fallbacks?.extendedThinking,
  };
}

/**
 * Fetch the session_feedback row for a session, creating a source:'timeout' row
 * if none exists.  Handles unique-constraint races by re-fetching on null return.
 * Used by both the inactivity sweep and the explicit DELETE handler.
 */
export async function getOrCreateTimeoutFeedback(
  db: SupabaseClient,
  sessionId: string,
  logPrefix: string,
): Promise<DbSessionFeedback | null> {
  let feedback = await getSessionFeedback(db, sessionId).catch(err => {
    console.error(`[${logPrefix}] Failed to fetch feedback for ${sessionId}:`, err);
    return null;
  });
  if (!feedback) {
    feedback = await createSessionFeedback(db, {
      session_id: sessionId,
      source: "timeout",
    }).catch(err => {
      console.error(`[${logPrefix}] Failed to create timeout feedback for ${sessionId}:`, err);
      return null;
    });
    // createSessionFeedback returns null on unique-constraint violation (concurrent insert).
    // Re-fetch to get the row that was created by the concurrent path.
    if (!feedback) {
      feedback = await getSessionFeedback(db, sessionId).catch(() => null);
    }
  }
  return feedback;
}

export async function runSessionEvaluation(
  db: SupabaseClient,
  sessionId: string,
  transcript: Array<{ role: string; text: string }>
): Promise<EvaluationResult | null> {
  try {
    const result = await evaluateTranscript(transcript);
    await upsertSessionEvaluation(db, {
      session_id: sessionId,
      model: result.model,
      mode_handling: result.mode_handling,
      problem_confirmation: result.problem_confirmation,
      never_gave_answer: result.never_gave_answer,
      probe_reasoning: result.probe_reasoning,
      understood_where_student_was: result.understood_where_student_was,
      one_question: result.one_question,
      worked_at_edge: result.worked_at_edge,
      followed_student_lead: result.followed_student_lead,
      adaptive_tone: result.adaptive_tone,
      parallel_problems: result.parallel_problems,
      step_feedback: result.step_feedback,
      resolution: result.resolution,
      has_failures: result.has_failures,
      rationale: result.rationale,
    });
    return result;
  } catch (err) {
    console.error(`[evaluation] Failed to evaluate session ${sessionId}:`, err);
    return null;
  }
}

/**
 * Mark the session email as sent in both in-memory state and the database.
 * Called after sendTranscript succeeds in both the inactivity sweep and the
 * DELETE handler — extracted here to avoid duplicating the two-step pattern.
 */
export async function markEmailSentPersisted(
  session: Session,
  db: SupabaseClient,
  sessionId: string,
  logPrefix: string,
): Promise<void> {
  session.markEmailSent();
  await updateSession(db, sessionId, { email_sent: true }).catch(err =>
    console.error(`[${logPrefix}] Could not persist email_sent for ${sessionId}:`, err)
  );
}

/**
 * Send a student-facing transcript email if the session belongs to a
 * registered user.  Fire-and-forget — never throws.
 */
export async function sendUserTranscriptIfApplicable(
  sessionId: string,
  transcript: Array<{ role: string; text: string }>,
  startedAt: Date,
  durationMs: number,
  emailFrom: string,
  db: SupabaseClient,
): Promise<void> {
  try {
    const email = await getUserEmailForSession(db, sessionId);
    if (!email) return;

    const apiKey = process.env.RESEND_API_KEY;
    await sendUserTranscript(email, { apiKey, from: emailFrom }, {
      transcript: transcript as Array<{ role: "Student" | "Tutor"; text: string }>,
      startedAt,
      durationMs,
    });
  } catch (err) {
    console.error(`[email] Failed to send user transcript for ${sessionId}:`, err);
  }
}
