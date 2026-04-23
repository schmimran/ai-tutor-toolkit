import express from "express";
import helmet from "helmet";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import {
  loadConfig,
  loadSystemPrompt,
  createTutorClient,
} from "@ai-tutor/core";
import {
  createSupabaseClient,
  createSupabaseAnonClient,
  markSessionEnded,
} from "@ai-tutor/db";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errors.js";
import { createChatRouter } from "./routes/chat.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createTranscriptRouter } from "./routes/transcript.js";
import { createTranscriptEmailRouter } from "./routes/transcript-email.js";
import { createFeedbackRouter } from "./routes/feedback.js";
import { createConfigRouter } from "./routes/config.js";
import { createAuthRouter } from "./routes/auth.js";
import { createHistoryRouter } from "./routes/history.js";
import { createAdminEvaluationsRouter } from "./routes/admin-evaluations.js";
import { createAdminStatsRouter } from "./routes/admin-stats.js";
import { getAllSessions, removeSession, markReaping, unmarkReaping, isReaping } from "./lib/session-store.js";
import { getOrCreateTimeoutFeedback, sendUserTranscriptIfApplicable } from "./lib/evaluation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const db = createSupabaseClient();

// Optional Supabase anon client — needed for the /api/auth/* routes that back
// the /login.html entry point. If SUPABASE_ANON_KEY is unset, the auth router
// is not registered and the app will be inaccessible (login page cannot
// authenticate).
let anonDb: ReturnType<typeof createSupabaseAnonClient> | null = null;
if (process.env.SUPABASE_ANON_KEY) {
  try {
    anonDb = createSupabaseAnonClient();
  } catch (err) {
    console.warn("[api] SUPABASE_ANON_KEY present but anon client init failed:", err);
    anonDb = null;
  }
} else {
  console.warn("[api] SUPABASE_ANON_KEY not set — /api/auth/* routes disabled.");
}

// ── Prompt discovery ──────────────────────────────────────────────────────────
// Scan templates/ for all tutor-prompt-*.md files and build a name→content map.
// The map is passed to the chat router so sessions can use a per-session prompt.
const templatesDir = path.join(__dirname, "../../../templates");
const promptMap = new Map<string, string>();

for (const file of fs.readdirSync(templatesDir)) {
  if (file.startsWith("tutor-prompt-") && file.endsWith(".md")) {
    const name = file.replace(/\.md$/, "");
    promptMap.set(name, loadSystemPrompt(path.join(templatesDir, file)));
  }
}

// Default prompt name derived from config.systemPromptPath in loadConfig().
const defaultPromptName = config.defaultPromptName;

// Fall back to loading via loadSystemPrompt if the default prompt wasn't found in templates/.
if (!promptMap.has(defaultPromptName)) {
  promptMap.set(defaultPromptName, loadSystemPrompt(config.systemPromptPath));
}

// Build the tutor client using the default system prompt.
const tutorClient = createTutorClient(config, promptMap.get(defaultPromptName)!);

const emailConfig = {
  apiKey: process.env.RESEND_API_KEY,
  to: process.env.ADMIN_EMAIL,
  from: process.env.EMAIL_FROM ?? "tutor@tutor.schmim.com",
};

// Inactivity sweep — reap sessions idle for more than 10 minutes.
// Also served via GET /api/config so the frontend uses the same value.
const INACTIVITY_MS = 10 * 60 * 1000;

const app = express();
app.set("trust proxy", 1); // Trust first proxy (Render) for correct req.ip in rate limiting

// Security headers. CSP allows the CDN scripts/styles the plain-HTML frontend
// loads (KaTeX, marked, DOMPurify), Google Fonts, and data: font URIs (KaTeX
// ships inline data: fonts). `'unsafe-inline'` in scriptSrc is a temporary
// allowance — inline event handlers still exist in apps/web/public/index.html.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "cdn.jsdelivr.net", "'unsafe-inline'"],
        styleSrc: ["'self'", "cdn.jsdelivr.net", "fonts.googleapis.com", "'unsafe-inline'"],
        fontSrc: ["'self'", "fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:"],
        // supabase-js makes fetch() calls to the Supabase project URL from the browser.
        connectSrc: [
          "'self'",
          "fonts.googleapis.com",
          "fonts.gstatic.com",
          ...(process.env.SUPABASE_URL ? [process.env.SUPABASE_URL] : []),
        ],
      },
    },
    xContentTypeOptions: true,
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true },
    xFrameOptions: { action: "deny" },
  }),
);

app.use(corsMiddleware);
app.use(express.json());

// Serve the static web frontend.
// __dirname is apps/api/dist/ at runtime, so ../../web/public resolves to apps/web/public/.
app.use(express.static(path.join(__dirname, "../../web/public")));

// Routes
app.use("/api/chat", createChatRouter(tutorClient, db, promptMap, defaultPromptName, config.model, config.extendedThinking));
app.use("/api/sessions", createSessionsRouter(db, emailConfig));
app.use("/api/transcript", createTranscriptEmailRouter(db, { apiKey: emailConfig.apiKey, from: emailConfig.from }));
app.use("/api/transcript", createTranscriptRouter(db));
app.use("/api/feedback", createFeedbackRouter(db));
app.use("/api/config", createConfigRouter(config, INACTIVITY_MS, promptMap, defaultPromptName));
app.use("/api/admin/evaluations", createAdminEvaluationsRouter(db, config, emailConfig));
app.use("/api/admin", createAdminStatsRouter(db));
app.use("/api/history", createHistoryRouter(db));
if (anonDb) {
  app.use("/api/auth", createAuthRouter(db, anonDb));
}

app.use(errorHandler);

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of getAllSessions()) {
    if (now - session.lastActivityAt.getTime() > INACTIVITY_MS) {
      if (isReaping(sessionId)) continue; // teardown already in progress

      // Mark as reaping to prevent the next sweep tick from re-processing and
      // to block concurrent chat requests on this session during async teardown.
      // The session stays in the store until finishReap removes it, so no
      // concurrent chat request can silently resurrect an empty ghost session.
      markReaping(sessionId);

      // Shared teardown: mark ended_at in DB, then remove from memory. Called
      // both from the async email path (in finally) and the no-email path.
      const finishReap = async () => {
        try {
          await markSessionEnded(db, sessionId);
        } catch (err) {
          console.error(`[sweep] Could not mark session ${sessionId} as ended:`, err);
        } finally {
          removeSession(sessionId);
          unmarkReaping(sessionId);
          console.log(`[sweep] Reaped idle session ${sessionId}.`);
        }
      };

      if (session.transcript.length > 0) {
        void (async () => {
          try {
            // Record a timeout-feedback row for analytics (picked up later by
            // batch eval when the admin transcript is sent).
            await getOrCreateTimeoutFeedback(db, sessionId, "sweep");

            // Student-facing transcript is the only email sent at session end.
            // Gated by profiles.email_transcripts_enabled inside the helper.
            const summary = session.getSessionSummary();
            await sendUserTranscriptIfApplicable(
              sessionId, summary.transcript, summary.startedAt, summary.durationMs,
              emailConfig.from, db,
            );
          } catch (err) {
            console.error(`[sweep] Failed to process session ${sessionId}:`, err);
          } finally {
            await finishReap();
          }
        })();
      } else {
        void finishReap();
      }
    }
  }
}, 60 * 1000); // Check every minute.

app.listen(config.port, () => {
  console.log(`[api] Listening on port ${config.port}`);
  console.log(`[api] Model: ${config.model}`);
  console.log(
    `[api] Extended thinking: ${config.extendedThinking ? "on" : "off"}`
  );
  console.log(`[api] Available prompts: ${[...promptMap.keys()].join(", ")}`);
});
