'use client'

import { useState, useEffect } from 'react'
import { createProfile, checkUsernameAvailability } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { useFormStatus } from 'react-dom'

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      {pending ? 'Saving...' : 'Complete Profile'}
    </Button>
  )
}

export default function OnboardingForm({ 
  defaultDisplayName, 
  serverError 
}: { 
  defaultDisplayName: string
  serverError?: string 
}) {
  const [username, setUsername] = useState('')
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
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
  }, [username])

  return (
    <div className="w-full max-w-md space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Welcome to Campus Messenger
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Let&apos;s set up your profile to get started.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Setup</CardTitle>
          <CardDescription>
            You can change these details later in your settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serverError && (
            <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/50 dark:text-red-400">
              {serverError}
            </div>
          )}
          
          <form action={createProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                name="displayName"
                type="text"
                defaultValue={defaultDisplayName}
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
                placeholder="e.g. johndoe"
                maxLength={20}
                className={isAvailable === false ? 'border-red-500 focus-visible:ring-red-500' : isAvailable === true ? 'border-green-500 focus-visible:ring-green-500' : ''}
              />
              <div className="h-5 text-xs">
                {validationError && (
                  <span className="text-red-500">{validationError}</span>
                )}
                {!validationError && isChecking && (
                  <span className="text-slate-500">Checking availability...</span>
                )}
                {!validationError && !isChecking && isAvailable === true && (
                  <span className="text-green-600 dark:text-green-400">Username is available!</span>
                )}
                {!validationError && !isChecking && isAvailable === false && (
                  <span className="text-red-500">Username is already taken.</span>
                )}
              </div>
            </div>
            
            <SubmitButton disabled={isAvailable === false || !!validationError} />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
