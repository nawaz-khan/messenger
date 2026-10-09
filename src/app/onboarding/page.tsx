import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnboardingForm from './OnboardingForm'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    redirect('/login')
  }

  // If already has a profile, redirect to /app
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profile) {
    redirect('/app')
  }

  const defaultEmailName = authData.user.email ? authData.user.email.split('@')[0] : ''
  const defaultDisplayName = authData.user.user_metadata?.full_name || defaultEmailName

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <OnboardingForm 
        defaultDisplayName={defaultDisplayName} 
        serverError={searchParams.error} 
      />
    </div>
  )
}
