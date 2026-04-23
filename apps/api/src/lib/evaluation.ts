import type { EvaluationResult } from "@ai-tutor/core";
import { sendUserTranscript } from "@ai-tutor/email";
import { getSessionFeedback, createSessionFeedback, getUserProfileForSession } from "@ai-tutor/db";
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
      rationale: result.rationale[key] ?? "",
    })),
    hasFailures: result.has_failures,
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
    const profile = await getUserProfileForSession(db, sessionId);
    if (!profile) return;
    if (!profile.emailTranscriptsEnabled) {
      console.log(
        `[email] User transcript suppressed for ${sessionId} (emailTranscriptsEnabled=false).`
      );
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    await sendUserTranscript(profile.email, { apiKey, from: emailFrom }, {
      transcript: transcript as Array<{ role: "Student" | "Tutor"; text: string }>,
      startedAt,
      durationMs,
    });
  } catch (err) {
    console.error(`[email] Failed to send user transcript for ${sessionId}:`, err);
  }
}
