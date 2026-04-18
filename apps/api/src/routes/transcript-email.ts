import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  getMessagesBySession,
  getSession as getDbSession,
} from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendUserTranscript } from "@ai-tutor/email";
import type { UserTranscriptPayload } from "@ai-tutor/email";
import { UUID_RE } from "../lib/validation.js";
import { createRequireAuth, type AuthedRequest } from "../middleware/require-auth.js";

export interface TranscriptEmailRouteConfig {
  apiKey: string | undefined;
  from: string;
}

/**
 * POST /api/transcript/:sessionId/email
 *
 * Sends a copy of the session transcript to the authenticated user's
 * registered email via Resend. Auth-gated; the session must belong to the
 * caller. Rate-limited to 3 requests per 15 minutes per IP.
 *
 * Response:
 *   { ok: true }                                on success
 *   { ok: false, error: "email_not_configured" } 503 — Resend not set up
 *   { ok: false, error: "failed" }              500 — Resend error
 */
export function createTranscriptEmailRouter(
  db: SupabaseClient,
  emailConfig: TranscriptEmailRouteConfig,
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(db);

  const rateLimitHandler = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } },
  ) => {
    res.status(429).json({ ok: false, error: "too_many_requests" });
  };

  const emailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

  router.post("/:sessionId/email", emailLimiter, requireAuth, async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      if (!UUID_RE.test(sessionId)) {
        res.status(400).json({ ok: false, error: "invalid_session_id" });
        return;
      }

      const authedReq = req as AuthedRequest;
      const row = await getDbSession(db, sessionId);
      if (!row || row.user_id !== authedReq.userId) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }

      if (!emailConfig.apiKey) {
        res.status(503).json({ ok: false, error: "email_not_configured" });
        return;
      }
      if (!authedReq.userEmail) {
        res.status(400).json({ ok: false, error: "no_user_email" });
        return;
      }

      const messages = await getMessagesBySession(db, sessionId);
      if (messages.length === 0) {
        res.status(400).json({ ok: false, error: "empty_transcript" });
        return;
      }

      const transcript = messages.map((m) => ({
        role: (m.role === "user" ? "Student" : "Tutor") as "Student" | "Tutor",
        text: m.content,
      }));
      const startedAt = new Date(row.started_at);
      const endedAt = row.ended_at ? new Date(row.ended_at) : new Date(row.last_activity_at);
      const durationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());

      const payload: UserTranscriptPayload = { transcript, startedAt, durationMs };

      try {
        await sendUserTranscript(authedReq.userEmail, emailConfig, payload);
      } catch (err) {
        console.error(`[transcript-email] Send failed for ${sessionId}:`, err);
        res.status(500).json({ ok: false, error: "failed" });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
