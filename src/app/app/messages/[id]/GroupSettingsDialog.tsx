'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Settings, Shield, UserX, UserMinus } from 'lucide-react'
import { 
  updateMemberRole, 
  removeMember,
  leaveGroup,
  updateGroupDetails,
  deleteGroup
} from '@/app/app/groups/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'

export default function GroupSettingsDialog({
  group,
  members,
  currentUserRole,
  currentUserId
}: {
  group: any
  members: any[]
  currentUserRole: string
  currentUserId: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  
  const router = useRouter()

  const isOwner = currentUserRole === 'owner'
  const isModerator = currentUserRole === 'moderator' || isOwner

  const handleUpdateDetails = async () => {
    setLoading(true)
    try {
      await updateGroupDetails(group.id, name, description)
      alert('Group updated!')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: 'owner'|'moderator'|'member') => {
    setLoading(true)
    try {
      await updateMemberRole(group.id, userId, newRole)
      alert('Role updated')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member?')) return
    setLoading(true)
    try {
      await removeMember(group.id, userId)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLeave = async () => {
    if (!confirm('Leave this group?')) return
    setLoading(true)
    try {
      await leaveGroup(group.id)
      setOpen(false)
      router.push('/app/messages')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this group permanently?')) return
    setLoading(true)
    try {
      await deleteGroup(group.id)
      setOpen(false)
      router.push('/app/messages')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="ml-auto flex items-center gap-2">
          <Settings size={16} />
          <span className="hidden sm:inline">Group Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Group Settings</DialogTitle>
        </DialogHeader>

        {isModerator && (
          <div className="space-y-4 py-4 border-b dark:border-slate-800">
            <h3 className="font-semibold text-sm text-slate-500">GROUP DETAILS</h3>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Button onClick={handleUpdateDetails} disabled={loading} size="sm">Save Changes</Button>
          </div>
        )}

        <div className="space-y-4 py-4">
          <h3 className="font-semibold text-sm text-slate-500 flex justify-between">
            <span>MEMBERS ({members.length})</span>
          </h3>
          <div className="space-y-3">
            {members.map(m => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
              const isMe = m.user_id === currentUserId
              return (
                <div key={m.user_id} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {p?.display_name || p?.username}
                      {isMe && <span className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 rounded">You</span>}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">{m.role}</div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {isOwner && !isMe && m.role !== 'owner' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleRoleChange(m.user_id, m.role === 'moderator' ? 'member' : 'moderator')}
                        disabled={loading}
                      >
                        <Shield size={14} className="mr-1" />
                        {m.role === 'moderator' ? 'Demote' : 'Promote'}
                      </Button>
                    )}
                    
                    {isModerator && !isMe && m.role !== 'owner' && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleRemove(m.user_id)}
                        disabled={loading}
                      >
                        <UserMinus size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="pt-4 border-t dark:border-slate-800 space-y-2 flex flex-col items-start">
          <Button variant="outline" className="text-red-500 w-full" onClick={handleLeave} disabled={loading}>
            Leave Group
          </Button>
          {isOwner && (
            <Button variant="ghost" className="text-red-600 w-full bg-red-50 dark:bg-red-950/20" onClick={handleDelete} disabled={loading}>
              Delete Group
            </Button>
          )}
        </div>

      </DialogContent>
    </Dialog>
  )
}
