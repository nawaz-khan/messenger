import Link from 'next/link'
import { resetPasswordForEmail } from '@/app/auth/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string, success?: string }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Campus Messenger
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reset your password</CardTitle>
            <CardDescription>
              Enter your email address and we will send you a link to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {searchParams.error && (
              <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/50 dark:text-red-400">
                {searchParams.error}
              </div>
            )}
            
            {searchParams.success ? (
              <div className="rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/50 dark:text-green-400">
                Check your email for the reset link. (If you don&apos;t see it, check your spam folder).
              </div>
            ) : (
              <form action={resetPasswordForEmail} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Send reset link
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Remember your password?{' '}
              <Link
                href="/login"
                className="font-medium text-slate-900 hover:underline dark:text-slate-50"
              >
                Back to sign in
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
