'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'

export function LanguageToggle() {
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const switchLocale = async (next: string) => {
    await fetch('/api/set-locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
    startTransition(() => { router.refresh() })
  }

  const isBn = locale === 'bn'

  return (
    <button
      onClick={() => switchLocale(isBn ? 'en' : 'bn')}
      disabled={isPending}
      title={isBn ? 'Switch to English' : 'বাংলায় পরিবর্তন করুন'}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 border"
    >
      {isBn ? '🇬🇧 EN' : '🇧🇩 বাং'}
    </button>
  )
}
