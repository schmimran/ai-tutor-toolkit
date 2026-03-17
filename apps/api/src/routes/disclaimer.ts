import { Router } from "express";
import geoip from "geoip-lite";
import { createDisclaimerAcceptance } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDisclaimerRouter(db: SupabaseClient): Router {
  const router = Router();

  /**
   * POST /api/disclaimer/accept
   *
   * Body (JSON):
   *   sessionId  — string (UUID, optional) — the client's current session ID
   *
   * Records disclaimer acceptance with IP, geo, and user-agent.
   * Always returns { ok: true } — DB errors are logged but never surfaced.
   */
  router.post("/accept", async (req, res, next) => {
    try {
      const { sessionId } = req.body as { sessionId?: unknown };

      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
        req.socket.remoteAddress ??
        "";
      const geo = geoip.lookup(ip);

      const validSessionId =
        typeof sessionId === "string" && UUID_RE.test(sessionId)
          ? sessionId
          : null;

      try {
        await createDisclaimerAcceptance(db, {
          client_ip: ip || null,
          client_geo: geo ? (geo as unknown as Record<string, unknown>) : null,
          client_user_agent: (req.headers["user-agent"] as string) ?? null,
          // session_id left null — backfilled by linkDisclaimerAcceptance() after
          // the first /api/chat call creates the session row.
          session_id: null,
          client_session_id: validSessionId,
        });
      } catch (err) {
        console.error("[disclaimer] Could not persist acceptance:", err);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
