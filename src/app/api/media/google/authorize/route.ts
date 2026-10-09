import { NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const oauth2Client = getOAuth2Client();
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request offline access to get a refresh token
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent', // Force consent prompt to guarantee a refresh token is returned
    });
    
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('Failed to generate auth url:', error);
    return new NextResponse('Configuration Error: ' + error.message, { status: 500 });
  }
}
