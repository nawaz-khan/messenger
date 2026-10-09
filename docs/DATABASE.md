# DATABASE.md

## 1. Database principles

- PostgreSQL is the source of truth for application data.
- Use UUIDs for primary keys unless there is a specific reason not to.
- Add foreign keys and appropriate indexes.
- Use database constraints for invariants that must always hold.
- Do not rely only on frontend validation.
- Use RLS on all user-facing tables.

## 2. Core tables

### profiles

```text
id                uuid PK, references auth.users(id)
username          text UNIQUE NOT NULL
username_normalized text UNIQUE NOT NULL
display_name      text NOT NULL
avatar_url        text NULL
course            text NULL
semester          text NULL
batch             text NULL
bio               text NULL
created_at        timestamptz NOT NULL
updated_at        timestamptz NOT NULL
```

Rules:

- `username_normalized` is the lookup/canonical uniqueness field.
- Recommended username range: 3-20 characters.
- Recommended allowed characters: lowercase letters, numbers, underscore.
- Username must not contain spaces.
- Reserve system/admin-looking usernames.

### conversations

```text
id                uuid PK
type              text CHECK (type IN ('direct','group'))
created_by        uuid references profiles(id)
created_at        timestamptz NOT NULL
updated_at        timestamptz NOT NULL
```

For group conversations, use a one-to-one relationship to `groups` or store a `group_id` here depending on the final normalized design.

For direct conversations, enforce that only two members exist, and that a duplicate conversation between the same two users cannot be created.

**Implementation note for DMs:**
To ensure uniqueness, use an atomic Postgres RPC (e.g., `get_or_create_direct_conversation(user_id_1, user_id_2)`) that locks and returns an existing DM or creates a new one safely. 

### groups

```text
id                uuid PK
conversation_id   uuid UNIQUE references conversations(id)
name              text NOT NULL
description       text NULL
icon_url           text NULL
privacy           text CHECK (privacy IN ('public','private','invite_only'))
created_by        uuid references profiles(id)
created_at        timestamptz NOT NULL
updated_at        timestamptz NOT NULL
```

### conversation_members

```text
conversation_id   uuid references conversations(id)
user_id           uuid references profiles(id)
role              text CHECK (role IN ('owner','moderator','member'))
joined_at         timestamptz NOT NULL
last_read_message_id uuid NULL
PRIMARY KEY (conversation_id, user_id)
```

### messages

```text
id                uuid PK
conversation_id   uuid references conversations(id)
sender_id         uuid references profiles(id)
content           text NULL
reply_to          uuid NULL references messages(id)
created_at        timestamptz NOT NULL
updated_at        timestamptz NULL
edited_at         timestamptz NULL
deleted_at        timestamptz NULL
deleted_by        uuid NULL references profiles(id)
```

Rules:

- A message should contain text, media, or both unless it is a special system event.
- Deletion should normally be soft-deletion for moderation/audit purposes.

### message_media

```text
id                uuid PK
message_id        uuid references messages(id)
media_type        text CHECK (media_type IN ('image','gif','video'))
drive_file_id     text NOT NULL
preview_drive_file_id text NULL
file_name         text NULL
mime_type         text NOT NULL
file_size         bigint NOT NULL
width             integer NULL
height            integer NULL
duration_ms       bigint NULL
created_at        timestamptz NOT NULL
```

- `drive_file_id` points to the original media.
- `preview_drive_file_id` points to the compressed image preview or video thumbnail.
- No actual media binary is stored in PostgreSQL.

### message_reactions

```text
id                uuid PK
message_id        uuid references messages(id)
user_id           uuid references profiles(id)
reaction          text NOT NULL
created_at        timestamptz NOT NULL
UNIQUE(message_id, user_id, reaction)
```

### notifications

```text
id                uuid PK
user_id           uuid references profiles(id)
type              text NOT NULL
reference_id      uuid NULL
read_at           timestamptz NULL
created_at        timestamptz NOT NULL
```

### reports

```text
id                uuid PK
reporter_id       uuid references profiles(id)
message_id        uuid NULL references messages(id)
reported_user_id  uuid NULL references profiles(id)
reason            text NOT NULL
status            text CHECK (status IN ('open','reviewing','resolved','dismissed'))
created_at        timestamptz NOT NULL
resolved_at       timestamptz NULL
resolved_by       uuid NULL references profiles(id)
```

### blocks

```text
blocker_id        uuid references profiles(id)
blocked_id        uuid references profiles(id)
created_at        timestamptz NOT NULL
PRIMARY KEY (blocker_id, blocked_id)
```

## 3. Important indexes

Create indexes for:

- `profiles(username_normalized)`
- `messages(conversation_id, created_at DESC)`
- `message_media(message_id)`
- `conversation_members(user_id)`
- `notifications(user_id, read_at)`
- `reports(status, created_at)`
- Any group search field used in V1.

## 4. Username search

Search by normalized username.

Recommended behavior:

- Exact username match is the primary result.
- Prefix/partial search can be supported for convenience.
- Do not expose email address in search results.

## 5. Pagination

Messages must be paginated/cursor-based. Do not load an entire conversation at once.

Initial target:

- Load latest 50-100 messages.
- Fetch older messages on scroll.

## 6. Deletion

Do not immediately hard-delete every message. Use soft deletion for normal message deletion so the UI can show a deleted placeholder and moderators can retain minimal audit context.

The exact data-retention policy must be documented before production launch.
