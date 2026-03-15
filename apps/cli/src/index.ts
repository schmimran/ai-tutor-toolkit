import readline from "readline";
import {
  loadConfig,
  loadSystemPrompt,
  createTutorClient,
  Session,
} from "@ai-tutor/core";

const config = loadConfig();
const systemPrompt = loadSystemPrompt(config.systemPromptPath);
const tutorClient = createTutorClient(config, systemPrompt);
const session = new Session();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("AI Tutor (CLI)");
console.log(`Model: ${config.model}`);
console.log(`Extended thinking: ${config.extendedThinking ? "on" : "off"}`);
console.log('Commands: "export" to print transcript, "quit" to exit.');
console.log("─".repeat(60));

function prompt(): void {
  rl.question("You: ", async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      prompt();
      return;
    }

    if (trimmed.toLowerCase() === "quit") {
      console.log("Goodbye.");
      rl.close();
      return;
    }

    if (trimmed.toLowerCase() === "export") {
      const transcript = session.getSessionSummary().transcript;
      if (transcript.length === 0) {
        console.log("(No messages yet.)");
      } else {
        console.log("\n--- Transcript ---");
        for (const entry of transcript) {
          console.log(`\n${entry.role}:\n${entry.text}`);
        }
        console.log("--- End ---\n");
      }
      prompt();
      return;
    }

    try {
      // Use the non-streaming method for simplicity in the terminal.
      const response = await tutorClient.sendMessage(session, trimmed, trimmed);
      console.log(`\nTutor: ${response}\n`);
    } catch (err) {
      console.error(
        "Error:",
        err instanceof Error ? err.message : String(err)
      );
    }

    prompt();
  });
}

prompt();
