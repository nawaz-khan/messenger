import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatView from './ChatView'

export default async function ConversationPage({
  params
}: {
  params: { id: string }
}) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    redirect('/login')
  }

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, type')
    .eq('id', params.id)
    .single()

  if (!conversation) {
    redirect('/app/messages')
  }

  const { data: members } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', params.id)
    
  let otherProfile = null
  let group = null
  let groupMembers = null
  let currentUserRole = null
  let isBlocked = false

  if (conversation.type === 'direct' && members) {
    const otherMember = members.find(m => m.user_id !== authData.user.id)
    if (otherMember) {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', otherMember.user_id)
        .single()
      otherProfile = data
      
      const { data: blockData } = await supabase
        .from('blocked_users')
        .select('id')
        .or(`and(blocker_id.eq.${authData.user.id},blocked_id.eq.${otherProfile?.id}),and(blocker_id.eq.${otherProfile?.id},blocked_id.eq.${authData.user.id})`)
        .maybeSingle()
      if (blockData) {
        isBlocked = true
      }
    }
  } else if (conversation.type === 'group') {
    const { data } = await supabase
      .from('groups')
      .select('*')
      .eq('conversation_id', params.id)
      .single()
    group = data
    
    const { data: memberData } = await supabase
      .from('conversation_members')
      .select('user_id, role, joined_at, profiles(id, username, display_name, avatar_url)')
      .eq('conversation_id', params.id)
    
    groupMembers = memberData
    const myMember = memberData?.find(m => m.user_id === authData.user.id)
    currentUserRole = myMember?.role || null
  }

  const { data: messages } = await supabase
    .from('messages')
    .select('*, message_media(*), sender:profiles!messages_sender_id_fkey(id, display_name, username, avatar_url)')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const initialMessages = (messages || []).reverse()

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      <ChatView 
        conversationId={params.id} 
        conversationType={conversation.type}
        initialMessages={initialMessages} 
        currentUserId={authData.user.id} 
        otherProfile={otherProfile}
        group={group}
        groupMembers={groupMembers || []}
        currentUserRole={currentUserRole}
        initialIsBlocked={isBlocked}
      />
    </div>
  )
}

