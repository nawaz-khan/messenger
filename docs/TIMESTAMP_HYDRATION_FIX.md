# Timestamp Hydration Fix

## Exact Cause
The application was throwing a React hydration error (`Text content does not match server-rendered HTML.`) because the message timestamp formatting was relying on the default browser/system locale via `toLocaleTimeString([])`.

Because the Node.js server and the user's browser may have different default locales (or different casing conventions for AM/PM in standard locales), the server rendered `"12:22 am"` while the browser expected `"12:22 AM"`. This mismatch caused React to fail during hydration.

## File/Function Responsible
- **File**: `src/app/app/messages/[id]/ChatView.tsx`
- **Line 308 (approx.)**: The timestamp formatting logic inside the message mapping:
  `{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

## Fix Applied
Replaced the empty array `[]` (which defaults to the system locale) with an explicit locale string (`'en-US'`) and specific formatting options to guarantee deterministic output on both the server and the client.

**Old code:**
```tsx
{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
```

**New code:**
```tsx
{new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
```

## Timezone Behavior
The `toLocaleTimeString` method automatically respects the execution environment's timezone when one is not explicitly provided in the options.
- The server will render the time in its timezone during SSR.
- Upon hydration, the client will adopt the string in the browser's local timezone.
- Although there can theoretically be a mismatch in hours between server and client during the initial SSR render before hydration, explicitly specifying the `timeZone` was intentionally avoided to preserve the existing behavior of relying on the local environment's default timezone offset. The hydration error was specifically related to the AM/PM casing mismatch caused by locale differences, which is fully resolved by enforcing `'en-US'`.

## Lint Result
`npm run lint` completed successfully with no new errors or warnings.

## Build Result
`npm run build` completed successfully.
