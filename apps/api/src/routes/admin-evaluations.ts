import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "@ai-tutor/core";
import type { TranscriptEmailConfig } from "@ai-tutor/email";
import {
  getEvaluationBatch,
  listEvaluationBatches,
} from "@ai-tutor/db";
import { createRequireAuth, type AuthedRequest } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { UUID_RE } from "../lib/validation.js";
import {
  createEvaluationBatchForPending,
  refreshBatchStatus,
  processBatchResults,
  MAX_BATCH_SIZE,
} from "../lib/batch-evaluation.js";

export function createAdminEvaluationsRouter(
  db: SupabaseClient,
  config: Config,
  emailConfig: TranscriptEmailConfig,
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(db);

  /**
   * POST /api/admin/evaluations/batches
   *
   * Submit a new batch of session evaluations to Anthropic's Message Batches
   * API. Picks up sessions with `evaluated=false AND ended_at IS NOT NULL`
   * that aren't already claimed by an in-flight batch.
   *
   * Body: { limit?: number } — default 50, capped at MAX_BATCH_SIZE (100).
   * Response: { ok, id, anthropicBatchId, sessionCount } or { ok, sessionCount: 0 } if nothing pending.
   */
  router.post("/batches", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const body = req.body as { limit?: unknown } | undefined;
      const rawLimit = typeof body?.limit === "number" ? body.limit : 50;
      const limit = Math.max(1, Math.min(Math.floor(rawLimit), MAX_BATCH_SIZE));

      const result = await createEvaluationBatchForPending(db, {
        limit,
        evaluationModel: config.evaluationModel,
        submittedBy: (req as AuthedRequest).userId,
      });

      if (!result) {
        res.json({ ok: true, sessionCount: 0 });
        return;
      }

      res.json({
        ok: true,
        id: result.batch.id,
        anthropicBatchId: result.batch.anthropic_batch_id,
        sessionCount: result.sessionCount,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/admin/evaluations/batches
   *
   * List the most recent 50 batches (newest first) for admin visibility.
   */
  router.get("/batches", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const batches = await listEvaluationBatches(db, 50);
      res.json({ ok: true, batches });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/admin/evaluations/batches/:id
   *
   * Idempotent status-then-finalize: polls Anthropic for the current state,
   * and — once the batch is `ended` — downloads results, writes evaluations,
   * and sends admin + user transcript emails. Safe to call repeatedly.
   */
  router.get("/batches/:id", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) {
        res.status(400).json({ ok: false, error: "invalid_batch_id" });
        return;
      }

      let batch = await getEvaluationBatch(db, id);
      if (!batch) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
      }

      if (batch.status === "submitted") {
        batch = await refreshBatchStatus(db, batch);
      }

      if (batch.status === "ended") {
        const outcome = await processBatchResults(db, batch, {
          emailConfig,
          evaluationModel: config.evaluationModel,
        });
        const processed = await getEvaluationBatch(db, id);
        res.json({ ok: true, batch: processed ?? batch, outcome });
        return;
      }

      res.json({ ok: true, batch });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
