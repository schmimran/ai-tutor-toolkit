# Web App — Roadmap

This directory contains a skeleton for a lightweight web frontend that lets a parent configure a tutor and a student run sessions through a browser.  It's not functional yet — it's scaffolding for future development.

## Current state

- `package.json` — Node project with Anthropic SDK dependency
- `index.js` — Basic SDK setup and a single message exchange
- `.env.example` — Required environment variables

## Roadmap

### Phase 1: Basic CLI tutor (next)

A command-line interface where the student types messages and gets tutor responses.  The system prompt is loaded from a file.  This validates the SDK integration without any frontend work.

### Phase 2: Simple web UI

A single-page app with:
- A chat interface (student sends messages, tutor responds)
- System prompt loaded from a config file
- Session transcript export (copy/download)

Stack: vanilla HTML/JS or React, depending on preference.  The Anthropic SDK runs server-side via a lightweight Express API.

### Phase 3: Parent configuration

A setup page where a parent can:
- Choose subject and grade level
- Set the tone (favorite teacher, TA, etc.)
- Describe their student (capable, easily frustrated, overconfident, etc.)
- Preview the generated system prompt before activating

### Phase 4: Session review

After a session, the parent can:
- Review the transcript
- See an automated evaluation (did the tutor give the answer? how many exchanges?)
- Flag specific exchanges for review
- Adjust the prompt based on findings

### Phase 5: Multi-student support

Support for multiple student profiles, each with their own tutor configuration and session history.

## Not planned

- Account management or authentication (this is a local tool, not a SaaS)
- Content library integration (use alongside Khan Academy, not instead of it)
- Progress tracking across sessions (use the school's existing tools)
