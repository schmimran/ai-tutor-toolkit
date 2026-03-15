import cors from "cors";

/**
 * CORS middleware.  In production, restrict `origin` to your frontend domain.
 * In development, all origins are allowed so the frontend can run on a
 * different port than the API server.
 */
export const corsMiddleware = cors({
  origin: process.env.CORS_ORIGIN ?? "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
