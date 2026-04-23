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

  /**
   * GET /api/admin/stats
   *
   * Returns aggregate usage stats:
   *   - totalSessions: total row count in `sessions`
   *   - activeUsers: registered-user count (labeled "Registered Users" in UI)
   *   - sessionsToday: sessions with started_at >= today-midnight
   *   - sessionsThisWeek: sessions with started_at >= now - 7 days
   *   - avgDurationSeconds: mean duration of up to 500 recent ended sessions
   *
   * Response: { ok: true, stats: AdminStats }
   */
  router.get("/stats", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const stats = await getAdminStats(db);
      res.json({ ok: true, stats });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/admin/sessions
   *
   * Paginated list of all ended sessions with embedded feedback and
   * evaluation data. Query params:
   *   - limit (default 50, max 100)
   *   - offset (default 0)
   *
   * Response: { ok: true, sessions: AdminSessionRow[], total: number }
   */
  router.get("/sessions", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
      const rawOffset = parseInt(String(req.query.offset ?? "0"), 10);
      const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
      const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
      const result = await getAdminSessionList(db, { limit, offset });
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
