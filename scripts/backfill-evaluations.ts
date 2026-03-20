import { createSupabaseClient } from "@ai-tutor/db";
import { upsertSessionEvaluation } from "@ai-tutor/db";
import { evaluateTranscript } from "@ai-tutor/core";
import type { EvaluationResult } from "@ai-tutor/core";

const DIMENSIONS = [
  "mode_handling",
  "problem_confirmation",
  "never_gave_answer",
  "probe_reasoning",
  "understood_where_student_was",
  "one_question",
  "worked_at_edge",
  "followed_student_lead",
  "adaptive_tone",
  "parallel_problems",
  "step_feedback",
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const db = createSupabaseClient();

  // Fetch sessions ended in the last 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sessions, error: sessionsError } = await db
    .from("sessions")
    .select("id")
    .not("ended_at", "is", null)
    .gte("ended_at", cutoff)
    .order("started_at", { ascending: true });

  if (sessionsError) {
    console.error("Failed to query sessions:", sessionsError);
    process.exit(1);
  }

  const total = sessions?.length ?? 0;
  console.log(`Found ${total} session(s) ended in the last 24 hours.`);

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

  for (let i = 0; i < sessions!.length; i++) {
    const sessionId = sessions![i].id;
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

      await upsertSessionEvaluation(db, {
        session_id: sessionId,
        model: result.model,
        mode_handling: result.mode_handling,
        problem_confirmation: result.problem_confirmation,
        never_gave_answer: result.never_gave_answer,
        probe_reasoning: result.probe_reasoning,
        understood_where_student_was: result.understood_where_student_was,
        one_question: result.one_question,
        worked_at_edge: result.worked_at_edge,
        followed_student_lead: result.followed_student_lead,
        adaptive_tone: result.adaptive_tone,
        parallel_problems: result.parallel_problems,
        step_feedback: result.step_feedback,
        resolution: result.resolution,
        has_failures: result.has_failures,
        rationale: result.rationale,
      });

      const scores = DIMENSIONS.map(d => `${d}=${result[d as keyof EvaluationResult]}`).join(" ");
      console.log(`${label} — ${scores} resolution=${result.resolution} has_failures=${result.has_failures}`);

      for (const d of DIMENSIONS) {
        if (result[d as keyof EvaluationResult] === "fail") {
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
