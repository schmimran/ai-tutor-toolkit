/**
 * Asserts that a Supabase query returned a row without error.
 * Throws a descriptive Error if the query failed or returned no data.
 */
export function assertRow<T>(
  data: T | null,
  error: { message: string } | null,
  context: string
): T {
  if (error) throw new Error(`${context}: ${error.message}`);
  if (!data) throw new Error(`${context}: no row returned`);
  return data;
}
