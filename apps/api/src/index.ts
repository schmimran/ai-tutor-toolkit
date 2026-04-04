import express from "express";
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
  markSessionEnded,
  createSessionFeedback,
  getSessionFeedback,
} from "@ai-tutor/db";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errors.js";
import { createChatRouter } from "./routes/chat.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createTranscriptRouter } from "./routes/transcript.js";
import { createFeedbackRouter } from "./routes/feedback.js";
import { createConfigRouter } from "./routes/config.js";
import { createDisclaimerRouter } from "./routes/disclaimer.js";
import { createAccessRouter } from "./routes/access.js";
import { getAllSessions, removeSession } from "./lib/session-store.js";
import { sendTranscript } from "@ai-tutor/email";
import { runSessionEvaluation, buildTranscriptEmailPayload } from "./lib/evaluation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const db = createSupabaseClient();

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

// Derive default prompt name from config.systemPromptPath (basename without extension).
const defaultPromptName = path.basename(config.systemPromptPath, ".md");

// Fall back to loading via loadSystemPrompt if the default prompt wasn't found in templates/.
if (!promptMap.has(defaultPromptName)) {
  promptMap.set(defaultPromptName, loadSystemPrompt(config.systemPromptPath));
}

// Build the tutor client using the default system prompt.
const tutorClient = createTutorClient(config, promptMap.get(defaultPromptName)!);

const emailConfig = {
  apiKey: process.env.RESEND_API_KEY,
  to: process.env.PARENT_EMAIL,
  from: process.env.EMAIL_FROM ?? "tutor@tutor.schmim.com",
};

// Inactivity sweep — reap sessions idle for more than 10 minutes.
// Also served via GET /api/config so the frontend uses the same value.
const INACTIVITY_MS = 10 * 60 * 1000;

const app = express();

app.use(corsMiddleware);
app.use(express.json());

// Serve the static web frontend.
// __dirname is apps/api/dist/ at runtime, so ../../web/public resolves to apps/web/public/.
app.use(express.static(path.join(__dirname, "../../web/public")));

// Routes
app.use("/api/chat", createChatRouter(tutorClient, db, promptMap, defaultPromptName, config.model));
app.use("/api/sessions", createSessionsRouter(db, emailConfig));
app.use("/api/transcript", createTranscriptRouter(db));
app.use("/api/feedback", createFeedbackRouter(db));
app.use("/api/config", createConfigRouter(config, INACTIVITY_MS, promptMap, defaultPromptName));
app.use("/api/disclaimer", createDisclaimerRouter(db));
app.use("/api/access", createAccessRouter());

app.use(errorHandler);

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of getAllSessions()) {
    if (now - session.lastActivityAt.getTime() > INACTIVITY_MS) {
      // Remove from memory first to prevent the next sweep tick from re-processing.
      removeSession(sessionId);

      // Shared teardown: mark ended_at in DB and log. Called both from the async
      // eval/email path (in finally, after the evaluation row is written) and from
      // the no-email path (immediately, since there is no evaluation to wait for).
      const finishReap = () => {
        void markSessionEnded(db, sessionId).catch(err =>
          console.error(`[sweep] Could not mark session ${sessionId} as ended:`, err)
        );
        console.log(`[sweep] Reaped idle session ${sessionId}.`);
      };

      if (!session.emailSent && session.transcript.length > 0) {
        void (async () => {
          try {
            const evalResult = await runSessionEvaluation(db, sessionId, session.transcript);

            let feedback = await getSessionFeedback(db, sessionId).catch(err => {
              console.error(`[sweep] Failed to fetch feedback for ${sessionId}:`, err);
              return null;
            });
            if (!feedback) {
              feedback = await createSessionFeedback(db, {
                session_id: sessionId,
                source: "timeout",
              }).catch(err => {
                console.error(`[sweep] Failed to create timeout feedback for ${sessionId}:`, err);
                return null;
              });
            }

            const payload = buildTranscriptEmailPayload(
              session, sessionId, evalResult, feedback, config.model, defaultPromptName
            );
            await sendTranscript(emailConfig, payload);
            session.markEmailSent();
          } catch (err) {
            console.error(`[sweep] Failed to process session ${sessionId}:`, err);
          } finally {
            // Mark ended_at only after evaluation and email have completed (or failed),
            // so session_evaluations is always written before ended_at is set.
            finishReap();
          }
        })();
      } else {
        finishReap();
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
