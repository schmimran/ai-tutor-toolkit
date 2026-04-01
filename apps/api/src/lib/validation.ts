/** Matches a standard UUID (version-agnostic, case-insensitive). */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Model IDs accepted by the chat and config routes. */
export const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
]);

/**
 * Returns a trimmed email string if the value looks like a valid address,
 * or null otherwise.  Intentionally lenient — just enough to reject garbage
 * like bare "@" or missing local/domain parts.
 */
export function sanitizeEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 254) return null;
  const trimmed = value.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex < 1 || atIndex === trimmed.length - 1) return null;
  return trimmed;
}
