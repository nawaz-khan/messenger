'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { joinPublicGroup, requestJoinGroup, leaveGroup } from './actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function GroupCard({ 
  group, 
  isMember, 
  role 
}: { 
  group: any, 
  isMember: boolean,
  role?: string
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleJoin = async () => {
    setLoading(true)
    try {
      if (group.privacy === 'public') {
        await joinPublicGroup(group.id)
        router.push(`/app/messages/${group.conversation_id}`)
      } else if (group.privacy === 'private') {
        await requestJoinGroup(group.id)
        alert('Join request sent!')
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this group?')) return
    setLoading(true)
    try {
      await leaveGroup(group.id)
      router.refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border dark:border-slate-800 rounded-lg p-5 flex flex-col bg-white dark:bg-slate-950 shadow-sm">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg line-clamp-1">{group.name}</h3>
        <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded capitalize text-slate-500">
          {group.privacy}
        </span>
      </div>
      
      <p className="text-slate-500 dark:text-slate-400 text-sm line-clamp-2 mb-4 flex-1">
        {group.description || 'No description provided.'}
      </p>

      {isMember ? (
        <div className="flex gap-2 items-center w-full justify-between mt-auto">
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/messages/${group.conversation_id}`}>Open Chat</Link>
            </Button>
            {role === 'owner' && (
              <span className="text-xs text-blue-500 self-center font-medium">Owner</span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleLeave} disabled={loading}>
            Leave
          </Button>
        </div>
      ) : (
        <Button 
          className="w-full mt-auto" 
          onClick={handleJoin} 
          disabled={loading || group.privacy === 'invite_only'}
          variant={group.privacy === 'invite_only' ? 'secondary' : 'default'}
        >
          {loading ? 'Processing...' : group.privacy === 'private' ? 'Request to Join' : group.privacy === 'invite_only' ? 'Invite Only' : 'Join Group'}
        </Button>
      )}
    </div>
  )
}
