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
- A Supabase project with all migrations applied — see the [Supabase setup section](../README.md#supabase--database) in the main README
- A Resend account with a verified sending domain — see the [Resend setup section](../README.md#resend--email) in the main README (optional, but required for email transcripts)

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
| `RESEND_API_KEY` | no | Resend dashboard → API Keys | **Yes** |
| `PARENT_EMAIL` | no | Your email address (where transcripts will be sent) | No |
| `EMAIL_FROM` | no | Your verified sending address (e.g., `tutor@yourdomain.com`) | No |
| `ACCESS_PASSCODE` | **yes** | A 5-digit code you choose; share with your student | **Yes** |
| `CONTACT_EMAIL` | no | Contact email shown in the access-wall overlay | No |
| `MODEL` | no | Default: `claude-sonnet-4-6` | No |
| `EXTENDED_THINKING` | no | Default: `true`; set `false` to disable | No |
| `SYSTEM_PROMPT_PATH` | no | Default: `templates/tutor-prompt-v7.md` | No |
| `CORS_ORIGIN` | no | Your Render app URL once deployed (e.g., `https://ai-tutor.onrender.com`) | No |

You can skip `RESEND_API_KEY`, `PARENT_EMAIL`, and `EMAIL_FROM` if you don't want email transcripts.  The app will work without them.

`PORT` does not need to be set — Render sets it automatically.

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

- **Auto-deploy:** By default, Render rebuilds and redeploys whenever you push to your main branch.  You can disable this under **Settings → Auto-Deploy**.
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

# Optional — emails are silently skipped if absent
export RESEND_API_KEY=re_...
export PARENT_EMAIL=you@yourdomain.com
export EMAIL_FROM=tutor@tutor.yourdomain.com
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
