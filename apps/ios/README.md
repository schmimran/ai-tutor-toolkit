# iOS Tutor — Planned

A native iOS tutor interface for students who primarily use an iPhone or iPad.

**Status:** Planned — technology decisions not yet finalized.

## Purpose

Provide a mobile-native tutoring experience with the same pedagogical approach as the web and CLI interfaces.  The core interaction — student sends a message, tutor responds with Socratic guidance — is identical.  The iOS app adds mobile-specific affordances: camera integration for photographing homework, push notifications, and offline transcript access.

## Planned technology

Technology is TBD.  Open questions:

- **Native vs. cross-platform:** Swift/SwiftUI gives the best iOS experience but shares no code with the Node.js apps.  React Native or a similar framework could share UI logic across platforms.
- **API architecture:** The app could call the Anthropic API directly from the device, or route through a shared backend.  A backend proxy keeps the API key off the device and enables session persistence.  Direct calls reduce infrastructure but require bundling the key.
- **Prompt distribution:** The system prompt currently lives in the repository as a markdown file.  The iOS app needs a way to receive it — options include bundling at build time, fetching from a backend, or loading from a CDN.  See the "Cross-platform prompt distribution" section in `CLAUDE.md` for the current thinking on this.

## Planned dependencies

| Dependency | Purpose |
|------------|---------|
| `@ai-tutor/core` (or equivalent) | Shared tutor logic — may need a Swift port or a backend proxy |
| Anthropic SDK (Swift or via backend) | Claude API access |

## Design methodology

The same six design tenets apply: examples over rules, principles over procedures, student finishes the problem, respect demonstrated knowledge, one question at a time, warm and direct tone.  The iOS app is a new interface for the same tutor, not a different tutor.

The prompt and evaluation checklist are shared assets at the repository root.  Any interface-specific behavior should be handled in the interface layer, not by forking the prompt.
