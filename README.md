# AI Tutor Toolkit

A framework for building, testing, and iterating on AI-powered homework tutors using Claude.

Built by a parent who wanted a better homework helper for his 9th grader — and discovered that building a good AI tutor is mostly about building a good feedback loop.

## What this is

This repo contains three things:

1. **A parameterized tutor prompt** that you can customize for any student, subject, and grade level.  It's built on principles from Khan Academy's Khanmigo research, Socratic tutoring literature, and five rounds of real-world iteration.

2. **A test harness** using Claude's Chrome extension to simulate student interactions and evaluate tutor behavior — without needing an actual student in the loop.

3. **Working tutor apps** — a CLI and a web interface, powered by the Anthropic SDK with extended thinking enabled by default.  Run `npm run serve` from the repo root and hand your student a browser.

## The core insight

**Examples drive model behavior more than rules.**  We went through five prompt versions.  The biggest improvements came not from adding principles or "never do this" lists, but from showing the model annotated examples of good and bad judgment.  When a stated principle conflicted with a demonstrated example, the model followed the example every time.

## Quick start

### Option A: Claude Project (no code required)

1. Go to [claude.ai](https://claude.ai), create a new Project.
2. Paste the contents of [`templates/tutor-prompt.md`](templates/tutor-prompt.md) into the custom instructions.  Customize the variables at the top.
3. Set the model to **Sonnet 4.6 with extended thinking**.

### Option B: Web app (local)

```bash
npm install
cp apps/web/.env.example apps/web/.env
# Edit apps/web/.env and add your Anthropic API key
npm run serve
```

Open `http://localhost:3000`.  Your student gets a chat interface.  Your API key stays server-side.

### Option C: CLI

```bash
npm install
cp apps/cli/.env.example apps/cli/.env
# Edit apps/cli/.env and add your Anthropic API key
npm run cli
```

### Testing

Use the character briefs in [`tests/`](tests/) to simulate student sessions via the Claude Chrome extension, or just paste them manually into conversations.  Each test includes a scenario, a character brief, and an evaluation checklist.

### Iterating

When something breaks, diagnose the transcript, trace the failure to a specific example or principle in the prompt, and make a targeted edit.  Swap examples — don't add rules.

## Repo structure

```
ai-tutor-toolkit/
├── README.md                         ← You are here
├── LICENSE                           ← MIT
├── CLAUDE.md                         ← Agent context (for AI contributors)
├── .gitignore
├── package.json                      ← npm workspaces root
├── templates/
│   ├── tutor-prompt.md               ← Parameterized prompt template
│   └── evaluation-checklist.md       ← Reusable scoring rubric
├── examples/
│   └── physics-geometry-9th-grade.md ← The actual prompt we built
├── tests/
│   ├── README.md                     ← How to run tests
│   ├── kinematics.md                 ← Wrong equation, basic error
│   ├── projectile-motion.md          ← Multi-step, buried error
│   ├── friction.md                   ← Frustrated/defeated student
│   ├── similar-triangles.md          ← Geometry, conceptual error
│   └── pendulum.md                   ← Overconfident student
├── docs/
│   ├── methodology.md                ← How to build a tutor from scratch
│   ├── model-selection.md            ← Sonnet vs Opus, extended thinking
│   └── lessons-learned.md            ← What we learned from Khan, etc.
└── apps/
    ├── core/                         ← Shared tutor logic (SDK, sessions, config)
    │   ├── README.md
    │   ├── package.json
    │   ├── index.js
    │   ├── config.js
    │   ├── prompt-loader.js
    │   ├── tutor-client.js
    │   └── session.js
    ├── cli/                          ← Terminal tutor (npm run cli)
    │   ├── README.md
    │   ├── package.json
    │   ├── index.js
    │   └── .env.example
    ├── web/                          ← Web tutor (npm run serve)
    │   ├── README.md
    │   ├── package.json
    │   ├── server.js
    │   ├── .env.example
    │   └── public/
    │       └── index.html
    ├── web-parent/                   ← Parent config UI (planned)
    │   └── README.md
    ├── web-review/                   ← Session review tool (planned)
    │   └── README.md
    └── ios/                          ← iOS app (planned)
        └── README.md
```

## Development

This is an npm workspaces monorepo.  All commands run from the repository root.

```bash
npm install          # Install all workspace dependencies
npm run serve        # Start the web tutor
npm run cli          # Start the CLI tutor
```

You can also run from individual app directories:

```bash
cd apps/web && npm run serve
cd apps/cli && npm start
```

Each app has its own `.env.example`.  Copy it to `.env` and set your `ANTHROPIC_API_KEY`.  The `SYSTEM_PROMPT_PATH` defaults to `templates/tutor-prompt.md` and resolves from the repo root.

## Roadmap

### Phase 1: CLI tutor ✅

Command-line interface with extended thinking, transcript export, and configurable system prompt.

### Phase 2: Web UI ✅

Express server with a single-page chat interface, file uploads, transcript export, and session management.

### Phase 3: Parent configuration

A setup page where a parent can choose subject, grade level, tone, and student description — then preview the generated system prompt.  See [`apps/web-parent/`](apps/web-parent/).

### Phase 4: Session review

Transcript review with automated evaluation checks and the ability to flag specific exchanges.  See [`apps/web-review/`](apps/web-review/).

### Phase 5: Multi-student support

Multiple student profiles, each with their own tutor configuration and session history.  This is a feature added to existing apps, not a standalone application.

### Future: iOS app

A native mobile tutor interface.  See [`apps/ios/`](apps/ios/).

## Key findings

These emerged from five iterations and eight test runs across four distinct scenarios:

- **Principles-based prompts outperform procedural ones.**  Decision trees and branching logic make the model rigid.  Short principles with annotated examples let the model use judgment.
- **The model follows examples over stated rules.**  If your example shows "walk me through your steps" but your principle says "ask why," the model will ask "walk me through your steps."  Always align your examples with your principles.
- **Sonnet with extended thinking is the sweet spot for tutoring.**  Opus is overkill.  Sonnet without extended thinking breaks on soft skills (stacks multiple questions, skips tone calibration).  Extended thinking gives the model a scratchpad to check its own behavior before responding.
- **The opening sequence matters more than anything else.**  See the problem → understand where the student is → then help.  If the tutor skips step one, everything downstream is guesswork.
- **A browser-based test harness works surprisingly well.**  Character briefs in the Chrome extension produced reliable, evaluable transcripts with zero setup friction.  The API approach is more robust but wasn't necessary for this stage.
- **The student's emotional state is a real variable.**  A frustrated student, an overconfident student, and a confused student all need different approaches.  The prompt can't branch for each case — but it can demonstrate good judgment through examples that cover the range.

## Prior art and references

- [Khan Academy: How We Built AI Tutoring Tools](https://blog.khanacademy.org/how-we-built-ai-tutoring-tools/)
- [Khan Academy: 7-Step Approach to Prompt Engineering](https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo/)
- [The Socratic Prompt: How to Make a Language Model Stop Guessing and Start Thinking](https://towardsai.net/p/machine-learning/the-socratic-prompt-how-to-make-a-language-model-stop-guessing-and-start-thinking)
- [AI Socratic Tutors: Teaching The World To Think](https://aicompetence.org/ai-socratic-tutors/)

## Contributing

This started as a one-evening project for one student.  If you adapt it for your own kid, a different subject, or a different grade level, open a PR with your findings.  The methodology section of the docs is where the real value is — the more examples of the iterate-and-test loop, the better.

## License

MIT.  Do whatever you want with it.
