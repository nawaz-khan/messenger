# Phase 7 Implementation

## User Search
Implemented global user search through a prominent `SearchBar` component integrated into the newly established app shell (`src/app/app/layout.tsx`). The search supports discovering other users across the application without unnecessarily downloading complete profiles.

## Username Search
Search operates specifically on the unique `username_normalized` field. The query is safely parameterized (using Supabase client's `.ilike` method) to ensure no raw string concatenation occurs. The search executes prefix matching (`query%`) to swiftly resolve targeted usernames as they type.

## Profile Discovery
Clicking a search result opens the other user's profile view (`/app/profile/[username]/page.tsx`). The profile safely exposes display name, username, avatar, academic info (course, semester, batch), and bio. It strictly does not expose internal auth fields like email.

## Search → DM
The profile discovery page integrates a "Message" button for external users. Triggering this invokes the atomic server action `getOrCreateDirectConversation`, executing the `get_or_create_direct_conversation` RPC to seamlessly transport the user to a unique direct message channel without risking duplicated conversations.

## Search Performance
A dedicated PostgreSQL index was added to `profiles(username_normalized text_pattern_ops)` to ensure prefix searches operate optimally without triggering expensive full-table scans. Additionally, the client-side search UI implements a 250ms debounce to prevent query floods on every keystroke.

## Notification Architecture
A standalone `notifications` table was introduced into the Supabase database. The schema leverages generic tracking (`type`, `reference_id`) while linking securely back to the notified `user_id`.

## Notification Types
Only the `new_message` notification type was implemented, aligning strictly with current requirements. Arbitrary types like 'friend_request' or 'like' were purposefully excluded.

## Notification Creation
Notifications are created transparently at the database layer via a `SECURITY DEFINER` Postgres trigger (`handle_new_message_notification`). Upon inserting a new row in `messages`, the trigger automatically creates a notification for all other conversation members. This mechanism prohibits malicious clients from arbitrarily crafting fake notifications via standard REST endpoints. Senders are intentionally excluded from being notified about their own outgoing messages.

## Notification Read State
Notifications implement a timestamped `read_at` state. The UI provides facilities to mark an individual notification as read (upon clicking/viewing the conversation), as well as a "Mark all read" mechanism to batch-clear unread indicators. A real-time unread badge reflects this state accurately in the app shell.

## Notification Realtime
The `notifications` table was added to the `supabase_realtime` publication. The `NotificationsBadge` client component securely subscribes to `notifications:${userId}` to reflect real-time incoming alerts without requiring a page refresh.

## RLS
Row-Level Security (RLS) is strict. Clients cannot `INSERT` into the `notifications` table directly. The `SELECT`, `UPDATE` (for reading), and `DELETE` policies restrict operations exclusively to `auth.uid() = user_id`.

## Database Schema
```sql
CREATE TABLE public.notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('new_message')),
    reference_id uuid,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notifications_pkey PRIMARY KEY (id)
);
```
Indexes were created on `user_id, read_at` to efficiently compute unread counts and sort notifications.

## UI
The previously headless application layout was enhanced with a `TopNav` integrating:
1. Branding/Home link.
2. The debounced `SearchBar`.
3. The interactive `NotificationsBadge`.
4. A quick link back to the authenticated user's own profile settings.

## Security
- Search limits profile exposure explicitly via the SELECT column definitions and preserves database-enforced RLS.
- Database triggers manage notification generation using `SECURITY DEFINER` to bypass external tampering.
- Read operations for notifications are strictly bound to `auth.uid()`.

## Testing

**Verified**:
- TypeScript compilation and Next.js static build checks (`npm run build`).
- UI component integration (SearchBar, NotificationsBadge, TopNav).
- Safe parameterized `.ilike` querying via Supabase client.
- Debounce execution logic in React effects.

**Unverified**:
- Due to the nature of local environment limits without active Google Drive / Supabase runtime provisions, runtime tests (such as direct PostgreSQL trigger verification, realtime WebSocket payload integrity, and actual RLS enforcement in staging) are designated as UNVERIFIED. 
(No local Docker containers or Supabase instances are actively running).

## Known Limitations
- Message content is not intentionally bundled into the notification reference payload to preserve privacy. Navigating via `reference_id` fetches the actual conversation adhering to its established RLS policy.
- Mark all read requires individual updates under the hood by Supabase JS if not executing an array update, but bulk updates are achievable through `eq` filters.

## Final Status
READY
