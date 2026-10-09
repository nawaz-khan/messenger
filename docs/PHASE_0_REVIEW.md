# Phase 0 Architecture Review

## 1. Understanding of the product

Campus Messenger is an unofficial, student-built web application designed for a small college community (approximately 100 users/day). It aims to provide a simple, Discord-inspired communication platform without the complexity of servers and channels. Core features include unique usernames, direct messaging, group chats, real-time messaging, and media sharing (images, GIFs, videos up to 200MB). 

## 2. Confirmed architecture

The intended architecture relies on a modular monolith approach using:
- **Frontend/Framework**: Next.js 16 (App Router) with TypeScript, Tailwind CSS, and shadcn/ui.
- **Backend/Auth/Database/Realtime**: Supabase (PostgreSQL, Auth with SSR, Realtime, RLS).
- **Media Storage**: Google Drive for storing images, GIFs, and videos.
- **Hosting**: Vercel for the Next.js web application.
- **Security**: Supabase Row Level Security (RLS) for data authorization. Google Drive credentials remain exclusively on the server. Large media is uploaded directly to Drive via resumable upload sessions to bypass Vercel request body limits.

## 3. Architecture validation

* **Frontend**
  * status: VALID
  * reasoning: Next.js + Tailwind + shadcn/ui is a robust, modern stack for a real-time web app.
  * implementation considerations: Use Server Components where possible, but chat UI will heavily rely on Client Components for real-time subscriptions and state.

* **Authentication**
  * status: VALID
  * reasoning: Supabase Auth with SSR properly secures both API routes and Server Components.
  * implementation considerations: Ensure the auth middleware is correctly configured to protect routes and handle token refreshes seamlessly.

* **Database**
  * status: NEEDS ATTENTION
  * reasoning: The core schema is sound, but it lacks a mechanism to prevent duplicate direct conversations between the same two users.
  * implementation considerations: A database constraint, unique index, or trigger is needed to guarantee only one `direct` conversation can exist for any unique pair of users. 

* **Realtime**
  * status: VALID
  * reasoning: Supabase Realtime using Broadcast and Presence perfectly matches the requirements for ephemeral typing indicators and online status without persisting noise to the database.
  * implementation considerations: Realtime subscriptions should be carefully managed to avoid memory leaks on the client.

* **Direct messages**
  * status: NEEDS ATTENTION
  * reasoning: Tied to the database issue above; the logic for initiating a DM must securely find an existing conversation or create a new one without race conditions.
  * implementation considerations: Use a Postgres function (RPC) to handle the "get or create DM" logic atomically to avoid race conditions.

* **Groups**
  * status: VALID
  * reasoning: The separation of `conversations` and `groups` tables is clean.
  * implementation considerations: RLS policies on `conversation_members` and `messages` must join with `groups` privacy settings to enforce access control.

* **Usernames/search**
  * status: VALID
  * reasoning: Using a normalized username column with a UNIQUE constraint is the correct approach.
  * implementation considerations: Normalization logic (lowercasing, trimming) should ideally be enforced via a Postgres trigger to guarantee consistency regardless of the client.

* **Media uploads**
  * status: NEEDS ATTENTION
  * reasoning: Direct-to-Drive resumable uploads bypass Vercel's request limits, which is correct. However, if the client uploads directly, image compression must happen entirely on the client *before* upload, as the server never receives the binary. 
  * implementation considerations: Use a client-side library to compress images before requesting the upload session URL.

* **Google Drive integration**
  * status: NEEDS ATTENTION
  * reasoning: Google Drive's resumable upload endpoints can be strict about CORS when called directly from a browser.
  * implementation considerations: Thoroughly test the Drive API's CORS behavior for resumable uploads from a web origin during Phase 1. 

* **Media delivery**
  * status: NEEDS ATTENTION
  * reasoning: The architecture strictly requires Drive credentials to remain server-side and prohibits making files public. Therefore, the Next.js server must proxy media requests. Vercel Serverless Functions have a 4.5MB response limit and execution time limits, which will fail for streaming 200MB private videos.
  * implementation considerations: This is the most significant architectural bottleneck. Serving large private media through Vercel is highly problematic.

* **Security/RLS**
  * status: VALID
  * reasoning: RLS is the correct paradigm for Supabase.
  * implementation considerations: RLS policies for conversations and messages can become complex and impact performance; ensure proper indexing on `conversation_members`.

* **Notifications**
  * status: VALID
  * reasoning: Simple table-based notifications are sufficient for V1.
  * implementation considerations: Clean up read notifications periodically to save space.

* **Moderation**
  * status: VALID
  * reasoning: Soft deletion and reporting tables are well-defined.
  * implementation considerations: Ensure UI gracefully handles soft-deleted messages.

* **Hosting/deployment**
  * status: NEEDS ATTENTION
  * reasoning: Vercel is great for the web app, but as noted in Media delivery, it is not well-suited as a proxy for large file streaming.

## 4. Problems or risks

* **CRITICAL**: **Private Media Delivery Limits**. Vercel Serverless Functions have strict payload (4.5MB) and timeout limits. Because Google Drive credentials must remain server-side and files cannot be public, Next.js must proxy the media. Proxying up to 200MB videos through Vercel will result in timeouts, memory crashes, or truncated responses. Google Drive does not offer temporary signed URLs (like AWS S3) that can be passed safely to a `<video>` tag without exposing tokens.
* **HIGH**: **Direct Upload CORS**. Initiating a Google Drive resumable upload from the server and having the browser complete the PUT request may face CORS restrictions from Google's API infrastructure if not perfectly configured.
* **MEDIUM**: **Duplicate Direct Conversations**. The database schema lacks a constraint to prevent multiple DM conversations between the exact same two users.
* **MEDIUM**: **Client-side Image Compression**. Because the server never processes the file binary (to avoid Vercel request limits), image compression/resizing *must* be implemented on the client before the upload session is requested.

## 5. Missing decisions

* How to securely serve large (200MB) private media files from Google Drive to the browser without hitting Vercel's proxying constraints.
* How to enforce the uniqueness of a direct conversation between two specific users at the database level.

## 6. Recommended changes

* **Media Storage**: Strongly reconsider the decision to avoid Supabase Storage (DECISIONS.md #24). Supabase Storage provides native S3-like signed URLs (e.g., valid for 60 seconds). This allows the frontend to fetch a temporary, secure URL from the server, and the browser streams the 200MB video directly from Supabase's CDN, completely bypassing Vercel and eliminating proxy limits.
* **Database Constraints**: Add a unique index on a sorted array of `user_id`s for direct conversations, or use a Postgres function to atomically "get or create" a direct conversation.
* **Media Compression**: Explicitly specify that image compression and thumbnail generation for images must occur on the client side before the upload begins.

## 7. Proposed implementation phases

1. **Foundation**: Setup Next.js, Supabase, Tailwind, shadcn/ui, and environment variables.
2. **Authentication and profiles**: Implement Auth, user onboarding, unique username constraints, and profile management.
3. **Conversation model**: Create database schema, RLS policies, and Postgres functions for Groups and DMs (including preventing duplicate DMs).
4. **Messaging**: Build text messaging, real-time subscriptions, read state, and typing indicators.
5. **Media**: Implement client-side compression, Google Drive upload integration, and media rendering (pending resolution of the delivery constraints).
6. **Search and notifications**: Build username/group search and the notification system.
7. **Moderation/admin**: Implement reporting, blocking, soft deletion, and basic admin controls.
8. **PWA and polish**: Add responsive refinements, empty states, and PWA manifest.
9. **Testing and deployment**: Final validation of limits, RLS, and deployment to Vercel/Supabase.

## 8. Questions requiring a decision

* Are we strictly locked into Google Drive for media, even if Supabase Storage natively solves the critical Vercel proxying/streaming limits via Signed URLs?
* Since the Next.js server cannot process large binaries, is it acceptable that all image compression and thumbnail generation will be performed by the client browser?

**Implementation-readiness assessment:**

READY WITH CHANGES
