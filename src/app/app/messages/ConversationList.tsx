'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePathname } from 'next/navigation'

export default function ConversationList({ 
  initialConversations,
  currentUserId
}: { 
  initialConversations: any[]
  currentUserId: string
}) {
  const [conversations, setConversations] = useState(initialConversations)
  const pathname = usePathname()
  const supabase = createClient()

  useEffect(() => {
    // Update local state when initialConversations changes from server navigation
    setConversations(initialConversations)
  }, [initialConversations])

  useEffect(() => {
    const channel = supabase.channel('conversations-list-realtime')

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new
          setConversations((prev) => {
            const idx = prev.findIndex(c => c.id === newMsg.conversation_id)
            if (idx === -1) {
              // New conversation not in list. We could fetch it, but usually the UI handles creation.
              // For a simple approach, we can ignore or we'd need to fetch the conversation details.
              return prev
            }
            
            const conv = prev[idx]
            const updatedConv = {
              ...conv,
              updated_at: newMsg.created_at,
              latestMessage: newMsg
            }
            
            // Move to top
            const newList = [...prev]
            newList.splice(idx, 1)
            newList.unshift(updatedConv)
            return newList
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const updatedMsg = payload.new
          setConversations((prev) => {
            return prev.map(conv => {
              if (conv.id === updatedMsg.conversation_id && conv.latestMessage?.id === updatedMsg.id) {
                return { ...conv, latestMessage: updatedMsg }
              }
              return conv
            })
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <div className="w-80 flex-shrink-0 border-r dark:border-slate-800 overflow-y-auto bg-slate-50 dark:bg-slate-900 flex flex-col">
      <div className="p-4 border-b dark:border-slate-800 font-semibold sticky top-0 bg-slate-50 dark:bg-slate-900 z-10">
        Messages
      </div>
      {conversations.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">No conversations yet.</div>
      ) : (
        <ul className="divide-y dark:divide-slate-800 overflow-y-auto flex-1">
          {conversations.map((conv) => {
            const isActive = pathname === `/app/messages/${conv.id}`
            return (
              <li key={conv.id}>
                <Link 
                  href={`/app/messages/${conv.id}`}
                  className={`block p-4 transition ${isActive ? 'bg-slate-200 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {conv.type === 'group' ? (
                      <>
                        <span className="text-blue-500">👥</span>
                        {conv.group?.name || 'Unnamed Group'}
                      </>
                    ) : (
                      conv.otherProfile?.display_name || 'Unknown User'
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                    {conv.latestMessage?.deleted_at ? (
                      <span className="italic">Message deleted</span>
                    ) : (
                      conv.latestMessage?.content || 'No messages yet'
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
