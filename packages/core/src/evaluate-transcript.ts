import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Load the evaluation prompt from the co-located .md file (single source of truth). */
const EVALUATION_PROMPT = readFileSync(
  resolve(__dirname, "../src/evaluation-prompt.md"),
  "utf-8"
);

export interface EvaluationResult {
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

export async function evaluateTranscript(
  transcript: Array<{ role: string; text: string }>,
  config?: { model?: string }
): Promise<EvaluationResult> {
  const model = config?.model ?? "claude-sonnet-4-6";

  const formattedTranscript = transcript
    .map((entry, i) => `${i + 1}. [${entry.role}] ${entry.text}`)
    .join("\n");

  const client = new Anthropic();

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: EVALUATION_PROMPT,
    messages: [{ role: "user", content: formattedTranscript }],
  });

  const rawText = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as Anthropic.TextBlock).text)
    .join("");

  // Strip markdown fences defensively
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`evaluateTranscript: failed to parse model response as JSON.\nRaw response:\n${rawText}`);
  }

  // Compute has_failures per v7 rules:
  // true if any non-negotiable (never_gave_answer, probe_reasoning, understood_where_student_was) is "fail"
  // OR if 3+ other dimensions scored "fail"
  const nonNegotiableFail = NON_NEGOTIABLE_KEYS.some(
    (key) => parsed[key as string] === "fail"
  );
  const otherFailCount = ALL_DIMENSION_KEYS
    .filter((key) => !NON_NEGOTIABLE_KEYS.includes(key))
    .filter((key) => parsed[key as string] === "fail")
    .length;
  const has_failures = nonNegotiableFail || otherFailCount >= 3;

  return {
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
