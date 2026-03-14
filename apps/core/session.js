/**
 * A tutoring session.  Manages the two parallel data structures that every
 * interface needs:
 *
 * - messages[]   — full API content blocks including thinking blocks, sent
 *                  back to Claude for context continuity.
 * - transcript[] — plain text {role, text} entries for export.
 *
 * This class is the single source of truth for the dual-array invariant.
 * Both arrays are always updated together.
 */
export class Session {
  constructor() {
    this.messages = [];
    this.transcript = [];
  }

  /**
   * Record a user message.
   * @param {string|Array} content — plain string (CLI) or array of content blocks (web).
   * @param {string} transcriptText — plain text for the transcript.
   */
  addUserMessage(content, transcriptText) {
    this.messages.push({ role: "user", content });
    this.transcript.push({ role: "Student", text: transcriptText });
  }

  /**
   * Record an assistant response.
   * @param {Array} contentBlocks — full response.content from the API.
   * @returns {string} the text-only portion of the response.
   */
  addAssistantResponse(contentBlocks) {
    const text = contentBlocks
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    this.messages.push({ role: "assistant", content: contentBlocks });
    this.transcript.push({ role: "Tutor", text });

    return text;
  }

  getTranscript() {
    return this.transcript;
  }

  reset() {
    this.messages = [];
    this.transcript = [];
  }
}
