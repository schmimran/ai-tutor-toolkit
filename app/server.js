import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import multer from "multer";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

// Load .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Config
const SYSTEM_PROMPT_PATH = process.env.SYSTEM_PROMPT_PATH || "../templates/tutor-prompt.md";
const MODEL = process.env.MODEL || "claude-sonnet-4-6";
const EXTENDED_THINKING = process.env.EXTENDED_THINKING !== "false";
const PORT = process.env.PORT || 3000;

// File upload config — store in memory, 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}.  Upload images (jpg, png, gif, webp) or PDFs.`));
    }
  },
});

// Load system prompt
let systemPrompt;
try {
  systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  const beginMarker = "## Begin prompt";
  const beginIndex = systemPrompt.indexOf(beginMarker);
  if (beginIndex !== -1) {
    systemPrompt = systemPrompt.substring(beginIndex + beginMarker.length).trim();
  }
} catch (err) {
  console.error(`Could not read system prompt from ${SYSTEM_PROMPT_PATH}`);
  console.error("Set SYSTEM_PROMPT_PATH to the path of your tutor prompt file.");
  process.exit(1);
}

// Initialize Anthropic client
const client = new Anthropic();

// In-memory session storage (keyed by session ID)
const sessions = new Map();

// Express app
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// Get or create a session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],     // Full API content blocks (includes thinking)
      transcript: [],   // Plain text for export
    });
  }
  return sessions.get(sessionId);
}

// Build Anthropic content blocks from a message + optional files
function buildUserContent(message, files) {
  const content = [];

  // Add file content blocks first so the model "sees" them before reading the text
  if (files && files.length > 0) {
    for (const file of files) {
      const base64 = file.buffer.toString("base64");

      if (file.mimetype === "application/pdf") {
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64,
          },
        });
      } else {
        // Image types
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.mimetype,
            data: base64,
          },
        });
      }
    }
  }

  // Add text message (always present, even if just describing the attachment)
  if (message) {
    content.push({ type: "text", text: message });
  }

  return content;
}

// POST /api/chat — send a message (with optional file attachments) and get a tutor response
app.post("/api/chat", upload.array("files", 5), async (req, res) => {
  const { message, sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  if (!message && (!req.files || req.files.length === 0)) {
    return res.status(400).json({ error: "message or file attachment is required" });
  }

  const session = getSession(sessionId);

  // Build content blocks for the API
  const userContent = buildUserContent(message, req.files);

  // Add to conversation history
  session.messages.push({ role: "user", content: userContent });

  // Build transcript text (files referenced by name)
  let transcriptText = message || "";
  if (req.files && req.files.length > 0) {
    const fileNames = req.files.map((f) => f.originalname).join(", ");
    transcriptText = transcriptText
      ? `${transcriptText} [attached: ${fileNames}]`
      : `[attached: ${fileNames}]`;
  }
  session.transcript.push({ role: "Student", text: transcriptText });

  try {
    const requestParams = {
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt,
      messages: session.messages,
    };

    if (EXTENDED_THINKING) {
      requestParams.thinking = {
        type: "enabled",
        budget_tokens: 10000,
      };
    }

    const response = await client.messages.create(requestParams);

    // Extract text response (skip thinking blocks)
    const assistantMessage = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    // Store full response for API context continuity
    session.messages.push({ role: "assistant", content: response.content });
    session.transcript.push({ role: "Tutor", text: assistantMessage });

    res.json({ response: assistantMessage });
  } catch (err) {
    console.error("Anthropic API error:", err.message);
    res.status(500).json({ error: "Failed to get tutor response.  Check your API key and try again." });
  }
});

// Handle multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large.  Maximum size is 10 MB." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// GET /api/transcript — export the session transcript
app.get("/api/transcript/:sessionId", (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ transcript: session.transcript });
});

// POST /api/reset — clear a session
app.post("/api/reset", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId && sessions.has(sessionId)) {
    sessions.delete(sessionId);
  }
  res.json({ ok: true });
});

// GET /api/config — expose non-sensitive config to frontend
app.get("/api/config", (req, res) => {
  res.json({
    model: MODEL,
    extendedThinking: EXTENDED_THINKING,
  });
});

app.listen(PORT, () => {
  console.log(`AI Tutor running at http://localhost:${PORT}`);
  console.log(`Model: ${MODEL}  |  Extended thinking: ${EXTENDED_THINKING ? "on" : "off"}`);
});
