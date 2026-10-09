import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string }
}) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (!profile) {
    redirect('/onboarding')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <ProfileForm 
        profile={profile} 
        serverError={searchParams.error}
        success={searchParams.success === 'true'}
      />
    </div>
  )
}
