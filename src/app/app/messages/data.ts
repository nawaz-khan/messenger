import { createClient } from '@/lib/supabase/server'

export async function getConversations() {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    return []
  }

  // Fetch conversations where the user is a member, ordered by updated_at
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id,
      type,
      updated_at,
      conversation_members!inner(
        user_id,
        role,
        joined_at,
        profiles (
          id,
          username,
          display_name,
          avatar_url
        )
      ),
      messages(
        id,
        content,
        created_at,
        deleted_at,
        sender_id
      ),
      groups (
        id,
        name,
        description,
        avatar_url,
        privacy
      )
    `)
    .order('updated_at', { ascending: false })
    .order('created_at', { foreignTable: 'messages', ascending: false })
    .limit(1, { foreignTable: 'messages' })

  if (error || !data) return []

  const processed = data.map((conv) => {
    let otherProfile = null
    let group = null

    if (conv.type === 'direct') {
      const otherMember = conv.conversation_members.find((m: any) => m.user_id !== authData.user.id)
      const otherProfileData = otherMember?.profiles;
      otherProfile = Array.isArray(otherProfileData) ? otherProfileData[0] : (otherProfileData || null)
    } else if (conv.type === 'group') {
      const groupData = conv.groups;
      group = Array.isArray(groupData) ? groupData[0] : (groupData || null)
    }

    const latestMessageData = conv.messages && conv.messages.length > 0 ? conv.messages[0] : null

    return {
      id: conv.id,
      type: conv.type,
      updated_at: conv.updated_at,
      otherProfile,
      group,
      latestMessage: latestMessageData,
      memberCount: conv.type === 'group' ? conv.conversation_members.length : 2
    }
  })

  return processed
}
