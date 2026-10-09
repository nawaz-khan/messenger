import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SearchBar } from '@/components/search/SearchBar'
import { NotificationsBadge } from '@/components/notifications/NotificationsBadge'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (!profile) {
    redirect('/onboarding')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="h-16 border-b dark:border-slate-800 flex items-center px-4 justify-between shrink-0 bg-white dark:bg-slate-950">
        <div className="flex items-center gap-6">
          <Link href="/app" className="font-bold text-lg hidden sm:block">
            Campus Messenger
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link href="/app/messages" className="hover:text-blue-600 transition">
              Messages
            </Link>
            <Link href="/app/groups" className="hover:text-blue-600 transition">
              Groups
            </Link>
          </nav>
        </div>

        <div className="flex-1 max-w-md mx-4">
          <SearchBar />
        </div>

        <div className="flex items-center gap-4">
          <NotificationsBadge userId={authData.user.id} />
          <Link href={`/app/profile/${profile.username}`} className="text-sm font-medium hover:text-blue-600 transition">
            Profile
          </Link>
        </div>
      </header>
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}
