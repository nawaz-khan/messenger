# Phase 6 Implementation

## Media Architecture
Phase 6 implements a robust Media System where Google Drive is exclusively used for storing actual binaries (images, GIFs, videos), bypassing Supabase Storage altogether as per the requirements. Supabase PostgreSQL only stores the metadata, associations to conversations and users, and the Google Drive File IDs. 

## Google Drive Integration
The system interacts with Google Drive in two distinct ways:
1. **Uploads (Client-Direct)**: The application server authenticates with Google using a Service Account to create a "Resumable Upload Session". It passes the session URI back to the client, which uploads the large file directly via HTTP PUT to Google Drive.
2. **Downloads (Media Proxy)**: Clients never interact with the Drive API directly for retrieval to avoid exposing Service Account credentials or access tokens. A Media Proxy retrieves the file on the client's behalf.

## Upload Flow
1. User selects a file.
2. Client validates the size and MIME type locally.
3. Client generates a compressed image preview or a video thumbnail.
4. Client requests an authorized upload session from the Next.js API `/api/media/upload`.
5. Server verifies conversation membership via Supabase and requests an upload URI from Google Drive.
6. Client performs an `XMLHttpRequest` directly to the provided Google Drive session URI.
7. Upon successful Google Drive upload (which yields a Drive File ID), the client requests the Next.js server to insert the message text and associated media metadata into Supabase via server actions.

## Resumable Upload
Google Drive's `uploadType=resumable` is leveraged to entirely bypass Vercel's standard 4.5MB request body limits. Upload progress is seamlessly monitored via the native `XMLHttpRequest` upload event.

## Database Schema
The database schema introduces the `message_media` table, mapping `message_id` to `drive_file_id`. 
The `messages.has_media` column was added, and the `messages_content_check` was relaxed to allow `content` to be NULL when `has_media` is TRUE.

## Image Processing
`browser-image-compression` generates a lightweight preview of original images entirely in the browser before upload. The original image remains securely in Drive, while the preview is displayed in the chat interface.

## GIF Handling
GIFs up to 50MB are securely uploaded. We bypass the static thumbnail generator to preserve animation natively as mandated.

## Video Handling
Videos up to 200MB are supported. A thumbnail is generated from the first valid frame via an off-screen HTML5 Canvas. The original video relies on the HTML5 `<video>` tag for native HTTP streaming.

## Thumbnail Generation
All thumbnail generation and image compression operates on the client-side (`src/lib/media.ts`), keeping the Next.js backend stateless and unburdened from heavy CPU transcoding tasks.

## Private Media Delivery
Uploaded files in Google Drive remain fully private. The Google Service Account retains ownership and access control.

## Media Proxy
A Cloudflare Worker (`media-proxy/worker.ts`) acts as the designated secure streaming abstraction. It securely wraps the Google Drive API, appending Service Account tokens to proxied requests.
For local development, a Vercel-bound fallback proxy route (`/api/media/proxy-fallback`) was provided to permit immediate development testing, but this violates Vercel limits and must not be utilized for production video.

## Signed Authorization
To request a private media asset, the Next.js app validates the user's conversation membership and issues a short-lived JSON Web Token (JWT). The Media Proxy strictly expects this JWT before streaming the Drive file.

## HTTP Range
Because the Media Proxy acts transparently with Google Drive API (`alt=media`), it honors all incoming browser HTTP Range requests out-of-the-box, ensuring efficient video seeking.

## CORS
Both the Google Drive Resumable Upload URIs and the Media Proxy explicitly support necessary Cross-Origin Resource Sharing (CORS) headers to ensure seamless client integrations.

## Security
- Next.js ensures RLS compliance before issuing upload sessions.
- `message_media` SELECT policies verify conversation membership.
- Signed JWTs prevent unauthenticated scraping or media enumeration.
- Google Service Account keys remain purely server-side.

## Realtime Integration
Media is fully integrated with the Phase 5 Realtime system. When the database registers an `INSERT` on `messages` featuring `has_media = true`, the `ChatView` automatically fetches the corresponding `message_media` records to instantly render the media block for the other participant.

## Cleanup / Failure Handling
If the client-to-Drive upload succeeds but the Next.js database transaction fails, the file becomes an orphan in Google Drive. As specified by `MEDIA.md`, cleanup of these orphan files is intentionally deferred beyond V1.

## Environment Variables
The following environment variables were documented in `.env.example`:
- `MEDIA_SECRET_KEY`: Used for signing short-lived JWTs.
- `NEXT_PUBLIC_MEDIA_PROXY_URL`: The URL of the external Cloudflare Worker proxy.
- `GOOGLE_DRIVE_CLIENT_EMAIL`: The Google Service Account email.
- `GOOGLE_DRIVE_PRIVATE_KEY`: The Google Service Account private key.
- `GOOGLE_DRIVE_FOLDER_ID`: The designated target folder ID in Google Drive.

## Testing

**Verified**:
- TypeScript compilation and Next.js static build checks (`npm run build`).
- Correct relaxation of PostgreSQL constraints without cyclic dependency failures.
- RLS insertion pathways and payload architecture for Realtime payloads.

**Unverified**:
- Due to the nature of local environment limits without active Google Drive / Cloudflare Service Account provisions, runtime tests (such as direct 200MB network streaming integrity, proxy worker HTTP range pass-throughs, and exact Google Drive XHR upload quirks) are designated as UNVERIFIED.

## Final Status
READY
