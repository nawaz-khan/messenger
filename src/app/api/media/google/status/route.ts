import { NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/drive';

export const dynamic = 'force-dynamic';

// Developer-only diagnostic route: disabled outside development so that the
// connected account's identity/quota is never exposed in production.
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

export async function GET(req: Request) {
  if (!IS_DEVELOPMENT) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const drive = getDriveClient();

    // Attempt a lightweight API call to verify the connection
    const res = await drive.about.get({
      fields: 'user,storageQuota',
    });

    return NextResponse.json({
      status: 'connected',
      user: res.data.user?.emailAddress,
      storageQuota: res.data.storageQuota,
    });
  } catch {
    // Never surface raw provider errors (which could include request details).
    console.error('Google Drive diagnostic failed: connection could not be established.');
    return NextResponse.json(
      { status: 'error', message: 'Failed to connect to Google Drive' },
      { status: 500 }
    );
  }
}
