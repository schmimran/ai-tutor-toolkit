import { evaluateTranscript } from "@ai-tutor/core";
import type { EvaluationResult } from "@ai-tutor/core";
import { createSessionEvaluation } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";

const DIMENSION_LABELS: Record<string, string> = {
  opening_sequence: "Opening sequence",
  one_question: "One question at a time",
  asked_why: "Asked why",
  worked_at_edge: "Worked at student's edge",
  parallel_problems: "Parallel problems",
  step_feedback: "Step-level feedback",
  never_gave_answer: "Never gave the answer",
  clarity: "Clarity",
  tone: "Tone",
  resolution: "Resolution",
};

const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as (keyof typeof DIMENSION_LABELS)[];

export function buildEvaluationPayload(result: EvaluationResult) {
  return {
    dimensions: DIMENSION_KEYS.map(key => ({
      label: DIMENSION_LABELS[key],
      score: (result[key as keyof EvaluationResult] as { score: string }).score,
      rationale: (result[key as keyof EvaluationResult] as { rationale: string }).rationale,
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
      opening_sequence: result.opening_sequence.score,
      one_question: result.one_question.score,
      asked_why: result.asked_why.score,
      worked_at_edge: result.worked_at_edge.score,
      parallel_problems: result.parallel_problems.score,
      step_feedback: result.step_feedback.score,
      never_gave_answer: result.never_gave_answer.score,
      clarity: result.clarity.score,
      tone: result.tone.score,
      resolution: result.resolution.score,
      has_failures: result.has_failures,
      rationale: {
        opening_sequence: result.opening_sequence.rationale,
        one_question: result.one_question.rationale,
        asked_why: result.asked_why.rationale,
        worked_at_edge: result.worked_at_edge.rationale,
        parallel_problems: result.parallel_problems.rationale,
        step_feedback: result.step_feedback.rationale,
        never_gave_answer: result.never_gave_answer.rationale,
        clarity: result.clarity.rationale,
        tone: result.tone.rationale,
        resolution: result.resolution.rationale,
      },
    });
    return result;
  } catch (err) {
    console.error(`[evaluation] Failed to evaluate session ${sessionId}:`, err);
    return null;
  }
}
