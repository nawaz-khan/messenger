# Phase 8 - Groups Architecture Audit

## A. Current Architecture
The current database architecture separates conversations and messages:
- `conversations` tracks distinct chat instances (`id`, `type`, `created_at`, `direct_participant_hash`).
- `conversation_members` links `profiles` to `conversations` with roles (`owner`, `moderator`, `member`).
- `messages` belongs to a `conversation_id`.
- The UI (`ChatView.tsx`, `ConversationList.tsx`, `data.ts`) currently assumes all conversations are Direct Messages (DMs). Specifically, the queries in `data.ts` attempt to locate an `otherProfile` by excluding the current user's ID from `conversation_members`.

## B. Proposed Group Architecture
Groups map cleanly onto the existing `conversations` concept. 
- A new `groups` table will be introduced with a 1:1 relationship to `conversations` where `type = 'group'`.
- The `conversation_members` table will continue to handle all membership, role-based authorization, and basic read-access enforcement.
- New tables for `group_invitations` and `group_join_requests` will handle the asynchronous membership flows for `invite_only` and `private` groups.

## C. Database Schema
```sql
CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    avatar_url text,
    privacy text NOT NULL CHECK (privacy IN ('public', 'private', 'invite_only')),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.group_invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invitee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, invitee_id, status)
);

CREATE TABLE public.group_join_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(group_id, user_id, status)
);
```

## D. RLS Design
To avoid circular references and RLS recursion, complex membership modifications (joining, accepting invites, role changes) should be executed via `SECURITY DEFINER` Postgres RPC functions rather than raw table inserts.

- **`groups`**:
  - `SELECT`: Allow authenticated users to view `public` and `private` groups (metadata only). `invite_only` metadata could be hidden or visible depending on the exact discovery requirements, but normally it requires an invite to be seen.
  - `UPDATE`: Owner and Moderator can update details.
- **`conversation_members`**:
  - `SELECT`: Keep the existing policy ("Users can view members of their conversations").
  - `INSERT/UPDATE/DELETE`: Prevent direct user access. Provide RPCs like `join_public_group(group_id)` and `update_member_role(user_id, role)` which internally verify roles and enforce business logic cleanly.
- **`messages`**:
  - `SELECT / INSERT`: Existing policies already check `conversation_members`. No changes needed!
  - `UPDATE / DELETE`: Existing policies ensure users can only modify their own messages.

## E. Realtime Design
Since `messages` are already broadcasted via Supabase Realtime using RLS, group messages will instantly work. When a user is added to `conversation_members`, they naturally pass the Realtime RLS check for any new message with that `conversation_id`.

## F. Notification Design
Trigger notifications in the `notifications` table for:
1. Being invited to an `invite_only` group.
2. Having your `join_request` approved.
3. Someone requesting to join a `private` group you manage.
4. (Optional) Group messages, governed by user notification preferences.

## G. UI Design
- **Navigation/List**: Update `ConversationList` to show group avatars and names instead of single user profiles if `type === 'group'`.
- **Discovery**: A "Discover Groups" or "Search Groups" page to find `public` and `private` groups.
- **Creation**: A modal allowing users to create a group, specify its privacy, and invite initial users.
- **ChatView Header**: Needs to handle group metadata (name, member count) instead of hardcoding `otherProfile`.
- **Group Settings Panel**: Accessible by owners/moderators to manage roles, accept join requests, and remove members.

## H. Migration Plan
Next migration filename: `20261006000000_create_groups_and_invitations.sql`.
Do NOT create this yet.

## I. Security/Edge-case Analysis
- **Owner Leaving**: Enforce via RPC that an owner cannot leave if they are the only member, unless they delete the group. If other members exist, require transferring ownership before leaving.
- **Removed Members**: Immediately deleted from `conversation_members`, thereby instantly losing RLS `SELECT` access to `messages`. 
- **Role Escalation**: Standard SQL RLS makes it very difficult to prevent a member from updating their own row in `conversation_members` to `owner` without recursion. This is solved by using `SECURITY DEFINER` RPCs and entirely blocking direct `UPDATE` on the `conversation_members` table for end users.
- **Concurrent Joins**: Covered by the `UNIQUE` constraints in `conversation_members`, `group_invitations`, and `group_join_requests`.
- **Private Group Messages**: Only members are in `conversation_members`, meaning the existing `messages` RLS strictly prohibits non-members from reading messages, regardless of group visibility.

## J. Implementation Order
1. Execute Database Migrations (tables, RPCs, RLS).
2. Update Types & Database schema mappings.
3. Implement Server Actions (`createGroup`, `joinGroup`, `inviteUser`, `acceptInvite`).
4. Update `getConversations` in `data.ts` to properly format group conversations.
5. Build UI for Group Search, Group Creation, and Group Settings.
6. Modify `ChatView` to render group-specific features.

## K. Risks and Mitigations
- **UI Hardcoding**: The current UI assumes all chats have exactly one other member. 
  - *Mitigation*: Extensive refactoring in `ConversationList` and `ChatView` is required to gracefully handle the union of `DM` vs `Group` metadata.
- **RLS Recursion**: Complex group privacy rules often cause infinite recursion in Postgres. 
  - *Mitigation*: Stick to `SECURITY DEFINER` RPCs for writes/joins, and keep `SELECT` policies linear and strictly dependent on `conversation_members`.

---

READY TO IMPLEMENT
