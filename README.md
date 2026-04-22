# AI Tutor Toolkit

A homework tutor for your student, built on the same principles as Khan Academy's Khanmigo.  One parent built this for his 9th grader because he wanted something that would actually teach — not just hand over answers.  It has gone through multiple rounds of real-world testing with a real student.  This is the result.

---

## What the tutor does

Most AI tools will give your student the answer if they ask for it.  This tutor won't.  It's designed around a question-first approach: instead of solving the problem for your student, it asks questions that help them figure out what they're missing on their own.

This idea — sometimes called Socratic tutoring — has a solid research base.  The short version: when students explain their reasoning out loud, they either confirm that they understood it, or they catch their own mistake.  A good tutor creates those moments.  An AI that just delivers answers skips them entirely.

The last step of every problem is always your student's.  The tutor will guide them right up to the edge, but it won't type out the answer.

---

## Quick start — three options

Before you start any option, you'll need an **Anthropic API key** for Options B and C.  Get one at [platform.claude.com](https://platform.claude.com).  Anthropic charges per use based on the number of tokens (roughly, words) processed.  The extended thinking mode this tutor uses costs more per session than a basic chat.  Check [Anthropic's pricing page](https://claude.com/pricing) so you know what to expect.  Option A (Claude Project) uses your existing Claude subscription instead.

---

### Option A: Claude Project (no code, no extra cost)

This is the fastest path.  It uses the Claude website directly — no server to run, no API key needed beyond your Claude subscription.

1. Go to [claude.ai](https://claude.ai) and sign in.
2. Click **Projects** in the left sidebar, then **New project**.
3. Open [`templates/tutor-prompt-v7.md`](templates/tutor-prompt-v7.md) in this repo.
4. Copy the entire file and paste it into the project's **Custom instructions** field.  Then open [`templates/system-instructions.md`](templates/system-instructions.md), copy its contents, and paste them at the bottom of the Custom instructions field, separated by a line containing only `-----`.  The combined text is ready to use — no variables to fill in.
5. Set the model to **Claude Sonnet 4.6 with extended thinking**.

That's it.  Hand your student the project link.  They'll see a clean chat interface.  You can watch the conversation in the project history.

**What you don't get with this option:** session history saved to a database, email transcripts sent to you automatically, or end-of-session feedback collection.  For those, use Option B.

---

### Option B: Web app (self-hosted)

This runs the full application on your computer (or on a server — see [Deploying on Render](#deploying-on-render) below).  It gives you a chat interface at a web address, plus session history, email transcripts, and feedback tracking.

The web app requires three services to run: **Anthropic** (AI), **Supabase** (database and authentication), and a **Supabase anon key** for the login flow.  Email transcripts via **Resend** are optional.

**Before you start:**  You'll need [Node.js](https://nodejs.org) version 20 or later installed.  If you're not sure whether you have it, open a terminal and run `node --version`.  If you see a version number starting with 20 or higher, you're set.

**Step 1: Download and install**

```bash
git clone https://github.com/schmimran/ai-tutor-toolkit.git
cd ai-tutor-toolkit
npm install
```

Or download the zip from GitHub and unzip it.

**Step 2: Set up Anthropic**

1. Go to [platform.claude.com](https://platform.claude.com) and create an account.
2. Click **API Keys → Create Key**.
3. Copy the key.  You won't see it again.
4. Check [Anthropic's pricing page](https://claude.com/pricing) so you know what a session will cost.

**Step 3: Set up Supabase**

The web app stores session transcripts, messages, and feedback in a database so nothing is lost if the server restarts.  Supabase provides a free hosted Postgres database.

Follow the instructions in [Setting up Supabase](#setting-up-supabase) below, then come back here.

**Step 4: Set up the Supabase anon key**

In your Supabase project dashboard, go to **Settings → API**.  Copy the **anon/public** key (not the service_role key — you already have that from Step 3).  This key is used server-side for the login flow and is never exposed to the browser.

**Step 5: Export environment variables**

The fastest way is to copy the env template and edit it: `cp env.sh.template env.sh`, fill in the values, then `source env.sh`.  The block below shows what each variable is.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export SUPABASE_URL=https://your-project-ref.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
export SUPABASE_ANON_KEY=eyJ...
```

**Step 6: Build and start**

```bash
npm run build
npm run api
```

**Step 7: Open and verify**

Open `http://localhost:3000` in your browser.  You'll see the login page — register an account or sign in.  Your student gets a chat interface.  Your API key stays on your computer — it's never sent to the browser.

To get email transcripts sent to you when sessions end, continue to [Optional: email transcripts](#optional-email-transcripts).

---

### Option C: CLI (terminal)

For parents comfortable in a terminal.  No web interface — you type your student's messages at a prompt and see the tutor's responses in the terminal.  Does not require Supabase or user accounts.  You'll need [Node.js](https://nodejs.org) version 20 or later installed (same as Option B).

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run build
npm run cli
```

Type `export` to print the transcript.  Type `quit` to exit.

---

## Tutoring approach

The tutor follows six core principles:

1. **See the problem first, then figure out where your student is.**  Before anything else, the tutor asks your student to share the actual problem.  Then it asks how far they got, and where they're stuck.  It doesn't start helping until it understands the situation.

2. **One question at a time.**  If your student has two errors in their work, the tutor addresses the more important one first, waits for them to work through it, and then moves on.  It doesn't pile on.

3. **Ask why, not just what.**  Instead of checking arithmetic, the tutor asks your student to explain their reasoning.  "Why did you use that equation?" gets further than "what did you get?"  The goal is for your student to hear themselves explain it — that's often when the mistake surfaces.

4. **Meet your student where they actually are.**  If your student got earlier parts of a problem right, the tutor doesn't re-quiz them on what they already know.  It works at the actual gap.  If your student is frustrated or overwhelmed, it backs off rather than pushing harder.

5. **When they're stuck in a loop, try a fresh problem.**  Sometimes a student can't spot an error because they're too close to their own work — the same way you miss a typo on your third re-read.  The tutor gives them the same type of problem with different numbers.  They'll do it correctly, and the contrast usually makes the original mistake obvious.

6. **Confirm each step, not just the final answer.**  The tutor checks in as your student walks through their work.  A quick "that step is right" after each correct move keeps them on track and tells them exactly where things went sideways when something's off.

These principles are a simplified summary for parents.  The tutor prompt implements them through a more detailed structure — see [`templates/tutor-prompt-v7.md`](templates/tutor-prompt-v7.md) for the full specification.

---

## Setting up Supabase

Supabase is a free hosted database.  The web app requires it — the server will not start without it.

**Step 1: Create a project**

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**.
3. Give it a name (e.g., `ai-tutor`), choose a region near you, and set a database password.  Wait about a minute for it to initialize.

**Step 2: Get your credentials**

1. In your project dashboard, go to **Settings → API**.
2. Copy the **Project URL** — this is your `SUPABASE_URL`.
3. Under **Project API keys**, copy the **service_role** key (the secret one) — this is your `SUPABASE_SERVICE_ROLE_KEY`.  Keep this key secret.  It has full access to your database.
4. Also copy the **anon/public** key — this is your `SUPABASE_ANON_KEY`.  It is used server-side for the login flow.

**Step 3: Run the schema migrations**

The migrations create the database tables the app needs.  Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then run `supabase link --project-ref <your-ref>` once before running the push.  From the repo root:

```bash
supabase db push
```

Or, if you prefer the SQL editor: open each file in `supabase/migrations/` in the Supabase SQL Editor in order (by filename) and click **Run** for each.  See [docs/deployment.md](docs/deployment.md) for full step-by-step instructions.

Done?  [Continue to Step 5: Export environment variables](#option-b-web-app-self-hosted).

---

## Optional: email transcripts

Resend sends you a transcript email when a session ends, including the full conversation, an automated evaluation, and any student feedback.  If you skip this setup, the app works fine — emails are silently skipped.

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
export ADMIN_EMAIL=you@yourdomain.com        # where admin transcripts go
export EMAIL_FROM=tutor@tutor.yourdomain.com # must match your verified domain
```

Done?  [Continue to Deploying on Render](#deploying-on-render) or [Behind the scenes](#behind-the-scenes).

---

For the full environment variable reference with defaults, see [CLAUDE.md](CLAUDE.md#configsecrets-management) or [docs/deployment.md](docs/deployment.md).

---

## Deploying on Render

Once the web app is working locally, you can put it online so your student can access it from any device — their laptop, their phone, anywhere.  [Render.com](https://render.com) is the recommended hosting service.  It has a free tier that covers a single low-traffic app.

See [docs/deployment.md](docs/deployment.md) for the full step-by-step walkthrough.

---

## Behind the scenes

Everything below is for developers, contributors, or anyone curious about how the tutor was built and how to test it.

---

## How the tutor was built

This isn't a prompt someone typed into ChatGPT once and published.  The tutor went through multiple rounds of iteration, each one involving real test sessions, evaluation against a scoring rubric, and targeted changes based on what broke.

The biggest lesson: examples drive model behavior more than rules.  Every version of the prompt that used annotated examples of good and bad tutor judgment outperformed versions that used rule lists or decision trees.  When a stated principle conflicted with a demonstrated example, the model followed the example every time.

Full details are in the methodology docs:

- [docs/methodology.md](docs/methodology.md) — how to build and iterate on a tutor prompt
- [docs/model-selection.md](docs/model-selection.md) — model comparison and why Sonnet with extended thinking
- [docs/lessons-learned.md](docs/lessons-learned.md) — key findings from building and testing this tutor

---

## Testing the tutor

The `tests/` folder contains character briefs for five simulated students.  Each brief describes a student's error, emotional state, and how they'd respond to different tutor moves.  You can use them to verify the tutor is working the way it should — without needing your actual student to sit through a test session.

See [tests/README.md](tests/README.md) for instructions on how to run a simulated session.

| Test file | What the student got wrong | Student's state |
|-----------|---------------------------|-----------------|
| [kinematics.md](tests/kinematics.md) | Wrong equation | Confused |
| [projectile-motion.md](tests/projectile-motion.md) | Buried vector error | Puzzled |
| [friction.md](tests/friction.md) | Forgot a force | Frustrated |
| [similar-triangles.md](tests/similar-triangles.md) | Wrong side correspondence | Confused |
| [pendulum.md](tests/pendulum.md) | Unit conversion miss | Overconfident |

---

## Key findings

These emerged from multiple iterations and test runs across distinct scenarios:

- **Principles-based prompts outperform procedural ones.**  Decision trees and branching logic make the model rigid.  Short principles with annotated examples let the model use judgment.
- **The model follows examples over stated rules.**  If your example shows "walk me through your steps" but your principle says "ask why," the model will ask "walk me through your steps."  Always align your examples with your principles.
- **Sonnet with extended thinking is the sweet spot for tutoring.**  Opus is overkill.  Sonnet without extended thinking breaks on soft skills (stacks multiple questions, skips tone calibration).  Extended thinking gives the model a scratchpad to check its own behavior before responding.
- **The opening sequence matters more than anything else.**  See the problem → understand where the student is → then help.  If the tutor skips step one, everything downstream is guesswork.
- **A browser-based test harness works surprisingly well.**  Character briefs in the Chrome extension produced reliable, evaluable transcripts with zero setup friction.
- **The student's emotional state is a real variable.**  A frustrated student, an overconfident student, and a confused student all need different approaches.  The prompt can't branch for each case — but it can demonstrate good judgment through examples that cover the range.

---

## Project structure

Everything runs as a single Node.js service (`apps/api`) that also serves the web frontend as a static file.

```
ai-tutor-toolkit/
├── package.json                          ← Workspace root (npm workspaces)
├── tsconfig.base.json                    ← Shared TypeScript config
├── CLAUDE.md                             ← Agent context (for AI contributors)
├── env.sh.template                       ← Template for local environment variable setup
│
├── packages/                             ← Shared libraries
│   ├── core/                             ← [@ai-tutor/core](packages/core/README.md) — tutor logic, Anthropic SDK wrapper
│   ├── db/                               ← [@ai-tutor/db](packages/db/README.md) — Supabase client and CRUD
│   └── email/                            ← [@ai-tutor/email](packages/email/README.md) — Resend email templates
│
├── apps/                                 ← Applications
│   ├── api/                              ← [@ai-tutor/api](apps/api/README.md) — Express server + API routes
│   ├── web/                              ← [@ai-tutor/web](apps/web/README.md) — Static frontend (chat + auth/account surfaces)
│   ├── cli/                              ← [@ai-tutor/cli](apps/cli/README.md) — Terminal REPL
│   └── ios/                              ← [@ai-tutor/ios](apps/ios/README.md) — Native iOS client (placeholder)
│
├── supabase/
│   ├── config.toml                       ← Supabase CLI local development config
│   └── migrations/                       ← Sequential SQL migrations (run via `supabase db push`)
│
├── templates/
│   ├── tutor-prompt-v7.md                  ← Production tutor prompt (current)
│   ├── tutor-prompt-v6.md                  ← Previous version (retained as rollback)
│   ├── system-instructions.md              ← Global protocol instructions appended to every prompt at runtime
│   ├── evaluation-checklist.md             ← Scoring rubric for test evaluation
│   └── physics-geometry-9th-grade-v6.md    ← Previous production prompt (retained)
│
├── tests/
│   ├── [README.md](tests/README.md)        ← Test harness usage
│   └── *.md                                ← Student character briefs
│
└── docs/
    ├── [methodology.md](docs/methodology.md)            ← Prompt development methodology
    ├── [model-selection.md](docs/model-selection.md)    ← Model selection analysis
    ├── [lessons-learned.md](docs/lessons-learned.md)    ← Key findings
    ├── [deployment.md](docs/deployment.md)              ← Render and local deployment instructions
    ├── [ui-style-guide.md](docs/ui-style-guide.md)      ← Frontend palette, typography, component specs
    └── archive/                                         ← Archived v1 documentation
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

**Before opening a PR:**

- Read [CLAUDE.md](CLAUDE.md) for architecture decisions, the database schema, and consistency rules.
- Follow the [Local development](docs/deployment.md#local-development) instructions to get the app running on your machine.
- Branch from `main` using a descriptive name (`feature/<short-description>` or `fix/<short-description>`).
- Run `npm run build` and `npm run api` from the repo root before opening a PR — verify the app starts cleanly.
- There are no automated unit tests.  Verification is via the character briefs in [`tests/`](tests/README.md); run a simulated session before claiming a behavior change works.

## License

MIT.  Do whatever you want with it.
