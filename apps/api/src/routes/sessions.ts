import { Router } from "express";
import {
  getSession as getDbSession,
  markSessionEnded,
  getUserInfoForSession,
} from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "@ai-tutor/core";
import { getSession, removeSession } from "../lib/session-store.js";
import { sendTranscript } from "@ai-tutor/email";
import { buildTranscriptEmailPayload, markEmailSentPersisted, getOrCreateTimeoutFeedback, sendUserTranscriptIfApplicable } from "../lib/evaluation.js";
import { UUID_RE } from "../lib/validation.js";
import { createRequireAuth, type AuthedRequest } from "../middleware/require-auth.js";

export interface EmailConfig {
  apiKey: string | undefined;
  to: string | undefined;
  from: string;
}

export function createSessionsRouter(
  db: SupabaseClient,
  emailConfig: EmailConfig,
  config: Config,
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(db);

  /**
   * GET /api/sessions/:sessionId
   *
   * Returns session metadata. Requires auth; the session must belong to the
   * caller.
   */
  router.get("/:sessionId", requireAuth, async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      if (!UUID_RE.test(sessionId)) {
        res.status(400).json({ error: "sessionId must be a valid UUID." });
        return;
      }
      const row = await getDbSession(db, sessionId);
      if (!row || row.user_id !== (req as AuthedRequest).userId) {
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
   * Normal flow: sends the transcript email (if not already sent), removes the
   * in-memory session, and marks ended_at in the database.
   *
   * With ?discard=true: skips the email entirely — just removes from memory
   * and marks ended_at.  Used when the user switches model/prompt mid-session
   * and the transcript should be discarded.
   */
  router.delete("/:sessionId", requireAuth, async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      if (!UUID_RE.test(sessionId)) {
        res.status(400).json({ error: "sessionId must be a valid UUID." });
        return;
      }
      const dbRow = await getDbSession(db, sessionId);
      if (!dbRow || dbRow.user_id !== (req as AuthedRequest).userId) {
        res.status(404).json({ error: "Session not found." });
        return;
      }
      const discard = req.query["discard"] === "true";
      const session = getSession(sessionId);

      try {
        if (!discard && session && !session.emailSent && session.transcript.length > 0) {
          const [feedback, userInfo] = await Promise.all([
            getOrCreateTimeoutFeedback(db, sessionId, "sessions"),
            getUserInfoForSession(db, sessionId).catch(() => null),
          ]);
          const payload = buildTranscriptEmailPayload(session, sessionId, null, feedback,
            { model: config.model, promptName: config.defaultPromptName, extendedThinking: config.extendedThinking },
            userInfo);
          try {
            await sendTranscript(emailConfig, payload);
            if (emailConfig.apiKey && emailConfig.to) {
              await markEmailSentPersisted(session, db, sessionId, "sessions");
            }
          } catch (err) {
            console.error(`[sessions] Failed to send transcript for ${sessionId}:`, err);
          }
          // Send a student-facing copy (fire-and-forget).
          const summary = session.getSessionSummary();
          void sendUserTranscriptIfApplicable(
            sessionId, summary.transcript, summary.startedAt, summary.durationMs,
            emailConfig.from, db,
          );
        }
      } finally {
        // Always clean up — even if eval or email throws unexpectedly.
        removeSession(sessionId);
        try {
          await markSessionEnded(db, sessionId);
        } catch (err) {
          console.error("[sessions] Could not mark DB session as ended:", err);
        }
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
