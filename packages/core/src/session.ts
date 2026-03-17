import type Anthropic from "@anthropic-ai/sdk";

/**
 * A plain-text transcript entry for export or email.
 */
export interface TranscriptEntry {
  role: "Student" | "Tutor";
  text: string;
}

/**
 * Metadata about an uploaded file.  The buffer is held for the session's
 * lifetime to support email attachments; see getSessionSummary().
 */
export interface FileEntry {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

export interface FileMetadata {
  filename: string;
  mimetype: string;
  size: number;
}

export interface ClientInfo {
  ip?: string;
  geo?: Record<string, unknown> | null;
  userAgent?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface SessionSummary {
  transcript: TranscriptEntry[];
  filesMetadata: FileMetadata[];
  clientInfo: ClientInfo;
  startedAt: Date;
  lastActivityAt: Date;
  durationMs: number;
  tokenUsage: TokenUsage;
}

/**
 * A tutoring session.  Manages two parallel data structures:
 *
 * - messages[]    — full API content blocks including thinking blocks, sent
 *                   back to Claude for context continuity.
 * - transcript[]  — plain-text {role, text} entries for export and email.
 *
 * Both arrays are always updated together through addUserMessage() and
 * addAssistantResponse().  Do not access or mutate them directly.
 */
export class Session {
  /**
   * Full message history in the Anthropic API format.  Includes thinking
   * blocks so the model retains its reasoning across turns.
   */
  readonly messages: Array<{
    role: "user" | "assistant";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: any;
  }> = [];

  readonly transcript: TranscriptEntry[] = [];
  readonly files: FileEntry[] = [];

  startedAt: Date = new Date();
  lastActivityAt: Date = new Date();
  clientInfo: ClientInfo = {};
  emailSent = false;
  tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  /**
   * Record a user message.
   *
   * @param content - Plain string (CLI) or array of content blocks (web, with
   *   image/PDF attachments).
   * @param transcriptText - Plain-text version for the transcript.
   */
  addUserMessage(
    content: string | Anthropic.ContentBlockParam[],
    transcriptText: string
  ): void {
    this.messages.push({ role: "user", content });
    this.transcript.push({ role: "Student", text: transcriptText });
  }

  /**
   * Record an assistant response.  Stores the full content block array
   * (including thinking blocks) in messages[] and extracts plain text for
   * transcript[].
   *
   * @param contentBlocks - response.content from the Anthropic API.
   * @returns The text-only portion of the response.
   */
  addAssistantResponse(contentBlocks: Anthropic.ContentBlock[]): string {
    const text = contentBlocks
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    this.messages.push({ role: "assistant", content: contentBlocks });
    this.transcript.push({ role: "Tutor", text });

    return text;
  }

  /**
   * Store an uploaded file buffer.  Files are held in memory for the
   * session's lifetime — acceptable for single-student use, not at scale.
   */
  addFile(filename: string, mimetype: string, buffer: Buffer): void {
    this.files.push({ filename, mimetype, buffer });
  }

  /** Update lastActivityAt to now. */
  touchActivity(): void {
    this.lastActivityAt = new Date();
  }

  /** Store client metadata: IP, approximate geo, user agent. */
  setClientInfo(info: ClientInfo): void {
    this.clientInfo = info;
  }

  /** Accumulate token usage from an API response. */
  addTokenUsage(input: number, output: number): void {
    this.tokenUsage.inputTokens += input;
    this.tokenUsage.outputTokens += output;
  }

  /** Prevent double-send of the session email. */
  markEmailSent(): void {
    this.emailSent = true;
  }

  /** Returns a plain object summarizing the session, suitable for email. */
  getSessionSummary(): SessionSummary {
    return {
      transcript: this.transcript,
      filesMetadata: this.files.map((f) => ({
        filename: f.filename,
        mimetype: f.mimetype,
        size: f.buffer.length,
      })),
      clientInfo: this.clientInfo,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      durationMs: this.lastActivityAt.getTime() - this.startedAt.getTime(),
      tokenUsage: { ...this.tokenUsage },
    };
  }

  /** Reset the session to a clean state (keeps clientInfo). */
  reset(): void {
    this.messages.length = 0;
    this.transcript.length = 0;
    this.files.length = 0;
    this.startedAt = new Date();
    this.lastActivityAt = new Date();
    this.emailSent = false;
    this.tokenUsage = { inputTokens: 0, outputTokens: 0 };
  }
}
