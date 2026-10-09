import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getOrCreateDirectConversation } from '@/app/app/messages/actions'
import { Button } from '@/components/ui/button'
import ProfileModerationActions from './ProfileModerationActions'
import Image from 'next/image'

export default async function UserProfilePage({
  params
}: {
  params: { username: string }
}) {
  const supabase = createClient()
  const { data: authData } = await supabase.auth.getUser()

  if (!authData?.user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username_normalized', params.username.toLowerCase())
    .maybeSingle()

  if (!profile) {
    notFound()
  }

  const isSelf = profile.id === authData.user.id

  let isBlocked = false
  if (!isSelf) {
    const { data: blockData } = await supabase
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', authData.user.id)
      .eq('blocked_id', profile.id)
      .maybeSingle()
    if (blockData) isBlocked = true
  }

  async function handleMessage() {
    'use server'
    const conversationId = await getOrCreateDirectConversation(profile.id)
    redirect(`/app/messages/${conversationId}`)
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 flex justify-center">
      <div className="max-w-2xl w-full bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl shadow-sm p-8 mt-10 h-fit">
        <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
          <div className="w-32 h-32 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0 shadow-sm border-4 border-white dark:border-slate-800 relative">
            {profile.avatar_url && (
              <Image src={profile.avatar_url} alt={profile.display_name} fill className="object-cover" />
            )}
          </div>
          <div className="flex-1 w-full">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">{profile.display_name}</h1>
            <p className="text-lg text-slate-500 mb-4">@{profile.username}</p>
            
            {(profile.course || profile.semester || profile.batch) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {profile.course && (
                  <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                    {profile.course}
                  </span>
                )}
                {profile.semester && (
                  <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                    Semester {profile.semester}
                  </span>
                )}
                {profile.batch && (
                  <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                    Batch {profile.batch}
                  </span>
                )}
              </div>
            )}

            {profile.bio && (
              <div className="mt-4 prose dark:prose-invert max-w-none">
                <p>{profile.bio}</p>
              </div>
            )}

            <div className="mt-8 flex gap-4">
              {!isSelf && (
                <form action={handleMessage}>
                  <Button type="submit">Message</Button>
                </form>
              )}
              {isSelf && (
                <form action={async () => { 'use server'; redirect('/profile') }}>
                  <Button variant="outline" type="submit">Edit Profile</Button>
                </form>
              )}
            </div>
            
            {!isSelf && (
              <ProfileModerationActions 
                targetUserId={profile.id} 
                targetUsername={profile.username}
                initialIsBlocked={isBlocked}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
