'use client'

import * as React from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface SubmitButtonProps extends React.ComponentProps<typeof Button> {
  pendingText?: string
}

export function SubmitButton({
  children,
  pendingText = 'Please wait...',
  className,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className={className}
      {...props}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{pendingText}</span>
        </span>
      ) : (
        children
      )}
    </Button>
  )
}
