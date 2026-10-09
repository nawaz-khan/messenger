'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function blockUser(targetUserId: string, pathToRevalidate?: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('block_user', { target_user_id: targetUserId })
  if (error) throw new Error(error.message)
  if (pathToRevalidate) revalidatePath(pathToRevalidate)
}

export async function unblockUser(targetUserId: string, pathToRevalidate?: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('unblock_user', { target_user_id: targetUserId })
  if (error) throw new Error(error.message)
  if (pathToRevalidate) revalidatePath(pathToRevalidate)
}

export async function reportUserAction(targetUserId: string, reason: string, description: string | null) {
  const supabase = createClient()
  const { error } = await supabase.rpc('report_user', {
    target_user_id: targetUserId,
    report_reason: reason,
    report_description: description
  })
  if (error) throw new Error(error.message)
}

export async function reportMessageAction(targetUserId: string, messageId: string, conversationId: string, reason: string, description: string | null) {
  const supabase = createClient()
  const { error } = await supabase.rpc('report_user', {
    target_user_id: targetUserId,
    report_reason: reason,
    report_description: description,
    target_message_id: messageId,
    target_conversation_id: conversationId
  })
  if (error) throw new Error(error.message)
}
