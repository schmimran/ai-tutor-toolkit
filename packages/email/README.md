# @ai-tutor/email

Resend email templates for session transcripts and feedback notifications.  Used by `apps/api`.

## Overview

This package sends two types of emails:

1. **Transcript email** — sent to the parent when a tutoring session ends, containing the full conversation, session metadata, and token usage.
2. **Feedback email** — sent to the parent when a student submits feedback (single rating or batch of per-message ratings).

Both functions fail silently: if the API key or recipient is missing, they log a warning and return without throwing.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `resend` | ^3.2.0 | Resend email API client |

## API reference

### `sendTranscript(config, payload): Promise<void>`

```typescript
import { sendTranscript } from "@ai-tutor/email";

await sendTranscript(
  {
    apiKey: process.env.RESEND_API_KEY,
    to: process.env.PARENT_EMAIL,
    from: process.env.EMAIL_FROM ?? "tutor@tutor.schmim.com",
  },
  {
    transcript: session.transcript,
    files: session.files,
    clientInfo: session.clientInfo,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
    durationMs: Date.now() - session.startedAt.getTime(),
    sessionId: sessionId,
    tokenUsage: session.tokenUsage,
  }
);
```

**Config:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `apiKey` | `string \| undefined` | no | Resend API key. If absent, email is skipped. |
| `to` | `string \| undefined` | no | Recipient address. If absent, email is skipped. |
| `from` | `string` | yes | Sender address (must match verified Resend domain). |

**Payload:**

| Field | Type | Description |
|-------|------|-------------|
| `transcript` | `TranscriptEntry[]` | `{ role: "Student" \| "Tutor", text: string }[]` |
| `files` | `FileEntry[]` | Uploaded files (sent as attachments, max ~40 MB total) |
| `clientInfo` | `ClientInfo` | IP, geolocation, user agent |
| `startedAt` | `Date` | Session start time |
| `lastActivityAt` | `Date` | Session last activity time |
| `durationMs` | `number` | Session duration in milliseconds |
| `sessionId` | `string?` | Session UUID (included in email header) |
| `tokenUsage` | `{ inputTokens: number; outputTokens: number }?` | Cumulative token usage |

---

### `sendFeedback(config, entry): Promise<void>`

Sends a single feedback summary email.

```typescript
import { sendFeedback } from "@ai-tutor/email";

await sendFeedback(
  {
    apiKey: process.env.RESEND_API_KEY,
    to: process.env.PARENT_EMAIL,
    from: process.env.EMAIL_FROM ?? "tutor@tutor.schmim.com",
  },
  {
    sessionId,
    rating: 4,
    comment: "Very helpful!",
    submittedAt: new Date(),
  }
);
```

**Entry:**

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | Session UUID |
| `rating` | `number \| null` | 1–5 star rating |
| `comment` | `string \| null` | Written comment |
| `submittedAt` | `Date` | Submission timestamp |

---

### `sendFeedbackBatch(config, sessionId, items): Promise<void>`

Sends a single summary email for all per-message feedback from a session.  Displays a table with one row per assistant message and columns for Accuracy, Usefulness, and Tone.

```typescript
import { sendFeedbackBatch } from "@ai-tutor/email";

await sendFeedbackBatch(
  {
    apiKey: process.env.RESEND_API_KEY,
    to: process.env.PARENT_EMAIL,
    from: process.env.EMAIL_FROM ?? "tutor@tutor.schmim.com",
  },
  sessionId,
  [
    { msgText: "Let's look at that equation.", category: "accuracy", sentiment: "up" },
    { msgText: "Let's look at that equation.", category: "usefulness", sentiment: "up" },
    { msgText: "Let's look at that equation.", category: "tone", sentiment: null },
  ]
);
```

**Items (`BatchFeedbackItem[]`):**

| Field | Type | Description |
|-------|------|-------------|
| `msgText` | `string` | Short snippet of the assistant message being rated |
| `category` | `string` | `"accuracy"` \| `"usefulness"` \| `"tone"` |
| `sentiment` | `string \| null` | `"up"` \| `"down"` \| `null` (not selected) |

---

## Types

```typescript
import type { TranscriptEmailConfig, TranscriptEmailPayload } from "@ai-tutor/email";
import type { FeedbackEmailConfig, FeedbackEntry, BatchFeedbackItem } from "@ai-tutor/email";
```

Shared types (used internally and exported for consumers):

```typescript
// From shared-types.ts
type TranscriptEntry = { role: "Student" | "Tutor"; text: string };
type FileEntry = { filename: string; mimetype: string; buffer: Buffer };
type ClientInfo = { ip?: string; geo?: Record<string, unknown>; userAgent?: string };
```

---

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | no | Resend API key. Email is silently skipped if missing. |
| `PARENT_EMAIL` | no | Recipient for transcripts and feedback. Skipped if missing. |
| `EMAIL_FROM` | no | Sender address. Must match a verified Resend domain. |

## Setup

See the Resend setup section in the root README for domain verification and API key generation.

This package is not run directly — it is imported by `apps/api`.
