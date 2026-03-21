/** Matches a standard UUID (version-agnostic, case-insensitive). */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns a trimmed email string if the value looks like a valid address,
 * or null otherwise.  Intentionally lenient — just enough to reject garbage.
 */
export function sanitizeEmail(value: unknown): string | null {
  return typeof value === "string" && value.includes("@") && value.length <= 254
    ? value.trim()
    : null;
}
