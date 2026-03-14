# Web Session Review — Planned

A transcript review interface with automated evaluation checks.  Helps parents and prompt developers assess tutor quality without manually reading every exchange.

**Status:** Planned — not yet implemented.

## Purpose

Provide a web interface to:

- View session transcripts.
- Run automated checks against the evaluation checklist (did the tutor give the answer?  How many exchanges?  Was more than one question asked per message?).
- Flag specific exchanges for review.
- Compare transcripts across prompt versions.

## Planned technology

- **Runtime:** Node.js 18+
- **Server:** Express
- **Frontend:** To be determined.
- **Evaluation logic:** Rule-based checks derived from `templates/evaluation-checklist.md`.

## Planned dependencies

| Package | Purpose |
|---------|---------|
| `@ai-tutor/core` | Shared session and transcript types |
| `express` | HTTP server |

## Design methodology

The review tool consumes the transcript format already produced by `Session.getTranscript()` from `@ai-tutor/core`.  Automated checks map to the standard evaluation checklist items defined in `templates/evaluation-checklist.md`.  The tool scores transcripts but does not modify prompts — that remains a manual, judgment-driven process.
