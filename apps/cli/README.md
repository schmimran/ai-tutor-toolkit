# @ai-tutor/cli

Terminal REPL for the AI Tutor.  Simple readline-based interface for local testing and development.

## Overview

The CLI provides a minimal interactive session with the tutor.  It uses the blocking `sendMessage()` API (not streaming) and prints the full response after each turn.  It is primarily useful for quick iteration on the system prompt without spinning up a browser.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@ai-tutor/core` | Tutor logic, Anthropic SDK wrapper, session management |

No other npm dependencies.

## Usage

```bash
# From the repo root
export ANTHROPIC_API_KEY=sk-ant-...
npm run cli
```

At the prompt:

| Input | Action |
|-------|--------|
| Any text | Send message to tutor; print full response |
| `export` | Print the full session transcript to stdout |
| `quit` | Exit |

The model ID and extended thinking status are printed at startup.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | **yes** | — | Anthropic API key |
| `MODEL` | no | `claude-sonnet-4-6` | Claude model ID |
| `EXTENDED_THINKING` | no | `true` | Set `"false"` to disable |
| `SYSTEM_PROMPT_PATH` | no | `templates/tutor-prompt-v7.md` | Path from repo root |

## Setup

```bash
npm install        # from repo root
npm run build      # compile TypeScript
npm run cli        # start REPL
```

## Source structure

```
apps/cli/src/
└── index.ts      ← readline REPL loop
```

## Notes

- Does not connect to Supabase or Resend — sessions are not persisted.
- Does not support file attachments.
- Uses `sendMessage()` (blocking), not `streamMessage()` — the full response appears at once.
- For streaming output and file uploads, use the web interface (`npm run api`).
