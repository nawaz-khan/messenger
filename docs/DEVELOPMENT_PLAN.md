# DEVELOPMENT_PLAN.md

## Phase 0 — Planning and verification

Before writing product code:

1. Read all docs in `/docs`.
2. Confirm current Next.js/Supabase package versions.
3. Confirm current Supabase SSR/auth setup.
4. Verify current Google Drive API upload flow and credential model.
5. Verify hosting constraints relevant to large uploads/media delivery.
6. Produce an implementation plan without changing the architecture.

Do not start by generating every page at once.

## Phase 1 — Foundation

Build:

- Next.js app.
- TypeScript.
- Tailwind.
- shadcn/ui.
- Environment configuration.
- Supabase client utilities.
- Basic application shell.
- Error/loading states.

Acceptance criteria:

- App runs locally.
- Production build succeeds.
- Supabase environment variables work.

## Phase 2 — Authentication and profiles

Build:

- Email/password.
- Google OAuth.
- Session handling.
- Onboarding.
- Profile table.
- Username uniqueness.
- Profile UI.

Acceptance criteria:

- New user can register/login.
- User can set unique username.
- Duplicate username is rejected by database constraint.
- User cannot edit another user's profile through the client.

## Phase 3 — Conversation model

Build:

- Conversations.
- Conversation members.
- Groups.
- Public/private/invite-only behavior.
- Owner/moderator/member permissions.
- Atomic Postgres RPC for getting/creating direct conversations to prevent duplicates.

Acceptance criteria:

- Direct conversation can be created between two users (and never duplicated).
- Group can be created.
- Members can join/leave according to rules.
- RLS blocks unauthorized access.

## Phase 4 — Messaging

Build:

- Message composer.
- Send text.
- Message list.
- Pagination.
- Edit/delete.
- Replies.
- Reactions.
- Read state.
- Realtime Broadcast.
- Presence.
- Typing indicators.

Acceptance criteria:

- Two browsers see new messages in real time.
- Messages survive page reload.
- Unauthorized users cannot read/send in protected conversations.

## Phase 5 — Media

Build:

- Media picker.
- File validation (client and server).
- Client-side image compression and video thumbnail generation.
- Google Drive upload-session flow (Browser PUTs directly to Drive session URI).
- Media Proxy Service setup for streaming private files.
- Signed JWT generation for media authorization.
- Image/GIF/video storage logic (original + preview).
- Supabase media metadata.
- Media viewing and HTML5 video playback.

Acceptance criteria:

- 99 MB image works.
- 100 MB boundary behavior is correct.
- 50 MB GIF boundary behavior is correct.
- 200 MB video boundary behavior is correct.
- Unsupported formats are rejected.
- Drive credentials are never exposed to the browser.
- Media is successfully streamed via Media Proxy supporting HTTP Range requests.
- Broken uploads do not leave unusable messages.

## Phase 6 — Search and notifications

Build:

- Username search.
- Group search.
- Unread counters.
- Notifications.

Acceptance criteria:

- Searching `@username` finds the correct profile.
- Search does not expose private email data.

## Phase 7 — Moderation/admin

Build:

- Report flow.
- Block flow.
- Admin dashboard.
- Moderator controls.
- Ban/suspension.
- Basic audit data.

Acceptance criteria:

- Ordinary users cannot grant themselves moderator/admin rights.
- Reports are visible only to authorized staff/moderators.

## Phase 8 — PWA and polish

Build:

- Installable PWA.
- Responsive/mobile polish.
- Accessibility.
- Error states.
- Empty states.
- Loading states.
- Optimistic UI only where safe.

## Phase 9 — Testing and deployment

Test:

- Authentication.
- RLS.
- DMs (atomic creation uniqueness).
- Groups.
- Realtime.
- Media uploads (client-direct flow).
- Large media streaming via Media Proxy.
- Account deletion.
- Blocking/reporting.
- Mobile browser.
- Production build.

Deploy:

- GitHub.
- Vercel (Next.js).
- Supabase production project.
- Media Proxy (e.g., Cloudflare Worker/Cloud Run).
- Google Drive production credentials.

## Agent behavior rules

Antigravity should:

- Follow `/docs` as the source of truth.
- Ask only when a decision is genuinely missing and cannot be inferred from these docs.
- Prefer the simplest implementation that satisfies the architecture.
- Avoid introducing dependencies unless necessary.
- Avoid replacing the stack without explicit approval.
- Run tests/build/lint after meaningful changes.
- Never silently alter product decisions stored in `DECISIONS.md`.
