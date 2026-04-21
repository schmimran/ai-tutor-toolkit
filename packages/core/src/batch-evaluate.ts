import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "./tutor-client.js";
import {
  parseEvaluationResponse,
  type EvaluationResult,
} from "./evaluate-transcript.js";

/**
 * Thin wrappers around `anthropicClient.messages.batches.*` plus a high-level
 * iterator that yields already-parsed `EvaluationResult`s. Keeping the SDK
 * types behind this module preserves the package-boundary rule: apps/api
 * does not import `@anthropic-ai/sdk` directly.
 */

export interface EvaluationBatchRequest {
  /** Our session ID — echoed back with each result so we can match it to a session row. */
  customId: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
}

export interface EvaluationBatchSummary {
  anthropicBatchId: string;
  processingStatus: string;
  requestCounts: Record<string, number>;
}

export interface EvaluationBatchResultEntry {
  customId: string;
  /** Result classification: 'succeeded' yields a parsed evaluation; others carry a reason. */
  status: "succeeded" | "errored" | "canceled" | "expired";
  /** Parsed evaluation, present iff `status === "succeeded"` and parsing succeeded. */
  evaluation: EvaluationResult | null;
  /** Human-readable reason for a non-successful outcome (or a parse failure). */
  reason?: string;
}

function toSummary(batch: Anthropic.Messages.MessageBatch): EvaluationBatchSummary {
  return {
    anthropicBatchId: batch.id,
    processingStatus: batch.processing_status,
    requestCounts: batch.request_counts as unknown as Record<string, number>,
  };
}

/** Submit a batch of evaluation requests. Returns a summary of the created batch. */
export async function submitEvaluationBatch(
  requests: EvaluationBatchRequest[],
): Promise<EvaluationBatchSummary> {
  const submitted = await anthropicClient.messages.batches.create({
    requests: requests.map((r) => ({ custom_id: r.customId, params: r.params })),
  });
  return toSummary(submitted);
}

/** Retrieve the current state of a batch (status + request_counts). */
export async function retrieveBatch(anthropicBatchId: string): Promise<EvaluationBatchSummary> {
  const batch = await anthropicClient.messages.batches.retrieve(anthropicBatchId);
  return toSummary(batch);
}

/**
 * Iterate over batch results, parsing each succeeded entry into an
 * `EvaluationResult`. Parse failures and non-successful result types are
 * surfaced as entries with `evaluation: null` and a `reason` string.
 */
export async function* iterateBatchEvaluationResults(
  anthropicBatchId: string,
  evaluationModel: string,
): AsyncGenerator<EvaluationBatchResultEntry> {
  const results = await anthropicClient.messages.batches.results(anthropicBatchId);

  for await (const entry of results) {
    const customId = entry.custom_id;

    if (entry.result.type !== "succeeded") {
      yield {
        customId,
        status: entry.result.type,
        evaluation: null,
        reason: `batch result type: ${entry.result.type}`,
      };
      continue;
    }

    try {
      const evaluation = parseEvaluationResponse(entry.result.message, evaluationModel);
      yield { customId, status: "succeeded", evaluation };
    } catch (err) {
      yield {
        customId,
        status: "succeeded",
        evaluation: null,
        reason: `parse error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
