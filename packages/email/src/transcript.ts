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
  sessionId?: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };

  /** Automated evaluation results.  Null if evaluation hasn't run yet. */
  evaluation?: {
    dimensions: Array<{
      label: string;
      score: string; // 'pass' | 'partial' | 'fail' | 'na' | 'resolved' | 'unresolved' | 'abandoned'
      rationale: string;
    }>;
    hasFailures: boolean;
  } | null;

  /** Student feedback.  Null if not collected. */
  studentFeedback?: {
    source: string;            // 'student' | 'timeout'
    outcome: string | null;    // 'solved' | 'partial' | 'stuck'
    experience: string | null; // 'positive' | 'neutral' | 'negative'
    comment: string | null;
    skipped: boolean;
  } | null;
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

function formatTokens(usage: { inputTokens: number; outputTokens: number }): string {
  const total = usage.inputTokens + usage.outputTokens;
  return `${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out (${total.toLocaleString()} total)`;
}

function formatGeo(geo: Record<string, unknown> | null | undefined): string {
  if (!geo) return "unknown";
  const parts = [geo.city, geo.region, geo.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "unknown";
}

function scoreBadge(score: string): string {
  const colorMap: Record<string, string> = {
    pass: "#16a34a",
    resolved: "#16a34a",
    partial: "#ca8a04",
    fail: "#dc2626",
    unresolved: "#dc2626",
    na: "#9ca3af",
    abandoned: "#9ca3af",
  };
  const color = colorMap[score] ?? "#9ca3af";
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:#fff;font-size:0.8em;font-weight:bold;">${score}</span>`;
}

function buildEvaluationHtml(
  evaluation: TranscriptEmailPayload["evaluation"]
): string {
  if (!evaluation) return "";

  const warningHtml = evaluation.hasFailures
    ? `<p style="color:#dc2626;font-weight:bold;">&#9888; This session had evaluation failures — see flagged dimensions below.</p>`
    : "";

  const rows = evaluation.dimensions
    .map(
      (d) => `
    <tr>
      <td style="padding:8px 10px;border:1px solid #ddd;">${d.label}</td>
      <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;">${scoreBadge(d.score)}</td>
      <td style="padding:8px 10px;border:1px solid #ddd;font-size:0.9em;color:#444;">${d.rationale}</td>
    </tr>`
    )
    .join("");

  return `
  <h2 style="font-size:1.1rem;margin-top:32px;">Automated Evaluation</h2>
  ${warningHtml}
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f4f4f4;">
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Dimension</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:center;width:100px;">Score</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Rationale</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildStudentFeedbackHtml(
  studentFeedback: TranscriptEmailPayload["studentFeedback"]
): string {
  if (!studentFeedback) return "";

  const outcomeLabels: Record<string, string> = {
    solved: "Yes, figured it out",
    partial: "Mostly",
    stuck: "No, still stuck",
  };
  const experienceLabels: Record<string, string> = {
    positive: "Really helpful",
    neutral: "Fine",
    negative: "Not great",
  };

  let body: string;
  if (studentFeedback.source === "timeout") {
    body = "<p>Student feedback: not collected (session ended by inactivity timeout).</p>";
  } else if (studentFeedback.skipped) {
    body = "<p>Student feedback: skipped.</p>";
  } else {
    const outcomeLabel = studentFeedback.outcome
      ? (outcomeLabels[studentFeedback.outcome] ?? studentFeedback.outcome)
      : "—";
    const experienceLabel = studentFeedback.experience
      ? (experienceLabels[studentFeedback.experience] ?? studentFeedback.experience)
      : "—";
    const commentRow = studentFeedback.comment
      ? `<tr><td style="padding:6px 0;color:#555;width:120px;">Comment</td><td>${studentFeedback.comment}</td></tr>`
      : "";

    body = `
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#555;width:120px;">Outcome</td><td>${outcomeLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#555;">Experience</td><td>${experienceLabel}</td></tr>
      ${commentRow}
    </table>`;
  }

  return `
  <h2 style="font-size:1.1rem;margin-top:32px;">Student Feedback</h2>
  ${body}`;
}

function buildHtml(payload: TranscriptEmailPayload): string {
  const {
    transcript,
    files,
    clientInfo,
    startedAt,
    durationMs,
    sessionId,
    tokenUsage,
    evaluation,
    studentFeedback,
  } = payload;

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
    <tr><td style="padding:6px 0;color:#555;width:160px;">Session ID</td><td style="font-size:0.85em;">${sessionId ?? "unknown"}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Started</td><td>${formatDate(startedAt)}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Duration</td><td>${formatDuration(durationMs)}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Exchanges</td><td>${exchangeCount}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Tokens</td><td>${tokenUsage ? formatTokens(tokenUsage) : "N/A"}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">IP</td><td>${clientInfo.ip ?? "unknown"}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Location</td><td>${formatGeo(clientInfo.geo)}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">User agent</td><td style="font-size:0.85em;">${clientInfo.userAgent ?? "unknown"}</td></tr>
  </table>
  <h2 style="font-size:1.1rem;">Uploaded files</h2>
  ${filesHtml}
  <h2 style="font-size:1.1rem;">Transcript</h2>
  ${transcriptHtml || "<p>No messages.</p>"}
  ${buildEvaluationHtml(evaluation)}
  ${buildStudentFeedbackHtml(studentFeedback)}
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
