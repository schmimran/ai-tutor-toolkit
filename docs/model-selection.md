# Model Selection for AI Tutoring (v7)

## Summary

Use **Sonnet 4.6 with extended thinking** for tutoring applications.  This recommendation holds from v1 through v7.  Extended thinking is more important in v7 than it was in earlier versions because mode detection — classifying the session type from the opening message — requires the model to reason before responding.

For the v1 analysis (single subject, single model comparison), see `docs/archive/model-selection-v1.md`.

---

## What we tested

The app supports three models at runtime.  Students can switch models mid-session via the UI.  Extended thinking is enabled by default for Sonnet and Opus, and automatically disabled for Haiku in the code.

| Configuration | Mode detection | One Q at a time | Tone | Probe reasoning | Never gave answer | Overall |
|--------------|---------------|-----------------|------|-----------------|-------------------|---------|
| Haiku 4.5 | Inconsistent | Partial (stacks Qs) | Functional, flat | Weak — asks what, not why | Occasional slips | Fast and cheap; weak on soft skills |
| Sonnet 4.6 + extended thinking | Reliable | Strong | Favorite teacher | Strong | Strong | Recommended |
| Opus 4.6 + extended thinking | Reliable | Strong | Strong | Strong | Strong | Unnecessary for high school STEM |

---

## Why extended thinking matters more in v7

Extended thinking was already valuable in v1 for one-question-at-a-time compliance and tone calibration.  v7 adds a new reason: mode detection.

The v7 prompt requires the tutor to classify the session into one of four modes (conceptual clarification, direct question, problem-solving, solution review) before responding.  This classification determines which principles apply — "never give the answer" is a non-negotiable in problem-solving but irrelevant in solution review.  Getting the mode wrong cascades through the entire session.

In thinking traces, we observe the model:

- Classifying the session mode and reasoning about which behaviors apply
- Checking whether it's about to assemble the answer for the student
- Evaluating whether the student's message signals frustration or readiness
- Deciding whether to probe reasoning or just redirect
- Considering whether a concept has already been demonstrated
- Noticing when the student has shifted modes mid-session

Without extended thinking, the model defaults to its natural behavior: helpful, efficient, slightly over-eager.  It solves the problem faster but tutors worse — stacking questions, skipping mode detection, treating every session as problem-solving.

---

## When to use Haiku

Haiku is faster and cheaper.  It works adequately when:

- The student needs a quick factual answer or formula reminder (direct question mode)
- Latency is the primary concern and the student will disengage if they wait
- You're running high-volume automated tests for structural checks (not tone or judgment)

Haiku struggles with:

- Mode detection — it often defaults to the Socratic protocol even for conceptual questions
- Adaptive tone — it tends toward a flat, neutral register regardless of student state
- Probe reasoning — it asks what the student computed rather than why they chose their approach
- Restraint — it's more likely to assemble the final answer rather than asking the student to do it

Extended thinking is automatically disabled for Haiku because the model doesn't benefit from it enough to justify the added latency and cost.

---

## When you don't need Opus

- Any homework at or below high school level
- The diagnostic challenge is "find the student's error," not "solve a novel problem"
- Response time matters — Opus is slower, and a student waiting will disengage
- Cost matters — Opus input/output token costs are significantly higher

Opus produces marginally better tone calibration and slightly more nuanced reasoning probes, but the difference is not meaningful for high school STEM tutoring.  Sonnet with extended thinking covers the same ground at lower cost and latency.

---

## Cost considerations

Extended thinking adds tokens to every response (thinking tokens are consumed but not displayed to the student).  The budget is set to 10,000 thinking tokens with a 16,000 max output.

For a typical homework session (10-15 exchanges):

- **Haiku** (no thinking): Lowest cost.  Best for direct questions and high-volume testing.
- **Sonnet + thinking**: Moderate cost.  The thinking overhead is negligible for individual sessions.  For automated test runs at scale, it adds up — consider running structural tests without thinking and reserving thinking-enabled runs for tone and judgment tests.
- **Opus + thinking**: Highest cost.  Not justified for the high school STEM use case.

Token usage is tracked per session (input and output tokens) and included in transcript emails so you can monitor costs over time.

---

## Recommendation

Default to **Sonnet 4.6 with extended thinking**.  The three-model setup exists for flexibility, not because Haiku or Opus are better choices for the default case.  Haiku is there for speed-sensitive interactions.  Opus is there as an option but has not demonstrated a meaningful advantage for this domain.
