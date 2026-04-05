import { Router } from "express";
import { createSessionFeedback } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_RE } from "../lib/validation.js";

export function createFeedbackRouter(db: SupabaseClient): Router {
  const router = Router();

  /**
   * POST /api/feedback
   *
   * Body (JSON):
   *   sessionId   — string (required)
   *   source      — 'student' | 'timeout' (optional, default 'student')
   *   outcome     — 'solved' | 'partial' | 'stuck' (optional)
   *   experience  — 'positive' | 'neutral' | 'negative' (optional)
   *   comment     — string (optional)
   *   skipped     — boolean (optional, default false)
   *
   * Saves one session_feedback row to the database.
   */
  router.post("/", async (req, res, next) => {
    try {
      const { sessionId, source, outcome, experience, comment, skipped } =
        req.body as {
          sessionId?: string;
          source?: string;
          outcome?: string;
          experience?: string;
          comment?: string;
          skipped?: boolean;
        };

      if (!sessionId) {
        res.status(400).json({ error: "sessionId is required." });
        return;
      }

      if (!UUID_RE.test(sessionId)) {
        res.status(400).json({ error: "sessionId must be a valid UUID." });
        return;
      }

      await createSessionFeedback(db, {
        session_id: sessionId,
        source: source ?? "student",
        outcome: outcome ?? null,
        experience: experience ?? null,
        comment: comment ?? null,
        skipped: skipped ?? false,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
