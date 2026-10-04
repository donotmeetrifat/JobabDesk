'use client'

import { useEffect } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Inbox Error Boundary]:', error)
  }, [error])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center p-6 text-center">
      <div className="rounded-2xl border border-border bg-card p-8 max-w-md shadow-lg space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Inbox Encountered an Issue</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {error?.message || 'A temporary issue occurred while rendering the conversation.'}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
          >
            <RefreshCw className="size-3.5" />
            <span>Try Again</span>
          </button>
          <button
            type="button"
            onClick={() => window.location.assign('/inbox')}
            className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            Reset to All Chats
          </button>
        </div>
      </div>
    </div>
  )
}
