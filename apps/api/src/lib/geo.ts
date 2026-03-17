import geoip from "geoip-lite";
import type { Request } from "express";
import type { ClientInfo } from "@ai-tutor/core";

/**
 * Extract client IP, geo location, and user agent from an Express request.
 * Reads IP from x-forwarded-for (first entry if comma-separated) or the
 * raw socket address.  Runs a geoip lookup and returns a ClientInfo object.
 */
export function extractClientInfo(req: Request): ClientInfo {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "";
  const geo = geoip.lookup(ip);
  return {
    ip,
    geo: geo ? (geo as unknown as Record<string, unknown>) : null,
    userAgent: req.headers["user-agent"],
  };
}
