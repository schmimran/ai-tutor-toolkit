# CLI Tutor

Terminal-based tutor interface.  The student types messages and the tutor responds.  Supports transcript export.  Does not support file uploads — use the web interface for that.

## Technology

- **Runtime:** Node.js 18+
- **Language:** JavaScript (ES modules)
- **I/O:** Node.js readline

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@ai-tutor/core` | workspace | Shared tutor logic (Anthropic SDK, session management, config) |

All Anthropic SDK and dotenv dependencies are provided transitively through `@ai-tutor/core`.

## Design methodology

The CLI is the thinnest possible wrapper around the shared core.  It handles only three concerns: reading terminal input, printing output, and the `export`/`quit` commands.  All tutor logic — API calls, session management, prompt loading, extended thinking configuration — comes from `@ai-tutor/core`.

## Setup

From the repository root:

```bash
npm install
```

Or from this directory:

```bash
npm install
```

### Configure

```bash
cp .env.example .env
```

Set your `ANTHROPIC_API_KEY` in `.env`.

## Usage

From the repository root:

```bash
npm run cli
```

Or from this directory:

```bash
npm start
```

### Commands

- Type a message and press Enter to send it to the tutor.
- `export` — print the full session transcript.
- `quit` — end the session.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key |
| `SYSTEM_PROMPT_PATH` | `templates/tutor-prompt.md` | Path to the system prompt, resolved from the repo root |
| `MODEL` | `claude-sonnet-4-6` | Model to use |
| `EXTENDED_THINKING` | `true` | Enable extended thinking (set to `false` to disable) |
