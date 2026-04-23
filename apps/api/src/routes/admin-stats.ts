import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminStats, getAdminSessionList } from "@ai-tutor/db";
import { createRequireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";

/**
 * Admin dashboard stats + recent-sessions list.
 *
 * MUST be passed the service-role `db` client — not the anon client. The
 * underlying DB queries call `auth.admin.listUsers()` which requires the
 * service-role key.
 *
 * All routes chain `requireAuth + requireAdmin`, matching the pattern used
 * by `createAdminEvaluationsRouter`.
 */
export function createAdminStatsRouter(db: SupabaseClient): Router {
  const router = Router();
  const requireAuth = createRequireAuth(db);

  router.get("/stats", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const stats = await getAdminStats(db);
      res.json({ ok: true, stats });
    } catch (err) {
      next(err);
    }
  });

  router.get("/sessions", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const limit = parseInt(String(req.query.limit ?? ""), 10) || 50;
      const offset = parseInt(String(req.query.offset ?? ""), 10) || 0;
      const result = await getAdminSessionList(db, { limit, offset });
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
