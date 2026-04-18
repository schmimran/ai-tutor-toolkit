import cors from "cors";

/**
 * CORS middleware.  Fails closed: when `CORS_ORIGIN` is not set, cross-origin
 * requests are rejected.  Set `CORS_ORIGIN` explicitly to the allowed origin
 * (e.g. your frontend domain) for every deployment — including local dev when
 * the frontend runs on a different port than the API server.
 */
const corsOrigin = process.env.CORS_ORIGIN ?? false;
if (!process.env.CORS_ORIGIN) {
  console.warn(
    "[cors] CORS_ORIGIN not set — cross-origin requests will be rejected",
  );
}

export const corsMiddleware = cors({
  origin: corsOrigin,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
