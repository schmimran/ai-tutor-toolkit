import { Router } from "express";
import { getSession as getDbSession, markSessionEnded } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession, removeSession } from "../lib/session-store.js";
import { sendTranscript } from "@ai-tutor/email";

export interface EmailConfig {
  apiKey: string | undefined;
  to: string | undefined;
  from: string;
}

export function createSessionsRouter(
  db: SupabaseClient,
  emailConfig: EmailConfig
): Router {
  const router = Router();

  /**
   * GET /api/sessions/:sessionId
   *
   * Returns session metadata from the database.
   */
  router.get("/:sessionId", async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const row = await getDbSession(db, sessionId);
      if (!row) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /api/sessions/:sessionId
   *
   * Ends a session: sends the transcript email (if not already sent), removes
   * the in-memory session, and marks the session as ended in the database
   * (sets ended_at); session data is retained for analysis.
   */
  router.delete("/:sessionId", async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const session = getSession(sessionId);

      if (session && !session.emailSent && session.transcript.length > 0) {
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

      try {
        await markSessionEnded(db, sessionId);
      } catch (err) {
        console.error("[sessions] Could not mark DB session as ended:", err);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
