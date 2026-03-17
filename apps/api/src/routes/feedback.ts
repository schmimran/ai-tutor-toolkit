import { Router } from "express";
import { createFeedback, createFeedbackBatch } from "@ai-tutor/db";
import { sendFeedback, sendFeedbackBatch } from "@ai-tutor/email";
import type { BatchFeedbackItem } from "@ai-tutor/email";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailConfig } from "./sessions.js";
import { UUID_RE } from "../lib/validation.js";

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

  /**
   * POST /api/feedback/batch
   *
   * Body (JSON):
   *   sessionId  — string (required)
   *   items      — Array<{ msgId, msgText, category, sentiment, rating }> (required, non-empty)
   *
   * Saves all feedback rows in one DB round-trip and sends a single summary email.
   * All three categories are sent for every message; unselected categories have null rating/sentiment.
   */
  router.post("/batch", async (req, res, next) => {
    try {
      const { sessionId, items } = req.body as {
        sessionId?: string;
        items?: unknown;
      };

      if (!sessionId) {
        res.status(400).json({ error: "sessionId is required." });
        return;
      }

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "items must be a non-empty array." });
        return;
      }

      const inserts = (items as Array<{ msgId?: unknown; msgText?: unknown; category?: unknown; sentiment?: unknown; rating?: unknown }>)
        .filter(item => typeof item === "object" && item !== null)
        .map(item => ({
          session_id: sessionId,
          message_id: typeof item.msgId === "string" && UUID_RE.test(item.msgId)
            ? item.msgId
            : null,
          category: typeof item.category === "string" && item.category.trim()
            ? item.category.trim()
            : null,
          rating: typeof item.rating === "number" && item.rating >= 1 && item.rating <= 5
            ? Math.round(item.rating)
            : null,
          comment: null,
        }));

      const rows = await createFeedbackBatch(db, inserts);

      const emailItems: BatchFeedbackItem[] = (items as Array<{ msgText?: unknown; category?: unknown; sentiment?: unknown }>)
        .filter(item => typeof item === "object" && item !== null)
        .map(item => ({
          msgText: typeof item.msgText === "string" && item.msgText.trim()
            ? item.msgText.trim().slice(0, 120)
            : "(no text)",
          category: String(item.category ?? ""),
          sentiment: typeof item.sentiment === "string" ? item.sentiment : null,
        }));

      void sendFeedbackBatch(emailConfig, sessionId, emailItems);

      res.json({ ok: true, count: rows.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
