import { Router } from "express";
import { createFeedback } from "@ai-tutor/db";
import { sendFeedback } from "@ai-tutor/email";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailConfig } from "./sessions.js";

export function createFeedbackRouter(
  db: SupabaseClient,
  emailConfig: EmailConfig
): Router {
  const router = Router();

  /**
   * POST /api/feedback
   *
   * Body (JSON):
   *   sessionId  — string (required)
   *   rating     — number 1–5 (optional)
   *   comment    — string (optional)
   *
   * Saves feedback to the database and sends an email notification.
   */
  router.post("/", async (req, res, next) => {
    try {
      const { sessionId, rating, comment } = req.body as {
        sessionId?: string;
        rating?: unknown;
        comment?: unknown;
      };

      if (!sessionId) {
        res.status(400).json({ error: "sessionId is required." });
        return;
      }

      const parsedRating =
        typeof rating === "number" && rating >= 1 && rating <= 5
          ? Math.round(rating)
          : null;

      const parsedComment =
        typeof comment === "string" && comment.trim() ? comment.trim() : null;

      const row = await createFeedback(db, {
        session_id: sessionId,
        rating: parsedRating,
        comment: parsedComment,
      });

      void sendFeedback(emailConfig, {
        sessionId,
        rating: parsedRating,
        comment: parsedComment,
        submittedAt: new Date(row.created_at),
      });

      res.json({ ok: true, id: row.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
