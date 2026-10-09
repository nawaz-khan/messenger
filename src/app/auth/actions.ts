'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Email and password are required'))
  }

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/', 'layout')
  redirect('/app')
}

function formatAuthError(error: { message: string; status?: number }): string {
  const msg = error.message || ''

  // Rate limit error: e.g. "For security purposes, you can only request this after 53 seconds."
  if (
    error.status === 429 ||
    msg.toLowerCase().includes('security purposes') ||
    msg.toLowerCase().includes('only request this after')
  ) {
    const match = msg.match(/after (\d+) seconds/i)
    if (match && match[1]) {
      return `Please wait ${match[1]} seconds before requesting another confirmation email.`
    }
    return 'Please wait a moment before requesting another confirmation email.'
  }

  if (msg.toLowerCase().includes('user already registered')) {
    return 'An account with this email already exists. Please sign in instead.'
  }

  return msg || 'An error occurred during authentication. Please try again.'
}

export async function register(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!email || !password || !confirmPassword) {
    redirect('/register?error=' + encodeURIComponent('All fields are required'))
  }

  if (password !== confirmPassword) {
    redirect('/register?error=' + encodeURIComponent('Passwords do not match'))
  }

  if (password.length < 6) {
    redirect('/register?error=' + encodeURIComponent('Password must be at least 6 characters'))
  }

  const supabase = createClient()
  const origin = headers().get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/app`,
    },
  })

  if (error) {
    const friendlyError = formatAuthError(error)
    redirect('/register?error=' + encodeURIComponent(friendlyError))
  }

  // If email enumeration protection is on, an existing user returns identities: []
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    redirect('/register?error=' + encodeURIComponent('An account with this email already exists. Please sign in instead.'))
  }

  // If session is established immediately (e.g. email confirmation disabled)
  if (data?.session) {
    revalidatePath('/', 'layout')
    redirect('/app')
  }

  // Email confirmation required (data.session === null)
  redirect(`/register?success=check-email&email=${encodeURIComponent(email)}`)
}

export async function resendConfirmationEmail(formData: FormData) {
  const email = formData.get('email') as string

  if (!email) {
    redirect('/register?error=' + encodeURIComponent('Email is required to resend confirmation'))
  }

  const supabase = createClient()
  const origin = headers().get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/app`,
    },
  })

  if (error) {
    const friendlyError = formatAuthError(error)
    redirect(`/register?success=check-email&email=${encodeURIComponent(email)}&error=${encodeURIComponent(friendlyError)}`)
  }

  redirect(`/register?success=check-email&email=${encodeURIComponent(email)}&resent=true`)
}

export async function logout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function resetPasswordForEmail(formData: FormData) {
  const email = formData.get('email') as string
  
  if (!email) {
    redirect('/forgot-password?error=' + encodeURIComponent('Email is required'))
  }

  const supabase = createClient()
  const origin = headers().get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  redirect('/forgot-password?success=true')
}

export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!password || !confirmPassword) {
    redirect('/reset-password?error=' + encodeURIComponent('All fields are required'))
  }

  if (password !== confirmPassword) {
    redirect('/reset-password?error=' + encodeURIComponent('Passwords do not match'))
  }

  if (password.length < 6) {
    redirect('/reset-password?error=' + encodeURIComponent('Password must be at least 6 characters'))
  }

  const supabase = createClient()
  
  const { error } = await supabase.auth.updateUser({
    password: password
  })

  if (error) {
    redirect('/reset-password?error=' + encodeURIComponent(error.message))
  }

  redirect('/app')
}

export async function signInWithGoogle() {
  const supabase = createClient()
  const origin = headers().get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=/app`,
    },
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  if (data?.url) {
    redirect(data.url)
  }
}
