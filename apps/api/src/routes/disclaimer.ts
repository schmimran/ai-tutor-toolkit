import { Router } from "express";
import { createDisclaimerAcceptance } from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractClientInfo } from "../lib/geo.js";
import { UUID_RE } from "../lib/validation.js";

export function createDisclaimerRouter(db: SupabaseClient): Router {
  const router = Router();

  /**
   * POST /api/disclaimer/accept
   *
   * Body (JSON):
   *   sessionId  — string (UUID, optional) — the client's current session ID
   *   email      — string (optional) — email submitted through the access-wall overlay
   *
   * Records disclaimer acceptance with IP, geo, user-agent, and email.
   * Always returns { ok: true } — DB errors are logged but never surfaced.
   */
  router.post("/accept", async (req, res, next) => {
    try {
      const { sessionId, email } = req.body as { sessionId?: unknown; email?: unknown };

      const clientInfo = extractClientInfo(req);

      const validSessionId =
        typeof sessionId === "string" && UUID_RE.test(sessionId)
          ? sessionId
          : null;

      const validEmail =
        typeof email === "string" && email.includes("@") && email.length <= 254
          ? email.trim()
          : null;

      try {
        await createDisclaimerAcceptance(db, {
          client_ip: clientInfo.ip || null,
          client_geo: clientInfo.geo ?? null,
          client_user_agent: clientInfo.userAgent ?? null,
          // session_id left null — backfilled by linkDisclaimerAcceptance() after
          // the first /api/chat call creates the session row.
          session_id: null,
          client_session_id: validSessionId,
          email: validEmail,
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
