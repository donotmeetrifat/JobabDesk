"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, TrendingUp } from 'lucide-react'
import type { ConversationsSeriesPoint } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

type RangeDays = 7 | 30 | 90

interface ConversationsChartProps {
  series: Record<RangeDays, ConversationsSeriesPoint[] | null>
  loading: boolean
  range: RangeDays
  onRangeChange: (r: RangeDays) => void
}

const VB_W = 760
const VB_H = 240
const PADDING = { top: 20, right: 20, bottom: 30, left: 42 }

export function ConversationsChart({ series, loading, range, onRangeChange }: ConversationsChartProps) {
  const t = useTranslations('Dashboard.conversationsChart')
  const data = series[range]

  const { maxY, niceTicks, totalIncoming, totalOutgoing } = useMemo(() => {
    const arr = data ?? []
    let inSum = 0
    let outSum = 0
    let max = 0
    for (const p of arr) {
      inSum += p.incoming
      outSum += p.outgoing
      if (p.incoming > max) max = p.incoming
      if (p.outgoing > max) max = p.outgoing
    }
    const ceil = niceCeil(max)
    const ticks = [0, ceil / 4, ceil / 2, (3 * ceil) / 4, ceil].map((v) =>
      Math.round(v),
    )
    return {
      maxY: ceil,
      niceTicks: Array.from(new Set(ticks)),
      totalIncoming: inSum,
      totalOutgoing: outSum,
    }
  }, [data])

  return (
    <section className="flex h-full flex-col rounded-2xl border border-border/80 bg-card/80 backdrop-blur-xs shadow-xs transition-shadow hover:shadow-md">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <TrendingUp className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{t('title')}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('description')}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick metric pills in chart header */}
          {!loading && data && (
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>{t('incoming')}: {totalIncoming.toLocaleString()}</span>
              </div>
              <div
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold"
                style={{
                  borderColor: 'color-mix(in srgb, var(--chart-2) 30%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--chart-2) 12%, transparent)',
                  color: 'var(--chart-2)',
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--chart-2)' }} />
                <span>{t('outgoing')}: {totalOutgoing.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Time range selector */}
          <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 border border-border/50">
            {[7, 30, 90].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r as RangeDays)}
                className={cn(
                  'rounded-lg px-3 py-1 text-xs font-medium transition-all duration-150',
                  range === r
                    ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
              >
                {t('days', { count: r })}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="p-5 flex-1 flex flex-col justify-center">
        {loading || !data ? (
          <Skeleton className="h-[240px] w-full rounded-xl" />
        ) : data.every((p) => p.incoming === 0 && p.outgoing === 0) ? (
          <EmptyState
            icon={MessageSquare}
            title={t('noActivity')}
            hint={t('noActivityHint')}
          />
        ) : (
          <LineSvg data={data} maxY={maxY} ticks={niceTicks} t={t} />
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-5">
          <LegendDot color="var(--primary)" label={t('incoming')} />
          <LegendDot color="var(--chart-2)" label={t('outgoing')} />
        </div>
        <span className="text-[11px] text-muted-foreground/75">
          Dynamic real-time analytics
        </span>
      </footer>
    </section>
  )
}

function LineSvg({
  data,
  maxY,
  ticks,
  t,
}: {
  data: ConversationsSeriesPoint[]
  maxY: number
  ticks: number[]
  t: ReturnType<typeof useTranslations>
}) {
  const [hover, setHover] = useState<{ idx: number; tooltipLeftPx: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const chartW = VB_W - PADDING.left - PADDING.right
  const chartH = VB_H - PADDING.top - PADDING.bottom
  const baseY = PADDING.top + chartH

  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0
  const yFor = (v: number) =>
    maxY === 0 ? baseY : PADDING.top + chartH - (v / maxY) * chartH
  const xFor = (i: number) => PADDING.left + i * stepX

  const incomingPoints = useMemo(
    () => data.map((p, i) => ({ x: xFor(i), y: yFor(p.incoming) })),
    [data, maxY, chartH, stepX],
  )
  const outgoingPoints = useMemo(
    () => data.map((p, i) => ({ x: xFor(i), y: yFor(p.outgoing) })),
    [data, maxY, chartH, stepX],
  )

  const incomingCurve = useMemo(() => createSmoothPath(incomingPoints), [incomingPoints])
  const outgoingCurve = useMemo(() => createSmoothPath(outgoingPoints), [outgoingPoints])
  const incomingArea = useMemo(() => createSmoothAreaPath(incomingPoints, baseY), [incomingPoints, baseY])
  const outgoingArea = useMemo(() => createSmoothAreaPath(outgoingPoints, baseY), [outgoingPoints, baseY])

  useEffect(() => {
    const svg = svgRef.current
    const wrap = wrapRef.current
    if (!svg || !wrap) return
    const onMove = (e: MouseEvent) => {
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const local = pt.matrixTransform(ctm.inverse())
      const xVb = local.x
      if (xVb < PADDING.left - 8 || xVb > VB_W - PADDING.right + 8) {
        setHover(null)
        return
      }
      const relative = xVb - PADDING.left
      const idx = Math.max(
        0,
        Math.min(data.length - 1, Math.round(stepX === 0 ? 0 : relative / stepX)),
      )
      const dataPointVbX = PADDING.left + idx * stepX
      const dataPointPt = svg.createSVGPoint()
      dataPointPt.x = dataPointVbX
      dataPointPt.y = 0
      const screen = dataPointPt.matrixTransform(ctm)
      const wrapRect = wrap.getBoundingClientRect()
      setHover({ idx, tooltipLeftPx: screen.x - wrapRect.left })
    }
    const onLeave = () => setHover(null)
    svg.addEventListener('mousemove', onMove)
    svg.addEventListener('mouseleave', onLeave)
    return () => {
      svg.removeEventListener('mousemove', onMove)
      svg.removeEventListener('mouseleave', onLeave)
    }
  }, [data, stepX])

  const hovered = hover !== null ? data[hover.idx] : null
  const hoverX = hover !== null ? xFor(hover.idx) : 0
  const labelStride = Math.max(1, Math.ceil(data.length / 6))

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-[240px] w-full overflow-visible"
        role="img"
        aria-label={t('ariaLabel')}
      >
        <defs>
          <linearGradient id="curveGradientIncoming" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="90%" stopColor="var(--primary)" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="curveGradientOutgoing" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.22" />
            <stop offset="90%" stopColor="var(--chart-2)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines + labels */}
        {ticks.map((tickVal) => {
          const y = yFor(tickVal)
          return (
            <g key={tickVal}>
              <line
                x1={PADDING.left}
                x2={VB_W - PADDING.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeOpacity={0.6}
                strokeDasharray="4 4"
              />
              <text
                x={PADDING.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] font-medium"
              >
                {tickVal}
              </text>
            </g>
          )
        })}

        {/* X-axis labels */}
        {data.map((p, i) =>
          i % labelStride === 0 ? (
            <text
              key={p.day}
              x={xFor(i)}
              y={VB_H - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px] font-medium"
            >
              {shortDayLabel(p.day)}
            </text>
          ) : null,
        )}

        {/* Smooth Area Fills */}
        <path d={outgoingArea} fill="url(#curveGradientOutgoing)" />
        <path d={incomingArea} fill="url(#curveGradientIncoming)" />

        {/* Smooth Curve Lines */}
        <path
          d={outgoingCurve}
          fill="none"
          stroke="var(--chart-2)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={incomingCurve}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover crosshair and data points */}
        {hover !== null && (
          <g pointerEvents="none">
            <line
              x1={hoverX}
              x2={hoverX}
              y1={PADDING.top}
              y2={baseY}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.4}
              strokeDasharray="3 3"
              strokeWidth={1.5}
            />
            <circle
              cx={hoverX}
              cy={yFor(data[hover.idx].incoming)}
              r={4.5}
              fill="var(--primary)"
              stroke="var(--card)"
              strokeWidth={2}
            />
            <circle
              cx={hoverX}
              cy={yFor(data[hover.idx].outgoing)}
              r={4.5}
              fill="var(--chart-2)"
              stroke="var(--card)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {/* Modern Glassmorphic Tooltip */}
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-20 -translate-x-1/2 rounded-xl border border-border/80 bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-md transition-all"
          style={{ left: `${hover.tooltipLeftPx}px` }}
        >
          <div className="font-semibold text-popover-foreground">{longDayLabel(hovered.day)}</div>
          <div className="mt-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
                {t('incoming')}
              </span>
              <span className="font-bold text-foreground tabular-nums">
                {hovered.incoming.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--chart-2)' }} />
                {t('outgoing')}
              </span>
              <span className="font-bold text-foreground tabular-nums">
                {hovered.outgoing.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full shadow-xs" style={{ background: color }} />
      <span className="font-medium text-foreground">{label}</span>
    </span>
  )
}

function createSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`
  }

  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

function createSmoothAreaPath(points: { x: number; y: number }[], baseY: number): string {
  if (points.length === 0) return ''
  const linePath = createSmoothPath(points)
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath} L ${last.x.toFixed(1)},${baseY.toFixed(1)} L ${first.x.toFixed(1)},${baseY.toFixed(1)} Z`
}

function shortDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function longDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function niceCeil(max: number): number {
  if (max <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const normalised = max / pow
  let nice: number
  if (normalised <= 1) nice = 1
  else if (normalised <= 2) nice = 2
  else if (normalised <= 5) nice = 5
  else nice = 10
  return nice * pow
}
