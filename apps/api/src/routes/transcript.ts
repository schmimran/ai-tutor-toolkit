import { Router } from "express";
import { getMessagesBySession, getSession as getDbSession } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "../lib/session-store.js";
import { UUID_RE } from "../lib/validation.js";
import { createOptionalAuth, type OptionalAuthRequest } from "../middleware/require-auth.js";

export function createTranscriptRouter(db: SupabaseClient): Router {
  const router = Router();
  const optionalAuth = createOptionalAuth(db);

  /**
   * GET /api/transcript/:sessionId
   *
   * Returns the session transcript.  Prefers the in-memory session (which has
   * the most up-to-date data); falls back to the database if the session has
   * been removed from memory.
   *
   * Ownership check: if a Bearer token is present, the middleware populates
   * req.userId. When the session has a user_id that differs from the caller,
   * the request is rejected with 403. When no Bearer token is provided the
   * request proceeds unauthenticated (preserves the existing app.js path).
   *
   * Response: { transcript: Array<{ role: string, text: string }> }
   */
  router.get("/:sessionId", optionalAuth, async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      if (!UUID_RE.test(sessionId)) {
        res.status(400).json({ error: "sessionId must be a valid UUID." });
        return;
      }

      const callerId = (req as OptionalAuthRequest).userId;

      // Ownership check — sessions with a user_id require a matching Bearer token.
      // Unauthenticated callers may not read sessions that belong to registered users.
      const dbRow = await getDbSession(db, sessionId);
      if (dbRow?.user_id) {
        if (!callerId || dbRow.user_id !== callerId) {
          res.status(403).json({ error: "forbidden" });
          return;
        }
      }

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
