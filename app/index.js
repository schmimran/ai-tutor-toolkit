import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { createInterface } from "readline";

// Load the tutor system prompt from a file
const SYSTEM_PROMPT_PATH = process.env.SYSTEM_PROMPT_PATH || "../templates/tutor-prompt.md";
const MODEL = process.env.MODEL || "claude-sonnet-4-6";
const EXTENDED_THINKING = process.env.EXTENDED_THINKING !== "false"; // enabled by default

// Read the system prompt
let systemPrompt;
try {
  systemPrompt = readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  // Strip the template variables section — use the prompt content after "## Begin prompt"
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

// Initialize the Anthropic client
const client = new Anthropic();

// Conversation history
const messages = [];

// Set up readline for CLI interaction
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("AI Tutor ready.  Type your message and press Enter.");
console.log(`Model: ${MODEL}  |  Extended thinking: ${EXTENDED_THINKING ? "on" : "off"}`);
console.log("Type 'quit' to exit.  Type 'export' to print the transcript.\n");

function prompt() {
  rl.question("You: ", async (input) => {
    const trimmed = input.trim();

    if (trimmed.toLowerCase() === "quit") {
      console.log("\nSession ended.");
      rl.close();
      return;
    }

    if (trimmed.toLowerCase() === "export") {
      console.log("\n--- TRANSCRIPT ---\n");
      for (const msg of messages) {
        const role = msg.role === "user" ? "Student" : "Tutor";
        console.log(`${role}: ${msg.content}`);
      }
      console.log("\n--- END TRANSCRIPT ---\n");
      prompt();
      return;
    }

    if (!trimmed) {
      prompt();
      return;
    }

    // Add user message to history
    messages.push({ role: "user", content: trimmed });

    try {
      // Build the request
      const requestParams = {
        model: MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        messages: messages,
      };

      // Add extended thinking if enabled
      if (EXTENDED_THINKING) {
        requestParams.thinking = {
          type: "enabled",
          budget_tokens: 10000,
        };
      }

      // Send to Claude
      const response = await client.messages.create(requestParams);

      // Extract the text response (skip thinking blocks)
      const assistantMessage = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      // Store the full response content for history (includes thinking blocks)
      // so the model maintains its reasoning chain across turns
      messages.push({ role: "assistant", content: response.content });

      console.log(`\nTutor: ${assistantMessage}\n`);
    } catch (err) {
      console.error("\nError communicating with Claude:", err.message, "\n");
    }

    prompt();
  });
}

prompt();
