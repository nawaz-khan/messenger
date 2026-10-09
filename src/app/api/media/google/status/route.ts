import { NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const drive = getDriveClient();
    
    // Attempt a lightweight API call to verify the connection
    const res = await drive.about.get({
      fields: 'user,storageQuota'
    });

    return NextResponse.json({
      status: 'connected',
      user: res.data.user?.emailAddress,
      storageQuota: res.data.storageQuota
    });
  } catch (error: any) {
    console.error('Drive API test failed:', error.message);
    return NextResponse.json({
      status: 'error',
      message: error.message || 'Failed to connect to Google Drive'
    }, { status: 500 });
  }
}
