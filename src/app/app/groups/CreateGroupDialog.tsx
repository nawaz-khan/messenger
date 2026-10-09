'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createGroup } from './actions'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { X } from 'lucide-react'
import Image from 'next/image'

export default function CreateGroupDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'private' | 'invite_only'>('public')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  // Members search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<any[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [myUserId, setMyUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id || null))
  }, [supabase])

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
    const search = async () => {
      const trimmed = searchQuery.trim().toLowerCase().replace(/^@/, '')
      if (!trimmed) {
        setSearchResults([])
        return
      }

      setSearching(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username_normalized', `${trimmed}%`)
        .limit(10)

      if (!error && data) {
        setSearchResults(data.filter(u => u.id !== myUserId && !selectedMembers.some(m => m.id === u.id)))
      }
      setSearching(false)
    }

    const timer = setTimeout(() => {
      search()
    }, 250)

    return () => clearTimeout(timer)
  }, [searchQuery, supabase, myUserId, selectedMembers])

  const addMember = (user: any) => {
    if (!selectedMembers.find(m => m.id === user.id)) {
      setSelectedMembers([...selectedMembers, user])
    }
    setSearchQuery('')
    setShowDropdown(false)
  }

  const removeMember = (userId: string) => {
    setSelectedMembers(selectedMembers.filter(m => m.id !== userId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)
    try {
      const memberIds = selectedMembers.map(m => m.id)
      const conversationId = await createGroup(name, description, privacy, memberIds)
      setOpen(false)
      setName('')
      setDescription('')
      setPrivacy('public')
      setSelectedMembers([])
      // The RPC now returns the conversation_id.
      router.push(`/app/messages/${conversationId}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Group</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a New Group</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Group Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Study Group CS101"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="privacy">Privacy</Label>
            <select
              id="privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as any)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="public">Public - Anyone can join</option>
              <option value="private">Private - Request to join</option>
              <option value="invite_only">Invite Only - Must be invited</option>
            </select>
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}

          <div className="space-y-2">
            <Label>Add Members</Label>
            <div className="relative w-full" ref={dropdownRef}>
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search users by username..."
              />
              {showDropdown && searchQuery.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg overflow-hidden z-50 max-h-48 overflow-y-auto">
                  {searching && <div className="p-2 text-sm text-muted-foreground text-center">Searching...</div>}
                  {!searching && searchResults.length === 0 && (
                    <div className="p-2 text-sm text-muted-foreground text-center">No users found.</div>
                  )}
                  {!searching && searchResults.length > 0 && (
                    <ul className="divide-y">
                      {searchResults.map((user) => (
                        <li key={user.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2"
                            onClick={() => addMember(user)}
                          >
                            <div className="w-6 h-6 rounded-full bg-muted overflow-hidden flex-shrink-0 relative">
                              {user.avatar_url && (
                                <Image src={user.avatar_url} alt="" fill className="object-cover" />
                              )}
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-sm font-medium truncate">{user.display_name}</span>
                              <span className="text-xs text-muted-foreground truncate">@{user.username}</span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedMembers.map(user => (
                  <div key={user.id} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-full text-sm">
                    <span className="truncate max-w-[120px]">@{user.username}</span>
                    <button type="button" onClick={() => removeMember(user.id)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading || !name.trim()}>
            {loading ? 'Creating...' : 'Create Group'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
