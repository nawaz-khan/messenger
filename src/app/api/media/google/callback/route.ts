import { NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      return new NextResponse(`Google OAuth Error: ${error}`, { status: 400 });
    }

    if (!code) {
      return new NextResponse('Missing authorization code', { status: 400 });
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      return new NextResponse(
        'Success, but no refresh token was provided. This usually happens if you already authorized the app previously. ' +
        'Please go to your Google Account permissions, revoke access for this app, and try again to obtain a new refresh token.', 
        { status: 400 }
      );
    }

    // Safest persistence for dev: tell developer to put it in .env.local
    const htmlResponse = `
      <html>
        <head><title>OAuth Connection Successful</title></head>
        <body style="font-family: sans-serif; padding: 2rem;">
          <h1 style="color: green;">Google Drive Connected Successfully!</h1>
          <p>Please copy the refresh token below and add it to your <strong>.env.local</strong> file:</p>
          <pre style="background: #eee; padding: 1rem; overflow-x: auto;">
GOOGLE_OAUTH_REFRESH_TOKEN="${tokens.refresh_token}"
          </pre>
          <p>After saving the file, restart your Next.js development server (<code>npm run dev</code>).</p>
          <p><em>(In production, this token should be stored in a secure secret manager or database rather than an environment file)</em></p>
          <a href="/">Return to App</a>
        </body>
      </html>
    `;

    return new NextResponse(htmlResponse, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error: any) {
    console.error('Google OAuth Callback Error:', error);
    return new NextResponse('Failed to exchange authorization code: ' + error.message, { status: 500 });
  }
}
