import { createInterface } from "readline";
import {
  loadConfig,
  loadSystemPrompt,
  Session,
  createTutorClient,
} from "@ai-tutor/core";

const config = loadConfig();
const systemPrompt = loadSystemPrompt(config.systemPromptPath);
const session = new Session();
const tutor = createTutorClient(config, systemPrompt);

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("AI Tutor ready.  Type your message and press Enter.");
console.log(`Model: ${config.model}  |  Extended thinking: ${config.extendedThinking ? "on" : "off"}`);
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
      for (const entry of session.getTranscript()) {
        console.log(`${entry.role}: ${entry.text}`);
      }
      console.log("\n--- END TRANSCRIPT ---\n");
      prompt();
      return;
    }

    if (!trimmed) {
      prompt();
      return;
    }

    try {
      const reply = await tutor.sendMessage(session, trimmed, trimmed);
      console.log(`\nTutor: ${reply}\n`);
    } catch (err) {
      console.error("\nError communicating with Claude:", err.message, "\n");
    }

    prompt();
  });
}

prompt();
