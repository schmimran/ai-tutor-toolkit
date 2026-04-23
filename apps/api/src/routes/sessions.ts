import { Router } from "express";
import {
  getSession as getDbSession,
  markSessionEnded,
} from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession, removeSession, isReaping } from "../lib/session-store.js";
import { getOrCreateTimeoutFeedback, sendUserTranscriptIfApplicable } from "../lib/evaluation.js";
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
   * Normal flow: sends the user's transcript email (if opted in), removes the
   * in-memory session, and marks ended_at in the database.  No admin email is
   * sent here — the admin copy is sent later, once batch evaluation runs.
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
        // If the sweep is already tearing down this session, skip the email
        // here — the sweep will send it. Prevents duplicate student emails.
        const sweeping = isReaping(sessionId);
        if (!discard && !sweeping && session && session.transcript.length > 0) {
          // Record a timeout-feedback row for analytics (picked up later by
          // batch eval when the admin transcript is sent).
          await getOrCreateTimeoutFeedback(db, sessionId, "sessions");

          // Student-facing transcript is the only email sent at session end.
          // Gated by profiles.email_transcripts_enabled inside the helper.
          // Fire-and-forget so the response returns without waiting on Resend.
          const summary = session.getSessionSummary();
          void sendUserTranscriptIfApplicable(
            sessionId, summary.transcript, summary.startedAt, summary.durationMs,
            emailConfig.from, db,
          );
        }
      } finally {
        // Always clean up — even if email throws unexpectedly.
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
