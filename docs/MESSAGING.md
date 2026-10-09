# MESSAGING.md

## 1. Messaging model

One generic conversation system supports:

- Direct messages.
- Groups.

Every message belongs to one conversation.

## 2. Message features for V1

- Text.
- Replies.
- Reactions.
- Image attachments.
- GIF attachments.
- Video attachments.
- Edit own messages.
- Delete own messages.
- Moderator/admin deletion where authorized.
- Read state.
- Timestamps.
- Basic mention support.

## 3. No product-level message restriction

Do not impose an arbitrary "messages per minute" limit as a user-facing product rule.

However, the application may still use infrastructure safeguards against obvious abuse, automated attacks, or accidental request storms if required for reliability. Such safeguards should not change normal student chat behavior.

## 4. Sending flow

Text-only:

```text
Client
 -> authenticate session
 -> validate message
 -> insert message in PostgreSQL
 -> broadcast event
 -> update local UI
```

Media:

```text
Client
 -> authenticate
 -> validate type/size
 -> upload media to Drive
 -> receive Drive file ID
 -> create message_media record
 -> create message record
 -> broadcast event
```

The final implementation may create the message before media upload if needed for retry/state tracking, but it must prevent orphaned media and broken message references.

## 5. Realtime

Use Supabase Realtime:

- Broadcast for new message/reaction events and transient events.
- Presence for online/offline state.
- Broadcast for typing indicators.

Persist actual messages in PostgreSQL before treating them as durable.

## 6. Typing indicators

Typing indicators are ephemeral.

Do not store every keystroke in the database.

Use a debounced/transient Realtime event.

## 7. Read state

Track a user's last-read message per conversation, for example:

```text
conversation_members.last_read_message_id
```

Do not create one database row for every "seen" event unless a specific feature later requires it.

## 8. Message editing

- Only sender may edit a normal message.
- Store `edited_at`.
- Keep the edited indicator in UI.

## 9. Message deletion

Normal deletion is soft deletion.

UI should replace content with something like:

```text
Message deleted
```

Do not expose internal moderation/audit fields to ordinary users.

## 10. Replies

A reply points to another message through `reply_to`.

Do not duplicate the entire original message into every reply row.

## 11. Reactions

A user can add multiple reaction types to a message, but only one instance of each reaction type per user.
