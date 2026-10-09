'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { reportMessageAction } from '@/app/app/moderation/actions'

export function MessageReportDialog({
  isOpen,
  onOpenChange,
  targetUserId,
  messageId,
  conversationId,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  targetUserId: string
  messageId: string
  conversationId: string
}) {
  const [reportReason, setReportReason] = useState('Spam')
  const [reportDesc, setReportDesc] = useState('')
  const [isReporting, setIsReporting] = useState(false)
  const [reportSuccess, setReportSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsReporting(true)
    setError(null)
    setReportSuccess(false)
    try {
      await reportMessageAction(targetUserId, messageId, conversationId, reportReason, reportDesc || null)
      setReportSuccess(true)
      setTimeout(() => {
        onOpenChange(false)
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Message</DialogTitle>
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
  )
}
