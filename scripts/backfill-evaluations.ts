import { createSupabaseClient } from "@ai-tutor/db";
import { createSessionEvaluation } from "@ai-tutor/db";
import { evaluateTranscript } from "@ai-tutor/core";

const DIMENSIONS = [
  "opening_sequence",
  "one_question",
  "asked_why",
  "worked_at_edge",
  "parallel_problems",
  "step_feedback",
  "never_gave_answer",
  "clarity",
  "tone",
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const db = createSupabaseClient();

  // Fetch all ended sessions
  const { data: allSessions, error: sessionsError } = await db
    .from("sessions")
    .select("id")
    .not("ended_at", "is", null)
    .order("started_at", { ascending: true });

  if (sessionsError) {
    console.error("Failed to query sessions:", sessionsError);
    process.exit(1);
  }

  // Fetch sessions that already have evaluations
  const { data: evaluated_sessions, error: evalError } = await db
    .from("session_evaluations")
    .select("session_id");

  if (evalError) {
    console.error("Failed to query session_evaluations:", evalError);
    process.exit(1);
  }

  const alreadyEvaluated = new Set((evaluated_sessions ?? []).map(r => r.session_id));
  const sessions = (allSessions ?? []).filter(s => !alreadyEvaluated.has(s.id));

  const total = sessions.length;
  console.log(`Found ${total} eligible session(s) to evaluate.`);

  if (total === 0) {
    console.log("Nothing to do.");
    return;
  }

  let evaluated = 0;
  let skipped = 0;
  let failed = 0;
  const failureCounts: Record<string, number> = Object.fromEntries(
    DIMENSIONS.map(d => [d, 0])
  );

  for (let i = 0; i < sessions.length; i++) {
    const sessionId = sessions[i].id;
    const label = `[${i + 1}/${total}] Session ${sessionId}`;

    // Fetch messages for this session
    const { data: messages, error: messagesError } = await db
      .from("messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error(`${label} — failed to fetch messages:`, messagesError);
      failed++;
      continue;
    }

    if (!messages || messages.length === 0) {
      console.log(`${label} — skipped (no messages)`);
      skipped++;
      continue;
    }

    const hasAssistantMessage = messages.some(m => m.role === "assistant");
    if (!hasAssistantMessage) {
      console.log(`${label} — skipped (no tutor responses)`);
      skipped++;
      continue;
    }

    const transcript = messages.map(m => ({
      role: m.role === "user" ? "Student" : "Tutor",
      text: m.content as string,
    }));

    try {
      const result = await evaluateTranscript(transcript);

      await createSessionEvaluation(db, {
        session_id: sessionId,
        model: result.model,
        opening_sequence: result.opening_sequence.score,
        one_question: result.one_question.score,
        asked_why: result.asked_why.score,
        worked_at_edge: result.worked_at_edge.score,
        parallel_problems: result.parallel_problems.score,
        step_feedback: result.step_feedback.score,
        never_gave_answer: result.never_gave_answer.score,
        clarity: result.clarity.score,
        tone: result.tone.score,
        resolution: result.resolution.score,
        has_failures: result.has_failures,
        rationale: {
          opening_sequence: result.opening_sequence.rationale,
          one_question: result.one_question.rationale,
          asked_why: result.asked_why.rationale,
          worked_at_edge: result.worked_at_edge.rationale,
          parallel_problems: result.parallel_problems.rationale,
          step_feedback: result.step_feedback.rationale,
          never_gave_answer: result.never_gave_answer.rationale,
          clarity: result.clarity.rationale,
          tone: result.tone.rationale,
          resolution: result.resolution.rationale,
        },
      });

      const scores = DIMENSIONS.map(d => `${d}=${result[d].score}`).join(" ");
      console.log(`${label} — ${scores} has_failures=${result.has_failures}`);

      for (const d of DIMENSIONS) {
        if (result[d].score === "fail") {
          failureCounts[d]++;
        }
      }

      evaluated++;
    } catch (err) {
      console.error(`${label} — evaluation failed:`, err);
      failed++;
    }

    if (i < sessions!.length - 1) {
      await sleep(1000);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Total sessions found:     ${total}`);
  console.log(`Evaluated successfully:   ${evaluated}`);
  console.log(`Skipped (no messages):    ${skipped}`);
  console.log(`Failed (errors):          ${failed}`);

  if (evaluated > 0) {
    console.log("\nFailure counts by dimension:");
    for (const d of DIMENSIONS) {
      console.log(`  ${d}: ${failureCounts[d]}/${evaluated} failed`);
    }
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
