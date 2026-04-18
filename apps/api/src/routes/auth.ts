import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import rateLimit from "express-rate-limit";

/**
 * Auth router — server-side proxies for the three auth operations that
 * benefit from server-controlled rate limiting: register, login, and
 * forgot-password.
 *
 * Everything else (session refresh, logout, /me, change-password,
 * change-email, resend-verification, settings read/write) is handled
 * client-side via `@supabase/supabase-js` in `apps/web/public/auth.js`
 * and `settings.js`. RLS on the profiles table enforces per-user access.
 */
export function createAuthRouter(db: SupabaseClient, anonDb: SupabaseClient): Router {
  const router = Router();

  // ── Rate limiters ────────────────────────────────────────────────────
  const rateLimitHandler = (_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(429).json({ ok: false, error: "too_many_requests" });
  };

  function makeLimit(windowMs: number, max: number) {
    return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, handler: rateLimitHandler });
  }

  const loginLimiter = makeLimit(15 * 60 * 1000, 10);
  const registerLimiter = makeLimit(60 * 60 * 1000, 5);
  const forgotPasswordLimiter = makeLimit(15 * 60 * 1000, 3);

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
      // admin.createUser with email_confirm:false does not dispatch an email
      // on its own. Trigger the signup verification email via the public API.
      anonDb.auth.resend({ type: "signup", email: parsed.email }).catch((err: unknown) => {
        console.error("[auth] initial verification email failed:", err);
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ ok: false, error: "server_error" });
    }
  });

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

  router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
    const body = req.body as { email?: unknown } | undefined;
    const email = body?.email;
    if (typeof email !== "string" || !EMAIL_RE.test(email)) {
      res.json({ ok: true });
      return;
    }
    // Use CORS_ORIGIN if set; fall back to Host header.
    // Never use req.headers.origin — it can be spoofed by non-browser clients.
    const origin =
      process.env.CORS_ORIGIN ??
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

  return router;
}
