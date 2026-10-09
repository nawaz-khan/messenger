# Audit Reconciliation

**Scope:** Re-verify every finding from the previous security audit against the *current*
repository state. This document is a **read-only audit** — no application code was changed.

**Repository state at time of reconciliation:**
- Branch audited: `main` (single commit `53b206a Initial Campus Messenger project`), working tree clean.
- `node_modules` present but **incomplete** (386 packages, no `.bin/` symlinks, TypeScript lib
  files missing). Build / lint / `tsc` could **not** be executed reliably. No test was run and no
  test is claimed to have passed.

**Method:** direct source inspection of the files named in each finding, plus the relevant
Supabase migrations and setup documentation. No credentials were read, printed, or exposed.
The absence of `.env.local` in this sandbox is treated as an environment artifact and is **not**
evidence that production secrets are missing.

---

## Verdict summary

| ID | Severity | Previous finding (short) | Current verdict |
|----|----------|--------------------------|-----------------|
| P0-1 | Critical | Drive uses "wrong" credential model (OAuth vs service account) | **STALE** (design is intentional; see sub-issue P0-1b) |
| P0-1b | Low | `.env.example` documents service-account vars code never reads | **CONFIRMED** (documentation inconsistency) |
| P0-2 | Medium | OAuth callback renders refresh token into browser HTML | **CONFIRMED** (developer-only route) |
| P1-1 | High | Media upload non-functional at runtime | **INCONCLUSIVE** (env-dependent; contradicts reported working state) |
| P1-2 | High | Proxy fallback exceeds Vercel 4.5 MB limit | **CONFIRMED** (architectural; needs deployed proxy) |
| P1-3 | — | `node_modules` missing → cannot build | **CONFIRMED** (environment) |
| P2-1 | Medium | Image viewer shows original instead of compressed preview | **CONFIRMED** |
| P2-2 | Low | Video thumbnail click opens a new tab instead of in-page player | **CONFIRMED** |
| P2-3 | Medium | Read receipts only marked for `direct`, never groups | **CONFIRMED (behavior)** / intent ambiguous |
| P2-4 | Low | `updateGroupDetails` has no server-side auth check | **CONFIRMED** (defense-in-depth only; RLS enforces authz) |
| P2-5 | Low | `mark_conversation_read` invoked via two paths | **CONFIRMED** (minor) |
| P2-6 | — | No build/lint verification performed | **CONFIRMED** (environment) |
| P2-7 | Low | OAuth `authorize`/`status` routes reachable in production | **CONFIRMED** |
| P2-8 | Low | `<img>` instead of `next/image` | **PARTIALLY FIXED / STALE** |
| P3-1 | Low | `[PERF]` debug logging in production paths | **CONFIRMED** |
| P3-2 | Low | `[READ DEBUG]` logging in `ChatView` | **CONFIRMED** |
| P3-3 | Low | `temp_app/` committed | **CONFIRMED** |
| P3-4 | Low | `scratch/` committed | **CONFIRMED** |
| P3-5 | Low | No HTTP security headers configured | **CONFIRMED** (new finding this pass) |

---

## Detailed findings

### P0-1 — Google Drive credential model — **STALE**

- **Files:** `src/lib/drive.ts`, `docs/GOOGLE_DRIVE_SETUP.md`, `.env.example`.
- **Previous finding:** The app was said to use the "wrong" credential model — user OAuth
  (`GOOGLE_OAUTH_CLIENT_ID` / `_CLIENT_SECRET` / `_REFRESH_TOKEN`) instead of a service account
  (`GOOGLE_DRIVE_CLIENT_EMAIL` / `GOOGLE_DRIVE_PRIVATE_KEY`).
- **Evidence (current):**
  - `src/lib/drive.ts` reads `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
    `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID`.
  - `docs/GOOGLE_DRIVE_SETUP.md` is titled *"Google Drive Integration Setup Guide (OAuth 2.0)"*
    and documents the OAuth flow as the **intended** production design (steps 4–8), explicitly
    listing the `GOOGLE_OAUTH_*` variables as the required names (§7) and describing the
    service-account variables as *"Legacy … Retained only temporarily for migration"* (§11).
- **Verdict:** **STALE.** The OAuth 2.0 model is the documented, deliberate architecture; code and
  primary setup documentation agree. It is not a vulnerability and must **not** be switched without
  a product decision. The earlier "service account private key is malformed" concern is moot for the
  running app: `GOOGLE_DRIVE_PRIVATE_KEY` is not read by any active code path (`grep` shows it only
  in `.env.example` and the standalone `media-proxy/worker.ts`).
- **Runtime verification required:** none for the design question; the credential *validity* is
  covered under P1-1.
- **Recommended fix:** none. Do **not** change the auth model.

### P0-1b — `.env.example` inconsistent with runtime code — **CONFIRMED (Low)**

- **Files:** `.env.example`, `src/lib/drive.ts`.
- **Evidence:** `.env.example` advertises only service-account variables, while the app requires the
  `GOOGLE_OAUTH_*` variables. A developer following `.env.example` would configure a non-functional
  setup.
- **Verdict:** **CONFIRMED** documentation defect (not a security issue).
- **Runtime verification required:** none.
- **Recommended fix (docs only):** align `.env.example` with the `GOOGLE_OAUTH_*` variables the code
  actually consumes (plus `GOOGLE_DRIVE_FOLDER_ID`, `MEDIA_SECRET_KEY`, `NEXT_PUBLIC_MEDIA_PROXY_URL`).

### P0-2 — Refresh token rendered in OAuth callback HTML — **CONFIRMED (Medium)**

- **File:** `src/app/api/media/google/callback/route.ts`.
- **Previous finding:** the route echoes `tokens.refresh_token` into an HTML `<pre>` block.
- **Evidence (current):** the route still builds an HTML response containing
  `GOOGLE_OAUTH_REFRESH_TOKEN="<token>"` and returns it with `Content-Type: text/html`.
- **Verdict:** **CONFIRMED.** The route is a developer bootstrap tool (documented in
  `GOOGLE_DRIVE_SETUP.md` §8), but a long-lived refresh token is rendered into a browser page, where
  it can persist in history, screenshots, or shared tabs.
- **Runtime verification required:** confirm whether the route is deployed in production and whether
  the Google OAuth client redirect URI is restricted to the production domain.
- **Recommended fix (do not delete the route):** guard the route so it only runs in non-production
  (`process.env.NODE_ENV !== 'production'`) and stop rendering the token in HTML — surface it via a
  server-side log / one-time display instead. Preserve the OAuth flow itself.

### P1-1 — Media upload "non-functional" — **INCONCLUSIVE**

- **Files:** `src/lib/drive.ts`, `src/lib/media.ts`, `src/app/api/media/upload/route.ts`.
- **Previous finding:** uploads fail because env vars are absent / mismatched.
- **Evidence (current):** the upload path is internally coherent for the OAuth model: server creates
  a resumable session (`createResumableUploadSession`), the browser PUTs directly to Drive
  (`uploadToDrive`), then `sendMediaMessage` persists `message_media`. The only "evidence" of failure
  was the absent `.env.local`, which is a sandbox artifact and explicitly not proof of a production
  problem.
- **Verdict:** **INCONCLUSIVE.** Cannot be confirmed or refuted without live credentials and a running
  environment. The reported "uploads were working after fixes" is consistent with the code.
- **Runtime verification required:** with real credentials, perform an image and a video upload
  end-to-end (session creation → Drive PUT → metadata insert → render).
- **Recommended fix:** none until reproduced.


### P1-2 — Media proxy fallback exceeds Vercel limits — **CONFIRMED (High, architectural)**

- **Files:** `src/lib/media.ts` (`getMediaProxyUrl`), `src/app/api/media/proxy-fallback/route.ts`,
  `media-proxy/worker.ts`.
- **Previous finding:** with no `NEXT_PUBLIC_MEDIA_PROXY_URL`, media streams through the Next.js
  fallback route, which cannot carry 50–200 MB payloads on Vercel.
- **Evidence (current):** `getMediaProxyUrl` still falls back to
  `/api/media/proxy-fallback?token=…` when `NEXT_PUBLIC_MEDIA_PROXY_URL` is unset; the fallback route
  still carries the header comment warning it violates the Vercel size limit. The Cloudflare Worker
  implementation exists but is not wired to any configured URL.
- **Verdict:** **CONFIRMED** as a deployment constraint. This is only a *bug* when the proxy is unset;
  the code path is intentional and self-documented.
- **Runtime verification required:** confirm the production value of `NEXT_PUBLIC_MEDIA_PROXY_URL` and
  that the Worker is deployed and reachable.
- **Recommended fix (only if genuinely unset in production):** deploy `media-proxy/worker.ts` and set
  `NEXT_PUBLIC_MEDIA_PROXY_URL`. Do not modify the fallback beyond its existing warning.

### P1-3 / P2-6 — Build tooling unavailable — **CONFIRMED (environment)**

- **Evidence (current):** `node_modules` exists (386 entries) but `node_modules/.bin` is absent,
  `.package-lock.json` is absent, and `tsc` fails with missing `lib.esnext.d.ts` / global types —
  i.e. the install is incomplete. `next`/`eslint`/`tsc` binaries are not runnable.
- **Verdict:** **CONFIRMED** environment limitation.
- **Runtime verification required:** complete `npm install`, then run `next lint` and `next build`.
- **Recommended fix:** none in code; fix the environment.

### P2-1 — Image renders original, not preview — **CONFIRMED (Medium)**

- **File:** `src/components/media/MediaRenderer.tsx` (line 26, lines 59–68).
- **Evidence (current):** `const targetFileId = mediaType === 'VIDEO' ? (previewDriveFileId || driveFileId) : driveFileId;`
  → for `IMAGE`, the **original** `driveFileId` is requested, and the click handler opens the same
  `proxyUrl`. Spec (DECISIONS #29, `docs/MEDIA.md` §5) requires the compressed **preview** in chat and
  the original only on click.
- **Verdict:** **CONFIRMED** — logic is inverted for images.
- **Runtime verification required:** upload a large image and confirm the preview (not the original)
  is fetched for the inline view.
- **Recommended fix:** request `previewDriveFileId || driveFileId` for the inline image; on click,
  fetch a token for the original `driveFileId` and open that.

### P2-2 — Video thumbnail opens a new tab — **CONFIRMED (Low)**

- **File:** `src/components/media/MediaRenderer.tsx` (line 84).
- **Evidence (current):** the thumbnail's `onClick` calls `window.open(videoUrl, '_blank')` with a
  comment marking it a "V1 quick implementation."
- **Verdict:** **CONFIRMED** — diverges from `docs/MEDIA.md` §7 (in-page HTML5 player).
- **Runtime verification required:** click a video thumbnail and observe behavior.
- **Recommended fix:** swap the thumbnail for an in-page `<video controls>` element via component
  state instead of opening a new tab.

### P2-3 — Read receipts only for direct conversations — **CONFIRMED (behavior); intent ambiguous**

- **Files:** `src/app/app/messages/[id]/ChatView.tsx` (lines 81, 95, 316),
  `supabase/migrations/20261006080000_fix_read_receipts_rls.sql`.
- **Evidence (current):** the client guards `mark_conversation_read` and receipt fetching behind
  `conversationType === 'direct'`. The RPC `mark_conversation_read(conv_id)` itself is
  conversation-agnostic and validates membership, so the **database already supports group reads**.
- **Verdict:** **CONFIRMED** as current behavior. Whether it is a *bug* depends on product intent:
  showing read receipts only in DMs is a common, legitimate design. Given the reported
  "group functionality previously tested," this may be intentional.
- **Runtime verification required:** confirm the desired product behavior for group read receipts.
- **Recommended fix (only if group receipts are desired):** extend the guard to include groups and
  verify the receipt UI is meaningful for multi-member groups.

### P2-4 — `updateGroupDetails` lacks a server-side auth check — **CONFIRMED (Low)**

- **Files:** `src/app/app/groups/actions.ts` (`updateGroupDetails`),
  `supabase/migrations/20261006000000_create_groups_and_invitations.sql` (lines 65–74).
- **Evidence (current):** the action performs a raw `.update()` without an explicit
  `auth.getUser()`/role check. However, the RLS policy **"Owner and mods can update group details"**
  restricts UPDATE to `conversation_members.role IN ('owner','moderator')`. Authorization is therefore
  enforced by the database.
- **Verdict:** **CONFIRMED** as a missing *defense-in-depth* layer only — **not** an authorization
  bypass. Per `docs/DECISIONS.md` #47, the DB is authoritative.
- **Runtime verification required:** attempt to update a group as a non-mod as a sanity check.
- **Recommended fix (optional):** add a `supabase.auth.getUser()` guard consistent with sibling
  actions for clearer error handling.


### P2-5 — `mark_conversation_read` called via two paths — **CONFIRMED (Low)**

- **File:** `src/app/app/messages/[id]/ChatView.tsx` (line 83 via RPC, line 317 via server action).
- **Evidence (current):** both call sites exist and are gated to `direct`.
- **Verdict:** **CONFIRMED** (redundant but harmless).
- **Recommended fix (optional):** consolidate to the client RPC path for latency; remove the extra
  server-action call in the realtime/send handler.

### P2-7 — OAuth helper routes reachable in production — **CONFIRMED (Low)**

- **Files:** `src/app/api/media/google/authorize/route.ts`, `.../status/route.ts`,
  `.../callback/route.ts`.
- **Evidence (current):** `authorize` (redirects to Google consent), `status` (returns the connected
  Drive account email + storage quota), and `callback` are plain `GET` routes with no environment gate.
- **Verdict:** **CONFIRMED.** `status` discloses the connected account email/quota without auth.
- **Runtime verification required:** confirm which of these are deployed publicly.
- **Recommended fix (preserve OAuth):** gate the helper routes to non-production and/or require an
  authenticated session. Do **not** remove the OAuth flow.

### P2-8 — `<img>` vs `next/image` — **PARTIALLY FIXED / STALE**

- **Evidence (current):** `profile/[username]/page.tsx`, `groups/CreateGroupDialog.tsx`, and
  `components/search/SearchBar.tsx` now import and use `next/image`; `next.config.mjs` configures
  `images.remotePatterns`. Only `components/media/MediaRenderer.tsx` still uses `<img>` (lines 59, 90).
- **Verdict:** the original three-file finding is **FIXED/STALE**. The remaining `MediaRenderer`
  `<img>` usage is arguably **justified**: the media URLs are short-lived signed-proxy URLs, not
  static assets, and `next/image` optimization cannot apply to them.
- **Recommended fix:** none required; the two `eslint-disable` comments can remain.

### P3-1 / P3-2 — Debug logging in production paths — **CONFIRMED (Low)**

- **Files:** `src/lib/drive.ts`, `src/lib/media.ts`, `src/app/api/media/upload/route.ts`,
  `src/app/app/messages/actions.ts`, `src/app/app/messages/[id]/ChatView.tsx`.
- **Evidence (current):** numerous `console.log('[PERF] …')` and `console.log('[READ DEBUG …]')` calls
  remain in client and server code. No secret values are logged, but timing/flow details leak to the
  browser console.
- **Verdict:** **CONFIRMED.**
- **Recommended fix:** remove, or gate behind `process.env.NODE_ENV === 'development'`.

### P3-3 / P3-4 — `temp_app/` and `scratch/` committed — **CONFIRMED (Low)**

- **Evidence (current):** both directories exist in the tree (`temp_app/src/app/*`, `scratch/*.ts`).
- **Verdict:** **CONFIRMED** (dead/debug code).
- **Recommended fix:** remove, or add to `.gitignore`.

### P3-5 — No HTTP security headers — **CONFIRMED (Low, new)**

- **Files:** `next.config.mjs`, `src/middleware.ts`, `src/lib/supabase/middleware.ts`.
- **Evidence (current):** no `headers()` block in `next.config.mjs` and no header injection in
  middleware. There is no `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`,
  `X-Content-Type-Options`, `Referrer-Policy`, or `Strict-Transport-Security`.
- **Verdict:** **CONFIRMED.** Not a data-loss risk by itself, but a hardening gap (clickjacking,
  MIME sniffing, referrer leakage).
- **Runtime verification required:** inspect response headers from the deployed app.
- **Recommended fix:** add a conservative `headers()` set in `next.config.mjs`
  (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`,
  `Strict-Transport-Security`) and, if feasible without breaking Drive/realtime, a CSP.

---

## Highest-priority confirmed issue

**P0-2 — refresh-token exposure in `src/app/api/media/google/callback/route.ts`.**

It is the only confirmed finding that exposes a long-lived **secret** to the browser. It is a
developer/setup route, so real-world exposure depends on production deployment, but the fix is small,
reversible, and does not touch the OAuth model: gate the route to non-production and stop rendering
the token in HTML. (P1-2 is the more impactful *functional* risk, but it is a known, self-documented
deployment constraint rather than a code defect, and resolving it requires deploying infrastructure
rather than a code change.)

---

## What is explicitly *not* a problem (to prevent churn)

- The **OAuth 2.0 Drive model** is intentional and documented — **do not switch** to service accounts.
- **Realtime presence** already uses private channels with `realtime.messages` RLS
  (`20261008000000_realtime_presence_authorization.sql`) — no action.
- **`updateGroupDetails`** is protected by RLS — no vulnerability.
- **`next/image`** adoption is already complete for the components that need it.

## Required runtime verification (blocked in this sandbox)

1. Complete `npm install` → run `next lint` and `next build`.
2. With real credentials: end-to-end image + video upload and authorized/unauthorized media access.
3. Confirm production values of `NEXT_PUBLIC_MEDIA_PROXY_URL` and that the Worker is deployed.
4. Confirm which OAuth helper routes are deployed publicly.
5. Confirm intended product behavior for group read receipts.

No secrets were read, printed, or committed during this reconciliation.

