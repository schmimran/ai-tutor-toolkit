# @ai-tutor/email

Resend email templates for session transcripts.  Used by `apps/api`.

## Overview

This package sends one type of email:

**Transcript email** — sent to the parent when a tutoring session ends, containing the full conversation, session metadata, any uploaded files as attachments, automated evaluation results (if available), and student feedback (if collected).

The function fails silently: if the API key or recipient is missing, it logs a warning and returns without throwing.

Feedback is no longer sent as a separate email — it is included in the transcript email as an optional section at the bottom.

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
    to: process.env.ADMIN_EMAIL,
    from: process.env.EMAIL_FROM ?? "tutor@tutor.schmim.com",
  },
  {
    transcript: session.transcript,
    files: session.files,
    clientInfo: session.clientInfo,
    startedAt: session.startedAt,
    lastActivityAt: session.lastActivityAt,
    durationMs: Date.now() - session.startedAt.getTime(),
    evaluation: session.evaluation ?? null,
    studentFeedback: session.studentFeedback ?? null,
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
| `sessionId` | `string` | _(optional)_ Session UUID |
| `tokenUsage` | `{ inputTokens: number; outputTokens: number }` | _(optional)_ Cumulative token usage |
| `evaluation` | `EvaluationPayload \| null` | _(optional)_ Automated evaluation results. Omit or pass `null` if evaluation hasn't run. |
| `studentFeedback` | `StudentFeedbackPayload \| null` | _(optional)_ Student feedback. Omit or pass `null` if not collected. |

**`evaluation` shape:**

Sends a single feedback summary email.

```typescript
{
  dimensions: Array<{
    label: string;    // human-readable label, e.g. "Opening sequence"
    score: string;    // 'pass' | 'partial' | 'fail' | 'na' | 'resolved' | 'unresolved' | 'abandoned'
    rationale: string; // one-sentence explanation
  }>;
  hasFailures: boolean; // true if any dimension scored 'fail'
}
```

Renders as a color-coded table (green = pass/resolved, amber = partial, red = fail/unresolved, gray = na/abandoned). A warning banner is shown if `hasFailures` is true.

**`studentFeedback` shape:**

```typescript
{
  source: string;            // 'student' | 'timeout'
  outcome: string | null;    // 'solved' | 'partial' | 'stuck'
  experience: string | null; // 'positive' | 'neutral' | 'negative'
  comment: string | null;
  skipped: boolean;
}
```

Three rendering cases:
- `source === 'timeout'` → "not collected (session ended by inactivity timeout)"
- `skipped === true` → "skipped"
- Otherwise → outcome, experience, and comment rendered as a key-value table

---

## Types

```typescript
import type { TranscriptEmailConfig, TranscriptEmailPayload } from "@ai-tutor/email";
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
| `ADMIN_EMAIL` | no | Recipient for admin transcripts. Skipped if missing. Renamed from `PARENT_EMAIL`. |
| `EMAIL_FROM` | no | Sender address. Must match a verified Resend domain. |

## Setup

See the Resend setup section in the root README for domain verification and API key generation.

This package is not run directly — it is imported by `apps/api`.
