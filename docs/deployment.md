# Deployment Guide

This document covers two deployment targets:

1. [Render.com](#rendercom) — recommended for most users
2. [Local development](#local-development)

No `.env` files are committed.  All secrets come from the deployment platform's secret store or your shell environment.

---

## Render.com

### Prerequisites

- A [Render](https://render.com) account
- This repo pushed to a GitHub repository you control
- A Supabase project with all migrations applied (see root README)
- A Resend account with a verified sending domain (see root README)

### Step 1: Create a Web Service

1. In Render, click **New → Web Service**.
2. Connect your GitHub repository.
3. Give the service a name (e.g., `ai-tutor`).

### Step 2: Configure the build

Render will detect `render.yaml` in the repo root and pre-fill the service configuration.  If creating manually:

1. Under **Runtime**, select **Node**.
2. Set **Build Command** to `npm install && npm run build`.
3. Set **Start Command** to `npm run api`.

### Step 3: Set environment variables

In the **Environment** section, add the following key/value pairs.  Do not use a `.env` file.

| Key | Value | Required |
|-----|-------|----------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key | **yes** |
| `SUPABASE_URL` | Your Supabase project URL | **yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | **yes** |
| `RESEND_API_KEY` | Your Resend API key | no (disables email) |
| `PARENT_EMAIL` | Email address to receive transcripts | no (disables email) |
| `EMAIL_FROM` | Sender address (verified Resend domain) | no |
| `CORS_ORIGIN` | Your app URL (e.g., `https://ai-tutor.onrender.com`) | no (defaults to `*`) |
| `PORT` | `3000` | no (Render sets this automatically) |

Mark `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` as **Secret** in the Render UI.

### Step 4: Set the health check path

Under **Advanced**, set **Health Check Path** to `/api/config`.

### Step 5: Deploy

Click **Create Web Service**.  Render will:
1. Pull your repo
2. Run the build command (`npm install && npm run build`)
3. Start the server (`npm run api`)
4. Route traffic once the health check passes

Subsequent pushes to your main branch trigger automatic rebuilds if **Auto-Deploy** is enabled.

### Using render.yaml

The recommended approach uses the `render.yaml` in the repo root:

1. In Render, click **New → Blueprint**.
2. Connect your repository.
3. Render will detect `render.yaml` and pre-fill the service configuration.
4. Set secret env vars when prompted (vars marked `sync: false` require manual entry).

---

## AWS

AWS deployment is not currently configured.  See the project roadmap for planned deployment targets.

---

## Local development

### Prerequisites

- Node.js 20+
- npm 10+

### Setup

```bash
# Install all workspace dependencies
npm install

# Build all TypeScript packages
npm run build
```

### Supabase migrations

Apply all migrations in order via the Supabase dashboard SQL editor or CLI:

1. `supabase/migrations/001_initial_schema.sql` — creates sessions, messages, feedback tables
2. `supabase/migrations/002_soft_session_end.sql` — adds `ended_at` column for data retention
3. `supabase/migrations/003_feedback_message_id.sql` — adds `message_id` FK to feedback; links ratings to messages
4. `supabase/migrations/004_feedback_category.sql` — adds `category` column; one row per category per message
5. `supabase/migrations/005_token_tracking.sql` — adds token usage columns to sessions and messages
6. `supabase/migrations/006_disclaimer_acceptances.sql` — creates disclaimer_acceptances table
7. `supabase/migrations/007_disclaimer_client_session_id.sql` — adds client_session_id for deferred FK backfill

> **Maintenance note:** When a new migration is added to `supabase/migrations/`, update this list and the schema reference in `CLAUDE.md`.

### Environment variables

Do not create `.env` files.  Export variables in your shell session:

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# Required for the API server
export SUPABASE_URL=https://your-project-ref.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional — emails are silently skipped if absent
export RESEND_API_KEY=re_...
export PARENT_EMAIL=you@example.com
export EMAIL_FROM=tutor@yourdomain.com
```

To persist across terminal sessions, add the exports to your `~/.zshrc` or `~/.bashrc`.

### Running the web interface

```bash
npm run api
# Open http://localhost:3000
```

### Running in watch mode

```bash
npm run dev
# Rebuilds and restarts on source changes
```

### Running the CLI

```bash
npm run cli
```

### Running tests

The test harness uses character briefs in `tests/` with the Claude Chrome extension or manual interaction.  See [tests/README.md](../tests/README.md) for instructions.

There are no automated unit or integration tests in this repo (yet).
