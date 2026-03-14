# Core — Shared Tutor Logic

Shared library used by all tutor interfaces.  Extracts the duplicated Anthropic SDK integration, session management, prompt loading, and configuration into a single package so that new interfaces only need to implement their own I/O layer.

## Technology

- **Runtime:** Node.js 18+
- **Language:** JavaScript (ES modules)
- **Key library:** Anthropic SDK (`@anthropic-ai/sdk`)

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.39.0 | Claude API client |
| `dotenv` | ^16.4.0 | Environment variable loading |

## API

### `loadConfig()`

Reads environment variables and returns a configuration object with defaults.

```js
import { loadConfig } from "@ai-tutor/core";

const config = loadConfig();
// { model, extendedThinking, systemPromptPath, port }
```

### `loadSystemPrompt(filePath)`

Reads a prompt file and strips the template variables section above the `## Begin prompt` marker.  Paths are resolved relative to the repository root unless absolute.

```js
import { loadSystemPrompt } from "@ai-tutor/core";

const prompt = loadSystemPrompt("templates/tutor-prompt.md");
```

### `Session`

Manages the dual-array invariant: `messages[]` for API context continuity and `transcript[]` for plain-text export.  This is the single source of truth for that pattern.

```js
import { Session } from "@ai-tutor/core";

const session = new Session();
session.addUserMessage("Hi", "Hi");
const text = session.addAssistantResponse(response.content);
const transcript = session.getTranscript();
session.reset();
```

### `createTutorClient(config, systemPrompt)`

Wraps the Anthropic SDK.  Handles request building, extended thinking configuration, and response text extraction.

```js
import { createTutorClient } from "@ai-tutor/core";

const tutor = createTutorClient(config, systemPrompt);
const reply = await tutor.sendMessage(session, "user text", "user text");
```

## Design methodology

The core package exists because the CLI and web apps duplicated six concerns: environment config, prompt file loading, Anthropic client initialization, request parameter building, response text extraction, and the dual-array session pattern.  The `Session` class enforces the `messages[]`/`transcript[]` invariant in one place, eliminating the previous requirement to update both arrays in parallel across multiple files.

The package exposes functions and a class rather than a framework.  Each interface calls what it needs.  There is no middleware, no plugin system, and no lifecycle hooks.
