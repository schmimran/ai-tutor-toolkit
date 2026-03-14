# CLAUDE.md — Agent Context for AI Tutor Toolkit

This file provides all context a future agent needs to work on this repository without introducing inconsistencies or re-learning decisions that were already made.  Read this entire file before making any changes to the repo.

---

## Project origin

This project was built in a single evening session by Imran (GitHub: schmimran) — a technologist and parent — working with Claude.  The goal was to build a homework tutor for his 9th-grade daughter taking Regents Physics and geometry.  It started with a real homework problem (Hoover Dam power/energy conversion, HW #13 from UTexas) and evolved through five prompt versions and eight test runs into a reusable framework.

The original problem was not "build an AI tutor."  It was "help my daughter with question 30."  The toolkit emerged from iterating on the gap between what the tutor did and what a good tutor should do.

---

## Core design tenets

These are non-negotiable.  Every change to the repo should be evaluated against them.

### 1. Examples drive behavior more than rules

This is the single most important finding.  When a stated principle conflicted with a demonstrated example in the prompt, the model followed the example every time.  We proved this across multiple iterations:

- Principle said "ask why, not just what" but the example showed "walk me through your steps" → model asked "walk me through your steps."
- Only after the example was rewritten to show a "why" question did the behavior change.

**Implication for contributors:** When fixing a prompt behavior, change or add an example first.  Adding a rule to the "never do this" list is almost always the wrong move.

### 2. Principles over procedures

Early prompt versions (v1–v3) used decision trees and branching logic ("if the student is looping, check if it's a conceptual gap or a staring-at-their-mistake situation, then...").  These made the model rigid and created spaghetti.  The v4 rewrite replaced all branching with five short principles and annotated examples.  Quality jumped immediately.

**Implication for contributors:** Do not add if/then logic, flowcharts, or multi-path decision trees to tutor prompts.  State the principle.  Show what good judgment looks like.  Let the model interpolate.

### 3. The student always finishes the problem

The tutor never gives the final numerical answer.  It can teach a concept, show a contradiction, set up every piece — but the last calculation or expression comes from the student.  This is the hardest rule for the model to follow and the most important.

### 4. Respect demonstrated knowledge

If the student got a prior part right, she used those concepts correctly.  The tutor does not re-quiz them.  "What does mega mean?" to a student who just correctly computed 499 MW is patronizing.  The tutor meets the student at the actual gap, not three steps behind it.

### 5. One question at a time

The model's natural instinct is to be efficient — it wants to cover multiple points per message.  This overwhelms students and causes the tutor to address one error while mentioning another.  Extended thinking helps enforce this because the model checks its own output before sending.

### 6. Warm, not sterile; direct, not preachy

The tone target is "favorite teacher" — warm and easy to talk to, but doesn't waste time or talk down.  Earlier versions used "sharp upperclassman" which produced correct but clinical responses.  The shift to "favorite teacher" improved emotional handling without sacrificing directness.

---

## Architecture decisions

### Prompt structure

The tutor prompt follows this architecture:

```
Identity paragraph (who, tone, scope, response length)
↓
Six principles (numbered, bolded headers, 1–3 sentences each)
↓
"What good judgment looks like" (4 annotated dialogue examples)
↓
"What bad judgment looks like" (2 anti-pattern examples with explanations)
```

Do not add sections.  Do not add a standalone "never do this" list.  Anti-patterns belong inside the examples section as contrast.  The total prompt should stay under ~1000 words.  Research shows instruction-following degrades as prompt complexity increases.

### Template vs. example

- `templates/tutor-prompt.md` is the **parameterized version** with variables (`{GRADE_LEVEL}`, `{SUBJECTS}`, etc.) and a "Begin prompt" marker.  This is what users customize.
- `examples/physics-geometry-9th-grade.md` is the **production version** built for Imran's daughter.  All variables are filled in.  This is the version that was tested.

These two files must stay in sync on principles, examples, and structure.  If you update one, update the other.

### The template variables

| Variable | Description |
|----------|-------------|
| `GRADE_LEVEL` | Student's grade |
| `SUBJECTS` | Subjects the tutor covers |
| `PRONOUNS` | Student's pronouns (she/her, he/him, they/them) — replace throughout the prompt |
| `TONE` | How the tutor should sound |
| `STUDENT_PROFILE` | Brief description of the student |
| `SCOPE_NOTE` | What to do with off-topic requests |

The prompt uses she/her throughout as written.  The `PRONOUNS` variable reminds users to replace.  This is documented in the template.

### Model selection

**Sonnet 4.6 with extended thinking** is the recommended and tested configuration.

- Sonnet without extended thinking works for the physics but breaks on soft skills: stacks questions, skips tone calibration, never asks "why."
- Opus is unnecessary for high school homework.  The reasoning demands don't justify the cost or latency.
- Extended thinking matters not because the math is hard, but because it gives the model a scratchpad to check its own behavior (one question at a time, tone, whether to probe reasoning) before responding.

### App (`app/`)

The app has two interfaces that share the same backend logic:

- **CLI** (`index.js`, run with `npm start`) — terminal-based, student types messages, tutor responds.  `export` command prints the transcript.
- **Web** (`server.js` + `public/index.html`, run with `npm run serve`) — Express server with a single-page chat interface.  Student messages on the right, tutor on the left.  Transcript modal with copy-to-clipboard.  New session button.  API key stays server-side.

Both interfaces share these implementation details:

- Node.js with the Anthropic SDK.
- Extended thinking is **on by default** — set `EXTENDED_THINKING=false` in `.env` to disable.
- Both maintain two parallel data structures: `messages` (full API content blocks including thinking blocks, for context continuity) and `transcript` (plain text strings, for export).  This was a bug fix — the original version stored raw content blocks and the export printed `[object Object]`.
- The system prompt is loaded from a file.  If the file contains `## Begin prompt`, everything above that marker is stripped (it's the template variables section, not part of the prompt itself).

The web server additionally:

- Stores sessions in memory keyed by UUID (generated client-side).  Restarting the server clears all sessions.
- Exposes `/api/chat`, `/api/transcript/:sessionId`, `/api/reset`, and `/api/config` endpoints.
- Serves static files from `public/`.
- Never exposes the API key to the frontend.

---

## Test harness

### How tests work

Each test is a **character brief** — not a script.  The brief describes who the student is, what they got wrong, what they know, and how they behave.  The Chrome extension (or a human) plays the student role and improvises within those constraints.

Character briefs are more resilient than scripts.  Scripts break when the tutor asks something unexpected.  Character briefs let the "student" adapt.

### Test structure

Every test file follows this structure:

1. Metadata (error type, student state, what it tests)
2. Setup (start a new conversation)
3. Character brief (who you are, the problem, what you did wrong, what you know, how to behave)
4. End condition (correct answer reached, or 12 exchanges without resolution)
5. After-conversation steps (ask tutor for transcript, copy it, fill in evaluation)
6. Evaluation checklist (standard items + scenario-specific items)

### Current test scenarios

| File | Error type | Emotional state | Key test |
|------|-----------|----------------|----------|
| kinematics | Wrong equation | Confused | Opening sequence, basic diagnosis |
| projectile-motion | Buried vector error | Puzzled | Step-level confirmation, finding hidden error |
| friction | Forgot a force | Frustrated, defeated | Emotional adaptation |
| similar-triangles | Wrong side correspondence | Confused | Geometry, conceptual error |
| pendulum | Unit conversion miss | Overconfident | Pushing back respectfully |

### Evaluation checklist items (standard)

These appear in every test and map to the six principles:

- Tutor asked to see the problem first (principle 1)
- Tutor asked where student was stuck / how far they got (principle 1)
- Tutor asked for student's work before helping (principle 1)
- Tutor never gave the final answer (principle 3)
- One question per message (principle 2)
- Asked WHY, not just what (principle 3)
- Step-by-step feedback, not end-dump (principle 6)
- Correctly identified the actual error
- Student computed the final answer herself
- Did not quiz demonstrated concepts (principle 4)
- Did not talk to the student like a child
- Exchange count
- Tone rating: favorite teacher / TA-like / neutral / patronizing
- Worst exchange (copy the specific message)

### Adding new tests

Pick an error type and emotional state not already covered.  Follow the file structure above.  Include scenario-specific checklist items.  Run the test and document findings.

---

## Known gaps and open issues

### "Ask why" is partially landing

Across all test runs, the tutor consistently asks *what* the student did but rarely asks *why* she chose her approach.  The v5 prompt has the principle and the example aligned, but the model still defaults to "what" questions about 50% of the time.  Extended thinking helps but doesn't fully solve it.

**Status:** Acceptable for now.  The tutor often gets at reasoning through indirect questions ("where does the 2 go?") which serve a similar function.  A real student's feedback will determine if this matters.

### Transcript request handling

The tutor sometimes refuses to provide a session transcript, interpreting it as outside its scope.  The v5 prompt includes "practical requests like recapping the conversation or summarizing what was covered are fine" to address this, but enforcement is inconsistent.  The web interface sidesteps this with a built-in transcript export button.

### No progress tracking

The tutor has no memory across sessions.  It can't detect patterns like "she consistently forgets unit conversions."  This would require either Claude's memory features or a persistent data layer in the web app.

---

## Consistency rules for contributors

### When editing tutor prompts

1. Keep the template and example in sync.  If you change a principle or example in one, change it in the other.
2. Do not exceed ~1000 words in the prompt.  Longer prompts degrade instruction-following.
3. Every principle must be demonstrated in at least one example.  If it isn't, the model will ignore it.
4. Anti-patterns go in the "bad judgment" section, not in a standalone "never" list.
5. Annotate examples — the sentence after each dialogue explaining *why* it's good is load-bearing.

### When editing test files

1. Every test must have a character brief, not a rigid script.
2. Every test must include the standard evaluation checklist items plus scenario-specific items.
3. The "after conversation" section must include asking the tutor for a transcript.
4. Setup should be a single step: "Start a new conversation in your tutor project."  Don't include navigation steps — the user has already set up shortcuts.
5. The student character must NOT know the correct answer.  If you find yourself writing scratch work to figure out the error, delete it before committing (this happened twice in development and was caught in review).

### When editing the app

1. The `messages` array stores full API content blocks (including thinking blocks) for context continuity.
2. The `transcript` array stores plain text for export.  These must be updated in parallel in both `index.js` and `server.js`.
3. Extended thinking is on by default.  Any new API call parameters must account for both thinking-on and thinking-off states.
4. The `.env.example` file must document every environment variable with defaults and descriptions.
5. The web server (`server.js`) must never expose the API key to the frontend.  All Anthropic API calls happen server-side.
6. The frontend (`public/index.html`) is a single file — HTML, CSS, and JS together.  No build step, no dependencies, no framework.  Keep it that way unless there's a strong reason to add complexity.
7. If you add a new API endpoint to `server.js`, document it in `app/README.md`.

### When editing documentation

1. The README repo structure diagram must match the actual file tree.  Verify after adding or renaming files.
2. The app README roadmap must label completed phases with ✅.
3. Cross-references between files (e.g., "see `templates/evaluation-checklist.md`") must point to actual paths.
4. The tests README scenario table must include every test file in `tests/`.

### General

1. Two spaces after periods in all prose files (this matches the project owner's writing style).
2. No parentheticals except to define an acronym on first use.
3. No hype language.  The ceiling on enthusiasm is "this is really cool."
4. Descriptions should be conclusion-first.  Lead with what the file does, then explain how.

---

## Iteration history

| Version | Words | Architecture | Key change |
|---------|-------|-------------|------------|
| v1 | ~400 | Branching paths, decision trees | Initial draft |
| v2 | ~500 | Added escalation protocol | Still too procedural |
| v3 | ~600 | More branches | Decision trees for looping vs. stuck |
| v4 | ~500 | Principles + examples, no branching | Clean rewrite — biggest quality jump |
| v5 | ~960 | 6 principles, 4 good examples, 2 anti-patterns | Research-backed (Khan, Socratic lit), tone shift to "favorite teacher" |

The v3 → v4 transition (deleting all decision trees) produced the largest single improvement.  The v5 additions (one question at a time, ask why, step-level feedback) were validated by the Khan Academy and Socratic tutoring research and confirmed through testing.

---

## Research references that informed the design

- **Khan Academy: How We Built AI Tutoring Tools** — Active engagement, immediate feedback, meeting students where they are.  Key insight: effective tutors prompt toward self-explanation.
- **Khan Academy: 7-Step Approach to Prompt Engineering** — Economy of language, testing with diverse personas, iterating on real user feedback.  Key finding: Khanmigo repeated itself too much; they fixed it with explicit brevity instructions.
- **The Socratic Prompt (Towards AI)** — Warning against "infinite regress" in Socratic questioning.  Socratic prompting is an interaction contract — if the student can't answer, the model must change strategy, not keep asking.
- **Prompt complexity research (arxiv)** — Specifying more requirements in a prompt can drop instruction-following performance by 19%.  This directly informed our move from procedural to principles-based prompts.

---

## File-level reference

| File | Purpose | Edits require syncing with |
|------|---------|---------------------------|
| `README.md` | Public-facing overview, quick start, key findings | Repo structure diagram must match actual files |
| `LICENSE` | MIT license | No edits expected |
| `CLAUDE.md` | This file — agent context | Update when major decisions are made |
| `templates/tutor-prompt.md` | Parameterized prompt for customization | `examples/physics-geometry-9th-grade.md` |
| `templates/evaluation-checklist.md` | Reusable scoring rubric | All test files (they embed similar checklists) |
| `examples/physics-geometry-9th-grade.md` | Production prompt, tested and validated | `templates/tutor-prompt.md` |
| `tests/README.md` | Test harness overview, scenario table | Must list all test files in `tests/` |
| `tests/*.md` | Individual test scenarios | Each must follow the standard structure |
| `docs/methodology.md` | Process documentation | Should reflect actual process used |
| `docs/model-selection.md` | Model comparison findings | Update if new models are tested |
| `docs/lessons-learned.md` | 10 key findings | Update as new findings emerge |
| `app/README.md` | Setup instructions and roadmap | Must document all `.env` variables and API endpoints |
| `app/index.js` | CLI tutor | `messages` and `transcript` arrays must stay in sync |
| `app/server.js` | Web server (Express) | Same dual-array pattern as `index.js`; API key must stay server-side |
| `app/public/index.html` | Chat interface (single-file, no build step) | Must match API endpoints in `server.js` |
| `app/package.json` | Node dependencies and scripts | `start` = CLI, `serve` = web |
| `app/.env.example` | Environment variable documentation | Must match what both `index.js` and `server.js` read |
