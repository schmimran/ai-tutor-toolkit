# AI Tutor Toolkit

A framework for building, testing, and iterating on AI-powered homework tutors using Claude.

Built by a parent who wanted a better homework helper for his 9th grader — and discovered that building a good AI tutor is mostly about building a good feedback loop.

## What this is

This repo contains three things:

1. **A parameterized tutor prompt** that you can customize for any student, subject, and grade level.  It's built on principles from Khan Academy's Khanmigo research, Socratic tutoring literature, and five rounds of real-world iteration.

2. **A test harness** using Claude's Chrome extension to simulate student interactions and evaluate tutor behavior — without needing an actual student in the loop.

3. **A skeleton for a web app** (Anthropic SDK) that can eventually serve as a lightweight frontend for parents and students.

## The core insight

**Examples drive model behavior more than rules.**  We went through five prompt versions.  The biggest improvements came not from adding principles or "never do this" lists, but from showing the model annotated examples of good and bad judgment.  When a stated principle conflicted with a demonstrated example, the model followed the example every time.

## Quick start

### 1. Create a Claude Project

Go to [claude.ai](https://claude.ai), create a new Project, and paste the contents of [`templates/tutor-prompt.md`](templates/tutor-prompt.md) into the custom instructions.  Customize the variables at the top (subject, grade level, tone).

### 2. Set the model

Use **Sonnet 4.6 with extended thinking**.  Our testing showed that extended thinking significantly improves soft skills — one question at a time, tone calibration, and reasoning about *why* the student made an error, not just *what* they got wrong.  Sonnet without extended thinking works but produces more robotic interactions.

### 3. Test it

Use the character briefs in [`tests/`](tests/) to simulate student sessions via the Claude Chrome extension, or just paste them manually into conversations.  Each test includes a scenario, a character brief, and an evaluation checklist.

### 4. Iterate

When something breaks, diagnose the transcript, trace the failure to a specific example or principle in the prompt, and make a targeted edit.  Swap examples — don't add rules.

## Repo structure

```
ai-tutor-toolkit/
├── README.md                 ← You are here
├── LICENSE                   ← MIT
├── templates/
│   ├── tutor-prompt.md       ← Parameterized prompt template
│   └── evaluation-checklist.md ← Reusable scoring rubric
├── tests/
│   ├── README.md             ← How to run tests
│   ├── kinematics.md         ← Wrong equation, basic error
│   ├── projectile-motion.md  ← Multi-step, buried error
│   ├── friction.md           ← Frustrated/defeated student
│   ├── similar-triangles.md  ← Geometry, conceptual error
│   └── pendulum.md           ← Overconfident student
├── examples/
│   └── physics-geometry-9th-grade.md ← The actual prompt we built
├── docs/
│   ├── methodology.md        ← How to build a tutor from scratch
│   ├── model-selection.md    ← Sonnet vs Opus, extended thinking
│   └── lessons-learned.md    ← What we learned from Khan, etc.
└── app/
    ├── README.md             ← Roadmap for the web app
    ├── package.json          ← Node/Anthropic SDK skeleton
    ├── index.js              ← Basic SDK setup
    └── .env.example          ← Environment variables
```

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
