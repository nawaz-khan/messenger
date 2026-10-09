'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell } from 'lucide-react'
import Link from 'next/link'
import { acceptGroupInvite, rejectGroupInvite, approveJoinRequest, rejectJoinRequest } from '@/app/app/groups/actions'

export function NotificationsBadge({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<any[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const supabase = createClient()
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*, actor:profiles!notifications_actor_id_fkey(display_name, username), group:groups(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (!error && data) {
        setNotifications(data)
      }
    }
    fetchNotifications()
  }, [userId, supabase])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const channel = supabase.channel(`notifications:${userId}`)

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          const { data } = await supabase
            .from('notifications')
            .select('*, actor:profiles!notifications_actor_id_fkey(display_name, username), group:groups(name)')
            .eq('id', payload.new.id)
            .single()
          
          if (data) {
            setNotifications((prev) => [data, ...prev].slice(0, 20))
          } else {
            setNotifications((prev) => [payload.new, ...prev].slice(0, 20))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? payload.new : n))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    )
  }

  const markAllAsRead = async () => {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      
    setNotifications((prev) =>
      prev.map((n) => (!n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
    )
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
        <Bell className="w-5 h-5 text-slate-700 dark:text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-lg shadow-lg overflow-hidden z-50 flex flex-col max-h-[80vh]">
          <div className="p-3 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900 sticky top-0">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                No notifications
              </div>
            ) : (
              <ul className="divide-y dark:divide-slate-800">
                {notifications.map((notif) => (
                  <li 
                    key={notif.id} 
                    className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-800 flex flex-col gap-1 transition ${!notif.read_at ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                  >
                    <div className="text-sm text-slate-800 dark:text-slate-200">
                      {notif.type === 'new_message' && (
                        <span>{notif.actor?.display_name || notif.actor?.username || 'Someone'} sent {notif.group ? `a message in ${notif.group.name}` : 'you a message'}</span>
                      )}
                      {notif.type === 'group_invite' && (
                        <span>{notif.actor?.display_name || notif.actor?.username || 'Someone'} invited you to join {notif.group?.name || 'a group'}</span>
                      )}
                      {notif.type === 'join_request' && (
                        <span>@{notif.actor?.username || 'someone'} wants to join {notif.group?.name || 'your group'}</span>
                      )}
                      {notif.type === 'join_request_approved' && (
                        <span>Your request to join {notif.group?.name || 'the group'} was approved</span>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center mt-1">
                      {notif.type === 'new_message' && notif.reference_id && (
                        <Link 
                          href={`/app/messages/${notif.reference_id}`}
                          onClick={() => {
                            if (!notif.read_at) markAsRead(notif.id)
                            setShowDropdown(false)
                          }}
                          className="text-xs text-blue-600 hover:underline font-medium"
                        >
                          {notif.group ? 'View group' : 'View conversation'}
                        </Link>
                      )}
                      
                      {notif.type === 'group_invite' && notif.reference_id && (
                        <div className="flex gap-2">
                          <button 
                            className="text-xs font-medium px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                            onClick={async () => {
                              try {
                                await acceptGroupInvite(notif.reference_id)
                                if (!notif.read_at) markAsRead(notif.id)
                                alert('Invitation accepted')
                              } catch (e: any) { alert(e.message) }
                            }}
                          >Accept</button>
                          <button 
                            className="text-xs font-medium px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
                            onClick={async () => {
                              try {
                                await rejectGroupInvite(notif.reference_id)
                                if (!notif.read_at) markAsRead(notif.id)
                              } catch (e: any) { alert(e.message) }
                            }}
                          >Reject</button>
                        </div>
                      )}

                      {notif.type === 'join_request' && notif.reference_id && (
                        <div className="flex gap-2">
                          <button 
                            className="text-xs font-medium px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                            onClick={async () => {
                              try {
                                await approveJoinRequest(notif.reference_id)
                                if (!notif.read_at) markAsRead(notif.id)
                                alert('Request approved')
                              } catch (e: any) { alert(e.message) }
                            }}
                          >Accept</button>
                          <button 
                            className="text-xs font-medium px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
                            onClick={async () => {
                              try {
                                await rejectJoinRequest(notif.reference_id)
                                if (!notif.read_at) markAsRead(notif.id)
                              } catch (e: any) { alert(e.message) }
                            }}
                          >Reject</button>
                        </div>
                      )}

                      {!notif.read_at && (
                        <button 
                          onClick={() => markAsRead(notif.id)}
                          className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 ml-auto"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
