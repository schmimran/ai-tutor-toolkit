# @ai-tutor/ios

Native iOS client for the AI Tutor.  Swift/SwiftUI app that connects to the existing API server — no AI logic runs on device.

## Overview

This is a placeholder for the iOS application.  The API server (`apps/api`) is the single source of truth for tutor logic, session management, and prompt loading.  The iOS app is a thin client: it sends messages and files to the API, streams the response, and renders it natively.

## Technology decisions

### Swift / SwiftUI

The app is written in Swift with a SwiftUI interface.  Minimum deployment target: iOS 17 (URLSession structured concurrency, SwiftUI NavigationStack, and `AsyncStream` are all required).

### API-first architecture

The iOS app calls the same REST/SSE API used by the web frontend.  No tutor prompt is bundled with the app binary.  Prompt updates, model changes, and extended-thinking configuration are all controlled server-side — no App Store update required.

Base URL is configurable at build time via a `Config.xcconfig` file (not committed).

### Streaming via URLSession

Chat responses stream token-by-token over Server-Sent Events, identical to the web client.  The app uses `URLSession.bytes(for:)` to read the response body as an `AsyncBytes` sequence and parses `data:` lines incrementally.

Event types handled:

| Type | Action |
|------|--------|
| `text_delta` | Append text to current assistant bubble |
| `message_stop` | Mark response complete |
| `error` | Show inline error; allow retry |

### Authentication — Supabase Auth SDK for Swift (Phase 5)

Authentication is deferred to Phase 5.  When implemented, it will use the [Supabase Swift SDK](https://github.com/supabase/supabase-swift) (`supabase-swift` package).  The auth flow will be:

1. Sign in with Apple (or email magic link) via `supabase.auth.signInWithApple()`
2. Exchange the Supabase JWT for a session token
3. Pass the JWT in the `Authorization: Bearer <token>` header on all API requests
4. The API server will validate the JWT using the Supabase project's JWT secret

No auth logic is implemented until Phase 5.  The API currently accepts unauthenticated requests.

### Camera integration for homework photos

The app provides a camera/photo-library picker so students can photograph a homework problem and attach it to a message.  Implementation uses `PhotosUI.PhotosPicker` (iOS 16+) for library access and `AVFoundation` for live camera capture.

Images are attached as `files[]` fields in the `multipart/form-data` POST to `/api/chat`, matching the same interface the web client uses.  The server accepts JPEG, PNG, GIF, WebP, and PDF (max 5 files, 10 MB each).

### No on-device model

There is no CoreML model, no on-device inference, and no bundled weights.  All AI calls go through the API server.  This keeps the app binary small and ensures the tutor behavior is always up to date.

### Session management

Session IDs are client-generated UUIDs (`UUID().uuidString`), consistent with the web client.  The iOS app:

- Generates a new session ID at app launch (or when the student taps "New session")
- Passes the session ID in every `POST /api/chat` request
- Calls `DELETE /api/sessions/:sessionId` when the student ends a session
- Does not persist sessions across app restarts (sessions are ephemeral by design)

## API calls made by the app

| Endpoint | When |
|----------|------|
| `GET /api/config` | On app launch |
| `POST /api/chat` | On each message send (with optional file attachments) |
| `GET /api/transcript/:sessionId` | When transcript view is opened |
| `POST /api/feedback` | When rating is submitted |
| `DELETE /api/sessions/:sessionId` | On "New session" or app backgrounding |

## Project structure (planned)

```
apps/ios/
├── README.md                    ← This file
├── AITutor/
│   ├── AITutorApp.swift         ← App entry point
│   ├── Config.xcconfig          ← Build-time config (not committed)
│   ├── API/
│   │   ├── APIClient.swift      ← URLSession wrapper, base URL, auth header
│   │   ├── ChatStream.swift     ← SSE parser, AsyncStream<ChatEvent>
│   │   └── Models.swift         ← Codable request/response types
│   ├── Session/
│   │   ├── SessionStore.swift   ← ObservableObject: current session ID, message list
│   │   └── Message.swift        ← Message model (role, text, attachments)
│   ├── Views/
│   │   ├── ContentView.swift    ← Root view (conversation + input bar)
│   │   ├── MessageBubble.swift  ← Student/tutor bubble; renders markdown + math
│   │   ├── InputBar.swift       ← Text field, send button, attachment picker
│   │   ├── AttachmentPicker.swift ← Camera + photo library sheet
│   │   └── TranscriptView.swift ← Full-session transcript modal
│   └── Resources/
│       └── Assets.xcassets
└── AITutor.xcodeproj/
```

## Configuration

| Setting | Where | Notes |
|---------|-------|-------|
| `API_BASE_URL` | `Config.xcconfig` | e.g. `https://your-render-app.onrender.com` |
| `SUPABASE_URL` | `Config.xcconfig` | Phase 5 only |
| `SUPABASE_ANON_KEY` | `Config.xcconfig` | Phase 5 only; anon key is safe to include in app |

`Config.xcconfig` is gitignored.  A `Config.xcconfig.example` will be provided with placeholder values.

## Building

This placeholder contains no Xcode project yet.  When Phase 5 is ready:

```bash
# Open in Xcode
open apps/ios/AITutor.xcodeproj

# Or build from CLI
xcodebuild -project apps/ios/AITutor.xcodeproj \
           -scheme AITutor \
           -destination 'platform=iOS Simulator,name=iPhone 16' \
           build
```

## Design notes

- Match the warm beige/brown aesthetic of the web frontend where possible
- LaTeX math rendering via a WKWebView shim using KaTeX (same library as web) or a native Swift math renderer
- Voice input (AVSpeechRecognizer) is a stretch goal, not in scope for the initial release
- Offline mode is out of scope — the app requires a network connection to the API server
