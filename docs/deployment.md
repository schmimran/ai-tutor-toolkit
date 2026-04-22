# Deployment Guide

This guide covers two scenarios:

1. [Deploying on Render.com](#deploying-on-rendercom) — put the app online so your student can access it from any device
2. [Running locally](#local-development) — run the app on your own computer

No `.env` files are committed to this repo.  All secrets come from the deployment platform or your shell.

---

## Deploying on Render.com

Render is a hosting service that runs the app on a server in the cloud.  It has a free tier that covers a single low-traffic app.

### Prerequisites

Before you start, make sure you have:

- A GitHub account, with this repo forked or pushed to a repository you control
- A [Render account](https://render.com) (free to sign up)
- An Anthropic API key — get one at [platform.claude.com](https://platform.claude.com)
- A Supabase project with all migrations applied — see the [Supabase setup section](../README.md#setting-up-supabase) in the main README
- A Resend account with a verified sending domain — see the [email transcripts section](../README.md#optional-email-transcripts) in the main README (optional, but required for email transcripts)

### Step 1: Create a Web Service

1. Sign in to [Render](https://render.com).
2. Click **New → Web Service**.
3. Click **Connect a repository** and select your GitHub repo.  You may need to grant Render access to your GitHub account the first time.
4. Give the service a name (e.g., `ai-tutor`).

### Step 2: Configure build settings

On the configuration page:

1. Under **Runtime**, select **Node**.
2. Set **Build Command** to:
   ```
   npm install && npm run build
   ```
3. Set **Start Command** to:
   ```
   npm run api
   ```

### Step 3: Set environment variables

Scroll down to the **Environment Variables** section.  Add each variable below as a key/value pair.

| Variable | Required | Where to find the value | Mark as Secret? |
|----------|----------|-------------------------|-----------------|
| `ANTHROPIC_API_KEY` | **yes** | [platform.claude.com](https://platform.claude.com) → API Keys | **Yes** |
| `SUPABASE_URL` | **yes** | Supabase dashboard → Settings → API → Project URL | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase dashboard → Settings → API → service_role key | **Yes** |
| `SUPABASE_ANON_KEY` | **yes** | Supabase dashboard → Settings → API → anon/public key. Required for the Supabase auth flow that gates the app at `/login.html`. If unset, the auth router is not registered and users cannot log in. | **Yes** |
| `RESEND_API_KEY` | no | Resend dashboard → API Keys | **Yes** |
| `ADMIN_EMAIL` | no | Your email address (where admin transcript/evaluation emails are sent). | No |
| `EMAIL_FROM` | no | Your verified sending address (e.g., `tutor@yourdomain.com`) | No |
| `CONTACT_EMAIL` | no | Contact email shown on the login page and returned by GET /api/config. Defaults to `""` — required before going public. The contact line is hidden when absent. | No |
| `MODEL` | no | Default: `claude-sonnet-4-6` | No |
| `EXTENDED_THINKING` | no | Default: `true`; set `false` to disable | No |
| `EVALUATION_MODEL` | no | Default: `claude-haiku-4-5-20251001`. Claude model ID used by the admin-gated batch transcript evaluator. | No |
| `SYSTEM_PROMPT_PATH` | no | Default: `templates/tutor-prompt-v7.md` | No |
| `CORS_ORIGIN` | no | Default: `false` (fail-closed). When unset, all cross-origin requests are rejected. Set explicitly to your Render app URL once deployed (e.g., `https://ai-tutor.onrender.com`). Required for every deployment that serves cross-origin traffic. | No |
| `ALLOW_PROMPT_SELECTION` | no | Set to `true` to enable the in-app prompt-version picker. Omit (or set to anything else) to lock the picker. Defaults fail-closed. | No |

You can skip `RESEND_API_KEY`, `ADMIN_EMAIL`, and `EMAIL_FROM` if you don't want email transcripts.  The app will work without them.

> **Migration ordering:** migration `006_auto_evaluate.sql` adds the `evaluated` column used by the post-evaluation write. Migration `007_evaluation_batches.sql` adds the `evaluation_batches` table used by the admin-gated batched evaluation subsystem and runs a one-time `UPDATE` to reconcile `sessions.evaluated` with existing `session_evaluations` rows. Apply Supabase migrations **before** deploying the matching API binary — otherwise inline writes (`updateSession({ evaluated: true })`) and the admin batch endpoints will fail against the old schema.

`PORT` does not need to be set — Render sets it automatically.

For descriptions of each variable, see the [config/secrets reference](../CLAUDE.md#configsecrets-management) in CLAUDE.md.

### Step 4: Set the health check path

1. Scroll down to the **Advanced** section.
2. Set **Health Check Path** to `/api/config`.

This tells Render which URL to ping to confirm the app started successfully.

### Step 5: Deploy

Click **Create Web Service**.  Render will:

1. Pull your repo from GitHub
2. Run the build command (installs dependencies and compiles TypeScript)
3. Start the server
4. Route traffic once the health check at `/api/config` returns a 200 response

The first deploy takes two to four minutes.  You'll see a build log in real time.

### Step 6: Verify

Once the deploy finishes, click the URL at the top of your service page (it looks like `https://ai-tutor.onrender.com`).  You should see the tutor chat interface.

To confirm the server is healthy, visit `https://your-app-url.onrender.com/api/config`.  You should see a JSON response like:

```json
{"model":"claude-sonnet-4-6","extendedThinking":true,"inactivityMs":600000,"contactEmail":"...","availableModels":[...],"availablePrompts":[...],"defaultPrompt":"tutor-prompt-v7"}
```

### Ongoing

- **Auto-deploy:** By default, Render rebuilds and redeploys whenever you push to your **main** branch (or whichever branch you selected when creating the Web Service). You can change the deploy branch under **Settings → Build & Deploy → Branch**, or disable auto-deploy entirely under **Settings → Auto-Deploy**.
- **Manual redeploy:** Click **Manual Deploy → Deploy latest commit** from your service's dashboard.
- **Logs:** Click **Logs** in the left sidebar to see live server output.

---

## Local development

Run the app on your own computer.

### Prerequisites

- Node.js 20 or later.  Check with `node --version`.  Download from [nodejs.org](https://nodejs.org) if needed.
- npm (included with Node.js)
- git

### Step 1: Clone and install

```bash
git clone https://github.com/schmimran/ai-tutor-toolkit.git
cd ai-tutor-toolkit
npm install
```

### Step 2: Set up environment variables

Do not create a `.env` file. The repo ships a template you copy and fill in:

```bash
cp env.sh.template env.sh
# edit env.sh and fill in your values
source env.sh
```

`env.sh` is gitignored, so your secrets stay local. `source env.sh` exports the variables into the current shell session — run it once per terminal before `npm run api`.

Required for the API server: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`. Optional (emails are silently skipped without them): `RESEND_API_KEY`, `ADMIN_EMAIL`, `EMAIL_FROM`. See the [config/secrets reference](../CLAUDE.md#configsecrets-management) in CLAUDE.md for the full list.

### Step 3: Build and run

```bash
# Compile TypeScript
npm run build

# Start the API server (also serves the web frontend)
npm run api
```

Open `http://localhost:3000` in your browser.

### Step 4: Verify

Visit `http://localhost:3000/api/config`.  You should see:

```json
{"model":"claude-sonnet-4-6","extendedThinking":true,"inactivityMs":600000,"contactEmail":"...","availableModels":[...],"availablePrompts":[...],"defaultPrompt":"tutor-prompt-v7"}
```

### Other commands

```bash
# Watch mode: rebuilds and restarts on source changes (for developers)
npm run dev

# CLI: terminal-based tutor interface (no browser needed)
npm run cli
```

### Running the test harness

The `tests/` folder contains character briefs for simulated student sessions.  See [tests/README.md](../tests/README.md) for how to use them.

There are no automated unit or integration tests in this repo.

---

## Supabase dashboard checklist

Run all available Supabase migrations:
`supabase db push`


1. **Authentication → URL Configuration** — add your production and local origins to "Redirect URLs" (e.g. `https://tutor.schmim.com/login.html`, `http://localhost:3000/login.html`). Without this, the signup/recovery email links will bounce.
2. **Authentication → Email Templates** — verify that the Confirm signup, Magic link, Reset password, and Change email templates point to `/login.html` (or `/settings.html` for the email-change confirmation). Supabase's defaults usually work.
3. **Authentication → Providers → Email** — set password minimum length to 8, enable HIBP leaked-password protection (Pro tier required).
4. **Seed admin users** — for each account that needs admin access, run:
   ```sql
   UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
     WHERE email = 'admin@example.com';
   ```
   `is_admin` lives in `app_metadata` (immutable from the client) and is read from the JWT `app_metadata.is_admin` claim.

---

## Session lifecycle

Understanding how a tutoring session moves through the system:

1. **Client generates a UUID.**  The browser creates a session ID via `crypto.randomUUID()` and stores it in memory (not localStorage).

2. **First chat message.**  `POST /api/chat` requires a Supabase Bearer token. On the first turn, the in-memory `Session` object and a `sessions` row in Supabase are created with the authenticated `user_id`. Client IP, geolocation, and user-agent are captured.

3. **Each turn.**  The student sends a message, the tutor streams a response via SSE.  After each turn:
   - User and assistant messages are persisted to the `messages` table
   - `last_activity_at` and cumulative token counts are updated on the session row
   - The in-memory session retains the full message history (including thinking blocks) for context continuity

4. **Session ends.**  This happens in one of two ways:
   - **Explicit end:** The student clicks "New session" or closes the tab → frontend calls `DELETE /api/sessions/:id`
   - **Inactivity timeout:** The server's 60-second sweep detects no activity for 10 minutes and reaps the session

5. **On end (unless `?discard=true`):**
   - An automated evaluation runs against the transcript (12 dimensions, scored pass/partial/fail/na)
   - Student feedback is fetched (or a `source: 'timeout'` placeholder is created)
   - A transcript email is sent to the parent (includes conversation, evaluation, feedback, and token usage)
   - `email_sent` is set to `true` to prevent duplicate sends

6. **Cleanup.**  The in-memory session is removed.  `ended_at` is set on the database row.  Session data (messages, feedback, evaluation) is **retained** for analysis — nothing is deleted.

---

## Troubleshooting

### API server won't start

- **Missing env vars:** The server requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `ANTHROPIC_API_KEY`.  Check that all four are exported in your shell.  If `SUPABASE_ANON_KEY` is missing, the auth router will not register and users will be unable to log in.
- **Port in use:** Another process is on port 3000.  Either stop it or set `export PORT=3001`.
- **Build not run:** TypeScript must be compiled before starting.  Run `npm run build` first, then `npm run api`.

### Email transcripts not arriving

- **Missing keys:** Both `RESEND_API_KEY` and `ADMIN_EMAIL` must be set.  If either is absent, emails are silently skipped.
- **Domain not verified:** The `EMAIL_FROM` address must match a domain verified in your Resend dashboard.  Check Resend → Domains for verification status.
- **Session too short:** Emails are only sent when a session has at least one exchange (transcript length > 0).

### Evaluation fails

- **Model access:** The evaluation defaults to `claude-haiku-4-5-20251001` and can be overridden via the `EVALUATION_MODEL` env var.  Your API key must have access to the configured model.
- **Check server logs:** Evaluation errors are logged as `[evaluation] Failed to evaluate session <id>`.  The session still ends normally — evaluation failure doesn't block cleanup.

### Session not found (404)

- **Reaped by sweep:** If the session was idle for 10+ minutes, the inactivity sweep already removed it from memory and set `ended_at`.  Check server logs for `[sweep] Reaped idle session <id>`.
- **Server restarted:** In-memory sessions don't survive server restarts.  Session data is still in Supabase — it just can't be resumed.
