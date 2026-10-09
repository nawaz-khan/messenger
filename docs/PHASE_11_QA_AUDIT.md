# Phase 11 QA Audit

## Overview
This document represents a read-only QA audit of the Campus Messenger systems. Features are marked as `CODE VERIFIED` (logic appears sound via code review) or `RUNTIME VERIFIED` (explicitly tested in a live browser session) or `NOT TESTED` (no runtime tests performed yet).

**Build & Lint Status:**
- `npm run lint`: **PASS** (3 warnings regarding `<img>` vs `<Image />` optimization).
- `npm run build`: **PASS** (Successful optimized production build).

---

## A. AUTHENTICATION

### 1. Sign up, Login, Logout, Verification
- **Expected behavior**: Users can register, receive verification email, login with credentials, maintain sessions, and logout cleanly.
- **Files/components**: `src/app/login/page.tsx`, `src/app/register/page.tsx`, `src/app/auth/callback/route.ts`
- **Server actions/RPCs**: Supabase Auth (Native)
- **Database tables**: `auth.users`, `public.profiles` (via trigger)
- **RLS/security**: Supabase secure cookies, `profile` creation strictly via `security definer` trigger.
- **Runtime test**: Register a new user, verify email, login, reload page to verify persistence, click logout.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed in code.
- **Recommended fix**: None.

---

## B. PROFILES

### 1. Profile Loading & Username Uniqueness
- **Expected behavior**: Profile displays correct info. Usernames must be unique (case-insensitive).
- **Files/components**: `src/app/app/profile/[username]/page.tsx`, `src/app/onboarding/page.tsx`
- **Server actions/RPCs**: `onboarding` action
- **Database tables**: `public.profiles`
- **RLS/security**: `username_normalized` unique constraint. Profile viewing is public for authenticated users.
- **Runtime test**: Attempt to claim an existing username with different casing during onboarding.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

### 2. Block/Unblock & Report User
- **Expected behavior**: Users can block/unblock and report other users. Cannot block/report self.
- **Files/components**: `ProfileModerationActions.tsx`, `MessageReportDialog.tsx`
- **Server actions/RPCs**: `block_user`, `unblock_user`, `report_user`
- **Database tables**: `public.blocked_users`, `public.reports`
- **RLS/security**: `SECURITY DEFINER` RPCs ensure `auth.uid()` matches action source. Duplicate reports prevented via recent migration.
- **Runtime test**: Block a user, verify UI updates. Report a user twice, verify second report is rejected.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

---

## C. DIRECT MESSAGING

### 1. Create DM & Existing DM reuse
- **Expected behavior**: Creating a DM with a user opens the existing thread or creates a new one.
- **Files/components**: `ConversationList.tsx`, `actions.ts` (`getOrCreateDirectConversation`)
- **Server actions/RPCs**: `get_or_create_direct_conversation`
- **Database tables**: `conversations`, `conversation_members`
- **RLS/security**: RPC checks `blocked_users` before creating. Unique hash `direct_participant_hash` prevents duplicates.
- **Runtime test**: Click "Message" on a profile twice; verify it routes to the same conversation ID.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

### 2. Send, Receive, Edit, Delete Messages
- **Expected behavior**: Realtime delivery, correct permissions for edits/deletes.
- **Files/components**: `ChatView.tsx`, `actions.ts`
- **Server actions/RPCs**: `sendMessage`, `editMessage`, `deleteMessage`
- **Database tables**: `messages`
- **RLS/security**: Only sender can edit/delete (`sender_id = auth.uid()`). Trigger `enforce_message_block_trigger` prevents sending if blocked.
- **Runtime test**: Send a message, edit it, delete it. Verify it updates via realtime for the recipient.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

---

## D. READ RECEIPTS

### 1. Delivery & Read Status
- **Expected behavior**: Gray tick (sent) -> Double gray tick (delivered) -> Double deep-green tick (read).
- **Files/components**: `ChatView.tsx`, `actions.ts` (`markConversationRead`)
- **Server actions/RPCs**: `mark_conversation_read`
- **Database tables**: `message_read_receipts`
- **RLS/security**: `is_conversation_member` helper function ensures RLS can evaluate realtime broadcasts without recursion.
- **Runtime test**: Sender sends message. Receiver opens chat. Sender UI instantly updates to green ticks.
- **Current status**: **RUNTIME VERIFIED** (PASS)
- **Issue**: None observed.
- **Recommended fix**: None.

---

## E. GROUPS

### 1. Group Creation, Invites, Privacy
- **Expected behavior**: Users can create groups, invite members, and privacy (public/private/invite_only) is respected.
- **Files/components**: `CreateGroupDialog.tsx`, `GroupSettingsDialog.tsx`, `actions.ts`
- **Server actions/RPCs**: `create_group_conversation`, `invite_user_to_group`, `join_public_group`
- **Database tables**: `groups`, `group_invitations`, `conversations`
- **RLS/security**: RPCs enforce membership roles.
- **Runtime test**: Create a private group, invite a user, log in as that user, accept invite.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

### 2. Member Management & Moderation
- **Expected behavior**: Owners/Moderators can promote/demote, remove members, delete group.
- **Files/components**: `GroupSettingsDialog.tsx`
- **Server actions/RPCs**: `remove_member`, `update_member_role`, `delete_group`
- **Database tables**: `conversation_members`, `groups`
- **RLS/security**: `remove_member` RPC enforces that only owners/moderators can kick, and owners cannot be kicked.
- **Runtime test**: Moderator attempts to remove owner (should fail). Moderator removes standard member (should pass).
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

---

## F. NOTIFICATIONS

### 1. DM, Group, Invites, and Realtime Updates
- **Expected behavior**: Users receive notifications for new messages (if not focused), and group invites. Badge updates in realtime.
- **Files/components**: `NotificationProvider.tsx`, `TopNav.tsx`
- **Server actions/RPCs**: `mark_notification_read`
- **Database tables**: `notifications`
- **RLS/security**: Notifications are strictly tied to `user_id`.
- **Runtime test**: Receive a message while on a different page. Verify notification dropdown populates and badge increments.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

---

## G. MEDIA

### 1. Upload Flow & Google Drive Integration
- **Expected behavior**: Users can upload attachments up to limits, files are stored securely (Drive/Supabase), and previews render.
- **Files/components**: `ChatView.tsx`, `media.ts`, `MediaRenderer.tsx`
- **Server actions/RPCs**: `createMessageMediaRecord`
- **Database tables**: `message_media`
- **RLS/security**: Validates `uploader_id`.
- **Runtime test**: Upload a >5MB file, verify chunked/drive upload succeeds and renders in chat.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

---

## H. SEARCH

### 1. Username and Member Search
- **Expected behavior**: Searching usernames returns partial/exact matches.
- **Files/components**: `SearchBar.tsx`
- **Server actions/RPCs**: `search_users` (or direct Supabase queries)
- **Database tables**: `profiles`
- **RLS/security**: Profiles are readable by authenticated users.
- **Runtime test**: Type partial username, verify results dropdown appears with correct avatars.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: Next.js linting warns about usage of standard `<img>` tags instead of `next/image`.
- **Recommended fix**: Switch `<img>` to `next/image` to improve LCP.

---

## I. SECURITY

### 1. Database Security & RPCs
- **Expected behavior**: All actions bypass direct table edits where complex validation is needed, using `SECURITY DEFINER` RPCs.
- **Files/components**: `supabase/migrations/`
- **Database tables**: All tables.
- **RLS/security**: 
  - `blocked_users`: RLS ensures privacy.
  - `message_read_receipts`: Foreign key and RLS correctly restricts visibility to conversation members.
  - `duplicate_reports`: RPC blocks identical pending reports.
- **Runtime test**: Attempt to query `messages` table via external REST client for a conversation the user is not in.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

---

## J. UI/UX

### 1. Layout & States
- **Expected behavior**: Responsive layout on mobile. Proper empty, error, and loading states.
- **Files/components**: All components.
- **UI/UX Considerations**: Enter sends message, Shift+Enter new line. Blocked users disable composer box.
- **Runtime test**: Shrink browser window to mobile width, verify chat and navigation stack correctly.
- **Current status**: **CODE VERIFIED** / **NOT TESTED** (Runtime)
- **Issue**: None observed.
- **Recommended fix**: None.

---

## Priority List

- **P3**: Use `<Image />` component from `next/image` in `CreateGroupDialog.tsx`, `Profile page.tsx`, and `SearchBar.tsx` to fix ESLint warnings and optimize LCP.
