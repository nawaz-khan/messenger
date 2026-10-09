'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { blockUser, unblockUser, reportUserAction } from '@/app/app/moderation/actions'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function ProfileModerationActions({
  targetUserId,
  targetUsername,
  initialIsBlocked,
}: {
  targetUserId: string
  targetUsername: string
  initialIsBlocked: boolean
}) {
  const [isBlocked, setIsBlocked] = useState(initialIsBlocked)
  const [isProcessingBlock, setIsProcessingBlock] = useState(false)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('Spam')
  const [reportDesc, setReportDesc] = useState('')
  const [isReporting, setIsReporting] = useState(false)
  const [reportSuccess, setReportSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleBlockToggle = async () => {
    const actionName = isBlocked ? 'Unblock' : 'Block'
    if (!confirm(`Are you sure you want to ${actionName.toLowerCase()} @${targetUsername}?`)) return

    setIsProcessingBlock(true)
    setError(null)
    try {
      if (isBlocked) {
        await unblockUser(targetUserId, `/app/profile/${targetUsername}`)
        setIsBlocked(false)
      } else {
        await blockUser(targetUserId, `/app/profile/${targetUsername}`)
        setIsBlocked(true)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsProcessingBlock(false)
    }
  }

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsReporting(true)
    setError(null)
    setReportSuccess(false)
    try {
      await reportUserAction(targetUserId, reportReason, reportDesc || null)
      setReportSuccess(true)
      setTimeout(() => {
        setIsReportOpen(false)
        setReportSuccess(false)
        setReportDesc('')
        setReportReason('Spam')
      }, 2000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsReporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-4 pt-4 border-t dark:border-slate-800">
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={isBlocked ? "outline" : "destructive"}
          onClick={handleBlockToggle}
          disabled={isProcessingBlock}
        >
          {isProcessingBlock ? 'Processing...' : isBlocked ? 'Unblock User' : 'Block User'}
        </Button>

        <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">Report User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report @{targetUsername}</DialogTitle>
            </DialogHeader>
            {reportSuccess ? (
              <div className="p-4 text-center text-green-600 bg-green-50 rounded-lg">
                Report submitted successfully. Thank you.
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <select
                    id="reason"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="Spam">Spam</option>
                    <option value="Harassment">Harassment</option>
                    <option value="Inappropriate content">Inappropriate content</option>
                    <option value="Threats">Threats</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={reportDesc}
                    onChange={(e) => setReportDesc(e.target.value)}
                    placeholder="Provide additional details..."
                  />
                </div>
                {error && <div className="text-red-500 text-sm">{error}</div>}
                <Button type="submit" variant="destructive" className="w-full" disabled={isReporting}>
                  {isReporting ? 'Submitting...' : 'Submit Report'}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
