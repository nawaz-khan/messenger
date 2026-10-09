# Phase 11 QA Audit — Media & Google Drive Integration

## System Overview

1. **Where media upload is initiated:**  
   Media processing is initiated in the frontend (e.g., `ChatView.tsx`), calling `processMediaFile` to generate thumbnails and validate size, then `uploadToDrive` (both in `src/lib/media.ts`).
2. **How the browser uploads to Google Drive:**  
   The browser calls `POST /api/media/upload` to request a Resumable Upload URL from the server. Once the URL is returned, the browser uses an `XMLHttpRequest` (PUT) to upload the file **directly** to Google Drive's resumable upload endpoint, tracking upload progress along the way.
3. **How Google Drive credentials/authentication are handled:**  
   Credentials (`GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY`) are read securely server-side in `src/lib/drive.ts` using the official `googleapis` library. The credentials are never exposed to the browser.
4. **Where media metadata is stored in Supabase:**  
   In the `message_media` table, mapping `drive_file_id` (and optionally `preview_drive_file_id`) to a `conversation_id`.
5. **How media URLs are generated:**  
   The client fetches a signed JWT via `POST /api/media/auth`. The token is passed to `getMediaProxyUrl(token)` which points to `NEXT_PUBLIC_MEDIA_PROXY_URL` (Cloudflare worker) or falls back to the local `/api/media/proxy-fallback` route.
6. **How private media is accessed by authorized users:**  
   `/api/media/auth` enforces RLS (verifying the user is a member of the conversation mapped to the media). It returns a 5-minute signed JWT. The proxy reads this JWT, validates it against `MEDIA_SECRET_KEY`, and securely fetches/streams the file from Google Drive using the service account credentials.
7. **Whether the proxy/worker for private media is actually configured:**  
   **NOT CONFIGURED.** `NEXT_PUBLIC_MEDIA_PROXY_URL` is missing. The system uses the local fallback (`/api/media/proxy-fallback`), which the code correctly warns will violate Vercel's 4.5MB request limit for larger video streams.
8. **Whether Google Drive credentials are currently present and usable:**  
   **NOT CONFIGURED.** `.env.local` contains no Google Drive credentials (`GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY`, `GOOGLE_DRIVE_FOLDER_ID`) and no `MEDIA_SECRET_KEY`.
9. **Whether the current implementation is only code-complete or actually runtime-ready:**  
   **CODE-COMPLETE BUT NOT RUNTIME-READY.** The implementation is thoroughly written but cannot execute due to missing Google Drive service credentials and media proxy secrets.

---

## Security Check

- **Google Drive credentials exposed?** CODE VERIFIED. They are server-only.
- **Service credentials prefixed with NEXT_PUBLIC_?** CODE VERIFIED. They are not.
- **Secrets committed?** CODE VERIFIED. None are present in `.env.local` or source.
- **Private media exposed via public Drive URL?** CODE VERIFIED. The upload creates private files accessible only via the authenticated Media Proxy stream wrapper.

---

## Limits

- **Images:** 100 MB (`MAX_IMAGE_SIZE`)
- **GIFs:** 50 MB (`MAX_GIF_SIZE`)
- **Videos:** 200 MB (`MAX_VIDEO_SIZE`)

---

## Runtime Verification Tests

**STOPPING RUNTIME TESTS.**
As requested, the runtime tests are stopped because Google Drive credentials (`GOOGLE_DRIVE_CLIENT_EMAIL`, `GOOGLE_DRIVE_PRIVATE_KEY`, `GOOGLE_DRIVE_FOLDER_ID`, and `MEDIA_SECRET_KEY`) are not configured in the environment.

| Test ID | Scenario | Status |
|---|---|---|
| TEST 1 | Image upload and viewing | **BLOCKED** |
| TEST 2 | Group media access | **BLOCKED** |
| TEST 3 | Access control enforcement | **BLOCKED** |
| TEST 4 | Failure handling | **BLOCKED** |
| TEST 5 | Large file limits | **BLOCKED** |

---

## MEDIA STATUS

- Upload: **BLOCKED** (Missing Google Drive credentials)
- Supabase metadata: **BLOCKED** (Cannot test without successful upload)
- Private access: **BLOCKED** (Missing `MEDIA_SECRET_KEY` and Drive credentials)
- Receiver access: **BLOCKED**
- Group access: **BLOCKED**
- Access control: **BLOCKED**
- Failure handling: **BLOCKED**

---

## Next Steps / Priority List

**P0: Configure Google Drive Service Account**
- Create a Google Cloud Project with Google Drive API enabled.
- Create a Service Account, generate a JSON key, and set `GOOGLE_DRIVE_CLIENT_EMAIL` and `GOOGLE_DRIVE_PRIVATE_KEY`.
- Create a Drive Folder and share it with the Service Account (Writer), then set `GOOGLE_DRIVE_FOLDER_ID`.
- Set a secure, random `MEDIA_SECRET_KEY` in `.env.local`.

**P1: Deploy Media Proxy (Cloudflare Worker)**
- The fallback API route (`/api/media/proxy-fallback`) will hit 4.5MB Vercel serverless function limits. The standalone Cloudflare Worker must be deployed to stream larger files (50MB GIFs, 200MB videos).
- Set `NEXT_PUBLIC_MEDIA_PROXY_URL`.

**P2: Execute Runtime Verification**
- Re-run Tests 1-5 from this document once P0 and P1 are complete.
