# Media Access Research

## 1. Problem Statement

The application must support the following for up to 100MB images, 50MB GIFs, and 200MB videos:
- **Private Storage**: Media must reside in Google Drive and remain private. It cannot be made "public to anyone with the link."
- **Secure Access**: The browser must NOT receive the Google Service Account or OAuth credentials.
- **Vercel Limits**: Vercel Serverless Functions have strict execution time limits and a 4.5MB payload limit for standard functions, making them unsuitable for proxying a 200MB video or streaming HTTP Range requests robustly.
- **Resumable Uploads**: Vercel's 4.5MB request limit also prevents uploading large files through Next.js. 

## 2. Investigated Google Drive Capabilities

### A. Private Image/Video Retrieval (Streaming)
- **Drive API Behavior**: The Drive API supports fetching file binaries using `alt=media` combined with an `Authorization: Bearer <TOKEN>` header. 
- **Limitation**: Google Drive does NOT support natively issuing "presigned URLs" (like AWS S3) that embed a signature and expire after a short time for *unauthenticated* clients. 
- **Conclusion**: The client cannot fetch the file directly from Google Drive without a Bearer token.

### B. Secure Authorization (Avoiding Token Exposure)
- **Limitation**: Drive API access tokens are scoped to the API (e.g., `https://www.googleapis.com/auth/drive.readonly`). You cannot mint a Google API token scoped to a *single* file ID for a service account.
- **Consequence**: Passing a Service Account's Bearer token to the browser grants the browser access to *all* files the Service Account owns. This violates the security requirement.
- **Conclusion**: The client MUST NEVER talk to the Drive API for downloading media directly. A proxy is fundamentally required to inject the credential and enforce per-file authorization.

### C. HTTP Range Requests for Video Playback
- **Drive API Behavior**: When using `alt=media`, the Google Drive API correctly honors standard `Range: bytes=X-Y` HTTP headers.
- **Conclusion**: If we proxy the request, the proxy can simply pass the browser's `Range` header to Google Drive and pipe the `206 Partial Content` response back. This enables fast HTML5 video playback without downloading the whole 200MB file.

### D. Resumable Uploads (Bypassing Vercel Upload Limits)
- **Drive API Behavior**: Google Drive supports a resumable upload flow (`uploadType=resumable`). 
- **Workflow**:
  1. Server sends a `POST` to Drive API with metadata.
  2. Drive API returns a unique, file-specific `Location` URI.
  3. The browser performs a `PUT` directly to this URI with the file binary.
- **CORS Support**: The Google Drive upload session URIs *do* support CORS, allowing browsers to `PUT` directly to them.
- **Conclusion**: Uploads DO NOT need to be proxied. Vercel payload limits are bypassed successfully.

## 3. Required Architectural Component: Media Proxy

Because Vercel cannot robustly proxy 200MB files, and Google Drive requires a proxy for authorization, we must introduce the **smallest architectural component** needed to solve this: a **Media Proxy Service**.

**Implementation**: A lightweight edge function or container (e.g., Cloudflare Worker, Google Cloud Run) dedicated solely to media delivery.

**Media Access Flow**:
1. The user opens the chat in Next.js.
2. Next.js validates that the user is allowed to see the conversation.
3. Next.js signs a short-lived JSON Web Token (JWT) containing the `drive_file_id` and an expiration time (e.g., 5 minutes) using a secret key.
4. The frontend renders `<video src="https://media-proxy.example.com/file?token=JWT">`.
5. The browser requests the file from the Media Proxy, including `Range` headers for playback.
6. The Media Proxy:
   - Validates the JWT signature and expiration.
   - Adds the Service Account `Authorization: Bearer <TOKEN>` header.
   - Forwards the `Range` headers to `https://www.googleapis.com/drive/v3/files/{file_id}?alt=media`.
   - Streams the Google Drive response directly back to the browser.

## 4. Summary of Capabilities

| Requirement | Mechanism | Works? |
| :--- | :--- | :--- |
| **Private image access** | Signed JWT -> Media Proxy -> Drive API | Yes |
| **Private video streaming** | Signed JWT -> Media Proxy -> Drive API | Yes |
| **HTTP Range requests** | Passed transparently through Media Proxy | Yes |
| **Browser CORS (Uploads)**| Drive API Resumable Session URI natively handles CORS | Yes |
| **Browser CORS (Downloads)**| Handled by Media Proxy CORS headers | Yes |
| **Avoid Vercel Limits** | Uploads go direct to Drive; Downloads use Media Proxy | Yes |
