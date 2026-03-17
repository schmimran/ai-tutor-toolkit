import { Router } from "express";
import multer from "multer";
import geoip from "geoip-lite";
import type Anthropic from "@anthropic-ai/sdk";
import type { TutorClient } from "@ai-tutor/core";
import {
  createMessage,
  createSession,
  updateSession,
} from "@ai-tutor/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateSession } from "../lib/session-store.js";
import { initSSE, sendEvent } from "../lib/stream.js";

/** Accepted MIME types for file uploads. */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

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

  const blocks: Anthropic.Messages.ContentBlockParam[] = [
    { type: "text", text },
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
  db: SupabaseClient
): Router {
  const router = Router();

  /**
   * POST /api/chat
   *
   * Body (multipart/form-data):
   *   sessionId  — client-generated UUID
   *   message    — student's text message
   *   files[]    — optional image or PDF attachments (max 5, 10 MB each)
   *
   * Response: SSE stream
   *   { type: "text_delta", text: "..." }   — one per token
   *   { type: "message_stop", message_id: "..." }  — final event
   *   { type: "error", message: "..." }     — on failure
   */
  router.post(
    "/",
    upload.array("files"),
    async (req, res, next) => {
      try {
        const { sessionId, message } = req.body as {
          sessionId?: string;
          message?: string;
        };

        if (!sessionId || !message?.trim()) {
          res.status(400).json({ error: "sessionId and message are required." });
          return;
        }

        const files = (req.files as Express.Multer.File[]) ?? [];
        const session = getOrCreateSession(sessionId);

        // Capture client info on the first message of the session.
        if (session.transcript.length === 0) {
          const ip =
            (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
            req.socket.remoteAddress ??
            "";
          const geo = geoip.lookup(ip);
          session.setClientInfo({
            ip,
            geo: geo ? (geo as unknown as Record<string, unknown>) : null,
            userAgent: req.headers["user-agent"],
          });

          // Upsert the session row in the database.
          try {
            await createSession(db, {
              id: sessionId,
              client_ip: session.clientInfo.ip ?? null,
              client_geo: session.clientInfo.geo ?? null,
              client_user_agent: session.clientInfo.userAgent ?? null,
              email_sent: false,
            });
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
            ? `${message}\n[${files.length} attachment(s): ${files.map((f) => f.originalname).join(", ")}]`
            : message;

        initSSE(res);

        let fullText = "";
        for await (const delta of tutorClient.streamMessage(
          session,
          userContent,
          transcriptText
        )) {
          fullText += delta;
          sendEvent(res, { type: "text_delta", text: delta });
        }

        // Persist the exchange to the database.
        let assistantMessageId: string | null = null;
        try {
          await createMessage(db, {
            session_id: sessionId,
            role: "user",
            content: transcriptText,
            thinking: null,
          });
          const assistantRow = await createMessage(db, {
            session_id: sessionId,
            role: "assistant",
            content: fullText,
            thinking: null, // Thinking blocks are stored in session.messages[] for context continuity.
          });
          assistantMessageId = assistantRow.id;
          await updateSession(db, sessionId, {
            last_activity_at: new Date().toISOString(),
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
