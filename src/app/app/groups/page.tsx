import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import CreateGroupDialog from './CreateGroupDialog'
import GroupCard from './GroupCard'
import { GroupSearch } from './GroupSearch'
import { InvitationCard } from './InvitationCard'

// Helper to safely unwrap Supabase response shapes that TypeScript 
// infers as arrays but are actually single objects at runtime (e.g., Many-to-One and One-to-One relations)
function extractSingle<T>(val: T[] | T | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? val[0] : val;
}

export default async function GroupsPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient()
  const { data: authData } = await supabase.auth.getUser()
  const currentUserId = authData?.user?.id

  const q = searchParams.q || ''

  // Fetch all public groups
  let publicQuery = supabase
    .from('groups')
    .select('*, conversations(id)')
    .eq('privacy', 'public')
    .order('created_at', { ascending: false })

  if (q) {
    publicQuery = publicQuery.ilike('name', `%${q}%`)
  }

  const { data: publicGroups } = await publicQuery

  // Fetch groups the user is a member of
  const { data: myMemberships, error: myMembershipsError } = await supabase
    .from('conversation_members')
    .select('conversation_id, role, conversations(id, type, groups(*))')
    .eq('user_id', currentUserId)

  if (myMembershipsError) console.error("myMembershipsError:", myMembershipsError)

  // Fetch pending invitations
  const { data: myInvitations } = await supabase
    .from('group_invitations')
    .select('id, group_id, status, created_at, group:groups(name), inviter:profiles!group_invitations_inviter_id_fkey(username, display_name)')
    .eq('invitee_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  // Extract valid groups the user is already in
  let myGroupMemberships = (myMemberships || [])
    .map(m => {
      const conv = extractSingle(m.conversations)
      const group = extractSingle(conv?.groups)
      return {
        conversation_id: m.conversation_id,
        role: m.role,
        group
      }
    })
    .filter(m => m.group !== null)

  if (q) {
    const lowerQ = q.toLowerCase()
    myGroupMemberships = myGroupMemberships.filter(m => m.group!.name.toLowerCase().includes(lowerQ))
  }

  const myGroupConvs = myGroupMemberships.map(m => m.conversation_id)

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h1 className="text-3xl font-bold">Groups</h1>
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center w-full sm:w-auto">
          <GroupSearch />
          <CreateGroupDialog />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Group Invitations</h2>
        {myInvitations && myInvitations.length > 0 ? (
          <div className="flex flex-col gap-4">
            {myInvitations.map((invitation) => (
              <InvitationCard key={invitation.id} invitation={invitation} />
            ))}
          </div>
        ) : (
          <div className="text-slate-500 bg-slate-50 dark:bg-slate-900 border dark:border-slate-800 rounded-lg p-4 text-sm text-center">
            No pending group invitations.
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">My Groups</h2>
        {myGroupMemberships.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myGroupMemberships.map((m) => (
              <GroupCard 
                key={m.group!.id} 
                group={m.group} 
                isMember={true} 
                role={m.role}
              />
            ))}
          </div>
        ) : (
          <div className="text-slate-500">You haven&apos;t joined any groups yet.</div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Public Groups</h2>
        {publicGroups && publicGroups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicGroups.map((group) => (
              <GroupCard 
                key={group.id} 
                group={group} 
                isMember={myGroupConvs.includes(group.conversation_id)} 
              />
            ))}
          </div>
        ) : (
          <div className="text-slate-500">No public groups found.</div>
        )}
      </div>
    </div>
  )
}
