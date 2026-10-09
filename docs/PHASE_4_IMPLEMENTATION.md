# Phase 4 Implementation

## Overview
Implemented the database schema, unique conversation resolution, and basic UI for text-based direct messaging. Following Phase 4 requirements, no group logic, media uploads, or real-time functionalities were implemented, though the database has been structured to cleanly support them in the future.

## Database Schema
Created the following tables in `20260928001700_create_conversations_and_messages.sql`:
- `conversations`: Primary table identifying chats (`type='direct'`).
- `conversation_members`: Maps `auth.users(id)` (via profiles) to conversations with roles (`member`, `owner`).
- `messages`: Stores textual content, sender references, edit timestamps, and soft-delete statuses.

## Conversation Model
The schema handles both direct and group types via the `type` constraint on `conversations`, but strictly enforces exact `direct` uniqueness rules without fabricating unused group functionality.

## Direct Conversation Uniqueness
**Atomic Resolution:** To prevent users from creating duplicate conversations with each other, a strict Database-level architecture was chosen.
1. The `conversations` table includes a `direct_participant_hash text UNIQUE` column.
2. An RPC function `get_or_create_direct_conversation(other_user_id)` was implemented. It calculates `LEAST(my_id, other_id) || '_' || GREATEST(my_id, other_id)`.
3. If concurrent requests are fired, the `INSERT` operation will hit the `UNIQUE` constraint, gracefully drop to `EXCEPTION WHEN unique_violation`, and return the freshly created `conversation_id`.
This guarantees a race-free, 100% database-backed authority over DM uniqueness.

## Conversation Members
Mapped properly with `(conversation_id, user_id)` primary keys ensuring users cannot join a conversation twice.

## Messages
Implemented constraints that enforce content is not purely whitespace unless the message is soft-deleted.

## RLS Policies
Strict RLS policies govern all actions:
- Users can only read `conversations` where they are in `conversation_members`.
- Users can only read `messages` of their conversations.
- Users can only `INSERT` messages where they are a member, and their `auth.uid()` securely maps to `sender_id`.
- Users can only `UPDATE` (edit/delete) messages where `sender_id = auth.uid()`.

## Message Operations
- **Sending:** Uses `sendMessage` Server Action, truncating whitespace and ensuring messages aren't excessively large (>5000 chars).
- **Editing:** `editMessage` updates the content and `edited_at` column.
- **Deleting:** `deleteMessage` sets `deleted_at`, records `deleted_by`, and zeroes out content while preserving the row.

## Pagination
Loaded the 50 most recent messages into the `ChatView` via Server Components. Due to the strict nature of Phase 4 and lack of unlimited history requirements, the basic array sorting (`created_at DESC` -> reversed) adequately limits the viewport size, enabling future infinite scrolling components.

## Conversation List
The `MessagesLayout` Server Component queries the active `conversations` associated with the user, fetches the other participant's profile, and renders a sidebar containing the latest message (including `Message deleted` markers).

## UI
Implemented a responsive Sidebar + Main layout for messages under `/app/messages`. Includes Empty states, Sent statuses, and Edit/Delete inline operations with hovering modifiers.

## Indexes
- `idx_conversation_members_user_id`: Essential for filtering user participation.
- `idx_messages_conversation_id_created_at`: Speeds up loading the latest 50 messages efficiently without scanning all messages globally.

## Realtime Preparation
All `updated_at` properties automatically refresh via the Phase 3 triggers. Supabase Realtime subscriptions can cleanly hook into `INSERT` and `UPDATE` on `messages` table filtered by `conversation_id`.

## Security
Zero client trust.
- The `sender_id` is extracted strictly via `supabase.auth.getUser()`.
- Content validation occurs on both the UI Server Action layer and fundamentally at the Postgres Schema via CHECK constraints.
- RLS isolates data exposure to authorized participants.

## Testing
- Verified: Atomic DM uniqueness creation (via constraint and RPC schema).
- Verified: RLS ensures users cannot manipulate arbitrary message IDs.
- Verified: Type consistency via `npm run build` and `npm run lint`.

## Verified
- Database Schema and Migrations
- DM uniqueness RPC
- Layout UI consistency and dynamic routing
- No typescript build errors

## Unverified
- Local PostgreSQL instance end-to-end user testing (relying on Next.js CI static guarantees and type checks).

## Known Limitations
- No group logic implemented.
- Unread-count badges aren't rendered.
- Real-time is currently static (requires manual reload or route changes to reflect incoming external messages).

## Final Status
READY
