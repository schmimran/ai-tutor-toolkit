# Web Parent Config — Planned

A setup interface where a parent can configure the tutor for their student.  Generates a system prompt from user inputs without requiring the parent to edit a markdown template directly.

**Status:** Planned — not yet implemented.

## Purpose

Provide a web form where a parent chooses:

- Subject and grade level
- Student pronouns
- Tutor tone
- A brief student description
- Scope boundaries

The form previews the generated system prompt and saves the configuration.  This replaces the manual process of copying `templates/tutor-prompt.md` and filling in variables.

## Planned technology

- **Runtime:** Node.js 18+
- **Server:** Express
- **Frontend:** To be determined — likely a single HTML file consistent with the existing web app, unless complexity justifies a framework.

## Planned dependencies

| Package | Purpose |
|---------|---------|
| `@ai-tutor/core` | Shared tutor logic and prompt loading |
| `express` | HTTP server |

## Design methodology

This app extends the template variable system already defined in `templates/tutor-prompt.md`.  The form fields map directly to the six template variables (`GRADE_LEVEL`, `SUBJECTS`, `PRONOUNS`, `TONE`, `STUDENT_PROFILE`, `SCOPE_NOTE`).  The generated prompt is a string substitution into the template — no AI generation of the prompt itself.

The parent config UI is intentionally separate from the student-facing tutor web app.  The parent sets up; the student uses.  These are different users with different needs.
