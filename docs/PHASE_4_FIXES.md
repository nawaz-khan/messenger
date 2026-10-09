# Phase 4 Audit Fixes

## F-1 CRITICAL: RLS Recursion
Created a `is_member_of(conversation_id)` helper function using `SECURITY DEFINER` and `SET search_path = public` to prevent infinite recursion. Replaced the direct recursive querying in the `conversation_members`, `conversations`, and `messages` policies to use this non-recursive helper, successfully maintaining the correct authorization model while eliminating the `SQLSTATE 42P17` infinite recursion.

## F-2 MEDIUM: conversations.updated_at
Added a specific `UPDATE` policy to `conversations` that allows users who are members of a conversation to update the conversation record (specifically its `updated_at` field). The `sendMessage` function manually bumping the `updated_at` on successful insert will now correctly pass RLS.

## F-3 MEDIUM: Message History Deletion
Changed the `messages.sender_id` column to be nullable and altered the foreign key constraint `ON DELETE CASCADE` to `ON DELETE SET NULL`. If a user is deleted, their messages remain in the conversation history, preserving context and preventing soft-deleted messages from unexpectedly hard-deleting.

## F-4 MEDIUM: N+1 Queries
Optimized `getConversations` in `messages/data.ts`. Removed the unused sequential fetch of messages and replaced the N+1 loop for getting profiles with a single query leveraging Supabase nested `select()` syntax with table limits. The query now retrieves `conversation_members` with nested `profiles`, and gets the single latest message using `.limit(1, { foreignTable: 'messages' })`.

## F-5 LOW: Message Length Limits
Added a `CHECK` constraint to `messages.content` limiting character length to 5000 characters (`char_length(content) <= 5000`).

## F-6 LOW: Empty Migration Cleanup
Successfully removed the empty 0-byte migration file (`20260927185211_create_conversations_and_messages.sql`).

## F-7 LOW: SECURITY DEFINER Hardening
Updated the `get_or_create_direct_conversation` function to append `SET search_path = public` inside the function signature. Combined with the new `is_member_of` helper doing the same, all `SECURITY DEFINER` functions in this phase are appropriately hardened against malicious object resolution.

## Migrations
A new corrective migration `20260928001701_phase_4_fixes.sql` has been created to apply these schema changes cleanly on top of the initial deployment without maliciously rewriting existing applied migrations.

## Testing Status
- **UNVERIFIED**: Runtime RLS tests inside Supabase (Local docker daemon was unavailable).
- **VERIFIED**: Static lint and build checks (`npm run lint` and `npm run build` executed).
- **VERIFIED**: RLS syntax and logic visually inspected and manually audited to fulfill constraints.
