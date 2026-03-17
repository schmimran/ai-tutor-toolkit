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

function sentimentBadge(sentiment: string | null): string {
  if (sentiment === "up") {
    return '<span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#16a34a;color:#fff;text-align:center;line-height:22px;font-size:13px;font-weight:bold;">+</span>';
  }
  if (sentiment === "down") {
    return '<span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#dc2626;color:#fff;text-align:center;line-height:22px;font-size:13px;font-weight:bold;">&minus;</span>';
  }
  return '<span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#d4d4d4;color:#fff;text-align:center;line-height:22px;font-size:13px;">&#x2013;</span>';
}

function buildBatchHtml(sessionId: string, items: BatchFeedbackItem[], submittedAt: Date): string {
  // Group items by message so categories become columns
  const grouped = new Map<string, { accuracy: string | null; usefulness: string | null; tone: string | null }>();
  for (const item of items) {
    if (!grouped.has(item.msgText)) {
      grouped.set(item.msgText, { accuracy: null, usefulness: null, tone: null });
    }
    const entry = grouped.get(item.msgText)!;
    if (item.category === "accuracy") entry.accuracy = item.sentiment;
    if (item.category === "usefulness") entry.usefulness = item.sentiment;
    if (item.category === "tone") entry.tone = item.sentiment;
  }

  const rows = [...grouped.entries()]
    .map(
      ([msgText, cats]) => `
    <tr>
      <td style="padding:8px 10px;border:1px solid #ddd;font-size:0.85em;">${msgText}</td>
      <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;">${sentimentBadge(cats.accuracy)}</td>
      <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;">${sentimentBadge(cats.usefulness)}</td>
      <td style="padding:8px 10px;border:1px solid #ddd;text-align:center;">${sentimentBadge(cats.tone)}</td>
    </tr>`
    )
    .join("");

  const messageCount = grouped.size;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Tutor Session Feedback</title></head>
<body style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:24px;color:#222;">
  <h1 style="font-size:1.4rem;border-bottom:2px solid #4f46e5;padding-bottom:8px;">Session Feedback</h1>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr><td style="padding:6px 0;color:#555;width:160px;">Session ID</td><td style="font-size:0.85em;">${sessionId}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Submitted</td><td>${submittedAt.toLocaleString()}</td></tr>
    <tr><td style="padding:6px 0;color:#555;">Messages rated</td><td>${messageCount}</td></tr>
  </table>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f4f4f4;">
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:left;">Message</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:center;width:90px;">Accuracy</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:center;width:90px;">Usefulness</th>
        <th style="padding:8px 10px;border:1px solid #ddd;text-align:center;width:90px;">Tone</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:0.8em;color:#888;margin-top:16px;">
    <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#16a34a;vertical-align:middle;"></span> Positive &nbsp;
    <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#dc2626;vertical-align:middle;"></span> Negative &nbsp;
    <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#d4d4d4;vertical-align:middle;"></span> Not rated
  </p>
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
