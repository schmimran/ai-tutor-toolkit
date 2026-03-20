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

Reads environment variables and returns a typed config object.  Throws if `ANTHROPIC_API_KEY` is not set.

**Returns:**

```typescript
{
  model: string;            // MODEL env var, default "claude-sonnet-4-6"
  extendedThinking: boolean; // EXTENDED_THINKING env var, default true
  systemPromptPath: string;  // SYSTEM_PROMPT_PATH env var, default "templates/tutor-prompt.md"
  port: number;             // PORT env var, default 3000
}
```

---

### `loadSystemPrompt(path: string): Promise<string>`

```typescript
import { loadSystemPrompt } from "@ai-tutor/core";
const prompt = await loadSystemPrompt(config.systemPromptPath);
```

Loads a prompt file from the repo root.  Strips everything above the `## Begin prompt` marker (documentation/comments above that line are ignored).  Resolves the repo root by walking up the directory tree looking for a `package.json` with `"workspaces"`.

---

### `createTutorClient(config, systemPrompt)`

```typescript
import { createTutorClient } from "@ai-tutor/core";
const tutorClient = createTutorClient(config, systemPrompt);
```

Returns an object with two methods:

#### `sendMessage(session, userContent, transcriptText?): Promise<string>`

Blocking version.  Sends a message and waits for the full response.  Adds both the user message and assistant response to the session.  Returns the response text.

Used by the CLI (where streaming is unnecessary).

#### `streamMessage(session, userContent, transcriptText?): AsyncGenerator<string>`

Streaming version.  Yields text deltas one by one.  Thinking tokens are buffered internally and not yielded.  Adds the full user message and assistant response to the session after streaming completes.

Used by the API server for SSE responses.

**Parameters:**

| Name | Type | Notes |
|------|------|-------|
| `session` | `Session` | Current session (message history appended in place) |
| `userContent` | `string \| ContentBlock[]` | Student's message; can include image/PDF content blocks |
| `transcriptText` | `string?` | Plain-text version for transcript (if different from userContent) |

---

### `evaluateTranscript(transcript, config?)`

```typescript
import { evaluateTranscript } from "@ai-tutor/core";
const result = await evaluateTranscript(session.transcript, { model: "claude-sonnet-4-6" });
```

Evaluates a session transcript against ten tutoring quality dimensions derived from the six Socratic tutoring principles.  Used for automated session evaluation after a session ends.

Calls `claude-sonnet-4-6` (or the model in `config.model`) without extended thinking.  `max_tokens: 2000`.

**Parameters:**

| Name | Type | Notes |
|------|------|-------|
| `transcript` | `Array<{ role: string; text: string }>` | Session transcript entries (e.g., `session.transcript`) |
| `config` | `{ model?: string }` | Optional. Defaults to `claude-sonnet-4-6` if omitted. |

**Returns:** `EvaluationResult`

```typescript
{
  model: string;                    // Model used for evaluation
  opening_sequence: DimensionScore;
  one_question: DimensionScore;
  asked_why: DimensionScore;
  worked_at_edge: DimensionScore;
  parallel_problems: DimensionScore;
  step_feedback: DimensionScore;
  never_gave_answer: DimensionScore;
  clarity: DimensionScore;
  tone: DimensionScore;
  resolution: DimensionScore;
  has_failures: boolean;            // true if any dimension (except resolution) scored 'fail'
}
```

Each `DimensionScore` is `{ score: string; rationale: string }`.  Scores for dimensions 1–9 are `'pass' | 'partial' | 'fail' | 'na'`.  Score for `resolution` is `'resolved' | 'partial' | 'unresolved' | 'abandoned'`.

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
| `clientInfo` | `ClientInfo \| null` | IP, geolocation, user agent |
| `emailSent` | `boolean` | Whether transcript email has been sent |

**Methods:**

| Method | Description |
|--------|-------------|
| `addUserMessage(content, transcriptText?)` | Appends user message to history |
| `addAssistantResponse(contentBlocks)` | Extracts text, appends to history with thinking blocks |
| `addFile(filename, mimetype, buffer)` | Stores an uploaded file |
| `touchActivity()` | Updates `lastActivityAt` |
| `setClientInfo(info)` | Stores IP/geo/user-agent |
| `markEmailSent()` | Sets `emailSent = true` |
| `getSessionSummary()` | Returns `{ transcript, files, clientInfo, startedAt, lastActivityAt, durationMs }` |
| `reset()` | Clears message history and transcript; keeps clientInfo |

---

## Configuration

All configuration is via environment variables.  See the root README for the full table.

| Variable | Required | Default |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | **yes** | — |
| `MODEL` | no | `claude-sonnet-4-6` |
| `EXTENDED_THINKING` | no | `true` |
| `SYSTEM_PROMPT_PATH` | no | `templates/tutor-prompt.md` |
| `PORT` | no | `3000` |

## Setup

```bash
# From the repo root
npm install
npm run build
```

This package is not run directly — it is imported by `apps/api` and `apps/cli`.
