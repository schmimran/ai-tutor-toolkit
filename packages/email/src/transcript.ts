import { Resend } from "resend";
import type { TranscriptEntry, FileEntry, ClientInfo } from "./shared-types.js";

export interface TranscriptEmailConfig {
  /** Resend API key.  If absent, sendTranscript() is a no-op. */
  apiKey: string | undefined;
  /** Recipient address, e.g. a parent's email. */
  to: string | undefined;
  /** Sender address — must be a verified Resend domain. */
  from: string;
}

export interface TranscriptEmailPayload {
  transcript: TranscriptEntry[];
  files: FileEntry[];
  clientInfo: ClientInfo;
  startedAt: Date;
  lastActivityAt: Date;
  durationMs: number;
}

/** Maximum total attachment size Resend accepts (40 MB in bytes). */
const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} sec`;
  return `${minutes} min ${seconds} sec`;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function buildHtml(payload: TranscriptEmailPayload): string {
  const { transcript, files, clientInfo, startedAt, durationMs } = payload;

  const exchangeCount = Math.floor(transcript.length / 2);

  const filesHtml =
    files.length > 0
      ? `<ul>${files
          .map(
            (f) =>
              `<li>${f.filename} (${f.mimetype}, ${(f.buffer.length / 1024).toFixed(1)} KB)</li>`
          )
          .join("")}</ul>`
      : "<p>None</p>";

  const transcriptHtml = transcript
    .map((entry) => {
      const isStudent = entry.role === "Student";
      const bg = isStudent ? "#f0f4ff" : "#f9f9f9";
      const label = isStudent
        ? "<strong>Student</strong>"
        : "<strong>Tutor</strong>";
      return `<div style="background:${bg};padding:12px 16px;margin:8px 0;border-radius:6px;white-space:pre-wrap;">${label}<br>${entry.text}</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Tutor Session Transcript</title></head>
<body style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#222;">
  <h1 style="font-size:1.4rem;border-bottom:2px solid #4f46e5;padding-bottom:8px;">Tutor Session Summary</h1>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:6px 0;color:#555;width:160px;">Started</td><td>${formatDate(startedAt)}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Duration</td><td>${formatDuration(durationMs)}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Exchanges</td><td>${exchangeCount}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">IP</td><td>${clientInfo.ip ?? "unknown"}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Location</td><td>${clientInfo.geo ? JSON.stringify(clientInfo.geo) : "unknown"}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">User agent</td><td style="font-size:0.85em;">${clientInfo.userAgent ?? "unknown"}</td></tr>
  </table>
  <h2 style="font-size:1.1rem;">Uploaded files</h2>
  ${filesHtml}
  <h2 style="font-size:1.1rem;">Transcript</h2>
  ${transcriptHtml || "<p>No messages.</p>"}
</body>
</html>`;
}

/**
 * Send the session transcript email via Resend.
 *
 * Fails silently — logs warnings but never throws.  A failed email must not
 * crash the API server or disrupt the student's session.
 *
 * File attachments are included unless the combined size exceeds Resend's
 * 40 MB limit, in which case attachments are skipped and the omission is
 * noted in the log.
 */
export async function sendTranscript(
  config: TranscriptEmailConfig,
  payload: TranscriptEmailPayload
): Promise<void> {
  if (!config.apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping transcript email.");
    return;
  }
  if (!config.to) {
    console.warn("[email] PARENT_EMAIL not set — skipping transcript email.");
    return;
  }
  if (payload.transcript.length === 0) {
    console.warn("[email] Transcript is empty — skipping transcript email.");
    return;
  }

  const resend = new Resend(config.apiKey);

  // Build attachments, skipping if total exceeds the Resend limit.
  const totalBytes = payload.files.reduce((sum, f) => sum + f.buffer.length, 0);
  const attachments =
    totalBytes <= MAX_ATTACHMENT_BYTES
      ? payload.files.map((f) => ({
          filename: f.filename,
          content: f.buffer,
        }))
      : [];

  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    console.warn(
      `[email] Attachments total ${(totalBytes / 1024 / 1024).toFixed(1)} MB — exceeds 40 MB limit.  Sending without attachments.`
    );
  }

  try {
    const result = await resend.emails.send({
      from: config.from,
      to: config.to,
      subject: `Tutor session — ${formatDate(payload.startedAt)}`,
      html: buildHtml(payload),
      attachments,
    });

    if (result.error) {
      console.error("[email] Resend API error:", result.error);
    } else {
      console.log(`[email] Transcript sent (id: ${result.data?.id}).`);
    }
  } catch (err) {
    console.error("[email] Unexpected error sending transcript:", err);
  }
}
