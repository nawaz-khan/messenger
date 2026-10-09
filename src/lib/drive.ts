import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/media/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials are not configured. Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET.');
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

export function getDriveClient() {
  const oauth2Client = getOAuth2Client();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error('Google OAuth refresh token is missing. Application has not been connected to Google Drive.');
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function createResumableUploadSession(
  filename: string,
  mimeType: string,
  fileSize: number,
  origin?: string | null
) {
  const perfStart = performance.now();
  const oauth2Client = getOAuth2Client();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    throw new Error('Google Drive folder ID is not configured.');
  }

  if (!refreshToken) {
    throw new Error('Google OAuth refresh token is missing. Application has not been connected to Google Drive.');
  }

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const credsTime = performance.now();

  try {
    // Explicitly measure access token retrieval
    const tokenStart = performance.now();
    await oauth2Client.getAccessToken();
    const tokenEnd = performance.now();

    const headers: Record<string, string> = {
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': fileSize.toString(),
      'Content-Type': 'application/json',
    };

    if (origin) {
      headers['Origin'] = origin;
    }

    const requestStart = performance.now();
    const response = await oauth2Client.request({
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
      method: 'POST',
      headers,
      data: {
        name: filename,
        parents: [folderId],
      },
    });
    const requestEnd = performance.now();
    
    let uploadUrl = (response.headers as any)['location'];
    if (!uploadUrl && typeof (response.headers as any).get === 'function') {
      uploadUrl = (response.headers as any).get('location');
    }
    if (!uploadUrl && (response.headers as any)['Location']) {
      uploadUrl = (response.headers as any)['Location'];
    }

    if (!uploadUrl) {
      throw new Error('Failed to retrieve resumable upload URL from Google Drive');
    }

    const end = performance.now();
    const perf = {
      clientSetupMs: credsTime - perfStart,
      tokenRefreshMs: tokenEnd - tokenStart,
      driveApiMs: requestEnd - requestStart,
      totalDriveSessionMs: end - perfStart
    };

    console.log(`[PERF] Session Creation - Client setup: ${perf.clientSetupMs.toFixed(2)} ms`);
    console.log(`[PERF] Session Creation - OAuth token refresh: ${perf.tokenRefreshMs.toFixed(2)} ms`);
    console.log(`[PERF] Session Creation - Drive API POST: ${perf.driveApiMs.toFixed(2)} ms`);
    console.log(`[PERF] Session Creation - Total server function: ${perf.totalDriveSessionMs.toFixed(2)} ms`);

    return { uploadUrl, perf };
  } catch (err: any) {
    console.error('Google API error in createResumableUploadSession:', err.message);
    if (err.response) {
      console.error('Google API error details:', err.response.data);
    }
    throw err;
  }
}
