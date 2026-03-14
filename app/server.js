import Anthropic from "@anthropic-ai/sdk";
import express from "express";
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

// POST /api/chat — send a message and get a tutor response
app.post("/api/chat", async (req, res) => {
  const { message, sessionId } = req.body;

  if (!message || !sessionId) {
    return res.status(400).json({ error: "message and sessionId are required" });
  }

  const session = getSession(sessionId);

  // Add user message
  session.messages.push({ role: "user", content: message });
  session.transcript.push({ role: "Student", text: message });

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
