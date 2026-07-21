import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Sun, Clock, Maximize2, Minimize2, RefreshCw, Power, Cpu,TrendingUp, Leaf
} from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import {
  Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Line, ComposedChart, Tooltip, BarChart, Bar, LabelList,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'
import { useAutoRefresh } from '@/api/useAutoRefresh'
// ============================================================
// TYPE SCALE — every text style on the page is one of these.
// Keep the page disciplined: never freehand a text-[XXpx] outside this list.
// ============================================================
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  body:         'text-[14px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
  metricXL:     'text-[38px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricL:      'text-[22px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricM:      'text-[15px] font-semibold text-black tabular-nums leading-none',
  unit:         'text-[13px] text-black font-medium',
}

const TEMP_GRADIENT =
  'linear-gradient(to right, #6b7280 0%, #497d00 40%, #e17100 60%, #e17100 100%)'

// ---- Types ----

interface PlantOverview {
  site: string
  customer: string
  last_updated: string
  plant: {
    active_power_kw: number
    energy_today_kwh: number
    energy_active_export_kwh: number
    frequency_hz: number
    power_factor: number
    ac_capacity_kw: number
    dc_capacity_kw: number
    daily_generation_target_kwh: number | null
  }
  grid: {
    voltage_ab: number
    voltage_bc: number
    voltage_ca: number
    current_a: number
    current_b: number
    current_c: number
  }
  inverters: {
    device_id: string
    name: string
    active_power_kw: number
    daily_gen_kwh: number
    status: string
    last_updated: string
  }[]
  device_summary: {
    total: number
    online: number
    offline: number
  }
  weather: {
    irradiation_inclined_wm2: number
    ambient_temp_c: number
    module_temp_c: number
    status: string
  } | null
  performance: {
    performance_ratio_pct: number
    cuf_pct: number
    poa_irradiation_kwh_m2: number
    dc_power_total_kw: number
    co2_avoided_today_kg: number
  } | null
  breaker_status: string | null
}

interface PowerTrendPoint {
  time: string
  active_power_total_kw: number
  irradiation_inclined_wm2: number
}

interface PowerTrendData {
  data: PowerTrendPoint[]
  stats: {
    active_power_total_kw: { max: number; mean: number; last: number }
    irradiation_inclined_wm2: { max: number; mean: number; last: number }
  } | null
}

interface ElecTrendPoint {
  time: string
  voltage_line_ab_v: number
  voltage_line_bc_v: number
  voltage_line_ca_v: number
  current_phase_a: number
  current_phase_b: number
  current_phase_c: number
  grid_frequency_hz: number
}

type ElecStat = { min: number; max: number; last: number }

interface ElecTrendStats {
  voltage_line_ab_v: ElecStat
  voltage_line_bc_v: ElecStat
  voltage_line_ca_v: ElecStat
  current_phase_a: ElecStat
  current_phase_b: ElecStat
  current_phase_c: ElecStat
  grid_frequency_hz: ElecStat
}

interface ElecTrendData {
  data: ElecTrendPoint[]
  stats: ElecTrendStats | null
}

interface DailyEnergyPoint {
  date: string
  energy_kwh: number
}

interface DailyEnergyData {
  site: string
  days: number
  data: DailyEnergyPoint[]
}

// ---- Helpers ----

/** Minutes elapsed since IST midnight of `day` (YYYY-MM-DD). Absolute — never wraps. */
function minutesFromIstDayStart(iso: string, day: string) {
  const dayStartMs = Date.parse(`${day}T00:00:00+05:30`)
  return (Date.parse(iso) - dayStartMs) / 60000
}

function formatMinutesTick(minutes: number) {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const DAY_TICKS = [0, 180, 360, 540, 720, 900, 1080, 1260, 1440]
const DAY_TICKS_MOBILE = [0, 360, 720, 1080, 1440]

function formatLastUpdated(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function formatDateTick(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ============================================================
// Small building blocks — always use these, never freehand
// ============================================================

// Section header: colored accent bar + title + optional meta + optional right-side actions.
// On mobile: actions wrap to a second row aligned right (via ml-auto).
function SectionHeader({
  title, meta, accent = 'orange', actions, status,
}: {
  title: string
  meta?: string
  accent?: 'orange' | 'olive' | 'none'
  actions?: React.ReactNode
  status?: { label: string; online: boolean }
}) {
  const bar =
    accent === 'orange' ? 'bg-[#e17100]' :
    accent === 'olive' ? 'bg-[#497d00]' : 'bg-black'
  return (
    <div className="flex items-stretch justify-between flex-wrap gap-3 mb-5">
      <div className="flex items-stretch gap-3 min-w-0">
        {accent !== 'none' && (
          <span className={`w-1 rounded-full ${bar} shrink-0 self-stretch`} />
        )}
        <div className="min-w-0">
          <h2 className={T.sectionTitle}>{title}</h2>
          <div className="flex items-center gap-2 mt-1">
            {meta && <p className={T.meta}>{meta}</p>}
            {status && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: status.online ? '#497d00' : '#dc2626' }}
                />
                <span style={{ color: status.online ? '#497d00' : '#dc2626' }}>
                  {status.label}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 ml-auto shrink-0">{actions}</div>
      )}
    </div>
  )
}
// A page-wide horizontal divider used between sections
function Divider() {
  return <div className="h-px w-full bg-black/15" />
}

// Status chip — proper pill with unified height so mixed icon/text sizes
// don't visually stagger. Border + bg gives it a coherent silhouette.
function StatusChip({
  label, value, healthy, icon: Icon,
}: {
  label: string
  value: string
  healthy: boolean | null
  icon: React.ElementType
}) {
  const dot = healthy === null ? 'bg-black' : healthy ? 'bg-green-500' : 'bg-red-500'
  const tone = healthy === null ? 'text-black' : healthy ? 'text-green-700' : 'text-red-600'
  return (
    <div className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full border border-black/15 bg-white shrink-0">
      <Icon size={13} className="text-black shrink-0" strokeWidth={2} />
      <span className="text-[11px] uppercase tracking-[0.1em] text-black font-semibold">{label}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`text-[13px] font-semibold ${tone} tabular-nums whitespace-nowrap`}>{value}</span>
    </div>
  )
}

// Live-data indicator: green dot + label when fresh, red "Offline" when stale.
// Uses a 30s local ticker so the badge flips to Offline even if no new fetch lands
// (e.g. tab was idle, or the API stopped responding).
function LiveDataIndicator({ lastUpdated }: { lastUpdated: string | null | undefined }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const STALE_MS = 5 * 60 * 1000
  const isLive = !!lastUpdated && (Date.now() - new Date(lastUpdated).getTime()) < STALE_MS

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isLive ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`}
      />
      <span
        className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
          isLive ? 'text-green-700' : 'text-red-600'
        }`}
      >
        {isLive ? 'Live data' : 'Offline'}
      </span>
    </span>
  )
}

// ============================================================
// Performance comparison — zone bar (actual vs target)
// ============================================================

const PERF_COLORS = {
  actual: '#e17100',
  targeted: '#497d00',
}

function PerformanceZoneCard({
  title, actual, targeted, formatValue,
}: {
  title: string
  actual: number
  targeted: number
  formatValue: (n: number) => string
}) {
  const max = Math.max(actual, targeted) * 1.2
  const actualPct = Math.min(100, (actual / max) * 100)
  const zone70 = ((targeted * 0.7) / max) * 100
  const zone100 = (targeted / max) * 100

  let status: string
  let statusColor: string
  if (actual >= targeted) { status = 'On target'; statusColor = PERF_COLORS.targeted }
  else if (actual >= targeted * 0.9) { status = 'Near target'; statusColor = PERF_COLORS.actual }
  else if (actual >= targeted * 0.7) { status = 'Behind'; statusColor = PERF_COLORS.actual }
  else { status = 'Well behind'; statusColor = '#dc2626' }

  return (
    <div className="flex flex-col min-w-0">
      <p className="text-[15px] font-semibold text-black tracking-tight leading-snug mb-4">{title}</p>
      <div className="flex flex-col justify-center h-[90px] md:h-[200px] gap-4">
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
          {/* Actual fill — orange up to target, green for the overshoot beyond target */}
          {actual >= targeted ? (
            <>
              <div
                className="absolute inset-y-0 left-0"
                style={{ width: `${zone100}%`, background: PERF_COLORS.actual }}
              />
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${zone100}%`,
                  width: `${actualPct - zone100}%`,
                  background: PERF_COLORS.targeted,
                }}
              />
            </>
          ) : (
            <div
              className="absolute inset-y-0 left-0"
              style={{ width: `${actualPct}%`, background: PERF_COLORS.actual }}
            />
          )}
          {/* Target line at zone boundary */}
          <div className="absolute inset-y-0 w-[2px] bg-black" style={{ left: `calc(${zone100}% - 1px)` }} />
        </div>
        <div className="flex items-center justify-end text-[11px] text-black/50 font-medium">
          <span>Target · {formatValue(targeted)}</span>
        </div>
      </div>
    </div>
  )
}

function PowerTrendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const t = payload[0]?.payload?.time
  return (
    <div className="rounded-lg border border-black bg-white px-3 py-2 min-w-[160px]">
      <p className="text-[12px] font-semibold text-black mb-1.5">
        {typeof t === 'number' ? formatMinutesTick(t) : ''}
      </p>
      {payload.map((e: any) => (
        <div key={e.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
          <span className="text-[12px] text-black/50">{e.name}</span>
          <span className="text-[12px] font-semibold tabular-nums text-black ml-auto">
            {e.value == null ? '—' : Number(e.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </span>
          <span className="text-[11px] text-black/50 w-9 text-right">
            {e.dataKey === 'power' ? 'kW' : 'W/m²'}
          </span>
        </div>
      ))}
    </div>
  )
}

const ELEC_UNITS: Record<string, { unit: string; dp: number }> = {
  voltage: { unit: 'kV', dp: 2 },
  current: { unit: 'A', dp: 1 },
  frequency: { unit: 'Hz', dp: 2 },
}

function elecUnitFor(dataKey: string) {
  if (dataKey.startsWith('voltage')) return ELEC_UNITS.voltage
  if (dataKey.startsWith('current')) return ELEC_UNITS.current
  return ELEC_UNITS.frequency
}

function ElectricalTrendTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const t = payload[0]?.payload?.time
  return (
    <div className="rounded-lg border border-black bg-white px-3 py-2 min-w-[190px]">
      <p className="text-[12px] font-semibold text-black mb-1.5">
        {typeof t === 'number' ? formatMinutesTick(t) : ''}
      </p>
      {payload.map((e: any) => {
        const u = elecUnitFor(e.dataKey as string)
        return (
          <div key={e.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
            <span className="text-[12px] text-black/50">{e.name}</span>
            <span className="text-[12px] font-semibold tabular-nums text-black ml-auto">
              {e.value == null ? '—' : Number(e.value).toFixed(u.dp)}
            </span>
            <span className="text-[11px] text-black/50 w-9 text-right">{u.unit}</span>
          </div>
        )
      })}
    </div>
  )
}

function PerformanceCards({
  actualToday, generationTarget, performanceRatio, cuf,
}: {
  actualToday: number
  generationTarget: number
  performanceRatio: number
  cuf: number
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-0 lg:divide-x lg:divide-black/15">
      <div className="lg:pr-8 min-w-0">
        <PerformanceZoneCard
          title="Generation"
          actual={actualToday}
          targeted={generationTarget}
          formatValue={(n) => `${n.toLocaleString()}\u00A0kWh`}
        />
      </div>
      <div className="lg:px-8 min-w-0">
        <PerformanceZoneCard
          title="Performance Ratio"
          actual={performanceRatio}
          targeted={79.4}
          formatValue={(n) => `${n.toFixed(1)}%`}
        />
      </div>
      <div className="lg:pl-8 min-w-0">
        <PerformanceZoneCard
          title="Capacity Utilisation Factor"
          actual={cuf}
          targeted={21.9}
          formatValue={(n) => `${n.toFixed(1)}%`}
        />
      </div>
    </div>
  )
}

// ============================================================
// Animated Sun — the playful centerpiece, ported from WeatherPage.
// Rays grow, brighten, and rotate based on irradiance.
// At low irradiance it becomes a subtle moon + stars (night mode).
// ============================================================
function AnimatedSun({ irradiance, isOffline = false }: { irradiance: number; isOffline?: boolean }) {
  const isNight = irradiance <= 10
  const intensityPct = Math.min(1, irradiance / 1000)
  const rayLength = 8 + intensityPct * 10
  const rayOpacity = 0.35 + intensityPct * 0.6
  const coreSize = 32 + intensityPct * 6

  if (isOffline) {
    return (
      <div className="relative w-[160px] h-[160px] flex items-center justify-center">
        <svg viewBox="0 0 160 160" className="absolute inset-0 w-full h-full">
          {[...Array(12)].map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180
            const innerR = 32 / 2 + 6
            const outerR = innerR + 8
            const x1 = 80 + innerR * Math.cos(angle)
            const y1 = 80 + innerR * Math.sin(angle)
            const x2 = 80 + outerR * Math.cos(angle)
            const y2 = 80 + outerR * Math.sin(angle)
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#D4D4D4" strokeWidth={2.5} strokeLinecap="round" />
            )
          })}
        </svg>
        <div
          className="rounded-full flex items-center justify-center"
          style={{ width: 32 * 1.6, height: 32 * 1.6, background: '#E5E5E5' }}
        >
          <Sun size={32 * 0.65} className="text-black/30" strokeWidth={1.5} />
        </div>
      </div>
    )
  }

  if (isNight) {
    const stars = [
      { cx: 24, cy: 34, r: 1.8, delay: '0s' },
      { cx: 136, cy: 28, r: 1.4, delay: '0.7s' },
      { cx: 18, cy: 112, r: 1.5, delay: '1.4s' },
      { cx: 142, cy: 104, r: 1.9, delay: '0.4s' },
      { cx: 50, cy: 146, r: 1.3, delay: '1.8s' },
      { cx: 116, cy: 140, r: 1.4, delay: '1.1s' },
      { cx: 82, cy: 18, r: 1.2, delay: '2.1s' },
      { cx: 8, cy: 72, r: 1.1, delay: '0.9s' },
      { cx: 150, cy: 66, r: 1.2, delay: '1.6s' },
    ]
    return (
      <div className="relative w-[160px] h-[160px] flex items-center justify-center">
        <div
          className="absolute rounded-full"
          style={{
            width: 145, height: 145,
            background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
            animation: 'weatherMoonGlow 5s ease-in-out infinite',
          }}
        />
        <svg viewBox="0 0 160 160" className="absolute inset-0 w-full h-full">
          {stars.map((s, i) => (
            <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#e2e8f0"
              style={{ animation: `weatherStarTwinkle 3s ease-in-out ${s.delay} infinite`,
                       transformOrigin: `${s.cx}px ${s.cy}px` }} />
          ))}
        </svg>
        <div style={{ animation: 'weatherMoonSway 6s ease-in-out infinite', transformOrigin: 'center' }}>
          <svg viewBox="0 0 100 100" width="90" height="90" style={{ transform: 'rotate(-18deg)' }}>
            <defs>
              <radialGradient id="moonPlantSurface" cx="30%" cy="30%" r="75%">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="70%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#64748b" />
              </radialGradient>
              <mask id="moonPlantMask">
                <rect width="100" height="100" fill="white" />
                <circle cx="64" cy="40" r="34" fill="black" />
              </mask>
            </defs>
            <circle cx="50" cy="50" r="34" fill="#1e293b" opacity="0.06" />
            <circle cx="50" cy="50" r="32" fill="url(#moonPlantSurface)" mask="url(#moonPlantMask)" />
            <circle cx="34" cy="60" r="2.5" fill="#94a3b8" opacity="0.35" mask="url(#moonPlantMask)" />
            <circle cx="42" cy="74" r="1.8" fill="#94a3b8" opacity="0.3" mask="url(#moonPlantMask)" />
            <circle cx="28" cy="46" r="1.4" fill="#94a3b8" opacity="0.28" mask="url(#moonPlantMask)" />
          </svg>
        </div>
        <style>{`
          @keyframes weatherMoonSway  { 0%,100% { transform: rotate(-1.5deg) translateY(0); } 50% { transform: rotate(1.5deg) translateY(-2px); } }
          @keyframes weatherMoonGlow  { 0%,100% { opacity: 0.8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
          @keyframes weatherStarTwinkle { 0%,100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        `}</style>
      </div>
    )
  }

  return (
    <div className="relative w-[160px] h-[160px] flex items-center justify-center">
      <div
        className="absolute rounded-full"
        style={{
          width: coreSize * 3.6,
          height: coreSize * 3.6,
          background: `radial-gradient(circle, rgba(225,113,0,${0.15 * intensityPct}) 0%, transparent 70%)`,
          animation: intensityPct > 0.5 ? 'weatherSunPulse 3s ease-in-out infinite' : 'none',
        }}
      />
      <svg
        viewBox="0 0 160 160"
        className="absolute inset-0 w-full h-full"
        style={{ animation: `weatherSunRotate ${30 - intensityPct * 10}s linear infinite` }}
      >
        {[...Array(12)].map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180
          const innerR = coreSize / 2 + 6
          const outerR = innerR + rayLength
          const x1 = 80 + innerR * Math.cos(angle)
          const y1 = 80 + innerR * Math.sin(angle)
          const x2 = 80 + outerR * Math.cos(angle)
          const y2 = 80 + outerR * Math.sin(angle)
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#e17100"
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={rayOpacity}
            />
          )
        })}
      </svg>
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: coreSize * 1.6,
          height: coreSize * 1.6,
          background: `radial-gradient(circle at 30% 30%, #f59e0b, #e17100)`,
          boxShadow: `0 4px 24px rgba(225,113,0,${0.3 + intensityPct * 0.3})`,
        }}
      >
        <Sun size={coreSize * 0.65} className="text-white" strokeWidth={1.5} />
      </div>
      <style>{`
        @keyframes weatherSunRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes weatherSunPulse  { 0%,100% { opacity: 0.8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
      `}</style>
    </div>
  )
}


function irradianceIntensity(w: number, isOffline = false) {
  if (isOffline) return { label: 'Offline', tone: 'text-black/30', pct: 0 }
  if (w >= 800) return { label: 'Peak Sun', tone: 'text-[#e17100]', pct: Math.min(100, (w / 1200) * 100) }
  if (w >= 500) return { label: 'Strong',   tone: 'text-[#e17100]', pct: (w / 1200) * 100 }
  if (w >= 200) return { label: 'Moderate', tone: 'text-[#497d00]', pct: (w / 1200) * 100 }
  if (w >  0)   return { label: 'Low',      tone: 'text-black',    pct: (w / 1200) * 100 }
  return           { label: 'Night',      tone: 'text-black/50', pct: 0 }
}

// Icon button — used for expand/collapse, matches the DatePicker chrome
function IconButton({
  onClick, children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 w-9 flex items-center justify-center border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors shrink-0"
    >
      {children}
    </button>
  )
}

// ============================================================
// Power Gauge — value sits INSIDE the arc (one readout, not two)
// ============================================================
function PowerGauge({
  value, capacity,
}: {
  value: number
  capacity: number
}) {
  const pct = capacity > 0 ? Math.min(100, (value / capacity) * 100) : 0
  const data = [{ name: 'power', value: pct }]
  return (
    <div className="relative w-[200px] h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={225}
          endAngle={-45}
          innerRadius="78%"
          outerRadius="100%"
          barSize={12}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={6}
            fill="#e17100"
            background={{ fill: 'rgba(0,0,0,0.06)' }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className={`${T.metricXL} text-[#e17100]`}>
          {Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: value >= 1000 ? 0 : 1 })}
        </span>
        <span className={`${T.unit} mt-1.5`}>kW</span>
      </div>
    </div>
  )
}

// ============================================================
// Section wrapper (top padding between sections)
// ============================================================
function Section({
  children,
}: {
  children: React.ReactNode
}) {
  return <section className="pt-6">{children}</section>
}

// ============================================================
// Power Trend
// ============================================================
function PowerTrendCard({
  chartData, trendLoading, selectedDate, setSelectedDate,
  stats, expanded, onToggle, height, isMobile,
}: {
  chartData: { time: number; power: number | null; irradiation: number | null }[]
  trendLoading: boolean
  selectedDate: string
  setSelectedDate: (d: string) => void
  stats: PowerTrendData['stats']
  expanded: boolean
  onToggle: () => void
  height: string
  isMobile: boolean
}) {
  return (
    <div className={expanded ? 'px-6 pt-5 pb-5' : ''}>
      <SectionHeader
        title="Power Trend"
        meta={`Active power · Irradiance · ${selectedDate === todayString() ? 'Today' : selectedDate}`}
        accent="orange"
        actions={
          <>
            <DatePicker value={selectedDate} onChange={setSelectedDate} maxDate={new Date()} />
            <IconButton onClick={onToggle}>
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </IconButton>
          </>
        }
      />
      {trendLoading ? (
        <div className={`${height} flex items-center justify-center`}>
          <p className={T.meta}>Loading chart…</p>
        </div>
      ) : (
        <div className={`${height} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="plantPowerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e17100" stopOpacity={0.20} />
                  <stop offset="100%" stopColor="#e17100" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                scale="linear"
                domain={[0, 1440]}
                allowDataOverflow
                ticks={isMobile ? DAY_TICKS_MOBILE : DAY_TICKS}
                tickFormatter={formatMinutesTick}
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="power"
                domain={[0, 'auto']}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <YAxis
                yAxisId="irr"
                orientation="right"
                domain={[0, 'auto']}
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#497d00'  }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip cursor={{ stroke: '#00000022', strokeWidth: 1 }} content={<PowerTrendTooltip />} />
              <Line
                yAxisId="irr"
                type="monotone"
                dataKey="irradiation"
                name="Irradiance"
                stroke="#497d00"
                strokeWidth={1.25}
                strokeDasharray="4 3"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={{ r: 3.5, fill: "#497d00" }}
              />
              <Area
                yAxisId="power"
                type="monotone"
                dataKey="power"
                name="Active Power"
                stroke="#e17100"
                strokeWidth={1.75}
                fill="url(#plantPowerGradient)"
                baseValue={0}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={{ r: 4, fill: '#e17100' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {stats && (
        <div className="mt-4 pt-3 border-t border-black/15">
          <div className="grid grid-cols-[1fr_76px_76px_76px] sm:grid-cols-[1fr_140px_140px_140px] pb-1.5">
            <span />
            {['Now', 'Peak', 'Avg'].map((h) => (
              <span key={h} className="text-[10px] uppercase tracking-[0.12em] font-semibold text-black/40 text-right">{h}</span>
            ))}
          </div>
          {[
            { name: 'Active Power', unit: 'kW',   color: '#e17100', s: stats.active_power_total_kw },
            { name: 'Irradiation',  unit: 'W/m²', color: '#497d00', s: stats.irradiation_inclined_wm2 },
          ].map((g) => (
            <div key={g.name} className="grid grid-cols-[1fr_76px_76px_76px] sm:grid-cols-[1fr_140px_140px_140px] items-baseline py-1">
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-2px]" style={{ background: g.color }} />
                <span className="text-[13px] font-semibold text-black truncate">{g.name}</span>
                <span className="text-[10px] text-black/40 shrink-0">{g.unit}</span>
              </span>
              {(['last', 'max', 'mean'] as const).map((k) => (
                <span key={k} className={`text-[13px] font-semibold tabular-nums text-right ${k === 'last' ? '' : 'text-black/55'}`}
                      style={k === 'last' ? { color: g.color } : undefined}>
                  {Number(g.s[k]).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Electrical Trend
// ============================================================
const ELEC_GROUPS = [
  { key: 'voltage', label: 'Voltage', color: '#e17100' },
  { key: 'current', label: 'Current', color: '#497d00' },
  { key: 'frequency', label: 'Frequency', color: '#8A8A8A' },
]

const ELEC_STAT_ROWS = [
  { group: 'voltage',   key: 'voltage_line_ab_v', name: 'Voltage AB', unit: 'kV', color: '#e17100', scale: 0.001, dp: 2 },
  { group: 'voltage',   key: 'voltage_line_bc_v', name: 'Voltage BC', unit: 'kV', color: '#D97706', scale: 0.001, dp: 2 },
  { group: 'voltage',   key: 'voltage_line_ca_v', name: 'Voltage CA', unit: 'kV', color: '#b45309', scale: 0.001, dp: 2 },
  { group: 'current',   key: 'current_phase_a',   name: 'Current A',  unit: 'A',  color: '#497d00', scale: 1, dp: 2 },
  { group: 'current',   key: 'current_phase_b',   name: 'Current B',  unit: 'A',  color: '#15803d', scale: 1, dp: 2 },
  { group: 'current',   key: 'current_phase_c',   name: 'Current C',  unit: 'A',  color: '#166534', scale: 1, dp: 2 },
  { group: 'frequency', key: 'grid_frequency_hz', name: 'Frequency',  unit: 'Hz', color: '#8A8A8A', scale: 1, dp: 2 },
] as const

function ElectricalTrendCard({
  chartData, trendLoading, selectedDate, setSelectedDate,
  hidden, onSeriesToggle, expanded, onToggleExpand, height, isMobile, stats
}: {
  chartData: { time: number; [key: string]: number | null }[]
  trendLoading: boolean
  selectedDate: string
  setSelectedDate: (d: string) => void
  hidden: Set<string>
  onSeriesToggle: (key: string) => void
  expanded: boolean
  onToggleExpand: () => void
  height: string
  isMobile: boolean
  stats: ElecTrendStats | null
}) {
  return (
    <div className={expanded ? 'px-6 pt-5 pb-5' : ''}>
      <SectionHeader
        title="Electrical Trend"
        meta={`Voltage · Current · Frequency · ${selectedDate === todayString() ? 'Today' : selectedDate}`}
        accent="olive"
        actions={
          <>
            <DatePicker value={selectedDate} onChange={setSelectedDate} maxDate={new Date()} />
            <IconButton onClick={onToggleExpand}>
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </IconButton>
          </>
        }
      />

      {/* Series checkboxes — wrap on mobile */}
      <div className="flex items-center gap-4 sm:gap-5 mb-4 flex-wrap">
        {ELEC_GROUPS.map((g) => (
          <button key={g.key} type="button" onClick={() => onSeriesToggle(g.key)} className="flex items-center gap-1.5">
            <span
              className="w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors"
              style={{
                backgroundColor: hidden.has(g.key) ? 'transparent' : g.color,
                borderColor: hidden.has(g.key) ? '#D4D4D4' : g.color,
              }}
            >
              {!hidden.has(g.key) && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-[13px] text-black font-semibold">{g.label}</span>
          </button>
        ))}
      </div>

      {trendLoading ? (
        <div className={`${height} flex items-center justify-center`}>
          <p className={T.meta}>Loading chart…</p>
        </div>
      ) : (
        <div className={`${height} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="linear"
              domain={[0, 1440]}
              allowDataOverflow
              ticks={isMobile ? DAY_TICKS_MOBILE : DAY_TICKS}
              tickFormatter={formatMinutesTick}
              tick={{ fontSize: 12, fill: '#171717' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
            yAxisId="voltage"
            domain={[
              (dataMin: number) => Math.floor(dataMin * 2) / 2 - 0.5,
              (dataMax: number) => Math.ceil(dataMax * 2) / 2 + 0.5,
            ]}
            tickCount={5}
            tickFormatter={(v) => Number(v).toFixed(1)}
            tick={{ fontSize: 12, fill: '#e17100' }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
            <YAxis
              yAxisId="current"
              orientation="right"
              domain={[0, 'auto']}
              tick={{ fontSize: 12, fill: '#497d00' }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            {!hidden.has('frequency') && (
              <YAxis yAxisId="freq" orientation="right" hide domain={[45, 55]} />
            )}
            <Tooltip
              cursor={{ stroke: '#00000022', strokeWidth: 1 }}
              content={<ElectricalTrendTooltip />}
            />

              {!hidden.has('voltage') && (
                <>
                  <Line yAxisId="voltage" type="monotone" dataKey="voltage_ab" name="Voltage AB" stroke="#e17100" strokeWidth={1.5} dot={false} connectNulls={false} activeDot={{ r: 4, fill: '#e17100' }} />
                  <Line yAxisId="voltage" type="monotone" dataKey="voltage_bc" name="Voltage BC" stroke="#D97706" strokeWidth={1.5} dot={false} connectNulls={false} activeDot={{ r: 4, fill: '#D97706' }} />
                  <Line yAxisId="voltage" type="monotone" dataKey="voltage_ca" name="Voltage CA" stroke="#b45309" strokeWidth={1.5} dot={false} connectNulls={false} activeDot={{ r: 4, fill: '#b45309' }} />
                </>
              )}
              {!hidden.has('current') && (
                <>
                  <Line yAxisId="current" type="monotone" dataKey="current_a" name="Current A" stroke="#497d00" strokeWidth={1.5} dot={false} connectNulls={false} activeDot={{ r: 4, fill: '#497d00' }} />
                  <Line yAxisId="current" type="monotone" dataKey="current_b" name="Current B" stroke="#15803d" strokeWidth={1.5} dot={false} connectNulls={false} activeDot={{ r: 4, fill: '#15803d' }} />
                  <Line yAxisId="current" type="monotone" dataKey="current_c" name="Current C" stroke="#166534" strokeWidth={1.5} dot={false} connectNulls={false} activeDot={{ r: 4, fill: '#166534' }} />
                </>
              )}
              {!hidden.has('frequency') && (
                <Line yAxisId="freq" type="monotone" dataKey="frequency" name="Frequency" stroke="#8A8A8A" strokeWidth={1.5} dot={false} connectNulls={false} activeDot={{ r: 4, fill: '#8A8A8A' }} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {stats && (
        <div className="mt-4 pt-3 border-t border-black/15">
          <div className="grid grid-cols-[1fr_76px_76px_76px] sm:grid-cols-[1fr_140px_140px_140px] pb-1.5">
            <span />
            {['Now', 'Max', 'Min'].map((h) => (
              <span key={h} className="text-[10px] uppercase tracking-[0.12em] font-semibold text-black/40 text-right">{h}</span>
            ))}
          </div>
          {ELEC_STAT_ROWS.filter((r) => !hidden.has(r.group)).map((r) => {
            const s = stats[r.key]
            if (!s) return null
            return (
              <div key={r.key} className="grid grid-cols-[1fr_76px_76px_76px] sm:grid-cols-[1fr_140px_140px_140px] items-baseline py-1">
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-2px]" style={{ background: r.color }} />
                  <span className="text-[13px] font-semibold text-black truncate">{r.name}</span>
                  <span className="text-[10px] text-black/40 shrink-0">{r.unit}</span>
                </span>
                {(['last', 'max', 'min'] as const).map((k) => (
                  <span key={k} className={`text-[13px] font-semibold tabular-nums text-right ${k === 'last' ? '' : 'text-black/55'}`}
                        style={k === 'last' ? { color: r.color } : undefined}>
                    {(Number(s[k]) * r.scale).toFixed(r.dp)}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Daily Energy
// ============================================================
function DailyEnergyCard({
  chartData, loading,
}: {
  chartData: { date: string; energy_kwh: number; fill: string }[]
  loading: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Track viewport for label sizing (SVG text can't use Tailwind breakpoints)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Auto-scroll to the end (today) once the chart has data / width to scroll
  useEffect(() => {
    if (loading || !scrollRef.current) return
    const el = scrollRef.current
    el.scrollLeft = el.scrollWidth
  }, [loading, chartData])

  return (
    <div>
      <SectionHeader
        title="Daily Energy"
        meta={`Generation over the last ${chartData.length} days`}
        accent="orange"
      />
      {loading ? (
        <div className="h-[280px] flex items-center justify-center">
          <p className={T.meta}>Loading chart…</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="h-[280px] w-full overflow-x-auto overflow-y-hidden -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          <div className="h-full" style={{ width: `max(100%, ${chartData.length * 90}px)` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 24, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateTick}
                  tick={{ fontSize: 12, fill: '#171717' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#171717' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                {/* <Tooltip
                  cursor={false}
                  contentStyle={{
                    fontSize: '13px', color: '#000', border: '1px solid #000',
                    borderRadius: '8px', boxShadow: 'none', fontWeight: 500,
                  }}
                  labelFormatter={(label) => formatDateTick(String(label))}
                  formatter={(value) => [`${Number(value).toLocaleString()} kWh`, 'Energy']}
                /> */}
                <Bar
                  dataKey="energy_kwh"
                  radius={[4, 4, 0, 0]}
                  shape={(props: any) => {
                    const { x, y, width, height, payload } = props
                    return <rect x={x} y={y} width={width} height={height} rx={4} ry={4} fill={payload.fill} />
                  }}
                >
                  <LabelList
                    dataKey="energy_kwh"
                    position="top"
                    formatter={(v) => `${Number(v).toLocaleString()}\u00A0kWh`}
                    style={{ fontSize: isMobile ? 10 : 12, fill: '#171717', fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Main page
// ============================================================
export default function PlantOverviewPage() {
  const [overview, setOverview] = useState<PlantOverview | null>(null)
  const [trend, setTrend] = useState<PowerTrendPoint[]>([])
  const [stats, setStats] = useState<PowerTrendData['stats']>(null)
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [trendLoading, setTrendLoading] = useState(false)
  const [chartExpanded, setChartExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const { site } = useSite()

  const [elecTrend, setElecTrend] = useState<ElecTrendPoint[]>([])
  const [elecTrendLoading, setElecTrendLoading] = useState(false)
  const [elecSelectedDate, setElecSelectedDate] = useState(todayString())
  const [elecExpanded, setElecExpanded] = useState(false)
  const [elecHidden, setElecHidden] = useState<Set<string>>(
    new Set(['current', 'frequency'])
  )

  const [dailyEnergy, setDailyEnergy] = useState<DailyEnergyPoint[]>([])
  const [dailyEnergyLoading, setDailyEnergyLoading] = useState(false)

  const [elecStats, setElecStats] = useState<ElecTrendStats | null>(null)

  const POWER_TREND_INTERVAL_MIN = 5   // must match backend interval
  const GAP_FACTOR = 2.5

  const tempDelta = overview?.weather
    ? (overview.weather.module_temp_c - overview.weather.ambient_temp_c).toFixed(1)
    : null

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  const weatherOffline = overview?.weather?.status === 'offline'
  const weatherIntensity = irradianceIntensity(overview?.weather?.irradiation_inclined_wm2 ?? 0, weatherOffline)

  function toggleElec(group: string) {
    setElecHidden((prev) => {
      const next = new Set(prev)
      next.has(group) ? next.delete(group) : next.add(group)
      return next
    })
  }

  // Near the top of the file, with your other constants
  const SHOW_DAILY_ENERGY_CARD = false // temporarily disabled — bar width/centering needs another pass
  // ============================================================
  // Fetch functions — extracted into memoized callbacks so they can be
  // called both by their own effect (on dep change) and by fetchAll
  // (on wake / manual refresh). Each callback re-identifies only when
  // its own deps change, so its useEffect below only fires then.
  // ============================================================

  const fetchOverview = useCallback(async () => {
    if (!site?.id) { setLoading(false); return }
    try {
      const res = await api.get<PlantOverview>(`/influx/plant/overview/?site=${site.id}`)
      res.data.inverters.sort((a, b) => a.name.localeCompare(b.name))
      setOverview(res.data)
    } catch (err) {
      console.error('Plant overview error:', err)
    } finally {
      setLoading(false)
    }
  }, [site?.id])

  const fetchPowerTrend = useCallback(async () => {
    if (!site?.id) return
    setTrendLoading(true)
    try {
      const url = `/influx/plant/power-trend/?site=${site.id}&date=${selectedDate}`
      const res = await api.get<PowerTrendData>(url)
      setTrend(res.data.data)
      setStats(res.data.stats)
    } catch {
      setTrend([])
    } finally {
      setTrendLoading(false)
    }
  }, [site?.id, selectedDate])

  const fetchDailyEnergy = useCallback(async () => {
    if (!site?.id) return
    setDailyEnergyLoading(true)
    try {
      const res = await api.get<DailyEnergyData>(
        `/influx/dashboard/daily-energy/?site=${site.id}&days=7`
      )
      setDailyEnergy(res.data.data)
    } catch {
      setDailyEnergy([])
    } finally {
      setDailyEnergyLoading(false)
    }
  }, [site?.id])

const fetchElecTrend = useCallback(async () => {
  if (!site?.id) return
  setElecTrendLoading(true)
  try {
    const res = await api.get<ElecTrendData>(
      `/influx/plant/electrical-trend/?site=${site.id}&date=${elecSelectedDate}&interval=5`
    )
    setElecTrend(res.data.data)
    setElecStats(res.data.stats ?? null)
  } catch {
    setElecTrend([])
    setElecStats(null)
  } finally {
    setElecTrendLoading(false)
  }
}, [site?.id, elecSelectedDate])

  // Initial + dep-change fetches. Each effect fires when its fetcher's identity changes,
  // which happens when site.id or the relevant selected date changes.
  useEffect(() => { fetchOverview() }, [fetchOverview])
  useEffect(() => { fetchPowerTrend() }, [fetchPowerTrend])
  useEffect(() => { fetchDailyEnergy() }, [fetchDailyEnergy])
  useEffect(() => { fetchElecTrend() }, [fetchElecTrend])

  // Full refresh — used for wake events and the manual Refresh button.
  const fetchAll = useCallback(async () => {
    await Promise.all([
      fetchOverview(),
      ...(SHOW_DAILY_ENERGY_CARD ? [fetchDailyEnergy()] : []),
      fetchDailyEnergy(),
      fetchElecTrend(),
    ])
  }, [fetchOverview, fetchPowerTrend, fetchDailyEnergy, fetchElecTrend])

  // Auto-refresh strategy:
  //   Interval (60s): only /overview/ — the lightweight snapshot.
  //   Wake events (visibility, focus, pageshow, online): full refresh via fetchAll.
  //   Manual refresh button: full refresh via fetchAll (bypasses throttle).
  // Heavy queries (power/daily/elec) never run on the interval, so they don't
  // burn API calls while someone is looking at yesterday's graph.
  const { refetch, isRefetching } = useAutoRefresh(fetchOverview, {
    intervalMs: 60_000,
    onWake: fetchAll,
  })

  const chartData = useMemo(() => {
    const pts = trend
      .map((p) => ({
        time: minutesFromIstDayStart(p.time, selectedDate),
        power: p.active_power_total_kw == null ? null : Math.max(0, p.active_power_total_kw),
        irradiation: p.irradiation_inclined_wm2 == null ? null : Math.max(0, p.irradiation_inclined_wm2),
      }))
      .filter((p) => p.time >= 0 && p.time <= 1440)
      .sort((a, b) => a.time - b.time)

    const out: typeof pts = []
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i - 1]
      if (prev && pts[i].time - prev.time > POWER_TREND_INTERVAL_MIN * GAP_FACTOR) {
        out.push({ time: prev.time + POWER_TREND_INTERVAL_MIN, power: null, irradiation: null })
      }
      out.push(pts[i])
    }
    return out
  }, [trend, selectedDate])

  const ELEC_TREND_INTERVAL_MIN = 5  // must match the &interval=5 query param

  const elecChartData = useMemo(() => {
    const nz = (v: number | null | undefined) =>
      v == null || v === 0 ? null : v

    const pts = elecTrend
      .map((p) => ({
        time: minutesFromIstDayStart(p.time, elecSelectedDate),
        voltage_ab: p.voltage_line_ab_v == null ? null : +(p.voltage_line_ab_v / 1000).toFixed(3),
        voltage_bc: p.voltage_line_bc_v == null ? null : +(p.voltage_line_bc_v / 1000).toFixed(3),
        voltage_ca: p.voltage_line_ca_v == null ? null : +(p.voltage_line_ca_v / 1000).toFixed(3),
        current_a: nz(p.current_phase_a),
        current_b: nz(p.current_phase_b),
        current_c: nz(p.current_phase_c),
        frequency: nz(p.grid_frequency_hz),
      }))
      .filter((p) => p.time >= 0 && p.time <= 1440)
      .sort((a, b) => a.time - b.time)

    const out: typeof pts = []
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i - 1]
      if (prev && pts[i].time - prev.time > ELEC_TREND_INTERVAL_MIN * GAP_FACTOR) {
        out.push({
          time: prev.time + ELEC_TREND_INTERVAL_MIN,
          voltage_ab: null, voltage_bc: null, voltage_ca: null,
          current_a: null, current_b: null, current_c: null,
          frequency: null,
        })
      }
      out.push(pts[i])
    }
    return out
  }, [elecTrend, elecSelectedDate])

  const dailyEnergyChartData = dailyEnergy.map((d) => ({
    date: d.date,
    energy_kwh: d.energy_kwh,
    fill: d.date === todayString() ? '#e17100' : '#497d00',
  }))


  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading plant overview…</p>
      </div>
    )
  }

  const capacityPct =
    overview && overview.plant.ac_capacity_kw
      ? Math.round((overview.plant.active_power_kw / overview.plant.ac_capacity_kw) * 100)
      : 0

  // Signed delta with correct "+" prefix only for positive
  const deltaNum = tempDelta ? Number(tempDelta) : 0
  const deltaSign = deltaNum > 0 ? '+' : ''
  const deltaColor =
    deltaNum > 10 ? 'text-[#e17100]' :
    deltaNum < 0 ? 'text-black' : 'text-[#497d00]'

  return (
    <div className="max-w-6xl px-0 mx-auto sm:px-6 md:px-4 lg:px-2 xl:px-0 pb-10">

      {/* ============ HEADER ============ */}
      {/* On mobile (order-1/2 flip): refresh row appears at the top with timestamp on the left,
          Refresh button on the right. Title block sits below. On desktop, columns are side by side. */}
      <header className="pb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        {/* Refresh + timestamp */}
        <div className="order-1 sm:order-2 flex items-center justify-between sm:flex-col sm:items-end gap-3 sm:gap-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap order-2 sm:order-2`}>
            <Clock size={13} strokeWidth={2} />
            {overview?.last_updated ? (
                <>
                <span className="hidden sm:inline">Updated&nbsp;</span>
                {formatLastUpdated(overview.last_updated)}
                </>
            ) : (
                <span className="text-red-600 font-semibold">OFFLINE</span>
            )}
            </p>
          <button
            type="button"
            onClick={refetch}
            disabled={isRefetching}
            className="h-10 px-4 flex items-center gap-2 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold order-1 sm:order-1"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Refresh
          </button>
        </div>

        {/* Title block */}
        <div className="order-2 sm:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 rounded-full bg-[#e17100] shrink-0 self-stretch" />
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <p className={T.eyebrow}>Plant Overview</p>
                <LiveDataIndicator lastUpdated={overview?.last_updated} />
              </div>
              <h1 className={`${T.siteH1} mt-2 break-words`}>{overview?.site ?? '—'}</h1>
              
              <div className="flex flex-wrap items-center gap-2 mt-4 pl-4">
                <StatusChip
                  label="Breaker"
                  value={overview?.breaker_status == null ? 'OFFLINE' : overview.breaker_status.toUpperCase()}
                  healthy={overview?.breaker_status == null ? null : overview.breaker_status === 'on'}
                  icon={Power}
                />
                <StatusChip
                  label="Inverters"
                  value={`${overview?.device_summary.online ?? 0}/${overview?.device_summary.total ?? 0} Online`}
                  healthy={overview ? overview.device_summary.online === overview.device_summary.total : null}
                  icon={Cpu}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

    
      {/* ============ HERO: Gauge + Energy Rail ============ */}
      <Divider />
      <section className="pt-10 pb-3">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-10 md:gap-16 items-center">

            {/* Gauge column — now sits on a soft tinted backdrop with capacity context above/below */}
            <div className="flex flex-col items-center">
              <div className="relative flex flex-col items-center px-8 py-8 rounded-3xl bg-gradient-to-b from-[#e17100]/[0.04] to-transparent w-full">
                <p className={`${T.eyebrow} mb-4`}>Active Power</p>
                <PowerGauge
                  value={overview?.plant.active_power_kw ?? 0}
                  capacity={overview?.plant.ac_capacity_kw ?? 1}
                />
                <div className="flex items-center gap-1.5 mt-4">
                  <span className={`w-1.5 h-1.5 rounded-full ${overview?.last_updated ? 'bg-green-500 animate-pulse' : 'bg-black/30'}`} />
                  <span className={T.meta}>
                    <span className="tabular-nums font-semibold text-black">{capacityPct}%</span>
                    {' '}of {overview?.plant.ac_capacity_kw?.toLocaleString() ?? '—'} kW AC
                  </span>
                </div>

                {/* DC capacity context — small footer stat tying gauge to DC rating */}
                <div className="flex items-center gap-4 mt-5 pt-4 border-t border-black/10 w-full justify-center">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[13px] font-semibold text-black tabular-nums">
                      {overview?.plant.dc_capacity_kw?.toLocaleString() ?? '—'}
                    </span>
                    <span className="text-[11px] text-black/50">kW DC</span>
                  </div>
                  <span className="w-1 h-1 rounded-full bg-black/20" />
                  <div className="flex items-baseline gap-1">
                    <span className="text-[13px] font-semibold text-black tabular-nums">
                      {overview && overview.plant.ac_capacity_kw
                        ? (overview.plant.dc_capacity_kw / overview.plant.ac_capacity_kw).toFixed(2)
                        : '—'}
                    </span>
                    <span className="text-[11px] text-black/50">DC/AC ratio</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Energy rail — each metric now gets an icon, and a small descriptive
                subtext to add substance beyond just a number */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-4 py-5 border-b border-black/10">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#e17100]/10 flex items-center justify-center shrink-0">
                    <Sun size={18} className="text-[#e17100]" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className={T.eyebrow}>Energy Today</p>
                    <p className="text-[12px] text-black/50 mt-0.5">Generated since morning</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className={`${T.metricL} text-[#e17100]`}>
                    {overview?.plant.energy_today_kwh?.toLocaleString() ?? '—'}
                  </span>
                  <span className={T.unit}>kWh</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 py-5 border-b border-black/10">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center shrink-0">
                    <TrendingUp size={18} className="text-black" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className={T.eyebrow}>Energy Total</p>
                    <p className="text-[12px] text-black/50 mt-0.5">Lifetime cumulative export</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 shrink-0">
                <span className={T.metricL}>
                  {overview?.plant.energy_active_export_kwh != null
                    ? (overview.plant.energy_active_export_kwh / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : '—'}
                </span>
                <span className={T.unit}>MWh</span>
              </div>
              </div>

              <div className="flex items-center justify-between gap-4 py-5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#497d00]/10 flex items-center justify-center shrink-0">
                    <Leaf size={18} className="text-[#497d00]" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className={T.eyebrow}>CO₂ Avoided Today</p>
                    <p className="text-[12px] text-black/50 mt-0.5">Equivalent emissions offset</p>
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className={`${T.metricL} text-[#497d00]`}>
                    {overview?.performance?.co2_avoided_today_kg?.toFixed(1) ?? '—'}
                  </span>
                  <span className={T.unit}>kg</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ WEATHER ============ */}
      {overview?.weather && (
        <>
          <Divider />
          <Section>
              <SectionHeader
                title="Weather"
                meta="On-site sensors"
                accent="orange"
                status={{ label: weatherOffline ? 'Offline' : 'Live', online: !weatherOffline }}
              />

            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 item-start">

              {/* Left: Sun + Irradiance — takes the majority width */}
              <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 min-w-0 lg:pr-8 lg:border-r lg:border-black/10">
                <div className="shrink-0 scale-[0.85] origin-center">
                  <AnimatedSun
                      irradiance={overview.weather.irradiation_inclined_wm2}
                      isOffline={weatherOffline}
                    />
                </div>
                <div className="flex flex-col gap-3 min-w-0 w-full">
                  <div>
                    <p className={T.eyebrow}>Solar Irradiance</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`${T.metricXL} ${weatherIntensity.tone}`}>
                        {overview.weather.irradiation_inclined_wm2.toFixed(0)}
                      </span>
                      <span className={T.unit}>W/m²</span>
                    </div>
                    <p className={`text-[15px] font-semibold mt-1.5 ${weatherIntensity.tone}`}>
                      {weatherIntensity.label}
                    </p>
                  </div>
                  <div className="pt-1">
                    <div className="h-2 bg-black/5 rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${weatherIntensity.pct}%`,
                          background: 'linear-gradient(to right, #497d00 0%, #e17100 50%, #dc2626 100%)',
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[11px] text-black/50 tabular-nums">
                      <span>0</span>
                      <span>400</span>
                      <span>800</span>
                      <span>1200 W/m²</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Temperature — condensed, self-contained column */}
              <div className="flex flex-col gap-4 min-w-0">
                <div>
                  <p className={T.eyebrow}>Temperature</p>
                  {tempDelta && (
                    <p className={`text-[13px] font-semibold mt-1 ${deltaColor}`}>
                      Module {deltaSign}{tempDelta}°C vs ambient
                    </p>
                  )}
                </div>

                {/* Module bar */}
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11px] text-black/50 font-medium uppercase tracking-wide">Module</span>
                    <span className={`text-[14px] font-semibold tabular-nums text-[#e17100]`}>
                      {overview.weather.module_temp_c.toFixed(1)}°C
                    </span>
                  </div>
                  <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, ((overview.weather.module_temp_c - -10) / 90) * 100))}%`,
                        background: TEMP_GRADIENT,
                      }}
                    />
                  </div>
                </div>

                {/* Ambient bar */}
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11px] text-black/50 font-medium uppercase tracking-wide">Ambient</span>
                    <span className="text-[14px] font-semibold tabular-nums text-black">
                      {overview.weather.ambient_temp_c.toFixed(1)}°C
                    </span>
                  </div>
                  <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, ((overview.weather.ambient_temp_c - -10) / 90) * 100))}%`,
                        background: TEMP_GRADIENT,
                      }}
                    />
                  </div>
                </div>

                {tempDelta && (
                  <p className="text-[12px] text-black/60 leading-snug pb-3">
                    {deltaNum > 15 ? 'Modules running hot — high thermal loss expected.' :
                    deltaNum > 8  ? 'Typical operating gap under sunlight.' :
                    deltaNum > 0  ? 'Modules slightly warmer than ambient — normal for low sun.' :
                    deltaNum < 0  ? 'Modules cooler than ambient — likely no sun or evening cooling.' :
                                    'Modules at ambient temperature.'}
                  </p>
                )}
              </div>
            </div>
          </Section>
        </>
      )}

      {/* ============ PERFORMANCE (GenerationCards) ============ */}
      <Divider />
      <Section>
        <SectionHeader title="Performance" meta="Today · Live" accent="orange" />
        <PerformanceCards
          actualToday={overview?.plant.energy_today_kwh ?? 0}
          generationTarget={overview?.plant.daily_generation_target_kwh ?? 0}
          performanceRatio={overview?.performance?.performance_ratio_pct ?? 0}
          cuf={overview?.performance?.cuf_pct ?? 0}
        />
      </Section>

      {/* ============ Power Trend============ */}
      <Divider />
      <Section>
        <PowerTrendCard
          chartData={chartData}
          trendLoading={trendLoading}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          stats={stats}
          expanded={chartExpanded}
          onToggle={() => setChartExpanded(o => !o)}
          height="h-[240px] sm:h-[360px]"
          isMobile={isMobile}
        />
      </Section>

      {/* ============ GRID ============ */}
      <Divider />
      <Section>
        <SectionHeader
          title="Grid"
          meta={overview?.last_updated ? `Last Updated : ${formatLastUpdated(overview.last_updated)}` : 'No data'}
          accent="olive"
        />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
          {[
            { label: 'Frequency', primary: overview?.plant.frequency_hz?.toFixed(2) ?? '—', unit: 'Hz' },
            { label: 'Power Factor', primary: overview?.plant.power_factor?.toFixed(2) ?? '—', unit: '' },
          ].map((m) => (
            <div key={m.label} className="border border-black/15 rounded-lg px-3.5 py-3">
              <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-black/50 mb-2">{m.label}</p>
              <p className="flex items-baseline gap-1">
                <span className={T.metricL}>{m.primary}</span>
                {m.unit && <span className="text-[11px] text-black/50 font-medium">{m.unit}</span>}
              </p>
            </div>
          ))}
          {[
            { phase: 'AB / A', voltage: overview?.grid.voltage_ab, current: overview?.grid.current_a },
            { phase: 'BC / B', voltage: overview?.grid.voltage_bc, current: overview?.grid.current_b },
            { phase: 'CA / C', voltage: overview?.grid.voltage_ca, current: overview?.grid.current_c },
          ].map((row) => (
            <div key={row.phase} className="flex gap-3 border border-black/15 rounded-lg px-3.5 py-3">
              <span className="w-[3px] rounded-full self-stretch shrink-0 bg-[#497d00]" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-black/50 mb-2">
                  Phase {row.phase}
                </p>
                <div className="flex items-baseline gap-4">
                  <span className="flex items-baseline gap-1">
                    <span className={T.metricM}>
                      {row.voltage != null ? (row.voltage / 1000).toFixed(2) : '—'}
                    </span>
                    <span className="text-[10px] text-black/50">kV</span>
                  </span>
                  <span className="flex items-baseline gap-1">
                    <span className={`${T.metricM} text-[#497d00]`}>{row.current?.toFixed(2) ?? '—'}</span>
                    <span className="text-[10px] text-black/50">A</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ============ DAILY ENERGY ============ */}
      <Divider />
      <Section>
        {SHOW_DAILY_ENERGY_CARD && (
          <DailyEnergyCard chartData={dailyEnergyChartData} loading={dailyEnergyLoading} />
        )}
      </Section>

      {/* ============ ELECTRICAL TREND ============ */}
      <Divider />
      <Section>
        <ElectricalTrendCard
          chartData={elecChartData}
          trendLoading={elecTrendLoading}
          selectedDate={elecSelectedDate}
          setSelectedDate={setElecSelectedDate}
          hidden={elecHidden}
          onSeriesToggle={toggleElec}
          expanded={elecExpanded}
          onToggleExpand={() => setElecExpanded(o => !o)}
          height="h-[220px] sm:h-[280px]"
          isMobile={isMobile}
          stats={elecStats}
        />
      </Section>

      {/* ============ Modals ============ */}
      {elecExpanded && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setElecExpanded(false)}
        >
          <div
            className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <ElectricalTrendCard
              chartData={elecChartData}
              trendLoading={elecTrendLoading}
              selectedDate={elecSelectedDate}
              setSelectedDate={setElecSelectedDate}
              hidden={elecHidden}
              onSeriesToggle={toggleElec}
              expanded={elecExpanded}
              onToggleExpand={() => setElecExpanded(false)}
              height="h-[220px] sm:h-[280px]"
              isMobile={isMobile}
              stats={elecStats}

            />
          </div>
        </div>,
        document.body
      )}

      {chartExpanded && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          style={{ backdropFilter: 'blur(6px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => setChartExpanded(false)}
        >
          <div
            className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <PowerTrendCard
              chartData={chartData}
              trendLoading={trendLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              stats={stats}
              expanded={chartExpanded}
              onToggle={() => setChartExpanded(false)}
              height="h-[480px]"
              isMobile={isMobile}
            />
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}