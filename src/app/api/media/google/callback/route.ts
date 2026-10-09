import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getOAuth2Client } from '@/lib/drive';

export const dynamic = 'force-dynamic';

// These routes exist only to bootstrap the developer's OAuth connection.
// They are intentionally disabled outside development so that credential
// bootstrapping can never happen on a production deployment.
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

function setupPage(title: string, bodyHtml: string, status = 200) {
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body style="font-family: sans-serif; padding: 2rem; max-width: 640px; line-height: 1.5;">
    <h1>${title}</h1>
    ${bodyHtml}
  </body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Never cache a page that is the result of an authorization exchange.
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Persist the refresh token to the local, git-ignored `.env.local` file, which
 * is the credential storage mechanism documented in docs/GOOGLE_DRIVE_SETUP.md.
 * The existing file contents are preserved; only the single
 * GOOGLE_OAUTH_REFRESH_TOKEN line is added or replaced.
 *
 * The token value is never returned to the caller or rendered anywhere.
 */
async function persistRefreshToken(refreshToken: string): Promise<void> {
  const envPath = path.join(process.cwd(), '.env.local');
  const line = `GOOGLE_OAUTH_REFRESH_TOKEN=${JSON.stringify(refreshToken)}`;

  let existing = '';
  try {
    existing = await fs.readFile(envPath, 'utf8');
  } catch {
    existing = '';
  }

  const pattern = /^GOOGLE_OAUTH_REFRESH_TOKEN=.*$/m;
  const updated = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing && !existing.endsWith('\n') ? `${existing}\n` : existing}${line}\n`;

  await fs.writeFile(envPath, updated, { mode: 0o600 });
}

export async function GET(req: Request) {
  if (!IS_DEVELOPMENT) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      // The provider error code is not a credential, but we deliberately do not
      // echo it into the page.
      return setupPage(
        'Google OAuth Error',
        '<p>Authorization was denied or failed. No credentials were stored.</p>',
        400
      );
    }

    if (!code) {
      return setupPage(
        'Missing authorization code',
        '<p>No authorization code was provided. Start again from <code>/api/media/google/authorize</code>.</p>',
        400
      );
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return setupPage(
        'Google OAuth Incomplete',
        '<p>Google did not return a refresh token. This usually happens if the app was already ' +
          'authorized. Revoke access for this app in your Google Account, then start again from ' +
          '<code>/api/media/google/authorize</code>.</p>',
        400
      );
    }

    try {
      await persistRefreshToken(tokens.refresh_token);
    } catch {
      return setupPage(
        'Google Drive Connected',
        '<p>The account was authorized, but the refresh token could not be saved automatically. ' +
          'Store it as <code>GOOGLE_OAUTH_REFRESH_TOKEN</code> using a secure method. ' +
          'The value was intentionally not displayed here.</p>',
        500
      );
    }

    return setupPage(
      'Google Drive Connected',
      '<p>The refresh token was saved to your local <code>.env.local</code>. ' +
        'Restart the development server (<code>npm run dev</code>) to apply it. ' +
        'The value was intentionally not displayed here.</p>'
    );
  } catch (error: any) {
    // Log only a generic message — never token values or the raw error object.
    console.error('Google OAuth callback failed:', error?.message ?? 'unknown error');
    return setupPage(
      'Google OAuth Failed',
      '<p>The authorization code could not be exchanged. Check the server logs for details.</p>',
      500
    );
  }
}
