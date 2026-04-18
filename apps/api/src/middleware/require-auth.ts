import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Request that has passed through `createRequireAuth`. The middleware
 * populates `userId`, `userEmail`, `userName`, and `isAdmin` from a
 * verified Supabase access token.
 *
 * `isAdmin` is read from the JWT's `app_metadata.is_admin` claim — no
 * extra DB query. Set via SQL (see migration 005 header).
 */
export interface AuthedRequest extends Request {
  userId: string;
  userEmail: string;
  userName: string | null;
  isAdmin: boolean;
}

/**
 * Create an auth-enforcing middleware bound to a Supabase service-role client.
 *
 * The middleware reads `Authorization: Bearer <token>` from the request,
 * verifies the token via `db.auth.getUser(token)`, and — on success — sets
 * `req.userId` / `req.userEmail` / `req.userName` / `req.isAdmin`. Any failure
 * (missing header, malformed header, invalid token, no user) responds with
 * 401 and does not leak the underlying reason.
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
    const token = match[1];

    try {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data?.user?.id) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
      }
      const authed = req as AuthedRequest;
      authed.userId = data.user.id;
      authed.userEmail = data.user.email ?? "";
      authed.userName = (data.user.user_metadata?.name as string | undefined) ?? null;
      authed.isAdmin = Boolean(
        (data.user.app_metadata as { is_admin?: unknown } | undefined)?.is_admin,
      );
      next();
    } catch {
      res.status(401).json({ ok: false, error: "unauthorized" });
    }
  };
}
