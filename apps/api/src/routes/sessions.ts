import { Router } from "express";
import {
  getSession as getDbSession,
  markSessionEnded,
  getSessionFeedback,
} from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession, removeSession } from "../lib/session-store.js";
import { sendTranscript } from "@ai-tutor/email";
import { runSessionEvaluation, buildEvaluationPayload } from "../lib/evaluation.js";

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
   * Normal flow: runs evaluation, sends the transcript email (if not already
   * sent), removes the in-memory session, and marks ended_at in the database.
   *
   * With ?discard=true: skips evaluation and email entirely — just removes
   * from memory and marks ended_at.  Used when the user switches model/prompt
   * mid-session and the transcript should be discarded.
   */
  router.delete("/:sessionId", async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const discard = req.query["discard"] === "true";
      const session = getSession(sessionId);

      if (!discard && session && !session.emailSent && session.transcript.length > 0) {
        const summary = session.getSessionSummary();
        const evalResult = await runSessionEvaluation(db, sessionId, summary.transcript);
        const feedback = await getSessionFeedback(db, sessionId).catch(() => null);
        void sendTranscript(emailConfig, {
          transcript: summary.transcript,
          files: session.files,
          clientInfo: summary.clientInfo,
          startedAt: summary.startedAt,
          lastActivityAt: summary.lastActivityAt,
          durationMs: summary.durationMs,
          sessionId,
          tokenUsage: summary.tokenUsage,
          evaluation: evalResult ? buildEvaluationPayload(evalResult) : null,
          studentFeedback: feedback ?? null,
          model: session.model ?? undefined,
          promptName: session.promptName ?? undefined,
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
