import { Router } from "express";
import type { Config } from "@ai-tutor/core";

export function createConfigRouter(config: Config, inactivityMs: number): Router {
  const router = Router();

  /**
   * GET /api/config
   *
   * Returns non-secret configuration the frontend needs to render correctly
   * (model name, whether extended thinking is active, inactivity timeout).
   *
   * Never includes API keys or service-role credentials.
   */
  router.get("/", (_req, res) => {
    res.json({
      model: config.model,
      extendedThinking: config.extendedThinking,
      inactivityMs,
      contactEmail: process.env.CONTACT_EMAIL ?? "wax.spirits8d@icloud.com",
    });
  });

  return router;
}
