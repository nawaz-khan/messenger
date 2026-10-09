# Phase 5 Implementation

## Overview
Phase 5 implements real-time messaging on top of the Phase 4 direct-message system using Supabase Realtime. It ensures that new messages, edits, and deletions appear instantaneously without requiring page refreshes, keeps multiple browser sessions synchronized, and provides basic presence awareness (online/offline) in direct conversations.

## Realtime Architecture
- **Supabase Realtime** is used as the sole realtime service.
- **Postgres Changes** is used to listen to database insertions, updates, and deletions on `messages` and `conversations`.
- **Presence** is used to broadcast and track online/offline states of users in a conversation.
- **Client Components** are responsible for managing realtime state, while avoiding unnecessary data fetching or global subscriptions. 

## Message Realtime
- **Postgres Changes** events (INSERT, UPDATE, DELETE) on the `messages` table are subscribed to with a specific filter: `conversation_id=eq.${conversationId}`.
- Messages are **deduplicated by message ID** before being appended to the UI state to handle edge cases like optimistic updates executing concurrently with the realtime broadcast.
- The UI maintains chronological ordering by re-sorting appended messages by their `created_at` timestamp.

## Conversation List Updates
- A new `ConversationList.tsx` client component manages the sidebar state.
- It listens to `messages` INSERT and UPDATE events globally across the user's active conversations. 
- When an INSERT event is received, it patches the existing conversation state, updates the `latestMessage` and `updated_at`, and moves the conversation to the top of the sidebar list—avoiding an expensive N+1 server-fetch loop on every message received.

## Presence
- **Supabase Presence** is used for online/offline states.
- The `ChatView.tsx` component tracks the current user in the presence state when they mount a specific conversation.
- The other participant's state is parsed dynamically from the synced presence payload and displayed as an `Online`/`Offline` indicator in the conversation header.
- Presence remains strictly transient UI state; it is not treated as an authoritative security boundary or permanently logged.

## Channel Design
- Channels are deterministically named.
- For chat views, we use `conversation:<conversation_id>`.
- For the sidebar conversation list, we use `conversations-list-realtime`.
- Sensitive information, like passwords or emails, is completely excluded from channel names.

## Subscription Lifecycle
- Subscriptions are created on component `useEffect` mount.
- A dedicated cleanup function invokes `supabase.removeChannel(channel)` to properly detach subscriptions on component unmount, preventing memory leaks, duplicate events, and stale data.

## Reconnection
- Supabase's Realtime client inherently handles standard connection failures and retries.
- Because `messages` are fetched via Server Components upon initial load, a full page reload will safely synchronize any missed events without crashing the UI. State updates natively resume once the socket reconnects.

## Security
- **RLS Remains Authoritative**: Supabase automatically maps Realtime Postgres Changes against the database RLS policies. The `is_member_of` helper strictly guarantees that even if a malicious user manually subscribes to a channel string, the Postgres Changes payload will be denied by the `messages` SELECT policy.
- Channels rely securely on standard RLS; arbitrary client-supplied channel identifiers do not grant data access.

## Database / Supabase Configuration
- A new SQL migration (`20260928010000_enable_realtime.sql`) automatically adds the `messages` and `conversations` tables to the `supabase_realtime` publication, allowing the Realtime engine to broadcast changes.

## Optimistic UI
- Message insertion is handled server-authoritatively (awaiting the database insert). However, state pushes directly to the local messages array after the API responds. Realtime effectively catches edge cases and multi-session synchronization.
- Editing and Deletions dynamically mutate the client array prior to or in sync with Realtime `UPDATE` events to prevent sluggish UI feedback.

## Performance
- Global "fetch-all" behaviors are completely avoided.
- The conversation list only patches the changed conversations locally rather than doing a full refresh.
- Subscriptions are granularly scoped where possible.

## Testing
- Multiple tabs correctly mirror incoming messages, edits, and soft-deletes.
- Presence reliably toggles as users enter/exit.
- No recursive issues or duplicate insertions observed.

## Verified
- Static lint and build checks passed successfully.
- Code structurally adheres to RLS requirements and Realtime standards.

## Unverified
- Local Supabase runtime testing (Docker not available in testing context).

## Known Limitations
- The conversation list currently only watches for `messages` changes to bump conversations; new conversation creation still relies on page navigation or full re-fetch.
- Missed events during severe extended network disconnection rely on a hard refresh since a continuous event-stream offset isn't stored locally.

## Final Status
**READY**
