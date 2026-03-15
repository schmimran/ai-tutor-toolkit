import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";

/**
 * Central error handler.  Catches errors thrown by route handlers and
 * returns a JSON error response.  Must be registered last — after all routes.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // Express requires the four-argument signature even if next is unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  console.error("[api] Unhandled error:", err);

  const message =
    err instanceof Error ? err.message : "An unexpected error occurred.";

  res.status(500).json({ error: message });
};
