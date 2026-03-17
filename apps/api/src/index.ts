import express from "express";
import { fileURLToPath } from "url";
import path from "path";
import {
  loadConfig,
  loadSystemPrompt,
  createTutorClient,
} from "@ai-tutor/core";
import { createSupabaseClient, markSessionEnded } from "@ai-tutor/db";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errors.js";
import { createChatRouter } from "./routes/chat.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createTranscriptRouter } from "./routes/transcript.js";
import { createFeedbackRouter } from "./routes/feedback.js";
import { createConfigRouter } from "./routes/config.js";
import { getAllSessions, removeSession } from "./lib/session-store.js";
import { sendTranscript } from "@ai-tutor/email";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = loadConfig();
const systemPrompt = loadSystemPrompt(config.systemPromptPath);
const tutorClient = createTutorClient(config, systemPrompt);
const db = createSupabaseClient();

const emailConfig = {
  apiKey: process.env.RESEND_API_KEY,
  to: process.env.PARENT_EMAIL,
  from: process.env.EMAIL_FROM ?? "tutor@tutor.schmim.com",
};

const app = express();

app.use(corsMiddleware);
app.use(express.json());

// Serve the static web frontend.
// __dirname is apps/api/dist/ at runtime, so ../../web/public resolves to apps/web/public/.
app.use(express.static(path.join(__dirname, "../../web/public")));

// Routes
app.use("/api/chat", createChatRouter(tutorClient, db));
app.use("/api/sessions", createSessionsRouter(db, emailConfig));
app.use("/api/transcript", createTranscriptRouter(db));
app.use("/api/feedback", createFeedbackRouter(db, emailConfig));
app.use("/api/config", createConfigRouter(config));

app.use(errorHandler);

// Inactivity sweep — reap sessions idle for more than 10 minutes.
const INACTIVITY_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of getAllSessions()) {
    if (now - session.lastActivityAt.getTime() > INACTIVITY_MS) {
      if (!session.emailSent && session.transcript.length > 0) {
        const summary = session.getSessionSummary();
        void sendTranscript(emailConfig, {
          transcript: summary.transcript,
          files: session.files,
          clientInfo: summary.clientInfo,
          startedAt: summary.startedAt,
          lastActivityAt: summary.lastActivityAt,
          durationMs: summary.durationMs,
          sessionId,
          tokenUsage: summary.tokenUsage,
        });
        session.markEmailSent();
      }
      removeSession(sessionId);
      void markSessionEnded(db, sessionId).catch(err =>
        console.error(`[sweep] Could not mark session ${sessionId} as ended:`, err)
      );
      console.log(`[sweep] Reaped idle session ${sessionId}.`);
    }
  }
}, 60 * 1000); // Check every minute.

app.listen(config.port, () => {
  console.log(`[api] Listening on port ${config.port}`);
  console.log(`[api] Model: ${config.model}`);
  console.log(
    `[api] Extended thinking: ${config.extendedThinking ? "on" : "off"}`
  );
});
