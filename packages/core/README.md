# @ai-tutor/core

Shared tutor logic — Anthropic SDK wrapper, configuration, session management, and prompt loading.  Used by `apps/api` and `apps/cli`.

## Overview

This package abstracts everything that touches the Anthropic API: loading config from environment variables, reading the system prompt file, managing message history (including thinking blocks), and streaming or blocking responses.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.90.0 | Anthropic API client |

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

#### `streamMessage(session, userContent, transcriptText, opts?): AsyncGenerator<string, TokenUsage>`

Streaming version.  Yields text deltas one by one.  Thinking tokens are buffered internally and not yielded.  Adds the full user message and assistant response to the session after streaming completes.  Returns per-call `TokenUsage` as the generator return value.

Used by the API server for SSE responses.

**Parameters:**

| Name | Type | Notes |
|------|------|-------|
| `session` | `Session` | Current session (message history appended in place) |
| `userContent` | `string \| ContentBlockParam[]` | Student's message; can include image/PDF content blocks |
| `transcriptText` | `string` | Plain-text version for transcript |
| `opts` | `StreamOptions` | Optional. `{ modelOverride?, systemPromptOverride?, extendedThinkingOverride? }` — per-call overrides. Haiku models always block extended thinking regardless. |

---

### `evaluateTranscript(transcript, evaluationModel?)`

```typescript
import { evaluateTranscript } from "@ai-tutor/core";
const result = await evaluateTranscript(session.transcript);
```

Evaluates a session transcript against a multi-dimensional tutoring quality rubric (v7).  Used for automated session evaluation after a session ends.

Defaults to `claude-haiku-4-5-20251001` (exported as `DEFAULT_EVALUATION_MODEL`) without extended thinking.

**Parameters:**

| Name | Type | Notes |
|------|------|-------|
| `transcript` | `Array<{ role: string; text: string }>` | Session transcript entries (e.g., `session.transcript`) |
| `evaluationModel` | `string` | Optional. Claude model ID. Defaults to `DEFAULT_EVALUATION_MODEL`. |

**Returns:** `Promise<EvaluationResult>`. See the [`session_evaluations` schema in CLAUDE.md](../../CLAUDE.md#session_evaluations) for the full dimension list and the `has_failures` computation rule.

---

### `Session`

```typescript
import { Session } from "@ai-tutor/core";
const session = new Session();
```

Holds all state for one tutoring conversation. See [`packages/core/src/session.ts`](src/session.ts) for the full property/method list; the [CLAUDE.md file-level reference](../../CLAUDE.md#file-level-reference-table) summarizes its role in the runtime.

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

This package reads `ANTHROPIC_API_KEY` (required), `MODEL`, `EXTENDED_THINKING`, `SYSTEM_PROMPT_PATH`, and `EVALUATION_MODEL` from environment variables.  (`PORT` is consumed by `apps/api`, not this package directly.)  For the full table with defaults and descriptions, see [CLAUDE.md](../../CLAUDE.md#configsecrets-management).

## Setup

```bash
# From the repo root
npm install
npm run build
```

This package is not run directly — it is imported by `apps/api` and `apps/cli`.
