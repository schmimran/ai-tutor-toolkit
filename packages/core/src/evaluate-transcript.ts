import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, cachedSystem } from "./tutor-client.js";
import { loadPromptFile } from "./prompt-loader.js";

/** Load the evaluation prompt from the co-located .md file (single source of truth). */
const EVALUATION_PROMPT = loadPromptFile("packages/core/src/evaluation-prompt.md");

/** Default model for automated transcript evaluation. Overridable via EVALUATION_MODEL env var. */
export const DEFAULT_EVALUATION_MODEL = "claude-haiku-4-5-20251001";

export interface EvaluationResult {
  model: string;
  session_mode: string;
  mode_handling: string;
  problem_confirmation: string;
  never_gave_answer: string;
  probe_reasoning: string;
  understood_where_student_was: string;
  one_question: string;
  worked_at_edge: string;
  followed_student_lead: string;
  adaptive_tone: string;
  parallel_problems: string;
  step_feedback: string;
  resolution: string;
  has_failures: boolean;
  rationale: Record<string, string>;
}

/** Non-negotiable dimensions — a "fail" on any of these triggers has_failures. */
const NON_NEGOTIABLE_KEYS: (keyof EvaluationResult)[] = [
  "never_gave_answer",
  "probe_reasoning",
  "understood_where_student_was",
];

/** All scored dimensions (excludes session_mode, has_failures, rationale). */
const ALL_DIMENSION_KEYS: (keyof EvaluationResult)[] = [
  "mode_handling",
  "problem_confirmation",
  "never_gave_answer",
  "probe_reasoning",
  "understood_where_student_was",
  "one_question",
  "worked_at_edge",
  "followed_student_lead",
  "adaptive_tone",
  "parallel_problems",
  "step_feedback",
];

/**
 * Build the Anthropic messages.create params for a single transcript evaluation.
 * Used by the batch path (each request in a Message Batches submission).
 * The cached system prompt is identical across calls — within a batch,
 * request #1 creates the cache and subsequent requests read it.
 */
export function buildEvaluationRequestParams(
  transcript: Array<{ role: string; text: string }>,
  evaluationModel: string = DEFAULT_EVALUATION_MODEL,
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const formattedTranscript = transcript
    .map((entry, i) => `${i + 1}. [${entry.role}] ${entry.text}`)
    .join("\n");

  return {
    model: evaluationModel,
    max_tokens: 2000,
    system: cachedSystem(EVALUATION_PROMPT),
    messages: [{ role: "user", content: formattedTranscript }],
  };
}

/**
 * Parse a completed evaluation `Message` (from either `messages.create` or a
 * batch result) into a structured `EvaluationResult`. Computes `has_failures`
 * from the parsed dimensions per v7 rules.
 */
export function parseEvaluationResponse(
  message: Anthropic.Messages.Message,
  evaluationModel: string,
): EvaluationResult {
  const rawText = message.content
    .filter((block) => block.type === "text")
    .map((block) => (block as Anthropic.TextBlock).text)
    .join("");

  // Strip markdown fences defensively
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`parseEvaluationResponse: failed to parse model response as JSON.\nRaw response:\n${rawText}`);
  }

  // has_failures: true if any non-negotiable dimension is "fail", or if 3+ other dimensions are "fail".
  const nonNegotiableFail = NON_NEGOTIABLE_KEYS.some(
    (key) => parsed[key as string] === "fail"
  );
  const otherFailCount = ALL_DIMENSION_KEYS
    .filter((key) => !NON_NEGOTIABLE_KEYS.includes(key))
    .filter((key) => parsed[key as string] === "fail")
    .length;
  const has_failures = nonNegotiableFail || otherFailCount >= 3;

  return {
    model: evaluationModel,
    session_mode: parsed.session_mode as string,
    mode_handling: parsed.mode_handling as string,
    problem_confirmation: parsed.problem_confirmation as string,
    never_gave_answer: parsed.never_gave_answer as string,
    probe_reasoning: parsed.probe_reasoning as string,
    understood_where_student_was: parsed.understood_where_student_was as string,
    one_question: parsed.one_question as string,
    worked_at_edge: parsed.worked_at_edge as string,
    followed_student_lead: parsed.followed_student_lead as string,
    adaptive_tone: parsed.adaptive_tone as string,
    parallel_problems: parsed.parallel_problems as string,
    step_feedback: parsed.step_feedback as string,
    resolution: parsed.resolution as string,
    has_failures,
    rationale: parsed.rationale as Record<string, string>,
  };
}

export async function evaluateTranscript(
  transcript: Array<{ role: string; text: string }>,
  evaluationModel?: string,
): Promise<EvaluationResult> {
  const model = evaluationModel ?? DEFAULT_EVALUATION_MODEL;
  const params = buildEvaluationRequestParams(transcript, model);
  const response = await anthropicClient.messages.create(params);
  return parseEvaluationResponse(response, model);
}
