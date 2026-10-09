# UI_UX.md

## 1. Design goal

The interface should feel familiar like Discord, but intentionally smaller and easier to understand.

Do not reproduce Discord's complete information architecture.

## 2. Primary layout

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ Campus Messenger                           Search  Bell User │
├───────────────┬──────────────────────────────┬───────────────┤
│ Direct        │                              │ Members       │
│ Messages      │        Active Chat           │               │
│               │                              │ Online        │
│ @username     │        messages...           │               │
│ @username     │                              │               │
│               │                              │               │
│ Groups        │                              │               │
│ # General     │                              │               │
│ # CSE         │                              │               │
│ # Events      │                              │               │
│               │──────────────────────────────│               │
│ + Create      │ Message...              ➤   │               │
└───────────────┴──────────────────────────────┴───────────────┘
```

Mobile should collapse the three-column desktop layout into a simple stack/navigation pattern.

## 3. Main navigation

Keep only:

- Messages.
- Groups.
- Search.
- Notifications.
- Profile/settings.

## 4. Direct messages

Search user -> open profile -> Message.

Do not require a friend request system in V1.

## 5. Groups

A group should expose:

- Name/icon.
- Member count.
- Description.
- Messages.
- Simple member list.
- Basic owner/moderator management.

No categories or nested channels.

## 6. Search

One global search bar.

Examples:

```text
@nawaz
CSE
Events
```

Prioritize users and groups first.

## 7. Profile

Show:

- Avatar.
- Display name.
- `@username`.
- Course.
- Semester.
- Batch.
- Bio.
- Message button.

Do not expose private email by default.

## 8. Message composer

Composer should support:

- Text entry.
- Emoji picker.
- Attach image.
- Attach GIF.
- Attach video.
- Reply indicator.
- Send.

Avoid a large number of buttons.

## 9. Media UX

When uploading:

- Show progress.
- Show filename/size.
- Allow cancellation where practical.
- Show clear error messages.

When displaying:

- Use thumbnails/previews.
- Open full media on click.
- Avoid loading every large video immediately.

## 10. Responsive behavior

The primary experience should work on desktop and mobile widths.

Design for phone use even though V1 is a web app.

## 11. Accessibility

Minimum expectations:

- Keyboard navigation.
- Accessible labels.
- Sufficient contrast.
- Focus states.
- Meaningful button names.
- Images have appropriate alternative text where user-provided context exists.

## 12. Visual style

Target:

- Clean.
- Modern.
- Neutral.
- Compact.
- Slightly Discord-inspired.

Avoid:

- Excessive gradients.
- Overly animated screens.
- Gamified UI.
- Too many panels.
- Visually noisy dashboards.
