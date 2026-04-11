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
  const BIRTHDATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ALLOWED_GRADES = new Set([
    "6th",
    "7th",
    "8th",
    "9th",
    "10th",
    "11th",
    "12th",
    "Other",
  ]);
  const MIN_AGE_YEARS = 13;

  function validateCredentials(body: unknown): { email: string; password: string } | string {
    if (!body || typeof body !== "object") return "invalid_request";
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || !EMAIL_RE.test(email)) return "invalid_email";
    if (typeof password !== "string" || password.length < 8) return "invalid_password";
    return { email, password };
  }

  interface RegistrationProfile {
    name: string;
    birthdate: string;
    gradeLevel: string;
    state: string | null;
    country: string | null;
  }

  function validateRegistrationProfile(body: unknown): RegistrationProfile | string {
    if (!body || typeof body !== "object") return "invalid_request";
    const {
      name,
      birthdate,
      gradeLevel,
      state,
      country,
    } = body as {
      name?: unknown;
      birthdate?: unknown;
      gradeLevel?: unknown;
      state?: unknown;
      country?: unknown;
    };

    if (typeof name !== "string" || name.trim().length === 0) return "invalid_name";
    if (typeof birthdate !== "string" || !BIRTHDATE_RE.test(birthdate)) return "invalid_birthdate";
    const parsed = new Date(birthdate + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime())) return "invalid_birthdate";
    if (typeof gradeLevel !== "string" || !ALLOWED_GRADES.has(gradeLevel)) return "invalid_grade";

    const stateVal = typeof state === "string" && state.trim().length > 0 ? state.trim() : null;
    const countryVal = typeof country === "string" && country.trim().length > 0 ? country.trim() : null;

    return {
      name: name.trim(),
      birthdate,
      gradeLevel,
      state: stateVal,
      country: countryVal,
    };
  }

  function computeAgeYears(birthdate: string, today: Date = new Date()): number {
    const [y, m, d] = birthdate.split("-").map((n) => parseInt(n, 10));
    let age = today.getUTCFullYear() - y;
    const monthDiff = today.getUTCMonth() + 1 - m;
    if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < d)) {
      age -= 1;
    }
    return age;
  }

  /**
   * POST /api/auth/register
   *
   * Creates a new Supabase auth user with `email_confirm: false` so Supabase
   * sends a verification email before the account can be used to sign in
   * (issue #76). Uses the service-role admin API. Additional profile fields
   * (name, birthdate, grade_level, state, country) are persisted in
   * `user_metadata`. Returns a generic error message on failure to avoid
   * leaking which emails are registered; the one exception is the `underage`
   * error, which is surfaced so the client can show a specific message.
   */
  router.post("/register", async (req, res) => {
    const parsed = validateCredentials(req.body);
    if (typeof parsed === "string") {
      res.status(400).json({ ok: false, error: parsed });
      return;
    }
    const profile = validateRegistrationProfile(req.body);
    if (typeof profile === "string") {
      res.status(400).json({ ok: false, error: profile });
      return;
    }
    const age = computeAgeYears(profile.birthdate);
    if (age < MIN_AGE_YEARS) {
      res.status(400).json({ ok: false, error: "underage" });
      return;
    }

    try {
      const { error } = await db.auth.admin.createUser({
        email: parsed.email,
        password: parsed.password,
        email_confirm: false,
        user_metadata: {
          name: profile.name,
          birthdate: profile.birthdate,
          grade_level: profile.gradeLevel,
          state: profile.state,
          country: profile.country,
        },
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
   * in sessionStorage. On failure, returns an opaque `invalid_credentials`
   * error in most cases. The one exception is `email_not_confirmed`, which
   * is passed through so the client can offer a "resend verification email"
   * affordance (issue #76).
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
        const code = (error as { code?: string } | null)?.code;
        if (code === "email_not_confirmed") {
          res.status(401).json({ ok: false, error: "email_not_confirmed" });
          return;
        }
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
   * POST /api/auth/resend-verification
   *
   * Re-sends the Supabase signup verification email for a given address
   * (issue #76). Always returns `{ ok: true }` regardless of whether the
   * email exists, to avoid account enumeration. Errors are logged
   * server-side but never surfaced to the client.
   */
  router.post("/resend-verification", async (req, res) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = body?.email;
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      // Still return ok:true to avoid enumeration / probing.
      res.json({ ok: true });
      return;
    }
    try {
      await anonDb.auth.resend({ type: "signup", email });
    } catch {
      // Swallow — do not surface errors to client.
    }
    res.json({ ok: true });
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
