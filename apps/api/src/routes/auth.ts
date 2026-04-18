import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProfile, getProfile, updateProfile } from "@ai-tutor/db";
import rateLimit from "express-rate-limit";
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

  // ── Rate limiters ────────────────────────────────────────────────────
  const rateLimitHandler = (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(429).json({ ok: false, error: "too_many_requests" });
  };

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

  const resendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  });

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

  // Sends (or re-sends) the Supabase signup verification email.
  // admin.createUser with email_confirm:false does NOT dispatch an email on its
  // own — only the public resend API does.  Errors are logged but never
  // surfaced to the caller (anti-enumeration + always-ok contract).
  function sendVerificationEmail(email: string, context: string): void {
    anonDb.auth.resend({ type: "signup", email }).catch((err: unknown) => {
      console.error(`[auth] ${context}:`, err);
    });
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
  router.post("/register", registerLimiter, async (req, res) => {
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
      const { data: createData, error } = await db.auth.admin.createUser({
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
      // Create a profile row for the new user (non-blocking on failure).
      if (createData?.user?.id) {
        try {
          await createProfile(db, createData.user.id);
        } catch (profileErr) {
          console.error("[auth] createProfile failed for user", createData.user.id, profileErr);
        }
      }
      sendVerificationEmail(parsed.email, "initial verification email failed");
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
  router.post("/login", loginLimiter, async (req, res) => {
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
  router.post("/resend-verification", resendLimiter, async (req, res) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = body?.email;
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      // Still return ok:true to avoid enumeration / probing.
      res.json({ ok: true });
      return;
    }
    sendVerificationEmail(email, "resend-verification failed");
    res.json({ ok: true });
  });

  /**
   * POST /api/auth/forgot-password
   *
   * Sends a Supabase password-reset email. Always returns `{ ok: true }`
   * regardless of whether the email exists (anti-enumeration). Derives the
   * redirect URL from the request Origin header.
   */
  router.post("/forgot-password", resendLimiter, async (req, res) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = body?.email;
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      res.json({ ok: true });
      return;
    }
    const origin =
      (req.headers.origin as string | undefined) ??
      `https://${req.headers.host ?? "localhost"}`;
    anonDb.auth
      .resetPasswordForEmail(email, {
        redirectTo: `${origin}/login.html`,
      })
      .catch((err: unknown) => {
        console.error("[auth] forgot-password resetPasswordForEmail failed:", err);
      });
    res.json({ ok: true });
  });

  /**
   * POST /api/auth/refresh
   *
   * Exchanges a refresh token for a new access token pair via the anon
   * client.
   */
  router.post("/refresh", resendLimiter, async (req, res) => {
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
   * POST /api/auth/change-password
   *
   * Updates the authenticated user's password via the service-role admin API.
   * Body: `{ newPassword: string }` — must be >= 8 characters.
   *
   * Note: The current password is NOT verified server-side. Supabase's
   * `auth.admin.updateUserById` does not support verifying the old password,
   * and `auth.updateUser` requires a valid client-side session (which we
   * don't have on the service-role client). The user must already be
   * authenticated (bearer token verified by requireAuth middleware), which
   * provides sufficient authorization for this action.
   */
  router.post("/change-password", resendLimiter, requireAuth, async (req, res) => {
    const body = req.body as { newPassword?: unknown; refreshToken?: unknown } | undefined;
    const newPassword = body?.newPassword;
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ ok: false, error: "weak_password" });
      return;
    }

    const userId = (req as AuthedRequest).userId;
    const refreshToken = typeof body?.refreshToken === "string" && body.refreshToken ? body.refreshToken : null;
    try {
      const { error } = await db.auth.admin.updateUserById(userId, { password: newPassword });
      if (error) {
        console.error("[auth] change-password updateUserById failed:", error);
        res.status(500).json({ ok: false, error: "server_error" });
        return;
      }
      // updateUserById invalidates all existing tokens. If the client supplied
      // a refresh token, issue a fresh session so the UI stays authenticated.
      if (refreshToken) {
        const { data: refreshed, error: refreshError } = await anonDb.auth.refreshSession({ refresh_token: refreshToken });
        if (!refreshError && refreshed?.session) {
          res.json({
            ok: true,
            accessToken: refreshed.session.access_token,
            refreshToken: refreshed.session.refresh_token,
            expiresAt: refreshed.session.expires_at,
          });
          return;
        }
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[auth] change-password unexpected error:", err);
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
   * Returns the authenticated user's ID, admin status, email, and display name.
   * isAdmin is read from the profiles table; returns false for legacy users
   * without a profile row (fail-closed).
   */
  router.get("/me", requireAuth, async (req, res) => {
    const authed = req as AuthedRequest;
    const { userId, userEmail, userName } = authed;
    try {
      const profile = await getProfile(db, userId);
      res.json({
        ok: true,
        userId,
        isAdmin: profile?.isAdmin ?? false,
        email: userEmail,
        name: userName ?? null,
      });
    } catch (err) {
      console.error("[auth] getProfile failed for /me:", err);
      res.json({ ok: true, userId, isAdmin: false, email: userEmail, name: userName ?? null });
    }
  });

  /**
   * GET /api/auth/settings
   *
   * Returns the authenticated user's profile settings for the settings page.
   * Reads from both auth.users (name, email, birthdate, gradeLevel) and the
   * profiles table (emailTranscriptsEnabled). Handles missing profile rows
   * gracefully by defaulting emailTranscriptsEnabled to true.
   */
  router.get("/settings", requireAuth, async (req, res) => {
    const authed = req as AuthedRequest;
    const { userId } = authed;
    try {
      const [profileResult, userResult] = await Promise.all([
        getProfile(db, userId),
        db.auth.admin.getUserById(userId),
      ]);
      const meta = userResult.data?.user?.user_metadata ?? {};
      const email = userResult.data?.user?.email ?? authed.userEmail;
      res.json({
        ok: true,
        name: (meta.name as string | undefined) ?? null,
        email,
        birthdate: (meta.birthdate as string | undefined) ?? null,
        gradeLevel: (meta.grade_level as string | undefined) ?? null,
        emailTranscriptsEnabled: profileResult?.emailTranscriptsEnabled ?? true,
      });
    } catch (err) {
      console.error("[auth] GET /settings error:", err);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  /**
   * POST /api/auth/settings
   *
   * Updates mutable profile settings. Accepts `gradeLevel` (updates
   * user_metadata on auth.users) and `emailTranscriptsEnabled` (updates
   * profiles table). Uses selective merge for user_metadata to avoid wiping
   * other fields.
   */
  router.post("/settings", requireAuth, async (req, res) => {
    const authed = req as AuthedRequest;
    const { userId } = authed;
    const body = req.body as {
      gradeLevel?: unknown;
      emailTranscriptsEnabled?: unknown;
    } | undefined;

    try {
      // Update gradeLevel in auth.users user_metadata if provided.
      if (body?.gradeLevel !== undefined) {
        const grade = body.gradeLevel;
        if (typeof grade !== "string" || !ALLOWED_GRADES.has(grade)) {
          res.status(400).json({ ok: false, error: "invalid_grade" });
          return;
        }
        // Get current metadata first, then merge selectively.
        const { data: { user } } = await db.auth.admin.getUserById(userId);
        const currentMeta = user?.user_metadata ?? {};
        await db.auth.admin.updateUserById(userId, {
          user_metadata: { ...currentMeta, grade_level: grade },
        });
      }

      // Update emailTranscriptsEnabled in profiles table if provided.
      if (body?.emailTranscriptsEnabled !== undefined) {
        const enabled = body.emailTranscriptsEnabled;
        if (typeof enabled !== "boolean") {
          res.status(400).json({ ok: false, error: "invalid_request" });
          return;
        }
        await updateProfile(db, userId, { emailTranscriptsEnabled: enabled });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("[auth] POST /settings error:", err);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  /**
   * POST /api/auth/change-email
   *
   * Updates the authenticated user's email address via the admin API.
   * Body: `{ newEmail: string }`.
   *
   * // NOTE: verify resend behavior with Supabase email_change type in production
   */
  router.post("/change-email", resendLimiter, requireAuth, async (req, res) => {
    const authed = req as AuthedRequest;
    const { userId } = authed;
    const body = req.body as { newEmail?: unknown } | undefined;
    const newEmail = body?.newEmail;
    if (typeof newEmail !== "string" || !EMAIL_RE.test(newEmail)) {
      res.status(400).json({ ok: false, error: "invalid_email" });
      return;
    }

    try {
      const { error } = await db.auth.admin.updateUserById(userId, { email: newEmail });
      if (error) {
        console.error("[auth] change-email updateUserById failed:", error);
        res.status(500).json({ ok: false, error: "server_error" });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[auth] change-email unexpected error:", err);
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });

  return router;
}
