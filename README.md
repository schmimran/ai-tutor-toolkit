# AI Tutor Toolkit

A framework for building, testing, and iterating on AI-powered homework tutors using Claude.

Built by a parent who wanted a better homework helper for his 9th grader — and discovered that building a good AI tutor is mostly about building a good feedback loop.

## What this is

This repo contains three things:

1. **A parameterized tutor prompt** that you can customize for any student, subject, and grade level.  It's built on principles from Khan Academy's Khanmigo research, Socratic tutoring literature, and five rounds of real-world iteration.

2. **A test harness** using Claude's Chrome extension to simulate student interactions and evaluate tutor behavior — without needing an actual student in the loop.

3. **Working tutor apps** — a CLI and a web interface, powered by the Anthropic SDK with extended thinking enabled by default.  Run `npm run api` from the repo root and hand your student a browser.

## The core insight

**Examples drive model behavior more than rules.**  We went through five prompt versions.  The biggest improvements came not from adding principles or "never do this" lists, but from showing the model annotated examples of good and bad judgment.  When a stated principle conflicted with a demonstrated example, the model followed the example every time.

---

## Quick start

### Option A: Claude Project (no code required)

1. Go to [claude.ai](https://claude.ai), create a new Project.
2. Paste the contents of [`templates/tutor-prompt.md`](templates/tutor-prompt.md) into the custom instructions.  Customize the variables at the top.
3. Set the model to **Sonnet 4.6 with extended thinking**.

### Option B: Web app

```bash
npm install

# Export required env vars (see Environment variables below)
export ANTHROPIC_API_KEY=sk-ant-...

# Start the API server (also serves the web frontend)
npm run api
```

Open `http://localhost:3000`.  Your student gets a chat interface.  Your API key stays server-side.

### Option C: CLI

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run cli
```

Type your student's messages at the prompt.  Type `export` to print the transcript.  Type `quit` to exit.

### Option D: API only

The API server exposes REST endpoints under `/api/`.  See [apps/api/README.md](apps/api/README.md) for the full endpoint reference.

---

## Third-party setup

### Supabase (Postgres database)

Supabase is used as a managed Postgres database.  The toolkit uses it for three tables: `sessions`, `messages`, and `feedback`.  No Edge Functions, no Realtime, no Storage.

If you skip Supabase setup, the API server still runs and the web/CLI interfaces still work — sessions just won't be persisted between server restarts and no transcript history will be available.

**Step 1: Create a Supabase project**

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**.
3. Give it a name (e.g., `ai-tutor`), choose a region close to you, and set a database password.
4. Wait for the project to initialize (about 1 minute).

**Step 2: Get your credentials**

1. In your Supabase project dashboard, go to **Settings → API**.
2. Copy the **Project URL** — this is your `SUPABASE_URL`.
3. Under **Project API keys**, copy the **service_role** key (the secret one, not `anon`) — this is your `SUPABASE_SERVICE_ROLE_KEY`.

Keep the service role key secret.  It bypasses row-level security and has full database access.

**Step 3: Run the migration**

Open **SQL Editor** in your Supabase dashboard, paste the contents of `supabase/migrations/001_initial_schema.sql`, and click **Run**.

Alternatively, if you have the [Supabase CLI](https://supabase.com/docs/guides/cli) installed:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

**Step 4: Set environment variables**

```bash
export SUPABASE_URL=https://your-project-ref.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

### Resend (outbound email)

Resend sends two types of emails: session transcript summaries (to the parent) and feedback notifications.  If you skip this setup, the app works fine — emails are just silently skipped.

**Step 1: Create a Resend account**

Go to [resend.com](https://resend.com) and sign up.

**Step 2: Add and verify your sending domain**

You need to send from a domain you own.  Resend cannot send from Gmail/Yahoo/etc.

1. In Resend, go to **Domains → Add Domain**.
2. Enter your domain (e.g., `tutor.yourdomain.com`).
3. Resend will show you DNS records to add:
   - An SPF `TXT` record
   - A DKIM `TXT` record
   - Optionally a DMARC `TXT` record
4. Add these records in your DNS provider (Cloudflare, Route 53, Namecheap, etc.).
5. DNS propagation takes 5 minutes to 48 hours.  Click **Verify** in Resend when you're ready.

**Step 3: Generate an API key**

1. In Resend, go to **API Keys → Create API Key**.
2. Give it a name (e.g., `ai-tutor-production`).
3. Copy the key — you won't see it again.

**Step 4: Set environment variables**

```bash
export RESEND_API_KEY=re_...
export PARENT_EMAIL=you@yourdomain.com   # where transcripts are sent
export EMAIL_FROM=tutor@tutor.yourdomain.com  # must match verified domain
```

---

## Monorepo structure

```
ai-tutor-toolkit/
├── package.json                          ← Workspace root (npm workspaces)
├── tsconfig.base.json                    ← Shared TypeScript config
├── Dockerfile                            ← Multi-stage production build
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
│   ├── web/                              ← @ai-tutor/web — Static single-file SPA
│   └── cli/                              ← @ai-tutor/cli — Terminal REPL
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql        ← DB schema (sessions, messages, feedback)
│
├── templates/
│   ├── tutor-prompt.md                   ← Parameterized tutor prompt (customize this)
│   └── evaluation-checklist.md           ← Scoring rubric for test evaluation
│
├── examples/
│   └── physics-geometry-9th-grade.md     ← Real production prompt
│
├── tests/
│   ├── README.md                         ← Test harness usage
│   ├── kinematics.md                     ← Wrong equation, confused student
│   ├── projectile-motion.md              ← Buried vector error, puzzled student
│   ├── friction.md                       ← Frustrated/defeated student
│   ├── similar-triangles.md              ← Geometry, conceptual error
│   └── pendulum.md                       ← Overconfident student
│
└── docs/
    ├── methodology.md                    ← How to build a tutor from scratch
    ├── model-selection.md                ← Sonnet vs Opus, extended thinking analysis
    ├── lessons-learned.md                ← Key findings from five iterations
    └── deployment.md                     ← Render, AWS, and local deployment instructions
```

---

## Technology stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| AI | Claude (Anthropic SDK) | Sonnet 4.6, extended thinking enabled |
| API server | Express | TypeScript, SSE streaming |
| Frontend | Plain HTML/CSS/JS | No framework, no build step |
| Math rendering | KaTeX (CDN) | LaTeX in tutor responses |
| Markdown | marked (CDN) | Markdown in tutor responses |
| Database | Supabase (Postgres) | Sessions, messages, feedback |
| Email | Resend | Transcript and feedback emails |
| File uploads | multer | Images and PDFs up to 10 MB each |
| Geolocation | geoip-lite | Client IP to city/country (local lookup) |
| Language | TypeScript | Node 20+, strict mode |
| Build | tsc --build | Composite projects, incremental |
| Package management | npm workspaces | Monorepo, single node_modules |
| Containerization | Docker | Multi-stage build |
| Deployment | Render (primary) | Also documented for AWS ECS Fargate |

---

## Environment variables reference

| Variable | Required | Default | Used by | Description |
|----------|----------|---------|---------|-------------|
| `ANTHROPIC_API_KEY` | **yes** | — | api, cli | Your Anthropic API key. Get it at [console.anthropic.com](https://console.anthropic.com). |
| `SUPABASE_URL` | no | — | api | Your Supabase project URL. **Settings → API → Project URL**. |
| `SUPABASE_SERVICE_ROLE_KEY` | no | — | api | Supabase service role key. **Settings → API → service_role**. Keep secret. |
| `RESEND_API_KEY` | no | — | api | Resend API key. **API Keys → Create API Key** in Resend dashboard. |
| `PARENT_EMAIL` | no | — | api | Email address where transcripts and feedback notifications are sent. |
| `EMAIL_FROM` | no | `tutor@tutor.schmim.com` | api | Sender address. Must match a verified Resend domain. |
| `CORS_ORIGIN` | no | `*` | api | Allowed CORS origin (e.g., `https://yourapp.com`). |
| `MODEL` | no | `claude-sonnet-4-6` | core | Claude model ID. |
| `EXTENDED_THINKING` | no | `true` | core | Set to `false` to disable extended thinking (faster, lower cost, weaker soft skills). |
| `SYSTEM_PROMPT_PATH` | no | `templates/tutor-prompt.md` | core | Path to the system prompt file, relative to the repo root. |
| `PORT` | no | `3000` | api | HTTP listen port. |

---

## Deployment

### Local development

```bash
# Install all workspace dependencies
npm install

# Export environment variables (no .env files)
export ANTHROPIC_API_KEY=sk-ant-...
export SUPABASE_URL=https://...supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
export RESEND_API_KEY=re_...
export PARENT_EMAIL=you@example.com

# Build all TypeScript packages
npm run build

# Start API server (serves web frontend at http://localhost:3000)
npm run api

# Or start in watch mode (rebuilds on changes)
npm run dev
```

### Render.com

See [docs/deployment.md](docs/deployment.md) for step-by-step Render deployment instructions.

Quick version:
1. Push this repo to GitHub.
2. Create a new **Web Service** on Render, connect your repo.
3. Set **Runtime** to **Docker**.
4. Add all required environment variables in Render's dashboard.
5. Deploy.

### AWS ECS Fargate

See [docs/deployment.md](docs/deployment.md) for the full AWS deployment guide, including ECS task definition, ALB setup, and secrets in SSM Parameter Store.

---

## Testing

Use the character briefs in [`tests/`](tests/) to simulate student sessions.

### Using the Claude Chrome extension (recommended)

1. Install the Claude Chrome extension.
2. Configure a shortcut pointing to your Claude Project.
3. Set the shortcut's instructions to the content of a test file (e.g., `tests/kinematics.md`).
4. Run it.  The extension plays the student role and captures the transcript.
5. Evaluate with the checklist in `templates/evaluation-checklist.md`.

### Manual testing

1. Open your Claude Project or the web app.
2. Play the student role yourself, following the character brief.
3. Evaluate responses against the checklist.

### Test scenarios

| File | Error type | Student state | Tests |
|------|-----------|--------------|-------|
| `kinematics.md` | Wrong equation | Confused | Basic opening sequence, error diagnosis |
| `projectile-motion.md` | Buried vector error | Puzzled | Step-by-step confirmation, finding hidden error |
| `friction.md` | Forgot a force | Frustrated | Emotional adaptation, not lecturing |
| `similar-triangles.md` | Wrong side correspondence | Confused | Geometry handling, conceptual vs arithmetic |
| `pendulum.md` | Unit conversion miss | Overconfident | Respectful pushback, not caving |

---

## Methodology docs

- [docs/methodology.md](docs/methodology.md) — Eight-phase process for building a tutor from scratch
- [docs/model-selection.md](docs/model-selection.md) — Sonnet vs Opus, extended thinking analysis
- [docs/lessons-learned.md](docs/lessons-learned.md) — Key findings from five real iterations

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
Express server with a single-page chat interface, file uploads, transcript export, session management, and end-of-session email summaries sent to the parent via Resend.

### Phase 3: Documentation and deployment ✅
CLAUDE.md, package READMEs, deployment files (Dockerfile, render.yaml, docs/deployment.md).

### Phase 4: Parent configuration
A setup page where a parent can choose subject, grade level, tone, and student description — then preview the generated system prompt.

### Phase 5: Session review
Transcript review with automated evaluation checks and the ability to flag specific exchanges.

### Phase 6: Multi-student support
Multiple student profiles, each with their own tutor configuration and session history.

### Future: iOS app
A native mobile tutor interface.

---

## Prior art and references

- [Khan Academy: How We Built AI Tutoring Tools](https://blog.khanacademy.org/how-we-built-ai-tutoring-tools/)
- [Khan Academy: 7-Step Approach to Prompt Engineering](https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo/)
- [The Socratic Prompt: How to Make a Language Model Stop Guessing and Start Thinking](https://towardsai.net/p/machine-learning/the-socratic-prompt-how-to-make-a-language-model-stop-guessing-and-start-thinking)
- [AI Socratic Tutors: Teaching The World To Think](https://aicompetence.org/ai-socratic-tutors/)

---

## Contributing

This started as a one-evening project for one student.  If you adapt it for your own kid, a different subject, or a different grade level, open a PR with your findings.  The methodology section of the docs is where the real value is — the more examples of the iterate-and-test loop, the better.

## License

MIT.  Do whatever you want with it.
