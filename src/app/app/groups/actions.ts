'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createGroup(name: string, description: string | null, privacy: 'public' | 'private' | 'invite_only', memberIds: string[] = []) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    throw new Error('Not authenticated')
  }

  const { data, error } = await supabase.rpc('create_group_conversation', {
    group_name: name,
    group_desc: description,
    group_privacy: privacy,
    group_avatar: null
  })

  if (error) {
    throw new Error(error.message)
  }

  const conversationId = data;

  const { data: group } = await supabase
    .from('groups')
    .select('id')
    .eq('conversation_id', conversationId)
    .single();

  if (memberIds && memberIds.length > 0 && group) {
    for (const userId of memberIds) {
      if (userId === authData.user.id) continue;
      await supabase.rpc('invite_user_to_group', {
        target_group_id: group.id,
        target_user_id: userId
      })
    }
  }

  revalidatePath('/app/groups')
  revalidatePath('/app/messages')
  return conversationId // returns the conversation id
}

export async function updateGroupDetails(groupId: string, name: string, description: string | null) {
  const supabase = createClient()
  const { error } = await supabase
    .from('groups')
    .update({ name, description })
    .eq('id', groupId)

  if (error) {
    throw new Error(error.message)
  }
  revalidatePath('/app/groups')
  revalidatePath(`/app/messages`)
}

export async function joinPublicGroup(groupId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('join_public_group', {
    target_group_id: groupId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
  revalidatePath('/app/messages')
}

export async function requestJoinGroup(groupId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('request_join_group', {
    target_group_id: groupId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
}

export async function approveJoinRequest(requestId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('approve_join_request', {
    target_request_id: requestId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
}

export async function rejectJoinRequest(requestId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('reject_join_request', {
    target_request_id: requestId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
}

export async function inviteUserToGroup(groupId: string, inviteeId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('invite_user_to_group', {
    target_group_id: groupId,
    target_user_id: inviteeId
  })
  if (error) throw new Error(error.message)
}

export async function acceptGroupInvite(inviteId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('accept_group_invite', {
    target_invite_id: inviteId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
  revalidatePath('/app/messages')
}

export async function rejectGroupInvite(inviteId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('decline_group_invite', {
    target_invite_id: inviteId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
}

export async function updateMemberRole(groupId: string, userId: string, newRole: 'owner' | 'moderator' | 'member') {
  const supabase = createClient()
  const { error } = await supabase.rpc('update_member_role', {
    target_group_id: groupId,
    target_user_id: userId,
    new_role: newRole
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
}

export async function removeMember(groupId: string, userId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('remove_member', {
    target_group_id: groupId,
    target_user_id: userId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
}

export async function leaveGroup(groupId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('leave_group', {
    target_group_id: groupId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
  revalidatePath('/app/messages')
}

export async function transferOwnership(groupId: string, newOwnerId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('transfer_ownership', {
    target_group_id: groupId,
    new_owner_id: newOwnerId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
}

export async function deleteGroup(groupId: string) {
  const supabase = createClient()
  const { error } = await supabase.rpc('delete_group', {
    target_group_id: groupId
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/groups')
  revalidatePath('/app/messages')
}
