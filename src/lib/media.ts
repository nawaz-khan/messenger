import imageCompression from 'browser-image-compression';

const MAX_IMAGE_SIZE = 100 * 1024 * 1024;
const MAX_GIF_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

export type MediaType = 'IMAGE' | 'GIF' | 'VIDEO';

export interface UploadMetadata {
  file: File;
  mediaType: MediaType;
  previewFile?: File; // for image/video thumbnail
}

export function validateMediaFile(file: File): MediaType {
  if (file.type === 'image/gif') {
    if (file.size > MAX_GIF_SIZE) throw new Error('GIF exceeds maximum size of 50MB');
    return 'GIF';
  } else if (file.type.startsWith('image/')) {
    if (file.size > MAX_IMAGE_SIZE) throw new Error('Image exceeds maximum size of 100MB');
    return 'IMAGE';
  } else if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_SIZE) throw new Error('Video exceeds maximum size of 200MB');
    return 'VIDEO';
  }
  throw new Error('Unsupported media type');
}

export async function processMediaFile(file: File): Promise<UploadMetadata> {
  const mediaType = validateMediaFile(file);
  let previewFile: File | undefined;

  if (mediaType === 'IMAGE') {
    // Generate compressed preview
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 800,
        useWebWorker: true,
      };
      const compressedBlob = await imageCompression(file, options);
      previewFile = new File([compressedBlob], `preview_${file.name}`, {
        type: compressedBlob.type,
      });
    } catch (e) {
      console.error('Image compression failed', e);
    }
  } else if (mediaType === 'VIDEO') {
    // Basic client-side video thumbnail generation
    previewFile = await generateVideoThumbnail(file);
  }
  
  // For GIFs, we don't generate a static thumbnail in V1 (preserving animation).

  return { file, mediaType, previewFile };
}

// Generate a thumbnail by extracting the first frame of a video using a canvas
async function generateVideoThumbnail(file: File): Promise<File | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.src = url;
    video.currentTime = 1; // Seek to 1 second to avoid black frames
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(new File([blob], `thumb_${file.name}.jpg`, { type: 'image/jpeg' }));
          } else {
            resolve(undefined);
          }
        }, 'image/jpeg', 0.8);
      } else {
        URL.revokeObjectURL(url);
        resolve(undefined);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
  });
}

export async function uploadToDrive(
  file: File,
  conversationId: string,
  mediaType: MediaType,
  onProgress?: (progress: number) => void
): Promise<string> {
  const sessionStart = performance.now();
  // 1. Request Resumable Upload Session
  const initResponse = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
      conversationId,
      mediaType,
    }),
  });

  if (!initResponse.ok) {
    const { error } = await initResponse.json();
    throw new Error(error || 'Failed to initialize upload');
  }

  const { uploadUrl, perf } = await initResponse.json();
  const sessionEnd = performance.now();
  console.log(`[PERF] Session creation - Client total duration: ${(sessionEnd - sessionStart).toFixed(2)} ms`);
  if (perf) {
    console.log(`[PERF] Session creation - Server setup: ${perf.clientSetupMs?.toFixed(2) || 0} ms`);
    console.log(`[PERF] Session creation - Server OAuth token refresh: ${perf.tokenRefreshMs?.toFixed(2) || 0} ms`);
    console.log(`[PERF] Session creation - Server Drive API POST: ${perf.driveApiMs?.toFixed(2) || 0} ms`);
    console.log(`[PERF] Session creation - Server drive logic total: ${perf.totalDriveSessionMs?.toFixed(2) || 0} ms`);
    console.log(`[PERF] Session creation - Server getUser(): ${perf.apiRouteGetUserMs?.toFixed(2) || 0} ms`);
    console.log(`[PERF] Session creation - Server req.json(): ${perf.apiRouteJsonMs?.toFixed(2) || 0} ms`);
    console.log(`[PERF] Session creation - Server is_conversation_member: ${perf.apiRouteRpcMs?.toFixed(2) || 0} ms`);
    console.log(`[PERF] Session creation - Server API route internal total: ${perf.apiRouteInternalTotalMs?.toFixed(2) || 0} ms`);
  }

  // 2. Upload file directly to Google Drive Session via XHR (to track progress)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    
    // Drive API requires matching Content-Length/Type if declared
    // The browser automatically sets Content-Length for the given body
    
    let uploadPhaseStart = performance.now();
    let fullySentTime = 0;
    let headersReceivedTime = 0;
    let loadingTime = 0;
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        if (onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        if (e.loaded === e.total && fullySentTime === 0) {
          fullySentTime = performance.now();
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 2 && headersReceivedTime === 0) {
        headersReceivedTime = performance.now();
      } else if (xhr.readyState === 3 && loadingTime === 0) {
        loadingTime = performance.now();
      }
    };

    xhr.onload = () => {
      const onloadTime = performance.now();
      const parseStart = performance.now();
      
      const actualUploadDuration = fullySentTime > 0 ? (fullySentTime - uploadPhaseStart) : (onloadTime - uploadPhaseStart);
      const timeToHeaders = fullySentTime > 0 && headersReceivedTime > 0 ? (headersReceivedTime - fullySentTime) : 0;
      const timeDownloadingResponse = headersReceivedTime > 0 ? (onloadTime - headersReceivedTime) : 0;

      const speed = (file.size / 1024 / 1024) / (actualUploadDuration / 1000);
      
      console.log(`[PERF] File size: ${file.size} bytes`);
      console.log(`[PERF] Upload (sending) duration: ${actualUploadDuration.toFixed(2)} ms`);
      console.log(`[PERF] Average upload speed: ${speed.toFixed(2)} MB/s`);
      console.log(`[PERF] Waiting for Google Drive HTTP headers (TTFB): ${timeToHeaders.toFixed(2)} ms`);
      console.log(`[PERF] Downloading Google Drive response body: ${timeDownloadingResponse.toFixed(2)} ms`);

      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        const parseEnd = performance.now();
        console.log(`[PERF] Parsing Drive response: ${(parseEnd - parseStart).toFixed(2)} ms`);
        resolve(response.id);
      } else {
        console.error(`[DIAGNOSTIC] XHR onload error response headers: ${xhr.getAllResponseHeaders()}`);
        reject(new Error(`Drive upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = (e) => {
      console.error(`[DIAGNOSTIC] XHR onerror triggered! Status: ${xhr.status}, readyState: ${xhr.readyState}`);
      reject(new Error('Drive upload failed (Network Error)'));
    };
    xhr.onabort = () => console.error(`[DIAGNOSTIC] XHR onabort triggered`);
    xhr.ontimeout = () => console.error(`[DIAGNOSTIC] XHR ontimeout triggered`);
    
    xhr.send(file);
  });
}

export async function fetchMediaToken(driveFileId: string): Promise<string> {
  const res = await fetch('/api/media/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driveFileId }),
  });
  if (!res.ok) {
    throw new Error('Failed to authorize media access');
  }
  const { token } = await res.json();
  return token;
}

export function getMediaProxyUrl(token: string): string {
  const proxyUrl = process.env.NEXT_PUBLIC_MEDIA_PROXY_URL;
  if (!proxyUrl) {
    // Fallback for unverified local environments lacking proxy
    return `/api/media/proxy-fallback?token=${encodeURIComponent(token)}`;
  }
  return `${proxyUrl}/?token=${encodeURIComponent(token)}`;
}
