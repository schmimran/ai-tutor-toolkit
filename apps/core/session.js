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
    this.files = [];
    this.startedAt = new Date();
    this.lastActivityAt = new Date();
    this.clientInfo = {};
    this.emailSent = false;
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

  /**
   * Store an uploaded file buffer.
   * Note: files are held in memory for the life of the session.  Acceptable
   * for single-student use; not acceptable at scale.
   * @param {string} filename
   * @param {string} mimetype
   * @param {Buffer} buffer
   */
  addFile(filename, mimetype, buffer) {
    this.files.push({ filename, mimetype, buffer });
  }

  /** Update lastActivityAt to the current time. */
  touchActivity() {
    this.lastActivityAt = new Date();
  }

  /**
   * Store client metadata: IP, approximate geo location, user agent.
   * @param {{ ip: string, geo: object|null, userAgent: string }} info
   */
  setClientInfo(info) {
    this.clientInfo = info;
  }

  /** Prevent double-send. */
  markEmailSent() {
    this.emailSent = true;
  }

  /**
   * Returns a plain object summarizing the session for email.
   * @returns {{ transcript: Array, filesMetadata: Array, clientInfo: object, startedAt: Date, lastActivityAt: Date, durationMs: number }}
   */
  getSessionSummary() {
    return {
      transcript: this.transcript,
      filesMetadata: this.files.map((f) => ({ filename: f.filename, mimetype: f.mimetype, size: f.buffer.length })),
      clientInfo: this.clientInfo,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      durationMs: this.lastActivityAt - this.startedAt,
    };
  }

  reset() {
    this.messages = [];
    this.transcript = [];
    this.files = [];
    this.startedAt = new Date();
    this.lastActivityAt = new Date();
    this.clientInfo = {};
    this.emailSent = false;
  }
}
