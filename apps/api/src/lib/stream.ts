import type { Response } from "express";

/**
 * Set SSE response headers and flush them immediately so the client sees the
 * connection open before any events arrive.
 */
export function initSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering if present.
  res.flushHeaders();
}

/**
 * Write a single SSE data event.  The payload is JSON-serialized.
 */
export function sendEvent(
  res: Response,
  data: Record<string, unknown>
): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Write an SSE comment (heartbeat) to keep the connection alive through
 * proxies that close idle connections.
 */
export function sendHeartbeat(res: Response): void {
  res.write(": heartbeat\n\n");
}
