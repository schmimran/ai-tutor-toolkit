import dotenv from "dotenv";

dotenv.config();

/**
 * Load configuration from environment variables with defaults.
 * Call this at startup in any app that uses the tutor.
 */
export function loadConfig() {
  return {
    model: process.env.MODEL || "claude-sonnet-4-6",
    extendedThinking: process.env.EXTENDED_THINKING !== "false",
    systemPromptPath: process.env.SYSTEM_PROMPT_PATH || "templates/tutor-prompt.md",
    port: parseInt(process.env.PORT, 10) || 3000,
  };
}
