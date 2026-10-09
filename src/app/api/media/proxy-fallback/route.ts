import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getDriveClient } from '@/lib/drive';

// IMPORTANT: This route violates the Vercel 4.5MB request limit for large media (200MB videos).
// It exists purely as an UNVERIFIED local fallback because the Cloudflare Worker media-proxy 
// could not be fully deployed and tested in this environment.
// Production must route large media proxying through the actual external Media Proxy Service.

const MEDIA_SECRET = process.env.MEDIA_SECRET_KEY;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  if (!MEDIA_SECRET) {
    return NextResponse.json({ error: 'Server configuration missing' }, { status: 500 });
  }

  try {
    const secret = new TextEncoder().encode(MEDIA_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const driveFileId = payload.drive_file_id as string;

    if (!driveFileId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const drive = getDriveClient();
    const driveRes = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // Forward headers (Drive handles Range requests)
    const headers = new Headers();
    if (driveRes.headers['content-type']) headers.set('Content-Type', driveRes.headers['content-type']);
    if (driveRes.headers['content-length']) headers.set('Content-Length', driveRes.headers['content-length']);
    if (driveRes.headers['content-range']) headers.set('Content-Range', driveRes.headers['content-range']);
    if (driveRes.headers['accept-ranges']) headers.set('Accept-Ranges', driveRes.headers['accept-ranges']);

    // @ts-ignore
    return new NextResponse(driveRes.data, {
      status: driveRes.status,
      statusText: driveRes.statusText,
      headers
    });
  } catch (error) {
    console.error('Proxy fallback error:', error);
    return NextResponse.json({ error: 'Unauthorized or Drive Error' }, { status: 403 });
  }
}
