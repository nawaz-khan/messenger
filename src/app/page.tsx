import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-50 dark:bg-slate-950">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Campus Messenger</h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
          Unofficial student community messenger.
        </p>
        <div className="flex justify-center gap-4 mt-8">
          <Button asChild>
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/register">Create Account</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
