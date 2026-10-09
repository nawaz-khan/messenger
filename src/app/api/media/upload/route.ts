import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createResumableUploadSession } from '@/lib/drive';

const MAX_IMAGE_SIZE = 100 * 1024 * 1024;
const MAX_GIF_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;

export async function POST(req: Request) {
  const startRoute = performance.now();
  console.log(`[PERF] /api/media/upload API Route started`);
  try {
    const supabase = createClient();
    
    const startAuth = performance.now();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    const endAuth = performance.now();
    console.log(`[PERF] /api/media/upload - supabase.auth.getUser(): ${(endAuth - startAuth).toFixed(2)} ms`);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startParse = performance.now();
    const { filename, mimeType, fileSize, conversationId, mediaType } = await req.json();
    const endParse = performance.now();
    console.log(`[PERF] /api/media/upload - req.json() parsing: ${(endParse - startParse).toFixed(2)} ms`);

    if (!filename || !mimeType || !fileSize || !conversationId || !mediaType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate size based on type
    if (mediaType === 'IMAGE' && fileSize > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Image exceeds maximum size of 100MB' }, { status: 400 });
    } else if (mediaType === 'GIF' && fileSize > MAX_GIF_SIZE) {
      return NextResponse.json({ error: 'GIF exceeds maximum size of 50MB' }, { status: 400 });
    } else if (mediaType === 'VIDEO' && fileSize > MAX_VIDEO_SIZE) {
      return NextResponse.json({ error: 'Video exceeds maximum size of 200MB' }, { status: 400 });
    }

    // Check conversation membership
    const startRpc = performance.now();
    const { data: isMember, error: memberError } = await supabase.rpc('is_conversation_member', {
      target_conversation_id: conversationId,
      target_user_id: user.id
    });
    const endRpc = performance.now();
    console.log(`[PERF] /api/media/upload - is_conversation_member RPC: ${(endRpc - startRpc).toFixed(2)} ms`);

    if (memberError || !isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create session
    const origin = req.headers.get('origin');
    
    const startDrive = performance.now();
    const { uploadUrl, perf } = await createResumableUploadSession(filename, mimeType, fileSize, origin);
    const endDrive = performance.now();
    console.log(`[PERF] /api/media/upload - createResumableUploadSession total: ${(endDrive - startDrive).toFixed(2)} ms`);

    const endRoute = performance.now();
    console.log(`[PERF] /api/media/upload - Total internal execution: ${(endRoute - startRoute).toFixed(2)} ms`);
    
    const extendedPerf = {
      ...perf,
      apiRouteGetUserMs: endAuth - startAuth,
      apiRouteJsonMs: endParse - startParse,
      apiRouteRpcMs: endRpc - startRpc,
      apiRouteInternalTotalMs: endRoute - startRoute
    };

    return NextResponse.json({ uploadUrl, perf: extendedPerf });
  } catch (error: any) {
    console.error('Upload session error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
