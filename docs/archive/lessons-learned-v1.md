# Lessons Learned
> **Archived (v1).** Superseded by [current doc](../lessons-learned.md). Retained for reference only.

These are the non-obvious things we discovered building this toolkit.  Most of them cost us at least one failed test run to learn.

## 1. Examples beat rules

This is the most important finding.  When a stated principle ("ask why, not just what") conflicted with a demonstrated example ("walk me through your steps"), the model followed the example every time.  We fixed the "ask why" problem only after we rewrote the example to actually show a "why" question.

**Implication:** When something breaks, fix the example first.  If there's no relevant example, add one.  Adding another bullet to a "never do this" list is almost always the wrong move.

## 2. Prompt complexity has diminishing returns

Our prompt went through five versions:

- v1 (~400 words): Too many branching paths, treated the model like a flowchart
- v2 (~500 words): Added escalation protocol, still too procedural
- v3 (~600 words): Better but still had decision trees
- v4 (~500 words): Clean rewrite — principles + examples, no branching
- v5 (~960 words): Added research-backed principles, anti-pattern examples

The biggest quality jump was v3 → v4, when we deleted the decision trees and replaced them with principles.  Research confirms this: specifying more requirements can drop instruction-following performance by 19%.

## 3. The tutor can't help without seeing the problem

This sounds obvious, but our first test run showed the tutor jumping straight into "show me your work" when the student had only said "I'm stuck on something about acceleration."  The tutor didn't have the problem text, the numbers, or even what was being solved for.

The fix was making "show me the problem" the mandatory first step, with an explicit self-check: does the tutor have the given values, what's being solved for, and the required units?

## 4. "Staring at your own mistake" is different from "doesn't understand the concept"

A strong student who can't find their error is not the same as a student who doesn't know the material.  The first needs a fresh pair of eyes — show them the contradiction, or give them a parallel problem with different numbers.  The second needs direct teaching.

Our early prompts treated all stuck students the same way (keep asking Socratic questions).  This led to infinite loops where the student kept giving the same wrong answer and the tutor kept asking "are you sure?"

## 5. One question at a time is surprisingly hard for the model

Even with an explicit principle and an example, Sonnet without extended thinking stacked questions in about 1 out of 3 responses.  Extended thinking reduced this to near-zero.  The model's natural instinct is to be efficient — it wants to cover multiple points per message.  Fighting this instinct requires either extended thinking (gives the model a self-check step) or very strong examples showing single-question messages.

## 6. The Chrome extension works as a test harness

We were skeptical that Claude's browser agent could reliably simulate a student.  It can — with the right character brief.  The key is giving it a character (who the student is, what they know, how they behave) rather than a script (say X, then say Y).  Character briefs are resilient to unexpected tutor behavior; scripts are brittle.

What the Chrome extension can't test: whether the interaction *feels* right.  Tone, warmth, the sense that the tutor is on your side — these require a real student.

## 7. Khan Academy's biggest insight applies here too

Khan's prompt engineering team found that Khanmigo repeated itself too much and used too many words.  Their fix: "economy of language."  We found the same thing.  When the student sends two-sentence messages and the tutor responds with three paragraphs, the mismatch is immediately off-putting.  The fix was a single line in the prompt: "if she sends two sentences, you send two or three back, not a paragraph."

## 8. The frustrated student is the real test

A calm, cooperative student makes any tutor look good.  The frustrated student — two hours in, three assignments due, starting to believe they're bad at physics — tests whether the tutor can be warm without being preachy, direct without being cold, and helpful without lecturing.  Our tutor passed this test, but only after we added the "favorite teacher" tone framing.  The earlier "sharp upperclassman" framing produced correct but sterile responses that would have made a frustrated student disengage.

## 9. Socratic questioning has a failure mode

The research calls it "infinite regress" — question after question, no synthesis, no termination.  If the student genuinely doesn't know the answer, asking more questions doesn't help.  Our fix was the parallel problem technique: give them the same type of problem with different numbers, let them do it correctly, and the contrast surfaces the original error.  If even that doesn't work, teach the concept directly — but still make them apply it.

## 10. The parent should be in the loop

This toolkit helps a parent build a tutor for their specific kid.  The personalization — knowing her temperament, knowing she stares at problems too long rather than having concept gaps, knowing that "count the zeros" sounds patronizing to her — is the value.  That doesn't scale without the parent.  Which is actually the point.
