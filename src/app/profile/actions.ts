'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function updateProfile(formData: FormData) {
  const supabase = createClient()
  
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    redirect('/login')
  }

  const username = formData.get('username') as string
  const displayName = formData.get('displayName') as string
  const avatarUrl = formData.get('avatarUrl') as string
  const course = formData.get('course') as string
  const semester = formData.get('semester') as string
  const batch = formData.get('batch') as string
  const bio = formData.get('bio') as string

  if (!username || !displayName) {
    redirect('/profile?error=' + encodeURIComponent('Username and Display Name are required'))
  }

  const normalizedUsername = username.trim().toLowerCase()
  if (normalizedUsername.length < 3 || normalizedUsername.length > 20) {
    redirect('/profile?error=' + encodeURIComponent('Username must be between 3 and 20 characters'))
  }

  if (!/^[a-z0-9_]+$/.test(normalizedUsername)) {
    redirect('/profile?error=' + encodeURIComponent('Username can only contain letters, numbers, and underscores'))
  }

  const updates = {
    username: username.trim(),
    display_name: displayName.trim(),
    avatar_url: avatarUrl?.trim() || null,
    course: course?.trim() || null,
    semester: semester?.trim() || null,
    batch: batch?.trim() || null,
    bio: bio?.trim() || null,
    updated_at: new Date().toISOString(), // Optional, handled by trigger too
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', authData.user.id)

  if (error) {
    if (error.code === '23505') { // Unique violation
      redirect('/profile?error=' + encodeURIComponent('Username is already taken'))
    }
    redirect('/profile?error=' + encodeURIComponent(error.message || 'Failed to update profile'))
  }

  revalidatePath('/profile')
  revalidatePath('/app', 'layout')
  redirect('/profile?success=true')
}
