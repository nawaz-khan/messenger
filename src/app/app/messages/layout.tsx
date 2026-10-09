import { getConversations } from './data'
import ConversationList from './ConversationList'
import { createClient } from '@/lib/supabase/server'

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const conversations = await getConversations()
  const supabase = createClient()
  const { data: authData } = await supabase.auth.getUser()

  return (
    <div className="flex flex-1 min-h-0 h-full border-t dark:border-slate-800">
      <ConversationList 
        initialConversations={conversations} 
        currentUserId={authData?.user?.id || ''} 
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-950 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
