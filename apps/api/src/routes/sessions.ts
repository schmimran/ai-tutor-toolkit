import { Router } from "express";
import { getSession as getDbSession, deleteSession as deleteDbSession } from "@ai-tutor/db";
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
   * the in-memory session, and deletes the database row.
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
        });
        session.markEmailSent();
      }

      removeSession(sessionId);

      try {
        await deleteDbSession(db, sessionId);
      } catch (err) {
        console.error("[sessions] Could not delete DB session row:", err);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
