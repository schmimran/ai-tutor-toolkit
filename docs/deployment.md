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
- An Anthropic API key — get one at [console.anthropic.com](https://console.anthropic.com)
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
| `ANTHROPIC_API_KEY` | **yes** | [console.anthropic.com](https://console.anthropic.com) → API Keys | **Yes** |
| `SUPABASE_URL` | **yes** | Supabase dashboard → Settings → API → Project URL | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase dashboard → Settings → API → service_role key | **Yes** |
| `SUPABASE_ANON_KEY` | no | Supabase dashboard → Settings → API → anon/public key. Required only if you want to enable the parallel Supabase-backed login flow at `/login.html` (issue #73). Omit to leave that route disabled — the main app's passcode access wall works either way. | **Yes** |
| `RESEND_API_KEY` | no | Resend dashboard → API Keys | **Yes** |
| `PARENT_EMAIL` | no | Your email address (where transcripts will be sent) | No |
| `EMAIL_FROM` | no | Your verified sending address (e.g., `tutor@yourdomain.com`) | No |
| `ACCESS_PASSCODE` | **yes** | A 5-digit code you choose; share with your student | **Yes** |
| `CONTACT_EMAIL` | no | Contact email shown in the access-wall overlay | No |
| `MODEL` | no | Default: `claude-sonnet-4-6` | No |
| `EXTENDED_THINKING` | no | Default: `true`; set `false` to disable | No |
| `SYSTEM_PROMPT_PATH` | no | Default: `templates/tutor-prompt-v7.md` | No |
| `CORS_ORIGIN` | no | Your Render app URL once deployed (e.g., `https://ai-tutor.onrender.com`) | No |
| `ALLOW_PROMPT_SELECTION` | no | Set to `true` to enable the in-app prompt-version picker. Omit (or set to anything else) to lock the picker. Defaults fail-closed. | No |

You can skip `RESEND_API_KEY`, `PARENT_EMAIL`, and `EMAIL_FROM` if you don't want email transcripts.  The app will work without them.

`PORT` does not need to be set — Render sets it automatically.

For descriptions of each variable, see the [environment variables reference](../README.md#environment-variables--full-reference) in the root README.

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

- **Auto-deploy:** By default, Render rebuilds and redeploys whenever you push to your **stage** branch.  You can disable this under **Settings → Auto-Deploy**.
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

### Step 2: Export environment variables

Do not create a `.env` file.  Export the variables in your shell session instead:

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# Required for the API server (session history, email transcripts)
export SUPABASE_URL=https://your-project-ref.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Required — 5-digit passcode for the access wall; share with your student
export ACCESS_PASSCODE=12345

# Optional — emails are silently skipped if absent
export RESEND_API_KEY=re_...
export PARENT_EMAIL=you@yourdomain.com
export EMAIL_FROM=tutor@tutor.yourdomain.com

# Optional — set to "true" to allow users to switch prompt versions in the UI.
# Omitting this variable locks the prompt picker (fail-closed).
export ALLOW_PROMPT_SELECTION=true
```

To avoid re-entering these every time you open a terminal, add the export lines to your `~/.zshrc` (Mac) or `~/.bashrc` (Linux).

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

## Session lifecycle

Understanding how a tutoring session moves through the system:

1. **Client generates a UUID.**  The browser creates a session ID via `crypto.randomUUID()` and stores it in memory (not localStorage).

2. **First chat message.**  `POST /api/chat` creates the in-memory `Session` object and a `sessions` row in Supabase.  Client IP, geolocation, and user-agent are captured.  The disclaimer acceptance record (if any) is linked to this session via `linkDisclaimerAcceptance()`.

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

- **Missing env vars:** The server requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ANTHROPIC_API_KEY`.  It also requires `ACCESS_PASSCODE` (fails closed if unset).  Check that all four are exported in your shell.
- **Port in use:** Another process is on port 3000.  Either stop it or set `export PORT=3001`.
- **Build not run:** TypeScript must be compiled before starting.  Run `npm run build` first, then `npm run api`.

### Can't get past the access wall

- **Wrong passcode:** Verify `ACCESS_PASSCODE` matches what you're entering.  It must be exactly 5 digits.
- **Not set:** If `ACCESS_PASSCODE` is not exported, the access wall rejects all codes (fails closed by design).

### Email transcripts not arriving

- **Missing keys:** Both `RESEND_API_KEY` and `PARENT_EMAIL` must be set.  If either is absent, emails are silently skipped.
- **Domain not verified:** The `EMAIL_FROM` address must match a domain verified in your Resend dashboard.  Check Resend → Domains for verification status.
- **Session too short:** Emails are only sent when a session has at least one exchange (transcript length > 0).

### Evaluation fails

- **Model access:** The evaluation uses `claude-sonnet-4-6` by default (hardcoded in `packages/core/src/evaluate-transcript.ts`).  Your API key must have access to that model.
- **Check server logs:** Evaluation errors are logged as `[evaluation] Failed to evaluate session <id>`.  The session still ends normally — evaluation failure doesn't block cleanup.

### Session not found (404)

- **Reaped by sweep:** If the session was idle for 10+ minutes, the inactivity sweep already removed it from memory and set `ended_at`.  Check server logs for `[sweep] Reaped idle session <id>`.
- **Server restarted:** In-memory sessions don't survive server restarts.  Session data is still in Supabase — it just can't be resumed.
