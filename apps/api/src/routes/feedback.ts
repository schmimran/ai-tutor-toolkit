import { Router } from "express";
import { createSessionFeedback } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { UUID_RE } from "../lib/validation.js";

const VALID_OUTCOMES = new Set(["solved", "partial", "stuck"]);
const VALID_EXPERIENCES = new Set(["positive", "neutral", "negative"]);

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

      // source: only 'student' is accepted from external callers; 'timeout' is server-only.
      if (source !== undefined && source !== "student") {
        res.status(400).json({ error: "Invalid source." });
        return;
      }

      if (outcome !== undefined && outcome !== null && !VALID_OUTCOMES.has(outcome)) {
        res.status(400).json({ error: "Invalid outcome." });
        return;
      }
      if (experience !== undefined && experience !== null && !VALID_EXPERIENCES.has(experience)) {
        res.status(400).json({ error: "Invalid experience." });
        return;
      }
      if (typeof comment === "string" && comment.length > 2000) {
        res.status(400).json({ error: "Comment too long (max 2000 characters)." });
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
