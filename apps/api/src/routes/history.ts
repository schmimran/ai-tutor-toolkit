import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionsByUser, getFeedbackForSessions } from "@ai-tutor/db";
import { createRequireAuth, type AuthedRequest } from "../middleware/require-auth.js";

/**
 * History router — returns ended sessions for the authenticated user.
 *
 * GET /api/history
 *   Requires Bearer auth. Returns the 50 most recent ended sessions for the
 *   calling user, ordered by started_at DESC.
 */
export function createHistoryRouter(db: SupabaseClient): Router {
  const router = Router();
  const requireAuth = createRequireAuth(db);

  router.get("/", requireAuth, async (req, res, next) => {
    try {
      const { userId } = req as AuthedRequest;
      const rows = await getSessionsByUser(db, userId);
      const feedbackMap = await getFeedbackForSessions(db, rows.map((r) => r.id));

      const sessions = rows.map((r) => {
        const fb = feedbackMap.get(r.id);
        return {
          id: r.id,
          started_at: r.started_at,
          ended_at: r.ended_at,
          prompt_name: r.prompt_name,
          model: r.model,
          total_input_tokens: r.total_input_tokens,
          total_output_tokens: r.total_output_tokens,
          outcome: fb?.outcome ?? null,
          experience: fb?.experience ?? null,
        };
      });

      res.json({ sessions });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
