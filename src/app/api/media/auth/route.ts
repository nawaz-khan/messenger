import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SignJWT } from 'jose';

const MEDIA_SECRET = process.env.MEDIA_SECRET_KEY;

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { driveFileId } = await req.json();

    if (!driveFileId) {
      return NextResponse.json({ error: 'Missing driveFileId' }, { status: 400 });
    }

    if (!MEDIA_SECRET) {
      console.error('MEDIA_SECRET_KEY is not configured');
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Check if the user is authorized to view this file via message_media RLS
    // The select policy requires the user to be a member of the conversation.
    const { data: mediaRecords, error: mediaError } = await supabase
      .from('message_media')
      .select('id, conversation_id')
      .or(`drive_file_id.eq.${driveFileId},preview_drive_file_id.eq.${driveFileId}`)
      .limit(1);

    if (mediaError || !mediaRecords || mediaRecords.length === 0) {
      return NextResponse.json({ error: 'Forbidden or File Not Found' }, { status: 403 });
    }

    // User is authorized, generate a short-lived signed JWT
    const secret = new TextEncoder().encode(MEDIA_SECRET);
    const token = await new SignJWT({ drive_file_id: driveFileId, sub: user.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m') // 5 minutes expiration
      .sign(secret);

    return NextResponse.json({ token });
  } catch (error) {
    console.error('Media auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
