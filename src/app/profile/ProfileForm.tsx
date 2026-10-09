'use client'

import { useState, useEffect } from 'react'
import { updateProfile } from './actions'
import { checkUsernameAvailability } from '@/app/onboarding/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending || disabled}>
      {pending ? 'Saving...' : 'Save Profile'}
    </Button>
  )
}

export default function ProfileForm({ 
  profile, 
  serverError,
  success
}: { 
  profile: any
  serverError?: string 
  success?: boolean
}) {
  const [username, setUsername] = useState(profile.username || '')
  const [isAvailable, setIsAvailable] = useState<boolean | null>(true)
  const [isChecking, setIsChecking] = useState(false)
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    // If username hasn't changed from original, it's valid
    if (username === profile.username) {
      setIsAvailable(true)
      setValidationError('')
      setIsChecking(false)
      return
    }

    const timer = setTimeout(async () => {
      if (!username) {
        setIsAvailable(null)
        setValidationError('')
        return
      }

      const normalized = username.trim().toLowerCase()
      if (normalized.length < 3 || normalized.length > 20) {
        setValidationError('Username must be 3-20 characters.')
        setIsAvailable(null)
        return
      }
      
      if (!/^[a-z0-9_]+$/.test(normalized)) {
        setValidationError('Letters, numbers, and underscores only.')
        setIsAvailable(null)
        return
      }

      setValidationError('')
      setIsChecking(true)
      const available = await checkUsernameAvailability(username)
      setIsAvailable(available)
      setIsChecking(false)
    }, 500) // Debounce

    return () => clearTimeout(timer)
  }, [username, profile.username])

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Your Profile
        </h1>
        <Button variant="outline" asChild>
          <Link href="/app">Back to App</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
          <CardDescription>
            Update your public information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serverError && (
            <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/50 dark:text-red-400">
              {serverError}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/50 dark:text-green-400">
              Profile updated successfully.
            </div>
          )}
          
          <form action={updateProfile} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  type="text"
                  defaultValue={profile.display_name}
                  required
                  maxLength={50}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  maxLength={20}
                  className={isAvailable === false ? 'border-red-500 focus-visible:ring-red-500' : (isAvailable === true && username !== profile.username) ? 'border-green-500 focus-visible:ring-green-500' : ''}
                />
                <div className="h-5 text-xs">
                  {validationError && (
                    <span className="text-red-500">{validationError}</span>
                  )}
                  {!validationError && isChecking && (
                    <span className="text-slate-500">Checking availability...</span>
                  )}
                  {!validationError && !isChecking && isAvailable === true && username !== profile.username && (
                    <span className="text-green-600 dark:text-green-400">Username is available!</span>
                  )}
                  {!validationError && !isChecking && isAvailable === false && (
                    <span className="text-red-500">Username is already taken.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatarUrl">Avatar URL (Reference)</Label>
              <Input
                id="avatarUrl"
                name="avatarUrl"
                type="text"
                defaultValue={profile.avatar_url || ''}
                placeholder="https://example.com/avatar.png"
              />
              <p className="text-xs text-slate-500">Note: Media upload will be supported in a future update.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="course">Course</Label>
                <Input
                  id="course"
                  name="course"
                  type="text"
                  defaultValue={profile.course || ''}
                  placeholder="e.g. B.Tech CS"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="semester">Semester</Label>
                <Input
                  id="semester"
                  name="semester"
                  type="text"
                  defaultValue={profile.semester || ''}
                  placeholder="e.g. 5th"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="batch">Batch</Label>
                <Input
                  id="batch"
                  name="batch"
                  type="text"
                  defaultValue={profile.batch || ''}
                  placeholder="e.g. 2026"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={profile.bio || ''}
                placeholder="Tell us a little about yourself"
                rows={3}
                maxLength={500}
              />
            </div>
            
            <div className="flex justify-end pt-4">
              <SubmitButton disabled={isAvailable === false || !!validationError} />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
