import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "./config.js";
import type { Session } from "./session.js";

type UserContent = string | Anthropic.ContentBlockParam[];

/**
 * Build the base request parameters common to both streaming and non-streaming
 * API calls.
 */
function buildParams(
  config: Config,
  systemPrompt: string,
  session: Session
): Omit<Anthropic.MessageCreateParams, "stream"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: Record<string, any> = {
    model: config.model,
    max_tokens: 16000,
    system: systemPrompt,
    messages: session.messages,
  };

  if (config.extendedThinking) {
    params["thinking"] = {
      type: "enabled",
      budget_tokens: 10000,
    };
  }

  return params as Omit<Anthropic.MessageCreateParams, "stream">;
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
  const client = new Anthropic();

  /**
   * Send a message and wait for the complete response.
   *
   * @returns The assistant's text response.
   */
  async function sendMessage(
    session: Session,
    userContent: UserContent,
    transcriptText: string
  ): Promise<string> {
    session.addUserMessage(userContent, transcriptText);
    session.touchActivity();

    const response = await client.messages.create({
      ...buildParams(config, systemPrompt, session),
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
    transcriptText: string
  ): AsyncGenerator<string> {
    session.addUserMessage(userContent, transcriptText);
    session.touchActivity();

    const stream = client.messages.stream(
      buildParams(config, systemPrompt, session) as Anthropic.MessageCreateParamsStreaming
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
    session.addTokenUsage(finalMessage.usage.input_tokens, finalMessage.usage.output_tokens);
    session.addAssistantResponse(finalMessage.content);
  }

  return { sendMessage, streamMessage };
}

export type TutorClient = ReturnType<typeof createTutorClient>;
