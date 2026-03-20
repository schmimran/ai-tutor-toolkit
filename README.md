# AI Tutor Toolkit

A homework tutor for your student, built on the same principles as Khan Academy's Khanmigo.  One parent built this for his 9th grader because he wanted something that would actually teach — not just hand over answers.  It has gone through five rounds of real-world testing with a real student.  This is the result.

---

## What the tutor does

Most AI tools will give your student the answer if they ask for it.  This tutor won't.  It's designed around a question-first approach: instead of solving the problem for your student, it asks questions that help them figure out what they're missing on their own.

This idea — sometimes called Socratic tutoring — has a solid research base.  The short version: when students explain their reasoning out loud, they either confirm that they understood it, or they catch their own mistake.  A good tutor creates those moments.  An AI that just delivers answers skips them entirely.

The tutor follows six core principles:

1. **See the problem first, then figure out where your student is.**  Before anything else, the tutor asks your student to share the actual problem.  Then it asks how far they got, and where they're stuck.  It doesn't start helping until it understands the situation.

2. **One question at a time.**  If your student has two errors in their work, the tutor addresses the more important one first, waits for them to work through it, and then moves on.  It doesn't pile on.

3. **Ask why, not just what.**  Instead of checking arithmetic, the tutor asks your student to explain their reasoning.  "Why did you use that equation?" gets further than "what did you get?"  The goal is for your student to hear themselves explain it — that's often when the mistake surfaces.

4. **Meet your student where they actually are.**  If your student got earlier parts of a problem right, the tutor doesn't re-quiz them on what they already know.  It works at the actual gap.  If your student is frustrated or overwhelmed, it backs off rather than pushing harder.

5. **When they're stuck in a loop, try a fresh problem.**  Sometimes a student can't spot an error because they're too close to their own work — the same way you miss a typo on your third re-read.  The tutor gives them the same type of problem with different numbers.  They'll do it correctly, and the contrast usually makes the original mistake obvious.

6. **Confirm each step, not just the final answer.**  The tutor checks in as your student walks through their work.  A quick "that step is right" after each correct move keeps them on track and tells them exactly where things went sideways when something's off.

The last step of every problem is always your student's.  The tutor will guide them right up to the edge, but it won't type out the answer.

---

## Quick start — three options

Before you start any option, you'll need an **Anthropic API key** for Options B and C.  Get one at [console.anthropic.com](https://console.anthropic.com).  Anthropic charges per use based on the number of tokens (roughly, words) processed.  The extended thinking mode this tutor uses costs more per session than a basic chat.  Check [Anthropic's pricing page](https://www.anthropic.com/pricing) so you know what to expect.  Option A (Claude Project) uses your existing Claude subscription instead.

---

### Option A: Claude Project (no code, no extra cost)

This is the fastest path.  It uses the Claude website directly — no server to run, no API key needed beyond your Claude subscription.

1. Go to [claude.ai](https://claude.ai) and sign in.
2. Click **Projects** in the left sidebar, then **New project**.
3. Open [`templates/tutor-prompt.md`](templates/tutor-prompt.md) in this repo.
4. At the top of the file, fill in the variables for your student: their grade level, the subjects you want covered, their pronouns, and a brief description of how they learn.
5. Copy everything from "Begin prompt" onward and paste it into the project's **Custom instructions** field.
6. Set the model to **Claude Sonnet 4.6 with extended thinking**.

That's it.  Hand your student the project link.  They'll see a clean chat interface.  You can watch the conversation in the project history.

**What you don't get with this option:** session history saved to a database, email transcripts sent to you automatically, or per-response feedback ratings.  For those, use Option B.

---

### Option B: Web app (self-hosted)

This runs the full application on your computer (or on a server — see [Deploying on Render](#deploying-on-render) below).  It gives you a chat interface at a web address, plus session history, email transcripts, and feedback tracking.

**Before you start:**  You'll need [Node.js](https://nodejs.org) version 20 or later installed.  If you're not sure whether you have it, open a terminal and run `node --version`.  If you see a version number starting with 20 or higher, you're set.

1. Download this repo.  If you have git installed:
   ```bash
   git clone https://github.com/schmimran/ai-tutor-toolkit.git
   cd ai-tutor-toolkit
   ```
   Or download the zip from GitHub and unzip it.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Export your API key:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

4. Build and start the server:
   ```bash
   npm run build
   npm run api
   ```

5. Open `http://localhost:3000` in your browser.  Your student gets a chat interface.  Your API key stays on your computer — it's never sent to the browser.

To also set up session history and email transcripts, continue to [Setting up the full experience](#setting-up-the-full-experience).

---

### Option C: CLI (terminal)

For parents comfortable in a terminal.  No web interface — you type your student's messages at a prompt and see the tutor's responses in the terminal.

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run build
npm run cli
```

Type `export` to print the transcript.  Type `quit` to exit.

---

## Setting up the full experience

The web app works with just an Anthropic API key.  To get session history saved to a database, email transcripts, and feedback tracking, you'll need to set up two additional services: **Supabase** (a free database) and **Resend** (email delivery).  Both have free tiers that are more than enough for a single student.

---

### Anthropic — AI access

1. Go to [console.anthropic.com](https://console.anthropic.com) and create an account.
2. Click **API Keys → Create Key**.
3. Copy the key.  You won't see it again.
4. Check [Anthropic's pricing page](https://www.anthropic.com/pricing) so you know what a session will cost.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

---

### Supabase — database

Supabase is a free hosted database.  The tutor uses it to store session transcripts, messages, and feedback ratings so nothing is lost if the server restarts.

**Step 1: Create a project**

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**.
3. Give it a name (e.g., `ai-tutor`), choose a region near you, and set a database password.  Wait about a minute for it to initialize.

**Step 2: Get your credentials**

1. In your project dashboard, go to **Settings → API**.
2. Copy the **Project URL** — this is your `SUPABASE_URL`.
3. Under **Project API keys**, copy the **service_role** key (the secret one, not `anon`) — this is your `SUPABASE_SERVICE_ROLE_KEY`.  Keep this key secret.  It has full access to your database.

**Step 3: Run the migrations**

Migrations are SQL scripts that create the database tables the app needs.  You run them once, in order.

In your Supabase project dashboard, open **SQL Editor** (in the left sidebar).  For each file below, copy its contents and click **Run**:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_soft_session_end.sql`
3. `supabase/migrations/003_feedback_message_id.sql`
4. `supabase/migrations/004_feedback_category.sql`
5. `supabase/migrations/005_token_tracking.sql`
6. `supabase/migrations/006_disclaimer_acceptances.sql`
7. `supabase/migrations/007_disclaimer_client_session_id.sql`

Run them in order.  Each one builds on the previous.

**Step 4: Export the variables**

```bash
export SUPABASE_URL=https://your-project-ref.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

### Resend — email

Resend sends you two types of emails: a transcript summary when a session ends, and a notification when your student submits feedback.  If you skip this setup, the app works fine — emails are silently skipped.

**Step 1: Create an account**

Go to [resend.com](https://resend.com) and sign up.

**Step 2: Add and verify a sending domain**

You need a domain you own to send from.  Resend can't send from Gmail, Yahoo, or other personal email addresses.

1. In Resend, go to **Domains → Add Domain**.
2. Enter a domain or subdomain you own (e.g., `tutor.yourdomain.com`).
3. Resend will show you a few DNS records to add — typically an SPF record and a DKIM record.  These are short text entries you add in wherever you manage your domain (Cloudflare, Namecheap, GoDaddy, etc.).  Resend walks you through exactly what to paste where.
4. DNS changes can take anywhere from five minutes to a few hours to propagate.  Once they're live, click **Verify** in Resend.

**Step 3: Generate an API key**

1. In Resend, go to **API Keys → Create API Key**.
2. Give it a name (e.g., `ai-tutor`).
3. Copy the key.  You won't see it again.

**Step 4: Export the variables**

```bash
export RESEND_API_KEY=re_...
export PARENT_EMAIL=you@yourdomain.com       # where transcripts go
export EMAIL_FROM=tutor@tutor.yourdomain.com # must match your verified domain
```

---

### Environment variables — full reference

| Variable | Required | Default | What it does |
|----------|----------|---------|--------------|
| `ANTHROPIC_API_KEY` | **yes** | — | Your Anthropic API key. |
| `SUPABASE_URL` | **yes (web app)** | — | Your Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes (web app)** | — | Supabase service role key.  Keep secret. |
| `RESEND_API_KEY` | no | — | Resend API key.  Emails skipped if absent. |
| `PARENT_EMAIL` | no | — | Where transcript and feedback emails are sent. |
| `EMAIL_FROM` | no | `tutor@tutor.schmim.com` | Sender address.  Must match a verified Resend domain. |
| `CORS_ORIGIN` | no | `*` | Allowed origin if you put the app behind a specific URL. |
| `MODEL` | no | `claude-sonnet-4-6` | Claude model ID. |
| `EXTENDED_THINKING` | no | `true` | Set to `false` to disable extended thinking (faster, lower cost, weaker tutoring quality). |
| `SYSTEM_PROMPT_PATH` | no | `examples/physics-geometry-9th-grade.md` | Path to the system prompt file, relative to the repo root. |
| `PORT` | no | `3000` | Port the server listens on. |

---

## Deploying on Render

Once the web app is working locally, you can put it online so your student can access it from any device — their laptop, their phone, anywhere.  [Render.com](https://render.com) is the recommended hosting service.  It has a free tier that covers a single low-traffic app.

See [docs/deployment.md](docs/deployment.md) for the full step-by-step walkthrough.

---

## How the tutor was built

This isn't a prompt someone typed into ChatGPT once and published.  The tutor went through five rounds of iteration, each one involving real test sessions, evaluation against a scoring rubric, and targeted changes based on what broke.

The biggest lesson: examples drive model behavior more than rules.  Every version of the prompt that used annotated examples of good and bad tutor judgment outperformed versions that used rule lists or decision trees.  When a stated principle conflicted with a demonstrated example, the model followed the example every time.

Full details are in the methodology docs:

- [docs/methodology.md](docs/methodology.md) — the eight-phase process for building a tutor from scratch
- [docs/model-selection.md](docs/model-selection.md) — why Sonnet with extended thinking, and what we tested against
- [docs/lessons-learned.md](docs/lessons-learned.md) — key findings from five real iterations

---

## Testing the tutor

The `tests/` folder contains character briefs for five simulated students.  Each brief describes a student's error, emotional state, and how they'd respond to different tutor moves.  You can use them to verify the tutor is working the way it should — without needing your actual student to sit through a test session.

See [tests/README.md](tests/README.md) for instructions on how to run a simulated session.

| Test file | What the student got wrong | Student's state |
|-----------|---------------------------|-----------------|
| `kinematics.md` | Wrong equation | Confused |
| `projectile-motion.md` | Buried vector error | Puzzled |
| `friction.md` | Forgot a force | Frustrated |
| `similar-triangles.md` | Wrong side correspondence | Confused |
| `pendulum.md` | Unit conversion miss | Overconfident |

---

## Key findings

These emerged from five iterations and eight test runs across four distinct scenarios:

- **Principles-based prompts outperform procedural ones.**  Decision trees and branching logic make the model rigid.  Short principles with annotated examples let the model use judgment.
- **The model follows examples over stated rules.**  If your example shows "walk me through your steps" but your principle says "ask why," the model will ask "walk me through your steps."  Always align your examples with your principles.
- **Sonnet with extended thinking is the sweet spot for tutoring.**  Opus is overkill.  Sonnet without extended thinking breaks on soft skills (stacks multiple questions, skips tone calibration).  Extended thinking gives the model a scratchpad to check its own behavior before responding.
- **The opening sequence matters more than anything else.**  See the problem → understand where the student is → then help.  If the tutor skips step one, everything downstream is guesswork.
- **A browser-based test harness works surprisingly well.**  Character briefs in the Chrome extension produced reliable, evaluable transcripts with zero setup friction.
- **The student's emotional state is a real variable.**  A frustrated student, an overconfident student, and a confused student all need different approaches.  The prompt can't branch for each case — but it can demonstrate good judgment through examples that cover the range.

---

## Roadmap

### Phase 1: CLI tutor ✅
Command-line interface with extended thinking, transcript export, and configurable system prompt.

### Phase 2: Web UI ✅
Express server with a single-page chat interface, file uploads, transcript export, session management, end-of-session email summaries (with session ID and token usage) sent to the parent via Resend, a live cumulative token counter in the header, a first-visit disclaimer overlay, and a full-page feedback review overlay that collects per-response ratings (Accuracy, Helpful, Tone) at session end.  Session data is retained in the database for analysis.

### Phase 3: Documentation and deployment ✅
CLAUDE.md, package READMEs, deployment config (render.yaml, docs/deployment.md).

### Phase 4: Parent configuration
A setup page where a parent can choose subject, grade level, tone, and student description — then preview the generated system prompt.

### Phase 5: Session review
Transcript review with automated evaluation checks and the ability to flag specific exchanges.

### Phase 6: Multi-student support
Multiple student profiles, each with their own tutor configuration and session history.

### Future: iOS app
A native mobile tutor interface.

---

## Project structure

If you're a developer looking at the code, here's how the repo is organized.  Everything runs as a single Node.js service (`apps/api`) that also serves the web frontend as a static file.

```
ai-tutor-toolkit/
├── package.json                          ← Workspace root (npm workspaces)
├── tsconfig.base.json                    ← Shared TypeScript config
├── render.yaml                           ← Render.com deployment config
├── CLAUDE.md                             ← Agent context (for AI contributors)
│
├── packages/                             ← Shared libraries
│   ├── core/                             ← @ai-tutor/core — tutor logic, Anthropic SDK wrapper
│   ├── db/                               ← @ai-tutor/db — Supabase client and CRUD
│   └── email/                            ← @ai-tutor/email — Resend email templates
│
├── apps/                                 ← Applications
│   ├── api/                              ← @ai-tutor/api — Express server + API routes
│   ├── web/                              ← @ai-tutor/web — Static single-file frontend
│   └── cli/                              ← @ai-tutor/cli — Terminal REPL
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql        ← DB schema (sessions, messages, feedback)
│       ├── 002_soft_session_end.sql      ← Adds ended_at; retains data after session end
│       ├── 003_feedback_message_id.sql   ← Links ratings to specific messages
│       ├── 004_feedback_category.sql     ← One row per feedback category per message
│       ├── 005_token_tracking.sql        ← Token usage columns on sessions and messages
│       ├── 006_disclaimer_acceptances.sql ← Disclaimer acceptance records
│       └── 007_disclaimer_client_session_id.sql ← Deferred FK backfill support
│
├── templates/
│   ├── tutor-prompt.md                   ← Parameterized tutor prompt (customize this)
│   └── evaluation-checklist.md          ← Scoring rubric for test evaluation
│
├── examples/
│   └── physics-geometry-9th-grade.md    ← Real production prompt
│
├── tests/
│   ├── README.md                         ← Test harness usage
│   └── *.md                              ← Student character briefs
│
└── docs/
    ├── methodology.md                    ← How to build a tutor from scratch
    ├── model-selection.md               ← Model and extended thinking analysis
    ├── lessons-learned.md               ← Key findings from five iterations
    └── deployment.md                    ← Render and local deployment instructions
```

---

## Prior art and references

- [Khan Academy: How We Built AI Tutoring Tools](https://blog.khanacademy.org/how-we-built-ai-tutoring-tools/)
- [Khan Academy: 7-Step Approach to Prompt Engineering](https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo/)
- [The Socratic Prompt: How to Make a Language Model Stop Guessing and Start Thinking](https://towardsai.net/p/machine-learning/the-socratic-prompt-how-to-make-a-language-model-stop-guessing-and-start-thinking)
- [AI Socratic Tutors: Teaching The World To Think](https://aicompetence.org/ai-socratic-tutors/)

---

## Contributing

This started as a one-evening project for one student.  If you adapt it for your own kid, a different subject, or a different grade level, open a PR with your findings.  The methodology docs are where the real value is — the more examples of the iterate-and-test loop, the better.

## License

MIT.  Do whatever you want with it.
