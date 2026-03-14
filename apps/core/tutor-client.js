import Anthropic from "@anthropic-ai/sdk";

/**
 * Create a tutor client that wraps the Anthropic SDK.
 * Handles request building, extended thinking configuration,
 * and response extraction.
 *
 * @param {object} config — from loadConfig()
 * @param {string} systemPrompt — loaded system prompt text
 * @returns {{ sendMessage(session, userContent, transcriptText): Promise<string> }}
 */
export function createTutorClient(config, systemPrompt) {
  const client = new Anthropic();

  async function sendMessage(session, userContent, transcriptText) {
    session.addUserMessage(userContent, transcriptText);

    const requestParams = {
      model: config.model,
      max_tokens: 16000,
      system: systemPrompt,
      messages: session.messages,
    };

    if (config.extendedThinking) {
      requestParams.thinking = {
        type: "enabled",
        budget_tokens: 10000,
      };
    }

    const response = await client.messages.create(requestParams);
    const assistantText = session.addAssistantResponse(response.content);

    return assistantText;
  }

  return { sendMessage };
}
