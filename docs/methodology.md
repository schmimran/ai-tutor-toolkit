# Methodology: Building an AI Tutor (v7)

This documents how we build and iterate on the AI tutor prompt.  The core loop from v1 still applies — write prompt, test with student, read transcript, diagnose failure, fix example.  What changed in v7 is the prompt architecture: mode detection as the first design primitive, tiered principles, identity-first framing, annotated dialogue examples, and automated evaluation to close the feedback loop.

For the v1 methodology (single subject, single student, five rules), see `docs/archive/methodology-v1.md`.

---

## The loop is still the product

```
Write prompt --> Test with student --> Read transcript --> Diagnose failure
     ^                                                          |
     <-------- Edit example or sharpen principle <--------------
```

Nothing in v7 changes this.  The prompt is a snapshot of the loop's current state.  What v7 changes is the internal structure of the prompt and the tooling around the loop.

---

## Phase 1: Start with a real problem

Same as v1.  Don't start with a prompt.  Start with a homework problem your student is actually stuck on.  Solve it yourself.  Help your student through it manually.  Get a feel for what good tutoring looks like before you try to write instructions for a model.

The difference from v1: you're no longer designing for one subject and one student.  v7 is built for high school STEM — physics, chemistry, calculus, geometry, biology.  The prompt doesn't name a subject or a grade level.  It describes behaviors that work across all of them.

---

## Phase 2: Mode detection as the first design primitive

v1 through v6 treated every session as a problem-solving session.  The Socratic protocol always applied.  This broke immediately for students who asked conceptual questions ("Can you explain what integration is?") or wanted a solution review after a test.

v7 starts with mode detection.  Before the tutor does anything, it reads the opening message and classifies the session into one of four modes:

- **Conceptual clarification** — explain directly, then ask one check question.
- **Direct question** — answer it.  No protocol.
- **Problem-solving** — full Socratic protocol.  Never give the answer.
- **Solution review** — the student knows they got it wrong and wants to understand the correct path.  Explain it completely.

The mode determines which principles apply.  "Never give the answer" is a non-negotiable in problem-solving mode but irrelevant in solution review mode.  "Understood where the student was" matters in problem-solving but not in conceptual clarification.  Mode detection is what makes the prompt flexible without making it vague.

Sessions can shift modes.  A conceptual question becomes a problem-solving session once the student engages with a specific problem.  The prompt handles this: "When that happens, treat it as a new opening — restate the problem, ask where they are, then proceed."

---

## Phase 3: Identity-first framing

v1 through v5 opened with rules.  v6 opened with a student profile.  v7 opens with identity: "Think favorite teacher — warm and easy to talk to, but direct and efficient."

This single line shapes every response more than any rule list can.  It tells the model who to be, not just what to do.  The rules follow from the identity.  A favorite teacher doesn't stack three questions.  A favorite teacher doesn't lecture a student who said "I get it."  A favorite teacher doesn't praise effort when the answer is wrong.

Put the identity first.  Put the rules second.

---

## Phase 4: Tiered principle architecture

v1 through v6 presented all principles as co-equal.  This created a problem for evaluation: is stacking two questions in one message the same severity as giving the student the answer?  It isn't.

v7 splits principles into two tiers:

**Non-negotiables** — violations mean the session failed regardless of outcome:
- Never give the answer
- Probe reasoning, not just arithmetic
- Understand where the student is before guiding

**Session mechanics** — important, but a single lapse is recoverable:
- One question at a time
- Work at the student's edge
- Parallel problems when looping
- Step-by-step feedback
- Problem confirmation
- Follow the student's lead
- Adaptive tone

The tier structure gives the evaluation framework clear priorities.  A "fail" on any non-negotiable triggers `has_failures` on the evaluation.  Session mechanics need three or more fails to trigger the same flag.

---

## Phase 5: Example-driven design

v1 learned this the hard way: examples beat rules.  v7 doubles down with two dedicated sections — "What good judgment looks like" and "What bad judgment looks like" — showing annotated dialogue for each mode.

Each example is followed by a one-line annotation explaining what the tutor did right or wrong:

> Confirmed the problem.  Asked why, not just what.

> The student had every piece.  The tutor assembled it for them.

These annotations are the bridge between principles and behavior.  The model reads the dialogue, reads the annotation, and generalizes to new situations.  Adding a new example is almost always more effective than adding a new bullet point to a rule list.

When a failure appears in testing, the fix process is:

1. Identify the exact exchange where the tutor went wrong.
2. Write a "bad judgment" example showing the failure.
3. Write a "good judgment" example showing the correct behavior.
4. If the failure maps to a principle that doesn't exist yet, add the principle — but always add the example too.

---

## Phase 6: Automated evaluation

v1 relied on manual transcript review.  This worked for one student and one subject but doesn't scale.  v7 adds automated evaluation: after each session ends, the transcript is scored against 11 dimensions plus a resolution status.

The 11 dimensions map directly to the prompt's principles:

| Dimension | Tier | What it measures |
|-----------|------|------------------|
| mode_handling | — | Did the tutor identify and follow the session mode? |
| problem_confirmation | Mechanic | Did the tutor restate the problem before proceeding? |
| never_gave_answer | Non-negotiable | Did the tutor avoid assembling or stating the answer? |
| probe_reasoning | Non-negotiable | Did the tutor ask why, not just what? |
| understood_where_student_was | Non-negotiable | Did the tutor establish how far the student had gotten? |
| one_question | Mechanic | One question per message? |
| worked_at_edge | Mechanic | Working at the student's actual gap? |
| followed_student_lead | Mechanic | Did the tutor follow when the student redirected? |
| adaptive_tone | Mechanic | Did the tutor read emotional state and adjust? |
| parallel_problems | Mechanic | Tried a parallel problem when the student was looping? |
| step_feedback | Mechanic | Feedback at each step, not just the end? |

Each dimension scores pass / partial / fail / na.  Resolution scores resolved / partial / unresolved / abandoned.

The `has_failures` flag is computed as: any non-negotiable scored "fail," OR three or more other dimensions scored "fail."  This gives you a single boolean to filter sessions that need manual review.

The evaluation runs automatically via the inactivity sweep or when a session is explicitly ended.  Results are stored in the `session_evaluations` table and included in the transcript email.

---

## Phase 7: Test across scenarios

Same as v1, but broader.  v7's scope is all high school STEM, so test scenarios should include:

- Different subjects (physics kinematics, algebra factoring, chemistry stoichiometry, geometry proofs)
- Different modes (conceptual question, direct question, problem-solving, solution review)
- Different emotional states (calm, frustrated, overconfident, defeated)
- Mode shifts mid-session (conceptual question that becomes a problem)
- Multi-step problems where the error is buried in the middle
- Students who redirect or declare they've got it

Character briefs remain the best approach for automated testing.  Give the simulated student a character (who they are, what they know, how they behave), not a script.

---

## Phase 8: Iterate and resist bloat

v7 is longer than v5 (~1500 words vs ~960).  But the structure is different — identity, then modes, then tiered principles, then annotated examples.  The length isn't the issue; the organization is.  A well-structured 1500-word prompt outperforms a flat 960-word list because the model can locate context more reliably.

The maintenance rule still holds: **fix failures by swapping examples, not by adding sections.**  If the same failure appears across multiple scenarios, sharpen a principle.  If it appears in one scenario, add a counter-example to the "bad judgment" section.

The automated evaluation makes this easier.  Instead of reading every transcript, filter for `has_failures = true` and focus your time on sessions that actually broke.
