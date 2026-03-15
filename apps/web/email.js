import { Resend } from "resend";

const RESEND_ATTACHMENT_LIMIT = 40 * 1024 * 1024; // 40 MB

/**
 * Format milliseconds as a human-readable duration string (e.g. "12 min 34 sec").
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} sec`;
  return `${minutes} min ${seconds} sec`;
}

/**
 * Format a Date as a readable local string.
 */
function formatDate(date) {
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

/**
 * Build the HTML email body from a session summary.
 */
function buildEmailHtml(summary) {
  const { transcript, filesMetadata, clientInfo, startedAt, durationMs } = summary;
  const exchangeCount = Math.floor(transcript.length / 2);

  const geoStr = clientInfo.geo
    ? [clientInfo.geo.city, clientInfo.geo.region, clientInfo.geo.country].filter(Boolean).join(", ")
    : "Unknown";

  const transcriptHtml = transcript
    .map((entry) => {
      const isStudent = entry.role === "Student";
      const bg = isStudent ? "#eef0f5" : "#f7f5f0";
      const label = isStudent ? "Student" : "Tutor";
      const text = entry.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
      return `
        <div style="margin-bottom:16px;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#8a8580;margin-bottom:4px;">${label}</div>
          <div style="background:${bg};border-radius:8px;padding:12px 16px;font-size:14px;line-height:1.6;color:#2c2a27;">${text}</div>
        </div>`;
    })
    .join("");

  const filesHtml =
    filesMetadata.length > 0
      ? filesMetadata
          .map((f) => `<li style="margin-bottom:4px;">${f.filename} (${f.mimetype}, ${Math.round(f.size / 1024)} KB)</li>`)
          .join("")
      : "<li>None</li>";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'DM Sans',sans-serif;background:#faf8f5;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e8e4df;overflow:hidden;">

    <div style="background:#5a7a64;padding:24px 28px;">
      <h1 style="margin:0;font-size:20px;color:#ffffff;font-weight:600;">Tutoring Session Summary</h1>
      <p style="margin:6px 0 0;color:#c8d8cc;font-size:13px;">${formatDate(startedAt)}</p>
    </div>

    <div style="padding:24px 28px;">

      <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#8a8580;margin:0 0 12px;">Session Details</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#8a8580;width:140px;">Start time</td><td style="padding:6px 0;color:#2c2a27;">${formatDate(startedAt)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8580;">Duration</td><td style="padding:6px 0;color:#2c2a27;">${formatDuration(durationMs)}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8580;">Exchanges</td><td style="padding:6px 0;color:#2c2a27;">${exchangeCount}</td></tr>
      </table>

      <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#8a8580;margin:0 0 12px;">Client Info</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
        <tr><td style="padding:6px 0;color:#8a8580;width:140px;">IP address</td><td style="padding:6px 0;color:#2c2a27;">${clientInfo.ip || "Unknown"}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8580;">Location</td><td style="padding:6px 0;color:#2c2a27;">${geoStr}</td></tr>
        <tr><td style="padding:6px 0;color:#8a8580;">User agent</td><td style="padding:6px 0;color:#2c2a27;word-break:break-all;">${clientInfo.userAgent || "Unknown"}</td></tr>
      </table>

      <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#8a8580;margin:0 0 12px;">Uploaded Files</h2>
      <ul style="font-size:14px;color:#2c2a27;margin:0 0 24px;padding-left:20px;">
        ${filesHtml}
      </ul>

      <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#8a8580;margin:0 0 16px;">Transcript</h2>
      ${transcriptHtml}

    </div>
  </div>
</body>
</html>`;
}

/**
 * Send a session summary email via Resend.
 *
 * Wraps in try/catch — logs errors but does not throw.  A failed email
 * should never crash the server or block a session reset.
 *
 * @param {import("@ai-tutor/core").Session} session
 * @param {{ resendApiKey: string, parentEmail: string }} emailConfig
 */
export async function sendSessionEmail(session, emailConfig) {
  const { resendApiKey, parentEmail } = emailConfig;

  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not set — skipping session email.");
    return;
  }

  const summary = session.getSessionSummary();

  if (summary.transcript.length === 0) {
    console.log("Session has no messages — skipping email.");
    return;
  }

  const date = summary.startedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const duration = formatDuration(summary.durationMs);
  const subject = `Tutoring session — ${date} — ${duration}`;

  // Build attachments — skip if total size exceeds Resend's 40MB limit
  const totalSize = session.files.reduce((sum, f) => sum + f.buffer.length, 0);
  let attachments = [];
  if (totalSize <= RESEND_ATTACHMENT_LIMIT) {
    attachments = session.files.map((f) => ({
      filename: f.filename,
      content: f.buffer,
    }));
  } else {
    console.warn(`Session file attachments total ${Math.round(totalSize / 1024 / 1024)} MB — exceeds 40MB Resend limit.  Sending transcript only.`);
  }

  try {
    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: "tutor@tutor.schmim.com",
      to: parentEmail,
      subject,
      html: buildEmailHtml(summary),
      attachments,
    });
    console.log(`Session email sent to ${parentEmail} (${summary.transcript.length} transcript entries).`);
  } catch (err) {
    console.error("Failed to send session email:", err.message);
  }
}
