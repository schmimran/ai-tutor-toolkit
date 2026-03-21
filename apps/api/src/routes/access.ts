import { Router } from "express";

export function createAccessRouter(): Router {
  const router = Router();

  /**
   * POST /api/access/verify
   *
   * Body (JSON): { passcode: string }
   *
   * Validates the submitted passcode against the ACCESS_PASSCODE env var.
   * Returns { ok: true } on match, { ok: false } on mismatch or unset env var.
   * Never exposes the real passcode in the response.
   *
   * Fails closed: if ACCESS_PASSCODE is not set, all requests return { ok: false }.
   */
  router.post("/verify", (req, res) => {
    const { passcode } = req.body as { passcode?: unknown };
    const expected = process.env.ACCESS_PASSCODE;

    if (!expected) {
      res.json({ ok: false });
      return;
    }

    const ok = typeof passcode === "string" && passcode === expected;
    res.json({ ok });
  });

  return router;
}
