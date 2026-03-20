# Methodology: How to Build an AI Tutor from Scratch

This documents the process we followed to build a working AI tutor in one evening.  The methodology is transferable to any subject, grade level, or student.

## Phase 1: Start with a real problem

Don't start with a prompt.  Start with a homework problem your student is actually stuck on.  Solve it yourself first — understand the error, the concept, and what a good explanation looks like.  Then help your student through it manually (or with a general-purpose Claude conversation).

This gives you two things: a concrete scenario to test against, and an intuitive sense of what "good tutoring" feels like for this specific student.

## Phase 2: Write a first-draft prompt

Write the shortest prompt that captures the core behaviors you want.  Ours started with five rules:

1. Ask where the student is before helping.
2. Don't give the answer.
3. Don't quiz concepts they've already demonstrated.
4. When they're stuck, try a parallel problem.
5. Keep encouragement natural.

This will be wrong.  That's fine.  The point is to have something testable.

## Phase 3: Test with a real student

Have your student use the tutor on actual homework.  Sit nearby if possible.  Read the transcript afterward.  Look for:

- Did the tutor ask for the problem before helping?
- Did it talk down to the student?
- Did it give the answer?
- Did it loop without resolving?
- Did the student seem engaged or annoyed?

The transcript is the data.  Everything else is speculation.

## Phase 4: Diagnose failures and edit examples, not rules

When something breaks, resist the urge to add a new rule.  Instead:

1. Identify the exact exchange where the tutor went wrong.
2. Trace it back to the prompt — which principle or example led to this behavior?
3. Fix the example.  If the principle says "ask why" but the example shows "walk me through your steps," the model will follow the example.

This is the single most important lesson from our process: **examples drive model behavior more than stated rules.**

## Phase 5: Automate testing with character briefs

Once you have a working prompt, you need to test across scenarios without requiring your student every time.  We used Claude's Chrome extension:

1. Write a character brief — who the student is, what they got wrong, what they know, how they behave.
2. Set up a Chrome shortcut pointed at the tutor project.
3. Run the brief.  The extension plays the student, captures the transcript.
4. Evaluate the transcript against a checklist.

This catches structural failures (gave the answer, stacked questions, quizzed known concepts) reliably.  It does not catch tone or "vibe" issues — that still requires a real student.

## Phase 6: Test across emotional states

A confused student, a frustrated student, and an overconfident student all need different approaches.  If your prompt only works for calm, cooperative students, it will fail in the real world.  Build test scenarios that cover:

- Student who already submitted a wrong answer
- Student who doesn't know where to start
- Student who is frustrated and pushing back
- Student who is certain they're right and the system is wrong
- Multi-step problem where the error is buried in the middle

## Phase 7: Choose the right model

Not every task needs the most powerful model.  Our findings:

- **Sonnet 4.6 with extended thinking** was the sweet spot.  Extended thinking gives the model a scratchpad to check its own behavior against the prompt instructions before responding.  This improved one-question-at-a-time compliance, tone calibration, and diagnostic accuracy.
- **Sonnet 4.6 without extended thinking** worked for the physics but broke on soft skills — stacked questions, skipped tone calibration, never asked "why."
- **Opus** was unnecessary.  The reasoning demands of 9th-grade homework don't justify the cost or latency.

## Phase 8: Iterate and resist bloat

Every failed test will create the urge to add another rule.  Resist it.  Prompt complexity degrades model performance.  Our prompt went from ~500 words (too sparse) to ~960 words (right balance).  Research shows that as you specify more requirements, instruction-following can drop by 19%.

The maintenance rule: **fix failures by swapping examples, not by adding sections.**  If the same failure type appears across multiple scenarios, sharpen a principle.  If it appears in one scenario, add a counter-example.

## The loop

```
Write prompt → Test with student → Read transcript → Diagnose failure
     ↑                                                        ↓
     ←——————— Edit example or sharpen principle ←——————————————
```

This loop is the product.  The prompt is just the current snapshot.
