'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { acceptGroupInvite, rejectGroupInvite } from './actions'

export function InvitationCard({ invitation }: { invitation: any }) {
  const [isProcessing, setIsProcessing] = useState(false)

  const groupName = Array.isArray(invitation.group) ? invitation.group[0]?.name : invitation.group?.name
  const inviterName = Array.isArray(invitation.inviter) ? invitation.inviter[0]?.display_name || invitation.inviter[0]?.username : invitation.inviter?.display_name || invitation.inviter?.username

  const handleAccept = async () => {
    setIsProcessing(true)
    try {
      await acceptGroupInvite(invitation.id)
    } catch (e: any) {
      alert(e.message)
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    setIsProcessing(true)
    try {
      await rejectGroupInvite(invitation.id)
    } catch (e: any) {
      alert(e.message)
      setIsProcessing(false)
    }
  }

  return (
    <div className="border dark:border-slate-800 p-4 rounded-lg flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
      <div>
        <h3 className="font-semibold">{groupName || 'Unnamed Group'}</h3>
        <p className="text-sm text-slate-500">@{inviterName} invited you to join this group.</p>
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <Button onClick={handleAccept} disabled={isProcessing} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white">Accept</Button>
        <Button onClick={handleReject} disabled={isProcessing} variant="outline" className="flex-1 sm:flex-none">Reject</Button>
      </div>
    </div>
  )
}
