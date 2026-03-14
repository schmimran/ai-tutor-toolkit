# AI Tutor — CLI App

A command-line tutor powered by Anthropic's Claude SDK.  Type messages as the student, get tutor responses in your terminal.

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

The other variables have sensible defaults but you can change them:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key |
| `SYSTEM_PROMPT_PATH` | `../templates/tutor-prompt.md` | Path to the tutor system prompt |
| `MODEL` | `claude-sonnet-4-6` | Model to use |

### Run

```bash
npm start
```

You'll see:

```
AI Tutor ready.  Type your message and press Enter.
Type 'quit' to exit.  Type 'export' to print the transcript.
```

Type as the student.  The tutor responds.  When you're done, type `export` to print the full transcript, or `quit` to exit.

### Using your own prompt

By default the app loads the template from `templates/tutor-prompt.md`.  To use the example prompt we built (already customized for 9th-grade physics and geometry):

```bash
SYSTEM_PROMPT_PATH=../examples/physics-geometry-9th-grade.md npm start
```

Or set it in your `.env` file.

## Notes

- The CLI loads the system prompt from a file and strips everything above `## Begin prompt` (the template variables section).  If you're using a prompt without that marker, it loads the entire file.
- Conversation history is maintained in memory for the duration of the session.  Closing the app clears it.
- Extended thinking is not enabled in the CLI skeleton.  To add it, modify the `client.messages.create` call in `index.js` to include the appropriate parameters.

---

## Roadmap

### Phase 2: Simple web UI

A single-page app with a chat interface, system prompt loaded from config, and transcript export.  Express API server-side, vanilla HTML/JS or React on the front.

### Phase 3: Parent configuration

A setup page where a parent can choose subject, grade level, tone, and student description — then preview the generated system prompt.

### Phase 4: Session review

Transcript review with automated evaluation checks (did the tutor give the answer? how many exchanges?) and the ability to flag specific exchanges.

### Phase 5: Multi-student support

Multiple student profiles, each with their own tutor configuration and session history.
