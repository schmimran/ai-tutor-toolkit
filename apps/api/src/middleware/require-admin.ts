import type { Request, Response, NextFunction } from "express";
import type { AuthedRequest } from "./require-auth.js";

/**
 * Gate a route to admin users only. Must be used *after* `createRequireAuth`,
 * which populates `req.isAdmin` from the JWT's `app_metadata.is_admin` claim.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!(req as AuthedRequest).isAdmin) {
    res.status(403).json({ ok: false, error: "admin_only" });
    return;
  }
  next();
}
