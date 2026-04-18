import { Router } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Config } from "@ai-tutor/core";
import { ALLOWED_MODELS } from "../lib/validation.js";

/* ── Build metadata (generated at build time) ──────────────────────────── */
interface BuildInfo {
  commitShort: string;
  builtAt: string;
}

let buildInfo: BuildInfo | null = null;
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(__dirname, "..", "..", "build-info.json"), "utf-8");
  buildInfo = JSON.parse(raw) as BuildInfo;
} catch {
  // File may not exist during local dev without a build step — that is fine.
}

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
   * available models/prompts for the picker UI, build version).
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
      promptSelectionEnabled: process.env.ALLOW_PROMPT_SELECTION === "true",
      buildVersion: buildInfo?.commitShort ?? null,
      buildDate: buildInfo?.builtAt ?? null,
      supabaseUrl: process.env.SUPABASE_URL ?? null,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? null,
    });
  });

  return router;
}
