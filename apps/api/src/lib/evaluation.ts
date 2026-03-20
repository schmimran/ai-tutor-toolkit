import { evaluateTranscript } from "@ai-tutor/core";
import type { EvaluationResult } from "@ai-tutor/core";
import { createSessionEvaluation } from "@ai-tutor/db";
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

export async function runSessionEvaluation(
  db: SupabaseClient,
  sessionId: string,
  transcript: Array<{ role: string; text: string }>
): Promise<EvaluationResult | null> {
  try {
    const result = await evaluateTranscript(transcript);
    await createSessionEvaluation(db, {
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
