'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function getOrCreateDirectConversation(otherUserId: string) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    throw new Error('Not authenticated')
  }

  const { data: convId, error } = await supabase.rpc('get_or_create_direct_conversation', {
    other_user_id: otherUserId
  })

  if (error) {
    if (error.message.includes('BLOCKED')) {
      throw new Error("You cannot message this user.")
    }
    throw new Error(error.message)
  }

  return convId
}

export async function sendMessage(conversationId: string, content: string, hasMedia: boolean = false) {
  const startAll = performance.now();
  
  const startAuth = performance.now();
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  const endAuth = performance.now();
  console.log(`[PERF] sendMessage - getUser(): ${(endAuth - startAuth).toFixed(2)} ms`);

  if (authError || !authData?.user) {
    throw new Error('Not authenticated')
  }

  const trimmed = content?.trim() || ''
  if (!trimmed && !hasMedia) {
    throw new Error('Message cannot be empty')
  }
  
  if (trimmed.length > 5000) {
    throw new Error('Message is too long')
  }

  const startInsertMsg = performance.now();
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: authData.user.id,
      content: trimmed || null,
      has_media: hasMedia
    })
    .select()
    .single()
  const endInsertMsg = performance.now();
  console.log(`[PERF] sendMessage - insert message: ${(endInsertMsg - startInsertMsg).toFixed(2)} ms`);

  if (error) {
    if (error.message.includes('BLOCKED')) {
      throw new Error("You cannot message this user.")
    }
    throw new Error(error.message)
  }

  const startUpdateConv = performance.now();
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
  const endUpdateConv = performance.now();
  console.log(`[PERF] sendMessage - update conversation: ${(endUpdateConv - startUpdateConv).toFixed(2)} ms`);

  const startReval = performance.now();
  revalidatePath('/app/messages')
  revalidatePath(`/app/messages/${conversationId}`)
  const endReval = performance.now();
  console.log(`[PERF] sendMessage - revalidatePath: ${(endReval - startReval).toFixed(2)} ms`);
  
  const endAll = performance.now();
  console.log(`[PERF] sendMessage - TOTAL: ${(endAll - startAll).toFixed(2)} ms`);

  return data
}

export async function createMessageMediaRecord({
  messageId,
  conversationId,
  driveFileId,
  previewDriveFileId,
  mediaType,
  mimeType,
  originalFilename,
  fileSize
}: {
  messageId: string
  conversationId: string
  driveFileId: string
  previewDriveFileId?: string
  mediaType: string
  mimeType: string
  originalFilename: string
  fileSize: number
}) {
  const startAll = performance.now();
  
  const startAuth = performance.now();
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  const endAuth = performance.now();
  console.log(`[PERF] createMediaRecord - getUser(): ${(endAuth - startAuth).toFixed(2)} ms`);

  if (authError || !authData?.user) {
    throw new Error('Not authenticated')
  }

  const startInsertMedia = performance.now();
  const { data, error } = await supabase
    .from('message_media')
    .insert({
      message_id: messageId,
      uploader_id: authData.user.id,
      conversation_id: conversationId,
      drive_file_id: driveFileId,
      preview_drive_file_id: previewDriveFileId || null,
      media_type: mediaType,
      mime_type: mimeType,
      original_filename: originalFilename,
      file_size: fileSize,
      status: 'UPLOADED'
    })
    .select()
    .single()
  const endInsertMedia = performance.now();
  console.log(`[PERF] createMediaRecord - insert message_media: ${(endInsertMedia - startInsertMedia).toFixed(2)} ms`);

  if (error) {
    throw new Error(error.message)
  }

  const startReval = performance.now();
  revalidatePath(`/app/messages/${conversationId}`)
  const endReval = performance.now();
  console.log(`[PERF] createMediaRecord - revalidatePath: ${(endReval - startReval).toFixed(2)} ms`);

  const endAll = performance.now();
  console.log(`[PERF] createMediaRecord - TOTAL: ${(endAll - startAll).toFixed(2)} ms`);
  
  return data
}

export async function sendMediaMessage(
  conversationId: string,
  content: string,
  mediaData: {
    driveFileId: string;
    previewDriveFileId?: string;
    mediaType: string;
    mimeType: string;
    originalFilename: string;
    fileSize: number;
  }
) {
  const startAll = performance.now();
  
  const startAuth = performance.now();
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const endAuth = performance.now();
  console.log(`[PERF] Combined action getUser: ${(endAuth - startAuth).toFixed(2)} ms`);

  if (authError || !authData?.user) {
    throw new Error('Not authenticated')
  }

  const trimmed = content?.trim() || ''
  if (trimmed.length > 5000) {
    throw new Error('Message is too long')
  }

  const startInsertMsg = performance.now();
  const { data: messageData, error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: authData.user.id,
      content: trimmed || null,
      has_media: true
    })
    .select()
    .single();
  const endInsertMsg = performance.now();
  console.log(`[PERF] Combined action messages INSERT: ${(endInsertMsg - startInsertMsg).toFixed(2)} ms`);

  if (messageError) {
    console.error("[sendMediaMessage] messageError:", messageError);
    if (messageError.message.includes('BLOCKED')) {
      return { success: false, error: "You cannot message this user." };
    }
    return { success: false, error: messageError.message };
  }

  const startUpdateConv = performance.now();
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  const endUpdateConv = performance.now();
  console.log(`[PERF] Combined action conversations UPDATE: ${(endUpdateConv - startUpdateConv).toFixed(2)} ms`);

  const startInsertMedia = performance.now();
  const { data: mediaRecord, error: mediaError } = await supabase
    .from('message_media')
    .insert({
      message_id: messageData.id,
      uploader_id: authData.user.id,
      conversation_id: conversationId,
      drive_file_id: mediaData.driveFileId,
      preview_drive_file_id: mediaData.previewDriveFileId || null,
      media_type: mediaData.mediaType,
      mime_type: mediaData.mimeType,
      original_filename: mediaData.originalFilename,
      file_size: mediaData.fileSize,
      status: 'UPLOADED'
    })
    .select()
    .single();
  const endInsertMedia = performance.now();
  console.log(`[PERF] Combined action media INSERT: ${(endInsertMedia - startInsertMedia).toFixed(2)} ms`);

  if (mediaError) {
    console.error("[sendMediaMessage] mediaError:", mediaError);
    // Cleanup the orphaned message if media fails
    await supabase.from('messages').delete().eq('id', messageData.id);
    return { success: false, error: mediaError.message };
  }

  const startReval = performance.now();
  revalidatePath('/app/messages');
  revalidatePath(`/app/messages/${conversationId}`);
  const endReval = performance.now();
  console.log(`[PERF] Combined action revalidatePath: ${(endReval - startReval).toFixed(2)} ms`);
  
  const endAll = performance.now();
  console.log(`[PERF] Combined message+media action total: ${(endAll - startAll).toFixed(2)} ms`);

  return { success: true, data: { ...messageData, message_media: [mediaRecord] } };
}

export async function editMessage(messageId: string, content: string) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    throw new Error('Not authenticated')
  }

  const trimmed = content.trim()
  if (!trimmed) {
    throw new Error('Message cannot be empty')
  }

  if (trimmed.length > 5000) {
    throw new Error('Message is too long')
  }

  const { error } = await supabase
    .from('messages')
    .update({ 
      content: trimmed,
      edited_at: new Date().toISOString()
    })
    .eq('id', messageId)
    .eq('sender_id', authData.user.id) // Ensure only sender can edit (also enforced by RLS)
    .is('deleted_at', null)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/app/messages')
}

export async function deleteMessage(messageId: string) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    throw new Error('Not authenticated')
  }

  const { error } = await supabase
    .from('messages')
    .update({ 
      deleted_at: new Date().toISOString(),
      deleted_by: authData.user.id,
      content: null // Optional: blank out content on delete for safety
    })
    .eq('id', messageId)
    .eq('sender_id', authData.user.id) // Only sender can delete for now

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/app/messages')
}

export async function markConversationRead(conversationId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('mark_conversation_read', { conv_id: conversationId })
  if (error) console.error('Failed to mark conversation read:', error)
}
