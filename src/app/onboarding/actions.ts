'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function createProfile(formData: FormData) {
  const supabase = createClient()
  
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    redirect('/login')
  }

  const username = formData.get('username') as string
  const displayName = formData.get('displayName') as string

  if (!username || !displayName) {
    redirect('/onboarding?error=' + encodeURIComponent('All fields are required'))
  }

  const normalizedUsername = username.trim().toLowerCase()
  if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
    redirect('/onboarding?error=' + encodeURIComponent('Username must be between 3 and 20 characters'))
  }

  if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
    redirect('/onboarding?error=' + encodeURIComponent('Username can only contain letters, numbers, and underscores'))
  }

  const { error } = await supabase.from('profiles').insert({
    id: authData.user.id,
    username: username.trim(),
    display_name: displayName.trim(),
  })

  if (error) {
    if (error.code === '23505') { // Unique violation
      redirect('/onboarding?error=' + encodeURIComponent('Username is already taken'))
    }
    redirect('/onboarding?error=' + encodeURIComponent(error.message || 'Failed to create profile'))
  }

  revalidatePath('/app', 'layout')
  redirect('/app')
}

export async function checkUsernameAvailability(username: string): Promise<boolean> {
  const supabase = createClient()
  const normalized = username.trim().toLowerCase()
  
  if (normalized.length < 3 || normalized.length > 20 || !/^[a-z0-9_]+$/.test(normalized)) {
    return false
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username_normalized', normalized)
    .maybeSingle()

  return !data // If no data found, it is available
}
