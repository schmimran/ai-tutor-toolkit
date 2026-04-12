import { Router } from "express";
import multer from "multer";
import type Anthropic from "@anthropic-ai/sdk";
import type { TutorClient, TokenUsage } from "@ai-tutor/core";
import {
  createMessage,
  createSession,
  updateSession,
  linkDisclaimerAcceptance,
} from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateSession } from "../lib/session-store.js";
import { initSSE, sendEvent } from "../lib/stream.js";
import { extractClientInfo } from "../lib/geo.js";

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
): string | Anthropic.Messages.ContentBlockParam[] {
  if (files.length === 0) return text;

  const fileList = files.map((f) => f.originalname).join(", ");
  const contextText = `[Uploaded files: ${fileList}]\n\n${text}`;

  const blocks: Anthropic.Messages.ContentBlockParam[] = [
    { type: "text", text: contextText },
  ];

  for (const file of files) {
    const base64 = file.buffer.toString("base64");
    if (file.mimetype === "application/pdf") {
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64,
        },
      } as Anthropic.Messages.ContentBlockParam);
    } else {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: file.mimetype as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: base64,
        },
      });
    }
  }

  return blocks;
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
    upload.array("files"),
    async (req, res, next) => {
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
        const session = getOrCreateSession(sessionId);

        // Capture client info and model/prompt on the first message of the session.
        if (session.transcript.length === 0) {
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

          // Resolve user_id from Bearer token (best-effort; never 401 on this route).
          let userId: string | null = null;
          try {
            const authHeader = req.headers.authorization;
            if (authHeader && typeof authHeader === "string") {
              const match = authHeader.match(/^Bearer\s+(.+)$/i);
              if (match) {
                const token = match[1].trim();
                if (token) {
                  const { data, error } = await db.auth.getUser(token);
                  if (!error && data?.user?.id) {
                    userId = data.user.id;
                  }
                }
              }
            }
          } catch {
            // Swallow — user_id is optional.
          }

          // Upsert the session row in the database.
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
            // Backfill session_id on any disclaimer acceptance rows recorded
            // before this session row existed.
            await linkDisclaimerAcceptance(db, sessionId);
          } catch (err) {
            console.error("[chat] Could not create DB session row:", err);
          }
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
