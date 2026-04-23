import { Router } from "express";
import multer from "multer";
import type { TutorClient, TokenUsage, UserContent } from "@ai-tutor/core";
import {
  createMessage,
  createSession,
  updateSession,
} from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateSession, isReaping } from "../lib/session-store.js";
import { initSSE, sendEvent } from "../lib/stream.js";
import { extractClientInfo } from "../lib/geo.js";
import { createRequireAuth, type AuthedRequest } from "../middleware/require-auth.js";

/** Accepted MIME types for file uploads. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

import { ALLOWED_MODELS, UUID_RE } from "../lib/validation.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * Build Anthropic content blocks from the text message and any uploaded files.
 */
function buildUserContent(
  text: string,
  files: Express.Multer.File[]
): UserContent {
  if (files.length === 0) return text;

  const fileList = files.map((f) => f.originalname).join(", ");
  const contextText = `[Uploaded files: ${fileList}]\n\n${text}`;

  const fileBlocks = files.map((file) => {
    const base64 = file.buffer.toString("base64");
    if (file.mimetype === "application/pdf") {
      return {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
      };
    }
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: file.mimetype as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: base64,
      },
    };
  });

  return [{ type: "text" as const, text: contextText }, ...fileBlocks] as UserContent;
}

export function createChatRouter(
  tutorClient: TutorClient,
  db: SupabaseClient,
  promptMap: Map<string, string>,
  defaultPromptName: string,
  defaultModel: string,
  defaultExtendedThinking: boolean
): Router {
  const router = Router();
  const requireAuth = createRequireAuth(db);

  /**
   * POST /api/chat
   *
   * Body (multipart/form-data):
   *   sessionId   — client-generated UUID
   *   message     — student's text message
   *   model       — optional model override (validated against ALLOWED_MODELS)
   *   promptName  — optional prompt name override (validated against promptMap)
   *   files[]     — optional image or PDF attachments (max 5, 10 MB each)
   *
   * Response: SSE stream
   *   { type: "text_delta", text: "..." }   — one per token
   *   { type: "message_stop", messageId: "...", tokenUsage: { inputTokens: N, outputTokens: N } }  — final event
   *   { type: "error", message: "..." }     — on failure
   */
  router.post(
    "/",
    requireAuth,
    upload.array("files"),
    async (req, res, next) => {
      const userId = (req as AuthedRequest).userId;
      try {
        const {
          sessionId,
          message,
          model: modelReq,
          promptName: promptNameReq,
          extendedThinking: extendedThinkingReq,
        } = req.body as {
          sessionId?: string;
          message?: string;
          model?: string;
          promptName?: string;
          extendedThinking?: string;
        };

        if (!sessionId || !message?.trim()) {
          res.status(400).json({ error: "sessionId and message are required." });
          return;
        }

        if (!UUID_RE.test(sessionId)) {
          res.status(400).json({ error: "sessionId must be a valid UUID." });
          return;
        }

        const files = (req.files as Express.Multer.File[]) ?? [];

        if (isReaping(sessionId)) {
          res.status(409).json({ error: "Session is ending. Please start a new session." });
          return;
        }

        const session = getOrCreateSession(sessionId);
        const isFirstMessage = session.transcript.length === 0;

        if (isFirstMessage) {
          // Bind this session to the calling user and capture client metadata.
          session.ownerId = userId;
          session.setClientInfo(extractClientInfo(req));

          // Validate and set model for this session.
          session.model =
            modelReq && ALLOWED_MODELS.has(modelReq) ? modelReq : defaultModel;

          // Validate and set prompt for this session.
          session.promptName =
            promptNameReq && promptMap.has(promptNameReq)
              ? promptNameReq
              : defaultPromptName;

          // Validate and set extended thinking for this session. Multipart form
          // data sends booleans as the strings "true"/"false". Anything else
          // (including undefined) falls back to the server default.
          if (extendedThinkingReq === "true") {
            session.extendedThinking = true;
          } else if (extendedThinkingReq === "false") {
            session.extendedThinking = false;
          } else {
            session.extendedThinking = defaultExtendedThinking;
          }

          try {
            await createSession(db, {
              id: sessionId,
              client_ip: session.clientInfo.ip || null,
              client_geo: session.clientInfo.geo ?? null,
              client_user_agent: session.clientInfo.userAgent ?? null,
              email_sent: false,
              model: session.model,
              prompt_name: session.promptName,
              extended_thinking: session.extendedThinking,
              user_id: userId,
            });
          } catch (err) {
            console.error("[chat] Could not create DB session row:", err);
          }
        } else if (session.ownerId !== null && session.ownerId !== userId) {
          res.status(403).json({ error: "Forbidden." });
          return;
        }

        // Store uploaded files on the session for later email attachment.
        for (const file of files) {
          session.addFile(file.originalname, file.mimetype, file.buffer);
        }

        const userContent = buildUserContent(message, files);
        const transcriptText =
          files.length > 0
            ? `[Uploaded files: ${files.map((f) => f.originalname).join(", ")}]\n\n${message}`
            : message;

        initSSE(res);

        // Resolve the system prompt and model for this session.
        const systemPromptOverride = session.promptName
          ? promptMap.get(session.promptName)
          : undefined;
        const modelOverride = session.model ?? undefined;

        // Manual iteration captures the generator's return value (per-call TokenUsage).
        let fullText = "";
        const gen = tutorClient.streamMessage(
          session,
          userContent,
          transcriptText,
          {
            modelOverride,
            systemPromptOverride,
            extendedThinkingOverride: session.extendedThinking!,
          }
        );
        let step = await gen.next();
        while (!step.done) {
          fullText += step.value as string;
          sendEvent(res, { type: "text_delta", text: step.value as string });
          step = await gen.next();
        }
        // step.value is TokenUsage for this specific API call (not cumulative).
        const perCallTokens = step.value as TokenUsage;

        // Persist the exchange to the database.
        let assistantMessageId: string | null = null;
        try {
          await createMessage(db, {
            session_id: sessionId,
            role: "user",
            content: transcriptText,
            thinking: null,
            input_tokens: null,
            output_tokens: null,
          });
          const assistantRow = await createMessage(db, {
            session_id: sessionId,
            role: "assistant",
            content: fullText,
            thinking: null, // Thinking blocks are stored in session.messages[] for context continuity.
            input_tokens: perCallTokens.inputTokens,
            output_tokens: perCallTokens.outputTokens,
          });
          assistantMessageId = assistantRow.id;
          await updateSession(db, sessionId, {
            last_activity_at: new Date().toISOString(),
            total_input_tokens: session.tokenUsage.inputTokens,
            total_output_tokens: session.tokenUsage.outputTokens,
          });
        } catch (err) {
          console.error("[chat] Could not persist messages to DB:", err);
        }

        sendEvent(res, {
          type: "message_stop",
          messageId: assistantMessageId,
          tokenUsage: {
            inputTokens: session.tokenUsage.inputTokens,
            outputTokens: session.tokenUsage.outputTokens,
          },
        });
        res.end();
      } catch (err) {
        if (!res.headersSent) {
          next(err);
        } else {
          // Headers already sent (SSE started) — write an error event and close.
          sendEvent(res, {
            type: "error",
            message:
              err instanceof Error ? err.message : "Unknown error",
          });
          res.end();
        }
      }
    }
  );

  return router;
}
