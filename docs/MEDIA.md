# MEDIA.md

## 1. Media policy

Google Drive is the ONLY storage location for uploaded media. Do NOT use Supabase Storage.

Supabase stores metadata and Drive file ID references.

Allowed:

- Images: up to 100 MB.
- GIFs: up to 50 MB.
- Videos: up to 200 MB.

Do not allow arbitrary file types in chat in V1.

## 2. Allowed types

Images:

- JPEG/JPG.
- PNG.
- WebP.
- HEIC/HEIF only if the browser/device support and the application can process or display them safely.

GIF:

- GIF.

Videos:

- MP4.
- WebM where practical.
- Other formats only if intentionally added later.

Do not rely on the file extension alone. Validate MIME type and, where practical, file signature/content.

## 3. Upload size validation

Validation must happen client-side before upload, and server-side before requesting the upload session.

```text
image <= 100 MB
gif   <= 50 MB
video <= 200 MB
```

Reject unsupported media before it becomes a permanent Drive object.

## 4. Large upload strategy (Client-Direct)

Use a resumable upload flow for large media to bypass Vercel limits.

The browser must not send a 100-200 MB file through a normal small request body endpoint.

Recommended flow:

```text
Browser
  -> validate file size/type locally
  -> perform client-side image compression or video thumbnail generation
  -> request authorized upload session URIs from Application server (e.g., one for original, one for preview)
Application server
  -> call Google Drive API to create resumable upload sessions
  -> return session URIs to Browser
Browser
  -> PUT media directly to Drive session URIs (handles CORS natively)
Drive
  -> returns file IDs
Browser
  -> submits final message with file IDs to Application server
Application
  -> verify file existence/ownership, store metadata in Supabase
```

## 5. Image compression & Behavior

Large images should be compressed/resized client-side before upload.

When a user uploads an image:
1. Validate the file type and size.
2. Preserve the original image in Google Drive.
3. Generate an optimized/compressed preview client-side.
4. Store the preview in Google Drive as well.
5. Store the relevant Google Drive file IDs and metadata in Supabase.
6. Display the optimized preview in the chat.
7. When the user clicks the image, open an image viewer and retrieve/display the original image.

## 6. GIF behavior

* Maximum 50 MB.
* Preserve GIF animation.
* Do not destroy animation through static-image compression.
* Store the original GIF in Google Drive.
* Display an appropriate preview in chat.

## 7. Video handling

When a user uploads a video:
1. Validate the file type and maximum 200 MB size.
2. Store the original video in Google Drive.
3. Generate a thumbnail (client-side where possible).
4. Store the thumbnail in Google Drive.
5. Store the relevant Drive file IDs and metadata in Supabase.
6. Display only the thumbnail in the chat.
7. Clicking the thumbnail should open an HTML5 video player.
8. The intended UX is streaming/playback (using HTTP Range requests) rather than automatically downloading the entire video.

V1 should not transcode videos server-side.

## 8. Google Drive privacy

Keep application media private.

Do not make all uploaded media public just to simplify rendering.

Drive credentials/tokens used by the application must remain server-side. Do NOT expose Google OAuth/service credentials to the browser.

## 9. Secure Media access

Before serving protected media, verify:

1. User is authenticated.
2. User is a member of the relevant conversation/group or is one of the DM participants.
3. The referenced message/media record exists.

Because files are private and Vercel cannot reliably proxy 200MB videos, access is handled via a **Media Proxy Service**:
- The Next.js app validates authorization and generates a short-lived Signed JWT containing the allowed Drive `file_id`.
- The Browser passes this JWT to the Media Proxy Service.
- The Media Proxy Service verifies the JWT, requests the private file from Google Drive using server credentials, and streams it back to the browser.

## 10. Orphan cleanup

The system should have a way to find media files that were uploaded to Drive but never attached to a valid message, such as after an interrupted upload or transaction failure.

A cleanup job can be added after V1.

## 11. Media abstraction

Implement a small storage interface on the backend such as:

```text
MediaStorage
  createUploadSession()
  verifyFile()
  generateSignedJwt()
  delete()
```

The initial implementation uses Google Drive exclusively, but the abstraction keeps the logic decoupled.
