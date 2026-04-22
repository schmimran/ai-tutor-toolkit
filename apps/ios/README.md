# @ai-tutor/ios

> **Status: Placeholder.**  No Swift code exists yet.  This directory reserves the `apps/ios` slot in the monorepo.  See the project roadmap in the root README for timeline.

Native iOS client for the AI Tutor.  Swift/SwiftUI app that connects to the existing API server -- no AI logic runs on device.

## API calls made by the app (planned)

| Endpoint | When |
|----------|------|
| `GET /api/config` | On app launch |
| `POST /api/chat` | On each message send (with optional file attachments) |
| `GET /api/transcript/:sessionId` | When transcript view is opened |
| `POST /api/feedback` | When rating is submitted |
| `DELETE /api/sessions/:sessionId` | On "New session" or app backgrounding |

Architecture and implementation decisions will be documented when development begins.
