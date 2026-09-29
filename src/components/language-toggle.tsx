'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { Globe } from 'lucide-react'

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
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
    >
      <Globe className="size-4 shrink-0" />
      <span>{isBn ? '🇬🇧 English' : '🇧🇩 বাংলা'}</span>
    </button>
  )
}
