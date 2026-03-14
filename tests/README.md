# Test Harness

## How it works

Each test file is a **character brief** — a set of instructions for simulating a student interaction with the tutor.  You can use these in three ways:

### Option 1: Claude Chrome Extension (recommended for quick iteration)

1. Set up a Chrome shortcut for each test scenario.
2. The shortcut should point to your Claude Project.
3. Paste the character brief as the shortcut's instructions.
4. Run it.  The extension will navigate to the project, start a conversation, and play the student role.
5. After the conversation, the extension will ask the tutor for a transcript and bring it back.

### Option 2: Manual testing

1. Open your Claude Project.
2. Start a new conversation.
3. Play the student role yourself, following the script in the character brief.
4. Evaluate the tutor's responses against the checklist.

### Option 3: API (for scale)

If you want to run many scenarios programmatically, use the Anthropic SDK to send the student messages and capture the tutor's responses.  See `app/` for both a CLI tutor (`npm start`) and a web interface (`npm run serve`).

## Test scenarios

| File | Error type | Student emotional state | What it tests |
|------|-----------|------------------------|---------------|
| `kinematics.md` | Wrong equation | Confused | Basic opening sequence, error diagnosis |
| `projectile-motion.md` | Buried vector error | Puzzled (work seems correct) | Step-by-step confirmation, finding a hidden error |
| `friction.md` | Forgot a force | Frustrated, defeated | Emotional adaptation, not lecturing |
| `similar-triangles.md` | Wrong side correspondence | Confused | Geometry handling, conceptual vs. arithmetic error |
| `pendulum.md` | Unit conversion miss | Overconfident | Pushing back respectfully, not caving |

## Evaluation

Use the checklist in `templates/evaluation-checklist.md` as a base, and add scenario-specific items from each test file.

## Interpreting results

- If the same failure appears across multiple scenarios (e.g., stacking questions), it's a **principle or example problem** — fix the prompt.
- If a failure appears in only one scenario, it's a **judgment problem** — consider adding an example that covers that case.
- If a scenario takes more than 10-12 exchanges to resolve, the tutor is either looping or over-scaffolding.
- If the tester rates the tone as "patronizing," check whether the examples in the prompt match the desired tone.

## Adding new tests

To add a new scenario:

1. Pick an error type and emotional state not already covered.
2. Write a character brief following the structure of the existing files.
3. Include: the problem, the wrong answer, the actual error, what the student knows/doesn't know, how to behave, and a customized evaluation checklist.
4. Run it and add findings to your iteration log.
