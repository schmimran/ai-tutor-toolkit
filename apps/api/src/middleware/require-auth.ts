import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Request that has passed through `createRequireAuth`. The middleware
 * populates `userId` from a verified Supabase access token.
 */
export interface AuthedRequest extends Request {
  userId: string;
  userEmail: string;
  userName: string | null;
}

/**
 * Create an auth-enforcing middleware bound to a Supabase service-role client.
 *
 * The middleware reads `Authorization: Bearer <token>` from the request,
 * verifies the token via `db.auth.getUser(token)`, and — on success — sets
 * `req.userId` so downstream handlers can identify the caller. Any failure
 * (missing header, malformed header, invalid token, no user) responds with
 * 401 and does not leak the underlying reason.
 *
 * The service-role client is used here because Supabase's `getUser(token)`
 * is a server-side verification endpoint; no anon client is required.
 */
export function createRequireAuth(db: SupabaseClient): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header || typeof header !== "string") {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const token = match[1].trim();
    if (!token) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    try {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user?.id) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      (req as AuthedRequest).userId = data.user.id;
      (req as AuthedRequest).userEmail = data.user.email ?? "";
      (req as AuthedRequest).userName =
        (data.user.user_metadata?.name as string | undefined) ?? null;
      next();
    } catch {
      res.status(401).json({ ok: false, error: "unauthorized" });
    }
  };
}
