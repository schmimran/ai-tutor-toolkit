import express from "express";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  loadConfig,
  loadSystemPrompt,
  Session,
  createTutorClient,
} from "@ai-tutor/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const systemPrompt = loadSystemPrompt(config.systemPromptPath);
const tutor = createTutorClient(config, systemPrompt);

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

// In-memory session storage (keyed by session ID)
const sessions = new Map();

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, new Session());
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

  if (message) {
    content.push({ type: "text", text: message });
  }

  return content;
}

// Express app
const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

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
  const userContent = buildUserContent(message, req.files);

  // Build transcript text (files referenced by name)
  let transcriptText = message || "";
  if (req.files && req.files.length > 0) {
    const fileNames = req.files.map((f) => f.originalname).join(", ");
    transcriptText = transcriptText
      ? `${transcriptText} [attached: ${fileNames}]`
      : `[attached: ${fileNames}]`;
  }

  try {
    const reply = await tutor.sendMessage(session, userContent, transcriptText);
    res.json({ response: reply });
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
  res.json({ transcript: session.getTranscript() });
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
    model: config.model,
    extendedThinking: config.extendedThinking,
  });
});

app.listen(config.port, () => {
  console.log(`AI Tutor running at http://localhost:${config.port}`);
  console.log(`Model: ${config.model}  |  Extended thinking: ${config.extendedThinking ? "on" : "off"}`);
});
