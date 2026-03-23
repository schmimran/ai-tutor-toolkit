import { Router } from "express";
import type { Config } from "@ai-tutor/core";
import { ALLOWED_MODELS } from "../lib/validation.js";

export function createConfigRouter(
  config: Config,
  inactivityMs: number,
  promptMap: Map<string, string>,
  defaultPromptName: string
): Router {
  const router = Router();

  /**
   * GET /api/config
   *
   * Returns non-secret configuration the frontend needs to render correctly
   * (model name, whether extended thinking is active, inactivity timeout,
   * available models/prompts for the picker UI).
   *
   * Never includes API keys or service-role credentials.
   */
  router.get("/", (_req, res) => {
    res.json({
      model: config.model,
      extendedThinking: config.extendedThinking,
      inactivityMs,
      contactEmail: process.env.CONTACT_EMAIL ?? "wax.spirits8d@icloud.com",
      availableModels: [...ALLOWED_MODELS],
      availablePrompts: [...promptMap.keys()],
      defaultPrompt: defaultPromptName,
    });
  });

  return router;
}
