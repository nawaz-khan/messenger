import { NextResponse } from 'next/server';
import { sendMediaMessage } from '@/app/app/messages/actions';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await sendMediaMessage(
      body.conversationId,
      body.content,
      body.mediaData
    );
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("TEST ROUTE ERROR:", error);
    return NextResponse.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
  }
}
