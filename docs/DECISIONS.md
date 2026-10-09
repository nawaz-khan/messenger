# DECISIONS.md

This file is the project's source of truth for decisions that should not be changed implicitly by an AI coding agent.

## Product

1. Project name is currently a placeholder: Campus Messenger.
2. The platform is an unofficial student community.
3. The platform is not the official communication system of the college.
4. Target initial usage is approximately 100 users/day.
5. The UI is inspired by Discord but intentionally simpler.
6. Do not implement Discord-style server/category/channel complexity.

## Authentication

7. Users may register with normal personal email accounts.
8. No college-email verification requirement.
9. Google OAuth is supported.
10. Email/password authentication is supported.
11. Every user gets a unique username.
12. Users can search for others by username.
13. Do not introduce a friend-request system in V1.

## Messaging

14. Direct messages are supported.
15. Groups are supported.
16. Groups have only owner, moderator, and member roles.
17. No artificial product-level message rate limit is required.
18. Realtime chat uses Supabase Realtime.
19. PostgreSQL remains the durable message store.
20. Typing indicators are ephemeral.
21. Presence is used for online/offline state.
22. Duplicate direct messages between the same two users are prevented by an atomic database constraint/RPC.

## Storage

23. Supabase stores application data and metadata.
24. Google Drive is the ONLY storage location for actual images, GIFs, and videos. Do NOT use Supabase Storage.
25. Images have a maximum upload size of 100 MB.
26. GIFs have a maximum upload size of 50 MB.
27. Videos have a maximum upload size of 200 MB.
28. Other arbitrary file uploads are blocked in V1.
29. For images: original is saved, and a client-side compressed preview is generated and saved. Both reside in Drive.
30. For videos: original is saved, and a thumbnail is generated and saved. Both reside in Drive.
31. For GIFs: original is saved, preserving animation.
32. Video transcoding is not part of V1.

## Security

33. Google Drive credentials remain server-side. Do NOT expose Google OAuth/service credentials to the browser.
34. Drive media is not made public merely to simplify rendering.
35. Supabase RLS is required for all protected application data.
36. Media access must be authorized through the application via signed JWTs.
37. User-supplied HTML is not trusted or rendered directly.

## Hosting

38. Initial web hosting target is Vercel.
39. Supabase is the backend platform.
40. GitHub is the source control platform.
41. Large private media is streamed to the browser via a dedicated Media Proxy component (e.g., Cloudflare Worker, Cloud Run) to bypass Vercel serverless request/response limits. Vercel serverless functions must not proxy 100-200MB files.

## Engineering

42. Prefer a modular monolith over microservices, except for the required Media Proxy.
43. Keep Drive operations behind a media/storage abstraction.
44. Do not add Redis, Kubernetes, Kafka, Elasticsearch, or another distributed system without a demonstrated need.
45. Do not add native mobile apps in V1.
46. Use feature-oriented code organization.
47. Database constraints and RLS are authoritative; frontend checks are UX only.

## Pending decisions

The following are intentionally not locked yet:

- Final product name and branding.
- Exact color palette.
- Whether usernames can change and exact cooldown duration.
- Exact image compression quality/dimensions.
- Exact thumbnail generation method for videos.
- Exact Google Drive credential model for production.
- Final privacy/retention period for deleted messages/media.
- Whether message search ships in V1 or V1.1.
