import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.js";
import type { Session, TokenUsage } from "./session.js";

/** Shared Anthropic client — one connection pool for all API calls. */
export const anthropicClient = new Anthropic();

/** Wraps a prompt string into the system array shape required for prompt caching. */
export function cachedSystem(text: string): Anthropic.Messages.TextBlockParam[] {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

export type UserContent = string | Anthropic.ContentBlockParam[];

export interface StreamOptions {
  /** Override the model for this call. If omitted, uses config.model. */
  modelOverride?: string;
  /** Override the system prompt for this call. If omitted, uses the client's system prompt. */
  systemPromptOverride?: string;
  /**
   * Override the extended-thinking flag for this call. When omitted, falls back
   * to `config.extendedThinking`. Haiku models always block extended thinking
   * regardless of this value.
   */
  extendedThinkingOverride?: boolean;
}

/** Haiku models do not support extended thinking. */
function isHaiku(modelId: string): boolean {
  return modelId.includes("haiku");
}

/**
 * Build the base request parameters common to both streaming and non-streaming
 * API calls.
 */
function buildParams(
  config: Config,
  systemPrompt: string,
  session: Session,
  opts?: StreamOptions
): Omit<Anthropic.MessageCreateParams, "stream"> {
  const model = opts?.modelOverride ?? config.model;
  const prompt = opts?.systemPromptOverride ?? systemPrompt;
  const useExtendedThinking = opts?.extendedThinkingOverride ?? config.extendedThinking;
  const extendedThinking = useExtendedThinking && !isHaiku(model);

  return {
    model,
    max_tokens: 16000,
    system: cachedSystem(prompt),
    messages: session.messages as Anthropic.MessageParam[],
    ...(extendedThinking && {
      thinking: { type: "adaptive" as const },
    }),
  } satisfies Omit<Anthropic.MessageCreateParams, "stream">;
}

/**
 * Create a tutor client wrapping the Anthropic SDK.
 *
 * Exposes two methods:
 * - sendMessage()   — waits for the full response (used by CLI)
 * - streamMessage() — yields text deltas as an async iterator (used by API
 *                     server for SSE).  Thinking tokens are buffered and not
 *                     yielded.  The Session is updated after the stream ends.
 */
export function createTutorClient(config: Config, systemPrompt: string) {
  /**
   * Send a message and wait for the complete response.
   *
   * @returns The assistant's text response.
   */
  async function sendMessage(
    session: Session,
    userContent: UserContent,
    transcriptText: string,
    opts?: StreamOptions
  ): Promise<string> {
    session.addUserMessage(userContent, transcriptText);
    session.touchActivity();

    const response = await anthropicClient.messages.create({
      ...buildParams(config, systemPrompt, session, opts),
      stream: false,
    } as Anthropic.MessageCreateParamsNonStreaming);

    session.addTokenUsage(response.usage.input_tokens, response.usage.output_tokens);
    return session.addAssistantResponse(response.content);
  }

  /**
   * Stream a message, yielding text deltas as they arrive.
   *
   * Thinking tokens are buffered and suppressed — they are not yielded to the
   * caller.  After the generator is exhausted, the full response (including
   * thinking blocks) is committed to the Session via addAssistantResponse().
   *
   * Usage:
   *   for await (const delta of client.streamMessage(session, content, text)) {
   *     res.write(`data: ${JSON.stringify({ type: "text_delta", text: delta })}\n\n`);
   *   }
   *   // Session is now updated — safe to persist to DB.
   */
  async function* streamMessage(
    session: Session,
    userContent: UserContent,
    transcriptText: string,
    opts?: StreamOptions
  ): AsyncGenerator<string, TokenUsage> {
    session.addUserMessage(userContent, transcriptText);
    session.touchActivity();

    const stream = anthropicClient.messages.stream(
      buildParams(config, systemPrompt, session, opts) as Anthropic.MessageCreateParamsStreaming
    );

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }

    // Stream is exhausted — finalMessage() is already resolved.
    const finalMessage = await stream.finalMessage();
    const perCallTokens: TokenUsage = {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };
    session.addTokenUsage(perCallTokens.inputTokens, perCallTokens.outputTokens);
    session.addAssistantResponse(finalMessage.content);
    return perCallTokens;
  }

  return { sendMessage, streamMessage };
}

export type TutorClient = ReturnType<typeof createTutorClient>;
