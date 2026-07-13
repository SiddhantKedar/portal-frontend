import { useState } from 'react'
import {
  BarChart, Bar, Cell, YAxis, ResponsiveContainer, LabelList, CartesianGrid,
  ReferenceLine,
} from 'recharts'

const COLORS = {
  actual: '#e17100',
  targeted: '#497d00',
}

export type ComparisonStyle =
  | 'grouped-bars' | 'progress-bar' | 'stat-delta' | 'radial-gauge' | 'bullet' | 'target-line'
  | 'concentric-arcs' | 'speedometer' | 'thermometer' | 'segmented' | 'diverging' | 'zone-bar'

// ============================================================
// Shared bits
// ============================================================

function InlineLegend() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.actual }} />
        <span className="text-[12px] text-black font-medium">Actual</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.targeted }} />
        <span className="text-[12px] text-black font-medium">Targeted</span>
      </div>
    </div>
  )
}

function CardShell({
  title, legend, children,
}: {
  title: string
  legend?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-4">
        <p className="text-[15px] font-semibold text-black tracking-tight leading-snug">{title}</p>
        {legend}
      </div>
      {children}
    </div>
  )
}

interface MetricProps {
  title: string
  actual: number
  targeted: number
  formatValue: (n: number) => string
  domainMax?: number
  /** For percentage-style metrics (PR, CUF) where 0-100 is the natural ceiling for a gauge */
  isPercent?: boolean
}

// ============================================================
// VARIANT 1 — Grouped bars (current / original)
// ============================================================

function GroupedBarsCard({ title, actual, targeted, formatValue, domainMax }: MetricProps) {
  const data = [
    { name: 'Actual', value: actual, fill: COLORS.actual },
    { name: 'Targeted', value: targeted, fill: COLORS.targeted },
  ]
  return (
    <CardShell title={title} legend={<InlineLegend />}>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 28, right: 12, left: 12, bottom: 0 }} barCategoryGap="20%" barSize={56}>
            <CartesianGrid stroke="#F1F1F1" vertical={false} />
            <YAxis hide domain={[0, domainMax ?? 'auto']} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: unknown) => {
                  const num = Number(v)
                  return Number.isFinite(num) ? formatValue(num) : ''
                }}
                style={{ fontSize: 15, fontWeight: 700, fill: '#000' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 2 — Horizontal progress bar, target as a tick mark
// (Echoes the Module/Ambient temperature bars already on the page)
// ============================================================

function ProgressBarCard({ title, actual, targeted, formatValue }: MetricProps) {
  const max = Math.max(actual, targeted) * 1.15
  const actualPct = Math.min(100, (actual / max) * 100)
  const targetPct = Math.min(100, (targeted / max) * 100)
  const aboveTarget = actual >= targeted
  const ratioPct = targeted > 0 ? (actual / targeted) * 100 : 0

  return (
    <CardShell title={title}>
      <div className="flex flex-col justify-center h-[200px] gap-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[32px] font-semibold text-black tracking-tight tabular-nums leading-none">
            {formatValue(actual)}
          </span>
          <span
            className="text-[13px] font-semibold tabular-nums"
            style={{ color: aboveTarget ? COLORS.targeted : COLORS.actual }}
          >
            {ratioPct.toFixed(0)}% of target
          </span>
        </div>

        <div className="relative h-2.5 bg-black/5 rounded-full overflow-visible">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${actualPct}%`, background: COLORS.actual }}
          />
          {/* target tick */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-black/70"
            style={{ left: `calc(${targetPct}% - 1.5px)` }}
          />
        </div>

        <div className="flex items-center justify-between text-[12px] text-black/50 font-medium">
          <span>0</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-black/70" />
            <span>Target · {formatValue(targeted)}</span>
          </div>
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 3 — Stat + delta (no chart, finance-dashboard style)
// ============================================================

function StatDeltaCard({ title, actual, targeted, formatValue }: MetricProps) {
  const diff = actual - targeted
  const diffPct = targeted !== 0 ? (diff / targeted) * 100 : 0
  const positive = diff >= 0

  return (
    <CardShell title={title}>
      <div className="flex flex-col justify-center h-[200px] gap-3">
        <span className="text-[42px] font-semibold text-black tracking-tight tabular-nums leading-none">
          {formatValue(actual)}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
            style={{
              color: positive ? COLORS.targeted : '#dc2626',
              background: positive ? 'rgba(73,125,0,0.08)' : 'rgba(220,38,38,0.08)',
            }}
          >
            {positive ? '▲' : '▼'} {Math.abs(diffPct).toFixed(1)}%
          </span>
          <span className="text-[13px] text-black/50">vs target {formatValue(targeted)}</span>
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 4 — Radial gauge (same shape language as Active Power dial)
// ============================================================

function RadialGaugeCard({ title, actual, targeted, formatValue, isPercent }: MetricProps) {
  // For percent metrics, gauge maxes at 100. For kWh, gauge maxes at a headroom above target.
  const gaugeMax = isPercent ? 100 : Math.max(actual, targeted) * 1.2
  const actualClamped = Math.min(actual, gaugeMax)
  const targetAngleRatio = Math.min(1, targeted / gaugeMax)

  const data = [{ name: 'actual', value: actualClamped, fill: COLORS.actual }]

  // 270° sweep, startAngle 225 -> endAngle -45, matches existing Active Power gauge
  const START = 225
  const END = -45
  const targetAngle = START + (START - END) * targetAngleRatio

  return (
    <CardShell title={title}>
      <div className="relative h-[200px] w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChartInline data={data} gaugeMax={gaugeMax} targetAngle={targetAngle} />
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[26px] font-semibold text-black tracking-tight tabular-nums leading-none">
            {formatValue(actual)}
          </span>
          <span className="text-[11px] text-black/50 font-medium mt-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-black/70 inline-block" />
            Target {formatValue(targeted)}
          </span>
        </div>
      </div>
    </CardShell>
  )
}

// Small internal wrapper so we can draw the target tick mark on top of the arc.
// Reimplemented with raw SVG for full control over the target indicator, since
// Recharts RadialBar doesn't expose a clean way to draw a second marker on the same track.
function RadialBarChartInline({
  data, gaugeMax, targetAngle,
}: {
  data: { name: string; value: number; fill: string }[]
  gaugeMax: number
  targetAngle: number
}) {
  const size = 200
  const cx = size / 2
  const cy = size / 2
  const r = 78
  const strokeWidth = 14

  const START = 225
  const END = -45
  const value = data[0]?.value ?? 0
  const ratio = gaugeMax > 0 ? Math.min(1, value / gaugeMax) : 0
  const sweepAngle = START - (START - END) * ratio

  function polar(angleDeg: number, radius: number) {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }
  }

  function arcPath(startDeg: number, endDeg: number, radius: number) {
    const start = polar(startDeg, radius)
    const end = polar(endDeg, radius)
    const largeArc = startDeg - endDeg > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  const trackPath = arcPath(START, END, r)
  const valuePath = arcPath(START, sweepAngle, r)
  const targetTickInner = polar(targetAngle, r - strokeWidth / 2 - 4)
  const targetTickOuter = polar(targetAngle, r + strokeWidth / 2 + 4)

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
      <path d={trackPath} fill="none" stroke="#F1F1F1" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d={valuePath} fill="none" stroke={data[0]?.fill ?? COLORS.actual} strokeWidth={strokeWidth} strokeLinecap="round" />
      <line
        x1={targetTickInner.x} y1={targetTickInner.y}
        x2={targetTickOuter.x} y2={targetTickOuter.y}
        stroke="#000" strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round"
      />
    </svg>
  )
}

// ============================================================
// VARIANT 5 — Bullet chart (Tufte-style, slim horizontal bars stacked)
// ============================================================

function BulletCard({ title, actual, targeted, formatValue }: MetricProps) {
  const max = Math.max(actual, targeted) * 1.15
  const actualPct = Math.min(100, (actual / max) * 100)
  const targetPct = Math.min(100, (targeted / max) * 100)

  return (
    <CardShell title={title}>
      <div className="flex flex-col justify-center h-[200px] gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] uppercase tracking-[0.1em] text-black/50 font-semibold w-14 shrink-0">Actual</span>
          <span className="text-[16px] font-semibold text-black tabular-nums">{formatValue(actual)}</span>
        </div>
        <div className="relative h-3 bg-black/[0.04] rounded-sm overflow-visible">
          <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${actualPct}%`, background: COLORS.actual }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[2px] h-5 bg-black"
            style={{ left: `calc(${targetPct}% - 1px)` }}
          />
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] uppercase tracking-[0.1em] text-black/50 font-semibold w-14 shrink-0">Target</span>
          <span className="text-[16px] font-semibold text-black/60 tabular-nums">{formatValue(targeted)}</span>
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 6 — Single bar with target reference line overlay
// ============================================================

function TargetLineCard({ title, actual, targeted, formatValue, domainMax }: MetricProps) {
  const data = [{ name: 'Actual', value: actual, fill: COLORS.actual }]
  const max = domainMax ?? Math.max(actual, targeted) * 1.3

  return (
    <CardShell title={title}>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 28, right: 32, left: 12, bottom: 0 }} barCategoryGap="20%" barSize={72}>
            <CartesianGrid stroke="#F1F1F1" vertical={false} />
            <YAxis hide domain={[0, max]} />
            <ReferenceLine
              y={targeted}
              stroke="#000"
              strokeOpacity={0.6}
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{
                value: `Target ${formatValue(targeted)}`,
                position: 'right',
                fill: '#000',
                fillOpacity: 0.6,
                fontSize: 12,
                fontWeight: 600,
              }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              <Cell fill={COLORS.actual} />
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: unknown) => {
                  const num = Number(v)
                  return Number.isFinite(num) ? formatValue(num) : ''
                }}
                style={{ fontSize: 15, fontWeight: 700, fill: '#000' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 7 — Concentric arcs (both actual + target visible at once)
// ============================================================

function ConcentricArcsCard({ title, actual, targeted, formatValue, isPercent }: MetricProps) {
  const gaugeMax = isPercent ? 100 : Math.max(actual, targeted) * 1.2
  const actualRatio = Math.min(1, Math.max(0, gaugeMax > 0 ? actual / gaugeMax : 0))
  const targetRatio = Math.min(1, Math.max(0, gaugeMax > 0 ? targeted / gaugeMax : 0))

  const size = 200
  const cx = size / 2
  const cy = size / 2
  const rOuter = 82
  const rInner = 60
  const stroke = 11
  const START = 225
  const END = -45
  const range = START - END // 270

  const actualEnd = START - range * actualRatio
  const targetEnd = START - range * targetRatio

  function polar(deg: number, r: number) {
    const rad = (deg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
  }
  function arc(startDeg: number, endDeg: number, r: number) {
    const s = polar(startDeg, r)
    const e = polar(endDeg, r)
    const large = startDeg - endDeg > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
  }

  return (
    <CardShell title={title}>
      <div className="relative h-[200px] w-full flex items-center justify-center">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          {/* Outer track + actual */}
          <path d={arc(START, END, rOuter)} fill="none" stroke="#F1F1F1" strokeWidth={stroke} strokeLinecap="round" />
          {actualRatio > 0.001 && (
            <path d={arc(START, actualEnd, rOuter)} fill="none" stroke={COLORS.actual} strokeWidth={stroke} strokeLinecap="round" />
          )}
          {/* Inner track + target */}
          <path d={arc(START, END, rInner)} fill="none" stroke="#F1F1F1" strokeWidth={stroke} strokeLinecap="round" />
          {targetRatio > 0.001 && (
            <path d={arc(START, targetEnd, rInner)} fill="none" stroke={COLORS.targeted} strokeWidth={stroke} strokeLinecap="round" />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[22px] font-semibold text-black tracking-tight tabular-nums leading-none">
            {formatValue(actual)}
          </span>
          <span className="text-[11px] text-[#497d00] font-medium mt-1.5">
            of {formatValue(targeted)}
          </span>
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 8 — Half-donut speedometer (180° arc + needle)
// ============================================================

function SpeedometerCard({ title, actual, targeted, formatValue, isPercent }: MetricProps) {
  const gaugeMax = isPercent ? 100 : Math.max(actual, targeted) * 1.2
  const actualRatio = Math.min(1, Math.max(0, gaugeMax > 0 ? actual / gaugeMax : 0))
  const targetRatio = Math.min(1, Math.max(0, gaugeMax > 0 ? targeted / gaugeMax : 0))

  const size = 200
  const cx = size / 2
  const cy = size * 0.68
  const r = 76
  const stroke = 12
  const START = 180
  const END = 0

  const actualAngle = START - (START - END) * actualRatio
  const targetAngle = START - (START - END) * targetRatio

  function polar(deg: number, radius: number) {
    const rad = (deg * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) }
  }
  function arc(startDeg: number, endDeg: number, radius: number) {
    const s = polar(startDeg, radius)
    const e = polar(endDeg, radius)
    const large = startDeg - endDeg > 180 ? 1 : 0
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`
  }

  const trackPath = arc(START, END, r)
  const valuePath = arc(START, actualAngle, r)
  const targetInner = polar(targetAngle, r - stroke / 2 - 3)
  const targetOuter = polar(targetAngle, r + stroke / 2 + 3)
  const needleTip = polar(actualAngle, r - 18)

  return (
    <CardShell title={title}>
      <div className="relative h-[200px] w-full flex items-end justify-center">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
          <path d={trackPath} fill="none" stroke="#F1F1F1" strokeWidth={stroke} strokeLinecap="round" />
          {actualRatio > 0.001 && (
            <path d={valuePath} fill="none" stroke={COLORS.actual} strokeWidth={stroke} strokeLinecap="round" />
          )}
          {/* Target tick on the arc */}
          <line
            x1={targetInner.x} y1={targetInner.y}
            x2={targetOuter.x} y2={targetOuter.y}
            stroke={COLORS.targeted} strokeWidth={3} strokeLinecap="round"
          />
          {/* Needle */}
          <line x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y} stroke="#000" strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={5} fill="#000" />
          <circle cx={cx} cy={cy} r={2} fill="#fff" />
        </svg>
        <div className="absolute inset-x-0 bottom-2 flex flex-col items-center pointer-events-none">
          <span className="text-[22px] font-semibold text-black tracking-tight tabular-nums leading-none">
            {formatValue(actual)}
          </span>
          <span className="text-[11px] text-black/50 font-medium mt-1 flex items-center gap-1.5">
            <span className="w-2 h-[2px]" style={{ background: COLORS.targeted }} />
            Target {formatValue(targeted)}
          </span>
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 9 — Vertical thermometer (fills upward, target line across)
// ============================================================

function ThermometerCard({ title, actual, targeted, formatValue, isPercent }: MetricProps) {
  const max = isPercent ? 100 : Math.max(actual, targeted) * 1.15
  const actualPct = Math.min(100, Math.max(0, (actual / max) * 100))
  const targetPct = Math.min(100, Math.max(0, (targeted / max) * 100))
  const aboveTarget = actual >= targeted

  return (
    <CardShell title={title}>
      <div className="flex items-center justify-center gap-6 h-[200px]">
        {/* Vertical fill column */}
        <div className="relative w-9 h-[160px] bg-black/[0.04] rounded-md overflow-hidden shrink-0">
          <div
            className="absolute bottom-0 left-0 right-0 transition-all"
            style={{ height: `${actualPct}%`, background: COLORS.actual }}
          />
          {/* Target line across the whole column */}
          <div
            className="absolute left-[-8px] right-[-8px] h-[2px] bg-black"
            style={{ bottom: `calc(${targetPct}% - 1px)` }}
          />
        </div>
        {/* Labels column */}
        <div className="flex flex-col gap-4 min-w-0">
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold mb-1">Actual</p>
            <p className="text-[20px] font-semibold text-black tabular-nums leading-none">
              {formatValue(actual)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold mb-1">Target</p>
            <p className="text-[15px] font-medium text-black/60 tabular-nums leading-none">
              {formatValue(targeted)}
            </p>
          </div>
          <p
            className="text-[11px] font-semibold"
            style={{ color: aboveTarget ? COLORS.targeted : COLORS.actual }}
          >
            {aboveTarget ? '▲' : '▼'} {targeted > 0 ? Math.abs(((actual - targeted) / targeted) * 100).toFixed(1) : '—'}%
          </p>
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 10 — Segmented notches (battery-style, target segment outlined)
// ============================================================

function SegmentedCard({ title, actual, targeted, formatValue, isPercent }: MetricProps) {
  const SEGMENTS = 10
  const max = isPercent ? 100 : Math.max(actual, targeted) * 1.15
  const filled = Math.min(SEGMENTS, Math.round((actual / max) * SEGMENTS))
  const targetSegment = Math.min(SEGMENTS, Math.max(1, Math.round((targeted / max) * SEGMENTS)))
  const ratioPct = targeted > 0 ? (actual / targeted) * 100 : 0
  const aboveTarget = actual >= targeted

  return (
    <CardShell title={title}>
      <div className="flex flex-col justify-center h-[200px] gap-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[26px] font-semibold text-black tracking-tight tabular-nums leading-none">
            {formatValue(actual)}
          </span>
          <span
            className="text-[13px] font-semibold tabular-nums"
            style={{ color: aboveTarget ? COLORS.targeted : COLORS.actual }}
          >
            {ratioPct.toFixed(0)}% of target
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const isFilled = i < filled
            const isTarget = i + 1 === targetSegment
            return (
              <div
                key={i}
                className="flex-1 h-6 rounded-sm"
                style={{
                  background: isFilled ? COLORS.actual : '#F1F1F1',
                  boxShadow: isTarget ? `inset 0 0 0 2px ${COLORS.targeted}` : undefined,
                }}
              />
            )
          })}
        </div>
        <div className="flex items-center justify-between text-[11px] text-black/50 font-medium">
          <span>0</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 border-2 rounded-sm" style={{ borderColor: COLORS.targeted }} />
            <span>Target · {formatValue(targeted)}</span>
          </div>
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 11 — Diverging gap (bar centered on target, extends over/under)
// ============================================================

function DivergingCard({ title, actual, targeted, formatValue }: MetricProps) {
  const diff = actual - targeted
  const diffPct = targeted !== 0 ? (diff / targeted) * 100 : 0
  const positive = diff >= 0
  // Half-bar represents a 100% swing from target
  const scaleMax = Math.abs(targeted) || 1
  const barWidthPct = Math.min(50, (Math.abs(diff) / scaleMax) * 50)

  return (
    <CardShell title={title}>
      <div className="flex flex-col justify-center h-[200px] gap-5">
        <div className="text-center">
          <p className="text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold mb-1.5">
            {positive ? 'Above target' : 'Below target'}
          </p>
          <p
            className="text-[30px] font-semibold tabular-nums leading-none"
            style={{ color: positive ? COLORS.targeted : COLORS.actual }}
          >
            {positive ? '+' : '−'}{formatValue(Math.abs(diff))}
          </p>
          <p className="text-[12px] text-black/50 mt-2 tabular-nums">
            {positive ? '+' : '−'}{Math.abs(diffPct).toFixed(1)}% vs {formatValue(targeted)}
          </p>
        </div>
        <div className="relative h-3">
          <div className="absolute inset-y-0 left-0 right-0 bg-black/[0.04] rounded-sm" />
          {positive ? (
            <div
              className="absolute inset-y-0 rounded-r-sm"
              style={{ left: '50%', width: `${barWidthPct}%`, background: COLORS.targeted }}
            />
          ) : (
            <div
              className="absolute inset-y-0 rounded-l-sm"
              style={{ left: `${50 - barWidthPct}%`, width: `${barWidthPct}%`, background: COLORS.actual }}
            />
          )}
          {/* Center target line — rendered last so it sits on top */}
          <div className="absolute left-1/2 -top-1 -bottom-1 w-[2px] bg-black -translate-x-1/2" />
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// VARIANT 12 — Zone bar (performance-tier backgrounds behind the fill)
// ============================================================

function ZoneBarCard({ title, actual, targeted, formatValue }: MetricProps) {
  const max = Math.max(actual, targeted) * 1.2
  const actualPct = Math.min(100, (actual / max) * 100)
  const zone70 = ((targeted * 0.7) / max) * 100
  const zone100 = (targeted / max) * 100

  let status: string
  let statusColor: string
  if (actual >= targeted) { status = 'On target'; statusColor = COLORS.targeted }
  else if (actual >= targeted * 0.9) { status = 'Near target'; statusColor = COLORS.actual }
  else if (actual >= targeted * 0.7) { status = 'Behind'; statusColor = COLORS.actual }
  else { status = 'Well behind'; statusColor = '#dc2626' }

  return (
    <CardShell title={title}>
      <div className="flex flex-col justify-center h-[200px] gap-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[26px] font-semibold text-black tracking-tight tabular-nums leading-none">
            {formatValue(actual)}
          </span>
          <span className="text-[13px] font-semibold" style={{ color: statusColor }}>
            {status}
          </span>
        </div>
        <div className="relative h-6 rounded-md overflow-hidden">
          {/* Zones background */}
          <div className="absolute inset-0 flex">
            <div style={{ width: `${zone70}%`, background: 'rgba(220,38,38,0.09)' }} />
            <div style={{ width: `${zone100 - zone70}%`, background: 'rgba(225,113,0,0.10)' }} />
            <div style={{ width: `${100 - zone100}%`, background: 'rgba(73,125,0,0.10)' }} />
          </div>
          {/* Actual fill */}
          <div className="absolute inset-y-0 left-0" style={{ width: `${actualPct}%`, background: COLORS.actual }} />
          {/* Target line at zone boundary */}
          <div className="absolute inset-y-0 w-[2px] bg-black" style={{ left: `calc(${zone100}% - 1px)` }} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-black/50 font-medium">
          <span>Behind · Near · On target</span>
          <span>Target · {formatValue(targeted)}</span>
        </div>
      </div>
    </CardShell>
  )
}

// ============================================================
// Router — picks the right variant per style
// ============================================================

function ComparisonCard(props: MetricProps & { style: ComparisonStyle }) {
  switch (props.style) {
    case 'progress-bar': return <ProgressBarCard {...props} />
    case 'stat-delta': return <StatDeltaCard {...props} />
    case 'radial-gauge': return <RadialGaugeCard {...props} />
    case 'bullet': return <BulletCard {...props} />
    case 'target-line': return <TargetLineCard {...props} />
    case 'concentric-arcs': return <ConcentricArcsCard {...props} />
    case 'speedometer': return <SpeedometerCard {...props} />
    case 'thermometer': return <ThermometerCard {...props} />
    case 'segmented': return <SegmentedCard {...props} />
    case 'diverging': return <DivergingCard {...props} />
    case 'zone-bar': return <ZoneBarCard {...props} />
    case 'grouped-bars':
    default: return <GroupedBarsCard {...props} />
  }
}

// ============================================================
// Style switcher — dev-only control to A/B the variants live
// ============================================================

const STYLE_OPTIONS: { value: ComparisonStyle; label: string }[] = [
  { value: 'grouped-bars', label: '1 · Grouped bars' },
  { value: 'progress-bar', label: '2 · Progress bar' },
  { value: 'stat-delta', label: '3 · Stat + delta' },
  { value: 'radial-gauge', label: '4 · Radial gauge' },
  { value: 'bullet', label: '5 · Bullet' },
  { value: 'target-line', label: '6 · Target line' },
  { value: 'concentric-arcs', label: '7 · Concentric arcs' },
  { value: 'speedometer', label: '8 · Speedometer' },
  { value: 'thermometer', label: '9 · Thermometer' },
  { value: 'segmented', label: '10 · Segmented' },
  { value: 'diverging', label: '11 · Diverging' },
  { value: 'zone-bar', label: '12 · Zone bar' },
]

function StyleSwitcher({ value, onChange }: { value: ComparisonStyle; onChange: (s: ComparisonStyle) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-6 p-1 bg-black/[0.03] rounded-lg w-fit">
      {STYLE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-[12px] font-medium px-2.5 py-1.5 rounded-md transition-colors ${
            value === opt.value
              ? 'bg-white text-black shadow-sm'
              : 'text-black/50 hover:text-black'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ============================================================
// Export
// ============================================================

export function GenerationCards({
  actualToday,
  performanceRatio,
  cuf,
  defaultStyle = 'grouped-bars',
  showSwitcher = true,
}: {
  actualToday: number
  performanceRatio: number
  cuf: number
  defaultStyle?: ComparisonStyle
  showSwitcher?: boolean
}) {
  const [style, setStyle] = useState<ComparisonStyle>(defaultStyle)

  return (
    <div>
      {showSwitcher && <StyleSwitcher value={style} onChange={setStyle} />}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-0 lg:divide-x lg:divide-black/15">
        <div className="lg:pr-8 min-w-0">
          <ComparisonCard
            style={style}
            title="Generation"
            actual={actualToday}
            targeted={5500}
            formatValue={(n) => `${n.toLocaleString()}\u00A0kWh`}
            domainMax={Math.max(actualToday, 5500) * 1.25}
          />
        </div>
        <div className="lg:px-8 min-w-0">
          <ComparisonCard
            style={style}
            title="Performance Ratio"
            actual={performanceRatio}
            targeted={79.4}
            formatValue={(n) => `${n.toFixed(1)}%`}
            domainMax={100}
            isPercent
          />
        </div>
        <div className="lg:pl-8 min-w-0">
          <ComparisonCard
            style={style}
            title="Capacity Utilisation Factor"
            actual={cuf}
            targeted={21.9}
            formatValue={(n) => `${n.toFixed(1)}%`}
            domainMax={Math.max(cuf, 21.9) * 1.3}
            isPercent
          />
        </div>
      </div>
    </div>
  )
}