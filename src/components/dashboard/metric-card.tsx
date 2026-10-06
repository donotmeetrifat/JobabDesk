import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
}

export function MetricCard({ title, value, icon: Icon, delta, subtitle }: MetricCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-xs transition-all duration-300 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5">
      {/* Ambient theme glow */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:bg-primary/20" />

      <div className="relative flex items-start justify-between">
        <p className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{title}</p>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-2xs transition-transform duration-300 group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="relative mt-3">
        <p className="text-2xl sm:text-[28px] font-bold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {delta ? <DeltaRow sign={delta.sign} label={delta.label} /> : subtitle ? (
          <p className="mt-2 text-xs text-muted-foreground truncate" title={subtitle}>{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const isPositive = sign > 0
  const isNegative = sign < 0
  const Arrow = isPositive ? ArrowUp : isNegative ? ArrowDown : Minus

  const badgeStyle = isPositive
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : isNegative
    ? 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400'
    : 'border-border/60 bg-muted/60 text-muted-foreground'

  return (
    <div className="mt-2 flex items-center">
      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums', badgeStyle)}>
        <Arrow className="h-3 w-3" aria-hidden />
        <span>{label}</span>
      </span>
    </div>
  )
}
