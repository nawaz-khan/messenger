# ARCHITECTURE.md

## 1. High-level architecture

```text
Students
   |
   v
Next.js web application / PWA
   |
   +------------------------------+---------------------------+
   |                              |                           |
   v                              v                           v
Supabase                       Media Proxy                 Google Drive
   |                              |                           |
   +-- Auth                       +-- Validates JWT           +-- images
   +-- PostgreSQL                 +-- Streams media securely  +-- gifs
   +-- Realtime                                               +-- videos
   +-- RLS
   +-- application metadata
```

## 2. Responsibilities

### Next.js

- UI and routing.
- Authentication UI.
- Server-side application logic where needed.
- Authorization checks before privileged operations.
- Requesting Google Drive resumable upload sessions.
- Generating signed JWTs for secure media access.
- API endpoints for app-specific operations that should not happen directly from the client.

### Supabase

Supabase is the system of record for:

- Authentication.
- User/profile data.
- Groups.
- Group membership.
- Conversations.
- Messages.
- Reactions.
- Notifications.
- Reports.
- Blocks.
- Media metadata (including Google Drive file IDs).
- Authorization through RLS.
- Realtime events.

### Google Drive

Google Drive is the ONLY storage location for actual media binaries:

- Original images and optimized previews.
- Original GIFs.
- Original videos and video thumbnails.

Do not store application data in Drive. Do not use Supabase Storage.

### Media Proxy

A dedicated, lightweight service (e.g., Cloudflare Worker or Cloud Run) to securely stream private Google Drive media to the browser without exposing Drive credentials or hitting Vercel's payload limits.

## 3. Conversation model

Use one generic conversation model that supports two types:

```text
conversation.type = direct | group
```

This avoids building separate messaging engines for DMs and groups.

### Direct conversation

- Exactly two members.
- No public discovery page.
- Can be created from a user profile/search result.
- A database-level constraint/mechanism guarantees a direct conversation between two specific users cannot be duplicated (atomic get-or-create).

### Group conversation

- Multiple members.
- Group metadata is stored in `groups` or represented by a group-linked conversation.
- Roles: owner, moderator, member.

## 4. Realtime model

Use Supabase Realtime for live chat behavior.

Preferred pattern:

- Persist the message in PostgreSQL.
- Broadcast the new-message event to authorized members.
- Use Presence for low-frequency presence state such as online/offline.
- Use ephemeral Broadcast events for transient UI state such as typing indicators.

Do not treat Realtime as the permanent message store.

## 5. Media architecture

**Upload Flow (bypassing Vercel limits):**

```text
Browser
  | validate size/type
  | generate client-side compression/thumbnail
  v
Next.js / application authorization
  |
  | request Drive upload session URIs (for original & preview)
  v
Google Drive API
  | returns session URIs
  v
Browser
  | resumable PUT upload directly to Drive session URIs
  v
Google Drive
  | returns file IDs
  v
Next.js / Supabase
  | store metadata and file IDs in PostgreSQL
  v
Message references media
```

Large media must not be sent through a normal application request body.

## 6. Media access

The browser must never receive the Google account credentials or server-side Drive credentials.
Media files must remain private in Google Drive.

For media viewing:

1. Authenticate the user with Supabase.
2. Next.js authorizes access to the message/conversation.
3. Next.js generates a short-lived, signed JWT containing the authorized Drive file ID.
4. Browser uses the JWT to request the file from the **Media Proxy**.
5. Media Proxy validates the JWT, requests the file from Google Drive using Server Credentials, and streams the binary to the browser (supporting HTTP Range requests for video).

Keep this behind a dedicated media abstraction.

## 7. Storage separation

Supabase stores metadata; Drive stores binaries.

Never put large media blobs into PostgreSQL.

## 8. Hosting

Initial hosting target:

- Vercel for the Next.js application.
- Supabase hosted services for backend.
- Google Drive for media storage.
- A small dedicated proxy service (e.g., Cloudflare Worker, Cloud Run) for media streaming.
- GitHub for source control.

## 9. Application layers

Keep the codebase organized into clear layers:

```text
UI
  -> hooks/client state
  -> application actions / API
  -> domain logic
  -> Supabase / Drive adapters
```

Avoid scattering Supabase and Google Drive SDK calls throughout React components.

## 10. Recommended folder direction

After initializing Next.js, target a structure similar to:

```text
src/
  app/
  components/
  features/
    auth/
    profiles/
    search/
    conversations/
    groups/
    messages/
    notifications/
    moderation/
    media/
  lib/
    supabase/
    drive/
    auth/
    permissions/
    validation/
  types/
  config/
```
