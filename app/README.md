# AI Tutor — App

Two interfaces for the tutor: a command-line version and a web version.  Both use the same Anthropic SDK backend, the same system prompt, and the same extended thinking configuration.

## Setup

### Prerequisites

- Node.js 18 or later
- An Anthropic API key ([get one here](https://console.anthropic.com/))

### Install

```bash
cd app
npm install
```

### Configure

```bash
cp .env.example .env
```

Open `.env` and set your API key:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

All variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key |
| `SYSTEM_PROMPT_PATH` | `../templates/tutor-prompt.md` | Path to the tutor system prompt |
| `MODEL` | `claude-sonnet-4-6` | Model to use |
| `EXTENDED_THINKING` | `true` | Enable extended thinking (set to `false` to disable) |
| `PORT` | `3000` | Port for the web server |

## Web interface

```bash
npm run serve
```

Open `http://localhost:3000` in your browser.  The student types in the chat, the tutor responds.  Features:

- **Chat interface** — messages appear in a conversation thread, student on the right, tutor on the left.
- **Transcript export** — click "Transcript" to view the full session, copy it to clipboard.
- **New session** — click "New session" to clear the conversation and start fresh.
- **Model indicator** — shows which model and whether extended thinking is active.
- **Error handling** — if the API key is missing or the server is down, errors appear as a toast notification.

The API key stays server-side.  The frontend never sees it.  This means your student can use the web interface directly without access to your credentials.

### Using a specific prompt

To use the example prompt we built (9th-grade physics and geometry):

```bash
SYSTEM_PROMPT_PATH=../examples/physics-geometry-9th-grade.md npm run serve
```

Or set it in your `.env` file.

## CLI interface

```bash
npm start
```

Same tutor, terminal-based.  Type messages, get responses.  Type `export` for the transcript, `quit` to exit.

## Notes

- **Extended thinking is on by default.**  Our testing showed it significantly improves tutoring quality.  Set `EXTENDED_THINKING=false` in `.env` to disable if latency or cost is a concern.
- The system prompt is loaded from a file and stripped of the template variables section (everything above `## Begin prompt`).  If your prompt doesn't have that marker, the entire file is used.
- The web server stores sessions in memory.  Restarting the server clears all sessions.

---

## Roadmap

### Phase 1: CLI tutor ✅

Command-line interface with extended thinking, transcript export, and configurable system prompt.

### Phase 2: Web UI ✅

Express server with a single-page chat interface, transcript export, and session management.

### Phase 3: Parent configuration

A setup page where a parent can choose subject, grade level, tone, and student description — then preview the generated system prompt.

### Phase 4: Session review

Transcript review with automated evaluation checks (did the tutor give the answer? how many exchanges?) and the ability to flag specific exchanges.

### Phase 5: Multi-student support

Multiple student profiles, each with their own tutor configuration and session history.
