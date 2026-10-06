"use client"

import Link from 'next/link'
import { useState } from 'react'
import {
  MessageSquare,
  UserPlus,
  Briefcase,
  Radio,
  Zap,
  Inbox,
  Activity,
  ArrowRight,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { ActivityItem, ActivityKind } from '@/lib/dashboard/types'
import { cn } from '@/lib/utils'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { useTranslations } from 'next-intl'

interface ActivityFeedProps {
  items: ActivityItem[] | null
  loading: boolean
}

const PAGE_SIZES = [5, 10, 20] as const
type PageSize = (typeof PAGE_SIZES)[number]

interface KindTheme {
  icon: ComponentType<{ className?: string }>
  badge: string
}

const KIND_THEME: Record<ActivityKind, KindTheme> = {
  message: { icon: MessageSquare, badge: 'bg-primary/10 text-primary border border-primary/20' },
  contact: { icon: UserPlus, badge: 'bg-primary/10 text-primary border border-primary/20' },
  deal: { icon: Briefcase, badge: 'bg-primary/10 text-primary border border-primary/20' },
  broadcast: { icon: Radio, badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
  automation: { icon: Zap, badge: 'bg-primary/15 text-primary border border-primary/25' },
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  const t = useTranslations('Dashboard.activityFeed')
  const [pageSize, setPageSize] = useState<PageSize>(5)

  const totalLoaded = items?.length ?? 0
  const visible = items?.slice(0, pageSize) ?? []
  const isSizeUseful = (size: PageSize, i: number) =>
    i === 0 || totalLoaded > PAGE_SIZES[i - 1]

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xs shadow-xs hover:shadow-md transition-shadow">
      <header className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Activity className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{t('title')}</h2>
            <p className="text-xs text-muted-foreground">Live event stream</p>
          </div>
        </div>
        <Link
          href="/inbox"
          className="group inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all"
        >
          <span>{t('viewAll')}</span>
          <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </header>

      <div className="flex-1">
        {loading || !items ? (
          <div className="space-y-2.5 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={Inbox}
              title={t('noActivity')}
              hint={t('noActivityHint')}
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((it) => {
              const theme = KIND_THEME[it.kind]
              const Icon = theme.icon
              const row = (
                <div className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl',
                      theme.badge,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {it.text}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {relativeTime(it.at, t)}
                  </span>
                </div>
              )
              return (
                <li key={it.id} className="transition-colors hover:bg-muted/30">
                  {it.href ? (
                    <Link href={it.href} className="block">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {!loading && items && items.length > 0 && (
        <footer className="flex items-center justify-between border-t border-border/70 px-5 py-3 text-xs">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {t('showingOf', { visible: visible.length, totalLoaded, plus: totalLoaded === 50 ? '+' : '' })}
          </span>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] text-muted-foreground">{t('show')}</span>
            {PAGE_SIZES.map((size, i) => {
              const disabled = !isSizeUseful(size, i)
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPageSize(size)}
                  disabled={disabled}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums transition-all',
                    pageSize === size
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
                  )}
                >
                  {size}
                </button>
              )
            })}
          </div>
        </footer>
      )}
    </section>
  )
}

function relativeTime(iso: string, t: ReturnType<typeof useTranslations>): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return t('timeS', { sec: Math.max(1, diffSec) })
  if (diffSec < 3600) return t('timeM', { min: Math.floor(diffSec / 60) })
  if (diffSec < 86400) return t('timeH', { hr: Math.floor(diffSec / 3600) })
  if (diffSec < 2_592_000) return t('timeD', { day: Math.floor(diffSec / 86400) })
  return new Date(iso).toLocaleDateString()
}
