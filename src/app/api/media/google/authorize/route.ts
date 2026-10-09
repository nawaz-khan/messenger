import { NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/drive';

export const dynamic = 'force-dynamic';

// Developer-only bootstrap route: disabled outside development.
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

export async function GET(req: Request) {
  if (!IS_DEVELOPMENT) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const oauth2Client = getOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request offline access to get a refresh token
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent', // Force consent prompt to guarantee a refresh token is returned
    });

    return NextResponse.redirect(authUrl);
  } catch {
    // Configuration errors never include credentials.
    console.error('Failed to generate Google auth URL: OAuth client is not configured.');
    return new NextResponse('Google OAuth is not configured.', { status: 500 });
  }
}
