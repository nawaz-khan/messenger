# AUTH.md

## 1. Authentication methods

V1 supports:

- Email + password.
- Google OAuth.

No college email requirement.

## 2. Session model

Use Supabase Auth and the recommended Next.js SSR integration.

- Server-side code must be able to read the authenticated session safely.
- Client-side auth state must update without full-page refresh when practical.
- Never store raw passwords in application tables.

## 3. Onboarding

After first successful signup/login, ensure a profile exists.

Profile onboarding fields:

- Display name.
- Unique username.
- Course.
- Semester.
- Batch.
- Optional bio/avatar.

## 4. Username rules

Canonical username rules:

- 3-20 characters.
- Lowercase letters, numbers, underscore.
- No spaces.
- Globally unique.
- Stored in normalized form.

Example:

```text
@nawaz
@nawaz_k
@rahul2005
```

The UI may display `@username`, but the database should store the username without the `@` prefix.

## 5. Username changes

Recommended policy:

- Allow username change.
- Prevent frequent identity churn with a cooldown such as 30 days.
- Record the last change timestamp.

This policy can be adjusted later; it should be configuration-driven.

## 6. Account deletion

Provide a clear account-deletion flow.

Recommended V1 behavior:

- Disable/remove the auth account.
- Anonymize old messages where necessary rather than unexpectedly deleting shared conversation history.
- Remove or orphan personal profile data according to the final privacy/retention policy.
- Clean up owned media and groups according to a defined policy.

## 7. Authorization

Authentication answers: "Who is this user?"

Authorization answers: "What is this user allowed to do?"

Never assume that an authenticated user can:

- Read every conversation.
- Edit another user's message.
- Access another user's private media.
- Manage another group's members.

These rules must be enforced by RLS/server-side checks.
