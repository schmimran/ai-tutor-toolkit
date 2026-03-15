/**
 * Types shared between transcript.ts and feedback.ts that mirror the Session
 * class in @ai-tutor/core without creating a circular dependency.
 */

export interface TranscriptEntry {
  role: "Student" | "Tutor";
  text: string;
}

export interface FileEntry {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

export interface ClientInfo {
  ip?: string;
  geo?: Record<string, unknown> | null;
  userAgent?: string;
}
