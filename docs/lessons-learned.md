# Lessons Learned (v7)

These are the non-obvious things we've discovered building and iterating on this toolkit.  Some carry over from v1; some are new to v7.  All of them cost at least one failed test run to learn.

For the v1 findings (physics/geometry scope, single student), see `docs/archive/lessons-learned-v1.md`.

---

## 1. Examples beat rules — even more so in v7

This was the most important finding in v1 and it's only gotten more true.  When a stated principle conflicts with a demonstrated example, the model follows the example.  v7 leans into this with dedicated "What good judgment looks like" and "What bad judgment looks like" sections showing annotated dialogue for each session mode.  The annotations are the key — a dialogue example without a one-line explanation of what makes it good or bad is just a transcript.  The annotation tells the model what to generalize.

**Implication:** When something breaks, write a new example before adding a new rule.  If you can't show the correct behavior in a 4-line dialogue, you probably don't understand the failure well enough yet.

## 2. Session mode detection changes everything

v1 through v6 treated every session as a problem-solving session.  The full Socratic protocol always applied.  This meant a student who asked "Can you explain what integration is?" got interrogated instead of taught, and a student reviewing a wrong test answer was forced to rediscover something they already knew was wrong.

v7's biggest structural change is mode detection: the tutor classifies the session before responding.  Conceptual clarification gets a direct explanation.  Direct questions get a direct answer.  Solution review gets a complete walkthrough.  Problem-solving gets the full protocol.  This single design choice eliminated an entire class of failures where the tutor was technically following its instructions but doing the wrong thing for the situation.

## 3. Student agency prevents over-tutoring

"Follow the student's lead" is a v7 principle that didn't exist in earlier versions.  It exists because we kept seeing transcripts where the student said "I get it, can we move on?" and the tutor insisted on running one more check-for-understanding question.  Or where the student shifted to a new problem and the tutor tried to loop back to finish the previous one.

The fix is explicit: the student sets the agenda.  The opening sequence, problem confirmation, and verification questions are defaults, not gates.  If the student moves past them, the tutor follows.  The one exception — referencing a prior result that's directly relevant — is stated in the prompt so the model knows it's a narrow carve-out, not a license to revisit.

## 4. Adaptive tone is a cross-cutting principle, not a persona setting

v1 set the tone once ("think favorite teacher") and left it there.  v7 makes tone adaptive: the tutor reads the student's emotional state before every response.  Frustration signals mean stop advancing and ask something simpler.  Confidence signals mean trust it and move on.  "Never praise effort when the answer is wrong" is a specific prohibition because models default to encouragement even when it's dishonest.

The insight is that tone isn't a fixed setting — it's a per-message decision.  A student can go from confident to frustrated in two exchanges.  The tutor that keeps probing at the same level through a frustration signal isn't just ineffective; it's harmful.

## 5. Problem confirmation prevents cascading errors

v7 makes problem confirmation explicit: before doing anything, restate the given values, what's being solved for, and any constraints.  This didn't exist in v1, and the failure mode was predictable — the tutor misread the problem at exchange 1, and the student followed the tutor's misreading for 12 exchanges before someone noticed.

"A misread problem discovered at exchange 12 is worse than one caught at exchange 1."  This line is in the prompt because it happened.

## 6. One question at a time is still surprisingly hard

This was finding #5 in v1 and it hasn't gotten easier.  The model's natural instinct is to be efficient — it wants to cover multiple points per message, ask two questions as alternatives ("Is it X, or is it Y?"), or stack a clarifying question on top of a teaching question.  Extended thinking reduced this to near-zero because the model checks itself before responding.  Without extended thinking, it still happens in roughly 1 out of 3 responses.

The evaluation framework scores this as `one_question` and it remains one of the most common "partial" scores across sessions.

## 7. Tiered principles give the evaluation framework clear priorities

v1 through v6 treated all principles as co-equal, which made evaluation subjective.  Is stacking two questions the same severity as giving the student the answer?  Obviously not, but the prompt didn't say so.

v7 splits principles into non-negotiables (never give the answer, probe reasoning, understand where the student is) and session mechanics (one question at a time, work at the edge, parallel problems, step feedback).  The automated evaluation uses this tier structure: a fail on any non-negotiable triggers `has_failures`.  Session mechanics need three or more fails to trigger the same flag.

This means you can filter sessions by severity without reading every transcript.  Non-negotiable failures get immediate attention.  Mechanic lapses get tracked but don't trigger alerts unless they cluster.

## 8. Prompt length isn't the issue — structure is

v7 is roughly 1500 words.  v5 was 960.  v1 through v3 were 400-600 words.  The biggest quality jump was v3 to v4, when we deleted decision trees and replaced them with principles.  The second biggest jump was v6 to v7, when we reorganized the prompt from a flat list into a layered structure: identity first, then modes, then tiered principles, then annotated examples.

Research still shows that specifying more requirements can degrade instruction-following.  But the degradation comes from flat lists of co-equal rules, not from well-structured documents with clear hierarchy.  The model navigates a 1500-word prompt with sections and tiers better than a 960-word prompt with 15 bullet points.

## 9. The frustrated student is still the real test

This was finding #8 in v1 and it's still true.  A calm, cooperative student makes any tutor look good.  The frustrated student — short answers, "idk," "you're confusing me" — tests whether the tutor can back off without giving up, simplify without patronizing, and stay warm without being preachy.

v7 handles this better than v6 because of the adaptive tone principle and the explicit frustration signals in the prompt.  But it's still the scenario most likely to surface failures, especially around over-probing (asking another "why" question when the student is already frustrated).

## 10. Automated evaluation closes the feedback loop

v1 relied entirely on manual transcript review.  This works when you have one student and five test scenarios.  It doesn't work when you're running the tutor across multiple subjects, multiple models, and multiple prompt versions.

v7's automated evaluation scores each transcript against 11 dimensions plus resolution status.  The evaluation runs after every session — either when the session is explicitly ended or when the inactivity sweep fires.  Results go into the `session_evaluations` table and into the transcript email.

The practical impact: you can iterate on the prompt, run a batch of test sessions, and filter for `has_failures = true` instead of reading every transcript.  The evaluation doesn't replace human judgment — it tells you where to focus your human judgment.

## 11. The parent should still be in the loop

This was finding #10 in v1 and it's the one most likely to get lost as the toolkit grows.  v7 broadened the scope from one student to any high school STEM student, but the underlying value proposition hasn't changed: the parent knows the student.  They know that their kid stares at problems too long rather than asking for help.  They know that certain phrasings sound patronizing.  They know when "I get it" means "I get it" versus "I want to stop."

The transcript emails, the evaluation scores, and the feedback system exist so the parent can stay in the loop without sitting next to the student for every session.  The toolkit helps a parent build a tutor for their specific kid.  That's still the point.
