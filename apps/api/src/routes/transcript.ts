import { Router } from "express";
import { getMessagesBySession } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "../lib/session-store.js";

export function createTranscriptRouter(db: SupabaseClient): Router {
  const router = Router();

  /**
   * GET /api/transcript/:sessionId
   *
   * Returns the session transcript.  Prefers the in-memory session (which has
   * the most up-to-date data); falls back to the database if the session has
   * been removed from memory.
   *
   * Response: { transcript: Array<{ role: string, text: string }> }
   */
  router.get("/:sessionId", async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const session = getSession(sessionId);

      if (session) {
        res.json({ transcript: session.getSessionSummary().transcript });
        return;
      }

      // Session not in memory — reconstruct from DB messages.
      const messages = await getMessagesBySession(db, sessionId);
      const transcript = messages.map((m) => ({
        role: m.role === "user" ? "Student" : "Tutor",
        text: m.content,
      }));

      res.json({ transcript });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
