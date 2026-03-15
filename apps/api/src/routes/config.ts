import { Router } from "express";
import type { Config } from "@ai-tutor/core";

export function createConfigRouter(config: Config): Router {
  const router = Router();

  /**
   * GET /api/config
   *
   * Returns non-secret configuration the frontend needs to render correctly
   * (model name, whether extended thinking is active).
   *
   * Never includes API keys or service-role credentials.
   */
  router.get("/", (_req, res) => {
    res.json({
      model: config.model,
      extendedThinking: config.extendedThinking,
    });
  });

  return router;
}
