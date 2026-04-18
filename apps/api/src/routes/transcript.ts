import { Router } from "express";
import { getMessagesBySession, getSession as getDbSession } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "../lib/session-store.js";
import { UUID_RE } from "../lib/validation.js";
import { createRequireAuth, type AuthedRequest } from "../middleware/require-auth.js";

export function createTranscriptRouter(db: SupabaseClient): Router {
  const router = Router();
  const requireAuth = createRequireAuth(db);

  /**
   * GET /api/transcript/:sessionId
   *
   * Returns the session transcript. Requires auth; the session must belong
   * to the caller.
   *
   * Response: { transcript: Array<{ role: string, text: string }> }
   */
  router.get("/:sessionId", requireAuth, async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      if (!UUID_RE.test(sessionId)) {
        res.status(400).json({ error: "sessionId must be a valid UUID." });
        return;
      }

      const callerId = (req as AuthedRequest).userId;
      const dbRow = await getDbSession(db, sessionId);
      if (!dbRow || dbRow.user_id !== callerId) {
        res.status(404).json({ error: "Session not found." });
        return;
      }

      const session = getSession(sessionId);
      if (session) {
        res.json({ transcript: session.getSessionSummary().transcript });
        return;
      }

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
