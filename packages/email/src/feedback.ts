import { Resend } from "resend";

export interface FeedbackEmailConfig {
  apiKey: string | undefined;
  to: string | undefined;
  from: string;
}

export interface FeedbackEntry {
  sessionId: string;
  rating: number | null;
  comment: string | null;
  submittedAt: Date;
}

function stars(rating: number | null): string {
  if (rating === null) return "Not rated";
  return "★".repeat(rating) + "☆".repeat(5 - rating) + ` (${rating}/5)`;
}

function buildHtml(entry: FeedbackEntry): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Tutor Session Feedback</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
  <h1 style="font-size:1.4rem;border-bottom:2px solid #4f46e5;padding-bottom:8px;">Session Feedback</h1>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
    <tr><td style="padding:6px 0;color:#555;width:160px;">Session ID</td><td style="font-size:0.85em;">${entry.sessionId}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Submitted</td><td>${entry.submittedAt.toLocaleString()}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Rating</td><td>${stars(entry.rating)}</td></tr>
  </table>
  ${
    entry.comment
      ? `<h2 style="font-size:1.1rem;">Comment</h2><p style="background:#f9f9f9;padding:12px 16px;border-radius:6px;white-space:pre-wrap;">${entry.comment}</p>`
      : ""
  }
</body>
</html>`;
}

export interface BatchFeedbackItem {
  msgText: string;  // human-readable snippet of the assistant message being rated
  category: string;
  sentiment: string | null; // "up" | "down" | null (not selected)
}

function buildBatchHtml(sessionId: string, items: BatchFeedbackItem[], submittedAt: Date): string {
  const rows = items
    .map(
      item => `
    <tr>
      <td style="padding:5px 10px;border:1px solid #ddd;font-size:0.85em;">${item.msgText}</td>
      <td style="padding:5px 10px;border:1px solid #ddd;">${item.category}</td>
      <td style="padding:5px 10px;border:1px solid #ddd;">${item.sentiment === "up" ? "👍" : item.sentiment === "down" ? "👎" : "—"}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Tutor Session Feedback</title></head>
<body style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222;">
  <h1 style="font-size:1.4rem;border-bottom:2px solid #4f46e5;padding-bottom:8px;">Session Feedback</h1>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr><td style="padding:6px 0;color:#555;width:160px;">Session ID</td><td style="font-size:0.85em;">${sessionId}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Submitted</td><td>${submittedAt.toLocaleString()}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Ratings</td><td>${items.length}</td></tr>
  </table>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f4f4f4;">
        <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Message</th>
        <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Category</th>
        <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Rating</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

/**
 * Send a single summary email for all feedback from a session.
 *
 * Fails silently — logs warnings but never throws.
 */
export async function sendFeedbackBatch(
  config: FeedbackEmailConfig,
  sessionId: string,
  items: BatchFeedbackItem[]
): Promise<void> {
  if (!config.apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping feedback email.");
    return;
  }
  if (!config.to) {
    console.warn("[email] PARENT_EMAIL not set — skipping feedback email.");
    return;
  }

  const resend = new Resend(config.apiKey);
  const submittedAt = new Date();

  try {
    const result = await resend.emails.send({
      from: config.from,
      to: config.to,
      subject: `Tutor session feedback — ${items.length} rating${items.length !== 1 ? "s" : ""}`,
      html: buildBatchHtml(sessionId, items, submittedAt),
    });

    if (result.error) {
      console.error("[email] Resend API error:", result.error);
    } else {
      console.log(`[email] Batch feedback email sent (id: ${result.data?.id}).`);
    }
  } catch (err) {
    console.error("[email] Unexpected error sending batch feedback:", err);
  }
}

/**
 * Send a feedback summary email via Resend.
 *
 * Fails silently — logs warnings but never throws.
 */
export async function sendFeedback(
  config: FeedbackEmailConfig,
  entry: FeedbackEntry
): Promise<void> {
  if (!config.apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping feedback email.");
    return;
  }
  if (!config.to) {
    console.warn("[email] PARENT_EMAIL not set — skipping feedback email.");
    return;
  }

  const resend = new Resend(config.apiKey);

  try {
    const result = await resend.emails.send({
      from: config.from,
      to: config.to,
      subject: `Tutor session feedback — ${stars(entry.rating)}`,
      html: buildHtml(entry),
    });

    if (result.error) {
      console.error("[email] Resend API error:", result.error);
    } else {
      console.log(`[email] Feedback email sent (id: ${result.data?.id}).`);
    }
  } catch (err) {
    console.error("[email] Unexpected error sending feedback:", err);
  }
}
