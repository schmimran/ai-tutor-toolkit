import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRequireAuth, type AuthedRequest } from "../middleware/require-auth.js";

/**
 * Auth router — parallel entry point for Supabase-backed individual user
 * accounts (issue #73).
 *
 * This is intentionally separate from the existing passcode access wall
 * (`/api/access/verify`). Endpoints under `/api/auth/*` do not grant access
 * to the main app at `/` — they are a smoke-test surface for the new login
 * flow at `/login.html`.
 *
 * Two Supabase clients are required:
 *   - `db`     — service-role client. Used for admin operations
 *                (`auth.admin.createUser`, `auth.admin.signOut`) and for JWT
 *                verification via `db.auth.getUser(token)` inside the
 *                `createRequireAuth` middleware.
 *   - `anonDb` — anon client. Used for `signInWithPassword` and
 *                `refreshSession`, which must go through the public-facing
 *                auth API rather than the service role.
 */
export function createAuthRouter(db: SupabaseClient, anonDb: SupabaseClient): Router {
  const router = Router();
  const requireAuth = createRequireAuth(db);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateCredentials(body: unknown): { email: string; password: string } | string {
    if (!body || typeof body !== "object") return "invalid_request";
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || !EMAIL_RE.test(email)) return "invalid_email";
    if (typeof password !== "string" || password.length < 8) return "invalid_password";
    return { email, password };
  }

  /**
   * POST /api/auth/register
   *
   * Creates a new Supabase auth user with `email_confirm: false` so the user
   * must confirm their email before login succeeds. Uses the service-role
   * admin API. Returns a generic error message on failure to avoid leaking
   * which emails are registered.
   */
  router.post("/register", async (req, res) => {
    const parsed = validateCredentials(req.body);
    if (typeof parsed === "string") {
      res.status(400).json({ ok: false, error: parsed });
      return;
    }

    try {
      const { error } = await db.auth.admin.createUser({
        email: parsed.email,
        password: parsed.password,
        email_confirm: false,
      });
      if (error) {
        res.status(400).json({ ok: false, error: "registration_failed" });
        return;
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  /**
   * POST /api/auth/login
   *
   * Authenticates via `anonDb.auth.signInWithPassword`. On success, returns
   * the access token, refresh token, and expiry so the client can store them
   * in sessionStorage. On failure, returns a single opaque error so callers
   * cannot distinguish "wrong password" from "unconfirmed email" etc.
   */
  router.post("/login", async (req, res) => {
    const parsed = validateCredentials(req.body);
    if (typeof parsed === "string") {
      res.status(400).json({ ok: false, error: "invalid_credentials" });
      return;
    }

    try {
      const { data, error } = await anonDb.auth.signInWithPassword({
        email: parsed.email,
        password: parsed.password,
      });
      if (error || !data?.session) {
        res.status(401).json({ ok: false, error: "invalid_credentials" });
        return;
      }
      res.json({
        ok: true,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? null,
      });
    } catch {
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  /**
   * POST /api/auth/refresh
   *
   * Exchanges a refresh token for a new access token pair via the anon
   * client.
   */
  router.post("/refresh", async (req, res) => {
    const body = req.body as { refreshToken?: unknown } | undefined;
    const refreshToken = body?.refreshToken;
    if (typeof refreshToken !== "string" || !refreshToken) {
      res.status(400).json({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const { data, error } = await anonDb.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data?.session) {
        res.status(401).json({ ok: false, error: "invalid_refresh_token" });
        return;
      }
      res.json({
        ok: true,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? null,
      });
    } catch {
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  /**
   * POST /api/auth/logout
   *
   * Revokes all refresh tokens for the authenticated user via the
   * service-role admin API. Note: this is NOT `anonDb.auth.signOut()`, which
   * only clears client-side state on the anon instance.
   */
  router.post("/logout", requireAuth, async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    try {
      await db.auth.admin.signOut(userId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  /**
   * GET /api/auth/me
   *
   * Smoke-test endpoint — returns the authenticated user's ID so the login
   * page can verify that the stored access token is working.
   */
  router.get("/me", requireAuth, (req, res) => {
    const userId = (req as AuthedRequest).userId;
    res.json({ ok: true, userId });
  });

  return router;
}
