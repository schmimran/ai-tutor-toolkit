# Model Selection for AI Tutoring
> **Archived (v1).** Superseded by [current doc](../model-selection.md). Retained for reference only.

## Summary

Use **Sonnet 4.6 with extended thinking** for tutoring applications.  The extended thinking scratchpad is what makes the difference — not raw intelligence.

## What we tested

We ran the same tutor prompt and the same test scenario (kinematics, wrong equation) across three configurations:

| Configuration | Opening sequence | One Q at a time | Tone | Ask "why" | Overall |
|--------------|-----------------|-----------------|------|-----------|---------|
| Sonnet 4.6 + extended thinking | ✅ | ✅ | Favorite teacher | Partial | Strong |
| Sonnet 4.6 (no thinking) | ✅ | ❌ (stacked Qs) | Drill sergeant | ❌ | Acceptable |
| Opus 4.6 + extended thinking | Not tested | Not tested | Not tested | Not tested | Overkill |

## Why extended thinking matters for tutoring

Extended thinking isn't about solving harder math problems.  Sonnet can solve 9th-grade physics without breaking a sweat either way.  What extended thinking provides is a **self-check step** — the model reasons about its own response before sending it.

In the thinking traces, we observed the model:

- Checking whether it was about to stack multiple questions
- Considering whether a concept had already been demonstrated
- Evaluating the student's emotional state before choosing a response strategy
- Deciding whether to probe reasoning or just redirect

Without extended thinking, the model defaults to its natural behavior: efficient, correct, slightly robotic.  It solves the problem faster but tutors worse.

## When you don't need extended thinking

- Simple factual questions about the subject matter
- The student just needs a definition or formula reminder
- The problem is straightforward and the student knows it

## When you don't need Opus

- Any homework at or below high school level
- The diagnostic challenge is "find the student's error," not "solve a novel problem"
- Response time matters (Opus is slower, and a student sitting there waiting will disengage)

## Cost considerations

Extended thinking adds tokens to every response (the thinking tokens are consumed but not displayed).  For a homework session with 10-15 exchanges, this is negligible.  If you're running automated tests at scale via the API, it adds up — consider running structural tests without extended thinking and reserving it for tone/judgment tests.

## Recommendation

Default to Sonnet 4.6 with extended thinking.  Drop to Sonnet without thinking only if latency becomes a real issue for your student, and accept the soft-skill tradeoffs.
