/**
 * Configuration loaded from environment variables at startup.
 * No .env file loading — use direnv or export vars in your shell.
 *
 * Required env vars (no defaults — process exits if missing):
 *   ANTHROPIC_API_KEY
 *
 * Optional env vars (with defaults):
 *   MODEL               — Anthropic model ID (default: claude-sonnet-4-6)
 *   EXTENDED_THINKING   — "false" to disable (default: enabled)
 *   SYSTEM_PROMPT_PATH  — path to prompt file, relative to repo root
 *   PORT                — HTTP port for the API server (default: 3000)
 */
import path from "path";

export interface Config {
  model: string;
  extendedThinking: boolean;
  systemPromptPath: string;
  defaultPromptName: string;
  port: number;
  autoEvaluate: boolean;
}

export function loadConfig(): Config {
  const systemPromptPath =
    process.env.SYSTEM_PROMPT_PATH ?? "templates/tutor-prompt-v7.md";
  return {
    model: process.env.MODEL ?? "claude-sonnet-4-6",
    extendedThinking: process.env.EXTENDED_THINKING !== "false",
    systemPromptPath,
    defaultPromptName: path.basename(systemPromptPath, ".md"),
    port: parseInt(process.env.PORT ?? "3000", 10),
    autoEvaluate: process.env.AUTO_EVALUATE !== "false",
  };
}
