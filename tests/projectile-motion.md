# Test: Projectile Motion — Buried Error

**Error type:** Added velocity components as scalars instead of using Pythagorean theorem
**Student state:** Puzzled — all individual steps seem correct
**Tests:** Step-by-step confirmation of correct work, finding a hidden error late in the chain

## Setup

1. Start a new conversation in your tutor project.

## Character brief

You are a 9th-grade student who got a projectile motion problem wrong.  You're not panicked — just genuinely puzzled.  You checked every step and they all look correct.  The error is in the very last step.

**Stay in character.  Do not evaluate the tutor out loud.  Do not mention testing.**

### The problem

> A ball is thrown horizontally at 15 m/s from the top of a 45 m cliff.  Find the total speed of the ball just before it hits the ground.  Ignore air resistance.  Answer in units of m/s.

### What you did wrong

- You submitted **44.7 m/s** and it was marked wrong.  The correct answer is approximately **33.3 m/s**.
- Your work:
  - Time to fall: t = √(2h/g) = √(2 × 45 / 9.8) ≈ 3.03 s.  **Correct.**
  - Vertical velocity: v_y = g × t = 9.8 × 3.03 = 29.7 m/s.  **Correct.**
  - Horizontal velocity stays 15 m/s.  **Correct.**
  - Combined them: 15 + 29.7 = 44.7 m/s.  **THIS IS THE ERROR.**  Should use √(15² + 29.7²) ≈ 33.3 m/s.
- You do NOT see the error.  Every individual step feels right.

### What you know (and don't know)

- You can do projectile motion — you split it into horizontal and vertical correctly.
- You have a vague understanding of vectors but didn't think about it here.
- You treated the final step as simple addition: "just combining two speeds."
- If the tutor mentions vectors or Pythagorean theorem, you might have an aha moment — but don't jump there on your own.

### How to behave

- **Open puzzled:** "I got a projectile motion problem wrong and I can't figure out why.  All my steps seem right."
- Walk through ALL steps with equal confidence if asked.
- When the tutor confirms early steps, acknowledge it but stay confused about the final answer.
- If the tutor zeroes in on the combination step: "I just added them... isn't that how you combine two speeds?"
- Keep messages short.

### End when

- You've arrived at the correct answer, OR
- 12 exchanges without resolution.

## After the conversation

1. Ask the tutor for a transcript.
2. Copy the transcript and fill in the evaluation below.

## Evaluation checklist

- [ ] Tutor asked to see the problem first
- [ ] Tutor asked where I was stuck / how far I got
- [ ] Tutor asked for my work before helping
- [ ] Tutor never gave the final answer
- [ ] One question per message
- [ ] Asked WHY I chose my approach
- [ ] Step-by-step feedback
- [ ] Correctly identified the buried error (scalar addition instead of vector addition)
- [ ] Confirmed the correct steps were correct before zeroing in on the error
- [ ] Student computed the final answer herself
- [ ] Did not quiz concepts already demonstrated
- [ ] Did not talk to the student like a child
- **Exchange count:** ___
- **Tone:** [ ] favorite teacher  [ ] TA-like  [ ] neutral  [ ] patronizing
- **Worst exchange:** ___
- **Notes:** ___
