# @ai-tutor/core

Shared tutor logic — Anthropic SDK wrapper, configuration, session management, and prompt loading.  Used by `apps/api` and `apps/cli`.

## Overview

This package abstracts everything that touches the Anthropic API: loading config from environment variables, reading the system prompt file, managing message history (including thinking blocks), and streaming or blocking responses.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.39.0 | Anthropic API client |

## API reference

### `loadConfig()`

```typescript
import { loadConfig } from "@ai-tutor/core";
const config = loadConfig();
```

Reads environment variables and returns a typed config object.

**Returns:**

```typescript
{
  model: string;             // MODEL env var, default "claude-sonnet-4-6"
  extendedThinking: boolean; // EXTENDED_THINKING env var, default true
  systemPromptPath: string;  // SYSTEM_PROMPT_PATH env var, default "templates/tutor-prompt-v7.md"
  defaultPromptName: string; // basename of systemPromptPath without extension (e.g. "tutor-prompt-v7")
  port: number;              // PORT env var, default 3000
  autoEvaluate: boolean;     // AUTO_EVALUATE env var, default true
  evaluationModel: string;   // EVALUATION_MODEL env var, default "claude-haiku-4-5-20251001"
}
```

---

### `loadSystemPrompt(path: string): string`

```typescript
import { loadSystemPrompt } from "@ai-tutor/core";
const prompt = loadSystemPrompt(config.systemPromptPath);
```

Loads a prompt file from the repo root (synchronous).  Strips everything above the `## Begin prompt` marker (documentation/comments above that line are ignored).  Appends global system instructions from `templates/system-instructions.md` if the file exists.  Resolves the repo root by walking up the directory tree looking for a `package.json` with `"workspaces"`.  Exits the process if the file cannot be read.

---

### `createTutorClient(config, systemPrompt)`

```typescript
import { createTutorClient } from "@ai-tutor/core";
const tutorClient = createTutorClient(config, systemPrompt);
```

Returns an object with two methods:

#### `sendMessage(session, userContent, transcriptText): Promise<string>`

Blocking version.  Sends a message and waits for the full response.  Adds both the user message and assistant response to the session.  Returns the response text.

Used by the CLI (where streaming is unnecessary).

#### `streamMessage(session, userContent, transcriptText): AsyncGenerator<string, TokenUsage>`

Streaming version.  Yields text deltas one by one.  Thinking tokens are buffered internally and not yielded.  Adds the full user message and assistant response to the session after streaming completes.  Returns per-call `TokenUsage` as the generator return value.

Used by the API server for SSE responses.

**Parameters:**

| Name | Type | Notes |
|------|------|-------|
| `session` | `Session` | Current session (message history appended in place) |
| `userContent` | `string \| ContentBlockParam[]` | Student's message; can include image/PDF content blocks |
| `transcriptText` | `string` | Plain-text version for transcript |

---

### `evaluateTranscript(transcript, config?)`

```typescript
import { evaluateTranscript } from "@ai-tutor/core";
const result = await evaluateTranscript(session.transcript, { model: "claude-sonnet-4-6" });
```

Evaluates a session transcript against a multi-dimensional tutoring quality rubric (v7).  Used for automated session evaluation after a session ends.  The rubric is defined in [src/evaluation-prompt.md](src/evaluation-prompt.md).

Calls the model in `config.model`, defaulting to `claude-haiku-4-5-20251001` (`DEFAULT_EVALUATION_MODEL`).  Extended thinking is not used.  `max_tokens: 2000`.

**Parameters:**

| Name | Type | Notes |
|------|------|-------|
| `transcript` | `Array<{ role: string; text: string }>` | Session transcript entries (e.g., `session.transcript`) |
| `config` | `{ model?: string }` | Optional. Defaults to `claude-haiku-4-5-20251001` (`DEFAULT_EVALUATION_MODEL`) if omitted. |

**Returns:** `EvaluationResult`

```typescript
{
  model: string;                         // Model used for evaluation
  session_mode: string;                  // Detected mode: "problem-solving", "conceptual", "direct", "review"
  mode_handling: string;                 // Did the tutor correctly identify and follow the session mode?
  problem_confirmation: string;          // Did the tutor restate the problem before proceeding?
  never_gave_answer: string;             // NON-NEGOTIABLE — did the tutor withhold the final answer?
  probe_reasoning: string;               // NON-NEGOTIABLE — did the tutor ask why, not just what?
  understood_where_student_was: string;  // NON-NEGOTIABLE — did the tutor establish how far the student had gotten?
  one_question: string;                  // One question at a time?
  worked_at_edge: string;                // Worked at the student's actual gap?
  followed_student_lead: string;         // Followed when the student redirected?
  adaptive_tone: string;                 // Read student state and adjusted?
  parallel_problems: string;             // Used parallel problems when appropriate?
  step_feedback: string;                 // Confirmed or redirected at each step?
  resolution: string;                    // 'resolved' | 'partial' | 'unresolved' | 'abandoned'
  has_failures: boolean;                 // See below
  rationale: Record<string, string>;     // Per-dimension rationale keyed by column name
}
```

All scored dimensions use `'pass' | 'partial' | 'fail' | 'na'` except `resolution` which uses `'resolved' | 'partial' | 'unresolved' | 'abandoned'`.

`has_failures` is `true` if any of the three non-negotiable dimensions (`never_gave_answer`, `probe_reasoning`, `understood_where_student_was`) scores `'fail'`, or if 3 or more of the remaining dimensions score `'fail'`.

---

### `Session`

```typescript
import { Session } from "@ai-tutor/core";
const session = new Session();
```

Holds all state for one tutoring conversation.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `messages` | `MessageParam[]` | Full Anthropic message history (includes thinking blocks) |
| `transcript` | `TranscriptEntry[]` | Plain-text `{ role, text }` pairs |
| `files` | `FileEntry[]` | Uploaded file buffers |
| `startedAt` | `Date` | Session creation time |
| `lastActivityAt` | `Date` | Last message time |
| `clientInfo` | `ClientInfo` | IP, geolocation, user agent |
| `emailSent` | `boolean` | Whether transcript email has been sent |
| `tokenUsage` | `TokenUsage` | Cumulative `{ inputTokens, outputTokens }` for this session |

**Methods:**

| Method | Description |
|--------|-------------|
| `addUserMessage(content, transcriptText)` | Appends user message to history |
| `addAssistantResponse(contentBlocks)` | Extracts text, appends to history with thinking blocks; returns response text |
| `addFile(filename, mimetype, buffer)` | Stores an uploaded file |
| `addTokenUsage(input, output)` | Accumulates token counts from an API call |
| `touchActivity()` | Updates `lastActivityAt` |
| `setClientInfo(info)` | Stores IP/geo/user-agent |
| `markEmailSent()` | Sets `emailSent = true` |
| `getSessionSummary()` | Returns `{ transcript, filesMetadata, clientInfo, startedAt, lastActivityAt, durationMs, tokenUsage }` |
| `reset()` | Clears message history, transcript, files, and token usage; keeps `clientInfo` |

---

### Batch evaluation helpers

These are used by the admin-gated batched evaluation subsystem in `apps/api`.

```typescript
import {
  buildEvaluationRequestParams,
  parseEvaluationResponse,
} from "@ai-tutor/core";

import {
  submitEvaluationBatch,
  retrieveBatch,
  iterateBatchEvaluationResults,
} from "@ai-tutor/core";
```

| Export | Module | Description |
|--------|--------|-------------|
| `buildEvaluationRequestParams(transcript, model)` | `evaluate-transcript` | Builds the `MessageCreateParamsNonStreaming` payload for a single evaluation request (shared between inline and batched paths). |
| `parseEvaluationResponse(message, model)` | `evaluate-transcript` | Parses an Anthropic `Message` into an `EvaluationResult`. |
| `submitEvaluationBatch(requests)` | `batch-evaluate` | Submits a batch to the Anthropic Messages Batches API. Returns an `EvaluationBatchSummary`. |
| `retrieveBatch(anthropicBatchId)` | `batch-evaluate` | Polls the current status of a submitted batch. Returns an `EvaluationBatchSummary`. |
| `iterateBatchEvaluationResults(anthropicBatchId, evaluationModel)` | `batch-evaluate` | Async generator that yields `EvaluationBatchResultEntry` — each entry has `{ customId, status, evaluation, reason? }`. |

---

## Exported types

```typescript
import type {
  Config,
  TutorClient,
  TranscriptEntry,
  FileEntry,
  FileMetadata,
  ClientInfo,
  TokenUsage,
  SessionSummary,
} from "@ai-tutor/core";
```

| Type | Description |
|------|-------------|
| `Config` | Return type of `loadConfig()` |
| `TutorClient` | Return type of `createTutorClient()` |
| `TranscriptEntry` | `{ role: "Student" \| "Tutor"; text: string }` |
| `FileEntry` | `{ filename: string; mimetype: string; buffer: Buffer }` |
| `FileMetadata` | `{ filename: string; mimetype: string; size: number }` (used in `SessionSummary`) |
| `ClientInfo` | `{ ip?: string; geo?: Record<string, unknown> \| null; userAgent?: string }` |
| `TokenUsage` | `{ inputTokens: number; outputTokens: number }` |
| `SessionSummary` | Return type of `session.getSessionSummary()` |

---

## Configuration

This package reads `ANTHROPIC_API_KEY` (required), `MODEL`, `EXTENDED_THINKING`, `SYSTEM_PROMPT_PATH`, `AUTO_EVALUATE`, and `EVALUATION_MODEL` from environment variables.  (`PORT` is consumed by `apps/api`, not this package directly.)  For the full table with defaults and descriptions, see [CLAUDE.md](../../CLAUDE.md#configsecrets-management).

## Setup

```bash
# From the repo root
npm install
npm run build
```

This package is not run directly — it is imported by `apps/api` and `apps/cli`.
