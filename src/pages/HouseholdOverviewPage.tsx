import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Sun, Clock, Maximize2, Minimize2, RefreshCw, Power, Cpu, TrendingUp, Leaf,
  AlertTriangle, WifiOff, CalendarRange, Gauge,
} from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import {
  Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, ComposedChart, Tooltip, BarChart, Bar, LabelList,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'
import { useAutoRefresh } from '@/api/useAutoRefresh'

// ============================================================
// Household Overview — inverter-only rooftop site.
// Visual language copied from PlantOverviewPage. No meter, weather,
// breaker, transformer or grid sections: that data does not exist here.
// Rule for this page: null means "the inverter did not send it" → show "—", never 0.
// ============================================================

// ---- Typography tokens (shared with PlantOverviewPage) ----
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
  metricXL:     'text-[38px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricL:      'text-[22px] font-semibold text-black tracking-tight tabular-nums leading-none',
  unit:         'text-[13px] text-black font-medium',
}

// ---- Types ----

type InverterStates = {
  running: number; stopped: number; standby: number; warning: number; fault: number; other: number
}

interface HouseholdInverter {
  id: number                      // used as `device` for the daily-energy endpoint
  name: string
  device_id: string
  status: string
  inverter_status: { code: number; label: string } | null
  ac_active_power_kw: number | null
  energy_daily_kwh: number | null
  energy_total_kwh: number | null
  grid_voltage_a_v: number | null
  ac_current_phase_a: number | null
  grid_frequency_hz: number | null
  ac_power_factor: number | null
  internal_temp_c: number | null
  dc_input_power_kw: number | null
  inverter_efficiency_pct: number | null
  last_updated: string | null
}

interface HouseholdOverview {
  site: string
  customer: string
  category: string
  last_updated: string | null
  summary: {
    active_power_kw: number | null
    energy_today_kwh: number | null
    energy_month_kwh: number | null
    energy_total_kwh: number | null
    ac_capacity_kw: number | null
    cuf_pct: number | null
    co2_avoided_today_kg: number | null
    inverters_online: number
    inverters_total: number
    states: InverterStates
  }
  data_logger: { status: string; last_seen: string | null } | null
  inverters: HouseholdInverter[]
}

interface PowerTrendPoint {
  time: string
  ac_active_power_kw: number | null
}

interface DailyEnergyPoint {
  date: string
  energy_kwh: number | null
}

// ---- Helpers ----

// One formatter for the whole page: null/undefined → "—", never 0.
function fmt(v: number | null | undefined, dp: number) {
  return v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: dp })
}

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

function ChartEmpty({ height, label = 'No data for this day' }: { height: string; label?: string }) {
  return (
    <div className={`${height} flex flex-col items-center justify-center gap-2`}>
      <p className="text-[13px] text-black/45">{label}</p>
    </div>
  )
}

// ============================================================
// Building blocks (copied from PlantOverviewPage)
// ============================================================

function SectionHeader({
  title, meta, accent = 'orange', actions,
}: {
  title: string
  meta?: string
  accent?: 'orange' | 'olive' | 'none'
  actions?: React.ReactNode
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
          {meta && <p className={`${T.meta} mt-1`}>{meta}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 ml-auto shrink-0">{actions}</div>
      )}
    </div>
  )
}

function Divider() {
  return <div className="h-px w-full bg-black/15" />
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="pt-6">{children}</section>
}

type ChipTone = 'good' | 'warn' | 'bad' | 'neutral'

const CHIP_TONE: Record<ChipTone, { dot: string; text: string }> = {
  good:    { dot: 'bg-green-500', text: 'text-green-700' },
  warn:    { dot: 'bg-[#e17100]', text: 'text-[#e17100]' },
  bad:     { dot: 'bg-red-500',   text: 'text-red-600' },
  neutral: { dot: 'bg-black',     text: 'text-black' },
}

function StatusChip({
  label, value, tone, icon: Icon,
}: {
  label: string
  value: string
  tone: ChipTone
  icon: React.ElementType
}) {
  const { dot, text } = CHIP_TONE[tone]
  return (
    <div className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full border border-black/15 bg-white shrink-0">
      <Icon size={13} className="text-black shrink-0" strokeWidth={2} />
      <span className="text-[11px] uppercase tracking-[0.1em] text-black font-semibold">{label}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`text-[13px] font-semibold ${text} tabular-nums whitespace-nowrap`}>{value}</span>
    </div>
  )
}

type Pill = { label: string; count: number; tone: ChipTone; icon: React.ElementType }

// Same headline logic as Plant Overview: Generating leads when anything is
// producing; otherwise the idle state headlines (so night reads "1/1 Standby").
function InverterStatusChips({ summary }: { summary?: HouseholdOverview['summary'] }) {
  if (!summary) return <StatusChip label="Inverters" value="—" tone="neutral" icon={Cpu} />

  const { states } = summary
  const total = summary.inverters_total
  const offline = total - summary.inverters_online

  let mainLabel = 'Generating'
  let mainCount = states.running
  const mainTone: ChipTone = states.running > 0 ? 'good' : 'neutral'
  if (states.running === 0) {
    if (states.standby > 0)      { mainLabel = 'Standby'; mainCount = states.standby }
    else if (states.stopped > 0) { mainLabel = 'Stopped'; mainCount = states.stopped }
  }

  const pills: Pill[] = []
  if (states.fault > 0)   pills.push({ label: 'Fault',   count: states.fault,   tone: 'bad',     icon: AlertTriangle })
  if (states.warning > 0) pills.push({ label: 'Warning', count: states.warning, tone: 'warn',    icon: AlertTriangle })
  if (offline > 0)        pills.push({ label: 'Offline', count: offline,        tone: 'bad',     icon: WifiOff })
  if (states.standby > 0 && mainLabel !== 'Standby') pills.push({ label: 'Standby', count: states.standby, tone: 'neutral', icon: Power })
  if (states.stopped > 0 && mainLabel !== 'Stopped') pills.push({ label: 'Stopped', count: states.stopped, tone: 'neutral', icon: Power })
  if (states.other > 0)   pills.push({ label: 'Other',   count: states.other,   tone: 'neutral', icon: Cpu })

  return (
    <>
      <StatusChip label={mainLabel} value={`${mainCount}/${total}`} tone={mainTone} icon={Cpu} />
      {pills.map((p) => (
        <StatusChip key={p.label} label={p.label} value={String(p.count)} tone={p.tone} icon={p.icon} />
      ))}
    </>
  )
}

function LiveDataIndicator({ status, lastSeen }: { status: string | null | undefined; lastSeen: string | null | undefined }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  // Liveness follows the data logger. Guard on last_seen so a frozen tab
  // self-flips to Offline instead of showing a stale "Live".
  const STALE_MS = 15 * 60 * 1000
  const fresh = !!lastSeen && (Date.now() - new Date(lastSeen).getTime()) < STALE_MS
  const isLive = status === 'online' && fresh

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${isLive ? 'text-green-700' : 'text-red-600'}`}>
        {isLive ? 'Live data' : 'Offline'}
      </span>
    </span>
  )
}

function IconButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
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
// Power Gauge — value sits inside the arc.
// value === null (night: inverter sends no power) → "—" and an empty arc.
// ============================================================
function PowerGauge({ value, capacity }: { value: number | null; capacity: number | null }) {
  const pct = value != null && capacity && capacity > 0
    ? Math.min(100, Math.max(0, (value / capacity) * 100))
    : 0
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
        <span className={T.metricXL} style={{ color: value == null ? 'rgba(0,0,0,0.3)' : '#e17100' }}>
          {value == null ? '—' : fmt(Math.max(0, value), 2)}
        </span>
        <span className={`${T.unit} mt-1.5`}>kW</span>
      </div>
    </div>
  )
}

// Device-reported status code → dot + label colour.
// Canonical: 0 Stopped · 1 Running · 2 Standby · 4 Warning · 8 Fault
const INV_STATE: Record<number, { label: string; dot: string; text: string }> = {
  0: { label: 'Stopped',    dot: 'bg-black/40',  text: 'text-black/60' },
  1: { label: 'Generating', dot: 'bg-green-500', text: 'text-green-700' },
  2: { label: 'Standby',    dot: 'bg-black/30',  text: 'text-black/55' },
  4: { label: 'Warning',    dot: 'bg-[#e17100]', text: 'text-[#e17100]' },
  8: { label: 'Fault',      dot: 'bg-red-600',   text: 'text-red-600' },
}

function invStatusMeta(inv: HouseholdInverter): { label: string; dot: string; text: string } {
  // Comms first: unreachable wins, it has no device state to carry.
  if (inv.status === 'offline') {
    return { label: 'Offline', dot: 'bg-red-600', text: 'text-red-600' }
  }
  // Reachable but no status register → report the comms fact.
  if (inv.inverter_status == null) {
    return { label: 'Online', dot: 'bg-green-500', text: 'text-green-700' }
  }
  const { code, label } = inv.inverter_status
  return INV_STATE[code] ?? { label: label || `Code ${code}`, dot: 'bg-black/30', text: 'text-black/55' }
}

// ============================================================
// Power Trend — active power only for now.
// DC input / reactive power to be added once confirmed in the data
// (bring back the series checkboxes from PlantOverviewPage at that point).
// ============================================================

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
            {e.value == null ? '—' : fmt(Number(e.value), 2)}
          </span>
          <span className="text-[11px] text-black/50 w-9 text-right">kW</span>
        </div>
      ))}
    </div>
  )
}

function PowerTrendCard({
  chartData, trendLoading, selectedDate, setSelectedDate,
  expanded, onToggle, height, isMobile,
}: {
  chartData: { time: number; power: number | null }[]
  trendLoading: boolean
  selectedDate: string
  setSelectedDate: (d: string) => void
  expanded: boolean
  onToggle: () => void
  height: string
  isMobile: boolean
}) {
  const hasPower = chartData.some((p) => p.power != null)
  const peak = hasPower ? Math.max(...chartData.map((p) => p.power ?? 0)) : null

  return (
    <div className={expanded ? 'px-6 pt-5 pb-5' : ''}>
      <SectionHeader
        title="Power Trend"
        meta={`Active power · ${selectedDate === todayString() ? 'Today' : selectedDate}`}
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
      ) : chartData.length === 0 ? (
        <ChartEmpty height={height} />
      ) : (
        <div className={`${height} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="householdPowerGradient" x1="0" y1="0" x2="0" y2="1">
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
              {/* Decimals allowed: a 3 kW rooftop inverter never reaches whole-number ticks */}
              <YAxis
                domain={[0, 'auto']}
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip cursor={{ stroke: '#00000022', strokeWidth: 1 }} content={<PowerTrendTooltip />} />
              <Area
                type="monotone"
                dataKey="power"
                name="Active Power"
                stroke="#e17100"
                strokeWidth={1.75}
                fill="url(#householdPowerGradient)"
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
      {!trendLoading && chartData.length > 0 && (
        <div className="mt-4 pt-3 border-t border-black/15 flex items-baseline justify-between">
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-2px] bg-[#e17100]" />
            <span className="text-[13px] font-semibold text-black">Active Power</span>
            <span className="text-[10px] text-black/40">kW</span>
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-black/40">Peak</span>
            <span className="text-[13px] font-semibold tabular-nums text-[#e17100]">{fmt(peak, 2)}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Daily Energy — last 7 days for one inverter
// ============================================================
function DailyEnergyCard({
  chartData, loading,
}: {
  chartData: { date: string; energy_kwh: number | null; fill: string }[]
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
        meta={chartData.length > 0 ? `Generation over the last ${chartData.length} days` : 'Generation over the last 7 days'}
        accent="orange"
      />
      {loading ? (
        <div className="h-[280px] flex items-center justify-center">
          <p className={T.meta}>Loading chart…</p>
        </div>
      ) : chartData.length === 0 ? (
        <ChartEmpty height="h-[280px]" label="No energy data" />
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
                    formatter={(v: any) => (v == null ? '' : `${fmt(Number(v), 1)}\u00A0kWh`)}
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
export default function HouseholdOverviewPage() {
  const { site } = useSite()

  const [overview, setOverview] = useState<HouseholdOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const [trend, setTrend] = useState<PowerTrendPoint[]>([])
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [trendLoading, setTrendLoading] = useState(false)
  const [chartExpanded, setChartExpanded] = useState(false)

  const [dailyEnergy, setDailyEnergy] = useState<DailyEnergyPoint[]>([])
  const [dailyEnergyLoading, setDailyEnergyLoading] = useState(true)

  const POWER_TREND_INTERVAL_MIN = 5   // must match the &interval=5 query param
  const GAP_FACTOR = 2.5

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Daily energy is per inverter. One inverter per household site today, so the
  // chart follows the first one; revisit when multi-inverter sites arrive.
  const dailyDeviceId = overview?.inverters[0]?.id ?? null

  // ---- Fetchers ----

  const fetchOverview = useCallback(async () => {
    if (!site?.id) { setLoading(false); return }
    try {
      const res = await api.get<HouseholdOverview>(`/influx/household/overview/?site=${site.id}`)
      res.data.inverters.sort((a, b) =>
        a.device_id.localeCompare(b.device_id, undefined, { numeric: true })
      )
      setOverview(res.data)
    } catch (err) {
      console.error('Household overview error:', err)
    } finally {
      setLoading(false)
    }
  }, [site?.id])

  const fetchPowerTrend = useCallback(async (silent = false) => {
    // Per-inverter endpoint: needs the inverter id from the overview response
    if (!site?.id || dailyDeviceId == null) return
    if (!silent) setTrendLoading(true)
    try {
      const res = await api.get<{ data: PowerTrendPoint[] }>(
        `/influx/inverter/detail/power-trend/?site=${site.id}&device=${dailyDeviceId}&date=${selectedDate}&interval=${POWER_TREND_INTERVAL_MIN}`
      )
      setTrend(res.data.data ?? [])
    } catch {
      setTrend([])
    } finally {
      if (!silent) setTrendLoading(false)
    }
  }, [site?.id, dailyDeviceId, selectedDate])

  const fetchDailyEnergy = useCallback(async () => {
    if (!site?.id) return
    if (dailyDeviceId == null) {
      // Overview has loaded and there is no inverter to chart — stop the spinner.
      if (!loading) setDailyEnergyLoading(false)
      return
    }
    setDailyEnergyLoading(true)
    try {
      const res = await api.get<{ data: DailyEnergyPoint[] }>(
        `/influx/inverter/detail/daily-energy/?site=${site.id}&device=${dailyDeviceId}&days=7`
      )
      setDailyEnergy(res.data.data ?? [])
    } catch {
      setDailyEnergy([])
    } finally {
      setDailyEnergyLoading(false)
    }
  }, [site?.id, dailyDeviceId, loading])

  useEffect(() => { fetchOverview() }, [fetchOverview])
  useEffect(() => { fetchPowerTrend() }, [fetchPowerTrend])
  useEffect(() => { fetchDailyEnergy() }, [fetchDailyEnergy])

  // Live trend polls every 5 min (data is 5-min aggregated). Silent, today only.
  useEffect(() => {
    if (selectedDate !== todayString()) return
    const id = setInterval(() => fetchPowerTrend(true), 5 * 60_000)
    return () => clearInterval(id)
  }, [selectedDate, fetchPowerTrend])

  // Full refresh — wake events and the manual Refresh button.
  const fetchAll = useCallback(async () => {
    await Promise.all([fetchOverview(), fetchPowerTrend(), fetchDailyEnergy()])
  }, [fetchOverview, fetchPowerTrend, fetchDailyEnergy])

  // Same model as PlantOverview: 60s interval hits only the overview snapshot;
  // wake events and the manual button do a full refresh.
  useAutoRefresh(fetchOverview, {
    intervalMs: 60_000,
    onWake: fetchAll,
  })

  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try { await fetchAll() } finally { setRefreshing(false) }
  }, [refreshing, fetchAll])

  const chartData = useMemo(() => {
    const pts = trend
      .map((p) => ({
        time: minutesFromIstDayStart(p.time, selectedDate),
        power: p.ac_active_power_kw == null ? null : Math.max(0, p.ac_active_power_kw),
      }))
      .filter((p) => p.time >= 0 && p.time <= 1440)
      .sort((a, b) => a.time - b.time)

    // Break the line across data gaps instead of drawing a straight bridge
    const out: typeof pts = []
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i - 1]
      if (prev && pts[i].time - prev.time > POWER_TREND_INTERVAL_MIN * GAP_FACTOR) {
        out.push({ time: prev.time + POWER_TREND_INTERVAL_MIN, power: null })
      }
      out.push(pts[i])
    }
    return out
  }, [trend, selectedDate])

  const dailyEnergyChartData = dailyEnergy.map((d) => ({
    date: d.date,
    energy_kwh: d.energy_kwh,
    fill: d.date === todayString() ? '#e17100' : '#497d00',
  }))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading overview…</p>
      </div>
    )
  }

  const s = overview?.summary
  const loggerOnline = overview?.data_logger?.status === 'online'
  // null when power is missing (night) — the "% of" text is dropped, not shown as 0%
  const capacityPct = s?.active_power_kw != null && s.ac_capacity_kw
    ? Math.round((s.active_power_kw / s.ac_capacity_kw) * 100)
    : null
  const updatedAt = overview?.data_logger?.last_seen ?? overview?.last_updated ?? null

  return (
    <div className="max-w-6xl px-0 mx-auto sm:px-6 md:px-4 lg:px-2 xl:px-0 pb-10">

      {/* ============ HEADER ============ */}
      <header className="pb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        {/* Refresh + timestamp */}
        <div className="order-1 sm:order-2 flex items-center justify-between sm:flex-col sm:items-end gap-3 sm:gap-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap order-2 sm:order-2`}>
            <Clock size={13} strokeWidth={2} />
            {loggerOnline ? (
              <>
                <span className="hidden sm:inline">Updated&nbsp;</span>
                {updatedAt ? formatLastUpdated(updatedAt) : '—'}
              </>
            ) : (
              <span className="text-red-600 font-semibold">OFFLINE</span>
            )}
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-10 px-4 flex items-center gap-2 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold order-1 sm:order-1"
          >
            <RefreshCw size={14} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Title block */}
        <div className="order-2 sm:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 rounded-full bg-[#e17100] shrink-0 self-stretch" />
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <p className={T.eyebrow}>Overview</p>
                <LiveDataIndicator status={overview?.data_logger?.status} lastSeen={overview?.data_logger?.last_seen} />
              </div>
              <h1 className={`${T.siteH1} mt-2 break-words`}>{overview?.site ?? site?.name ?? '—'}</h1>

              <div className="flex flex-wrap items-center gap-2 mt-4 pl-4">
                <InverterStatusChips summary={s} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ============ HERO: Gauge + Energy Rail ============ */}
      <Divider />
      <section className="pt-8 pb-2">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-10 md:gap-12 items-center">

            {/* Gauge column */}
            <div className="flex flex-col items-center">
              <div className="relative flex flex-col items-center px-8 py-8 rounded-3xl bg-gradient-to-b from-[#e17100]/[0.04] to-transparent w-full">
                <p className={`${T.eyebrow} mb-4`}>Active Power</p>
                <PowerGauge value={s?.active_power_kw ?? null} capacity={s?.ac_capacity_kw ?? null} />
                <div className="flex items-center gap-1.5 mt-4">
                  <span className={`w-1.5 h-1.5 rounded-full ${loggerOnline ? 'bg-green-500 animate-pulse' : 'bg-black/30'}`} />
                  <span className={T.meta}>
                    {capacityPct != null && (
                      <><span className="tabular-nums font-semibold text-black">{capacityPct}%</span>{' '}of{' '}</>
                    )}
                    {fmt(s?.ac_capacity_kw, 2)} kW AC
                  </span>
                </div>
              </div>
            </div>

            {/* Energy rail */}
            <div className="flex flex-col self-stretch">
              {[
                {
                  label: 'Energy Today',
                  sub: 'Generated since morning',
                  icon: Sun,
                  tone: '#e17100' as string | null,
                  value: fmt(s?.energy_today_kwh, 2),
                  unit: 'kWh',
                },
                {
                  label: 'CO₂ Avoided Today',
                  sub: 'Equivalent emissions offset',
                  icon: Leaf,
                  tone: '#497d00' as string | null,
                  value: fmt(s?.co2_avoided_today_kg, 1),
                  unit: 'kg',
                },
                {
                  label: 'CUF',
                  sub: 'Capacity utilisation factor',
                  icon: Gauge,
                  tone: '#497d00' as string | null,
                  value: fmt(s?.cuf_pct, 1),
                  unit: '%',
                },
                {
                  label: 'Energy Month',
                  sub: 'Generated this month',
                  icon: CalendarRange,
                  tone: '#e17100' as string | null,
                  value: fmt(s?.energy_month_kwh, 1),
                  unit: 'kWh',
                },
                {
                  label: 'Energy Total',
                  sub: 'Lifetime generation',
                  icon: TrendingUp,
                  tone: null as string | null,
                  value: fmt(s?.energy_total_kwh, 1),
                  unit: 'kWh',
                },
              ].map((m, i, arr) => {
                const Icon = m.icon
                return (
                  <div
                    key={m.label}
                    className={`flex flex-1 items-center justify-between gap-4 py-3.5 ${i < arr.length - 1 ? 'border-b border-black/10' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: m.tone ? `${m.tone}1A` : 'rgba(0,0,0,0.05)' }}
                      >
                        <Icon size={18} style={{ color: m.tone ?? '#000' }} strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <p className={T.eyebrow}>{m.label}</p>
                        <p className="text-[12px] text-black/50 mt-0.5">{m.sub}</p>
                      </div>
                    </div>
                    <div className="flex items-baseline gap-1.5 shrink-0">
                      <span className={T.metricL} style={m.tone ? { color: m.tone } : undefined}>
                        {m.value}
                      </span>
                      <span className={T.unit}>{m.unit}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ============ INVERTERS — one card per inverter ============ */}
      <Divider />
      <Section>
        <SectionHeader
          title={(overview?.inverters.length ?? 0) > 1 ? 'Inverters' : 'Inverter'}
          meta={`${s?.inverters_online ?? 0} of ${s?.inverters_total ?? 0} online`}
          accent="olive"
        />

        {(overview?.inverters.length ?? 0) === 0 ? (
          <p className="text-[13px] text-black/50 py-4">No inverters reporting.</p>
        ) : (
          <div className="space-y-4 pb-3">
            {overview!.inverters.map((inv) => {
              const st = invStatusMeta(inv)
              return (
                <div key={inv.id} className="rounded-2xl border border-black/15 overflow-hidden">
                  <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-4 bg-black/[0.02] border-b border-black/10">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#497d00]/10 flex items-center justify-center shrink-0">
                        <Cpu size={18} className="text-[#497d00]" strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-black tracking-tight truncate">{inv.name}</p>
                        <p className="text-[11px] text-black/45 mt-0.5">
                          {inv.last_updated ? `Updated ${formatLastUpdated(inv.last_updated)}` : 'No data'}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-black/15 bg-white shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                      <span className={`text-[13px] font-semibold whitespace-nowrap ${st.text}`}>{st.label}</span>
                    </span>
                  </div>

                  {/* Row 1: power and energy · Row 2: grid side (single phase) and temperature */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-6 px-5 py-5">
                    {[
                      { label: 'AC Power',      value: fmt(inv.ac_active_power_kw, 2),      unit: 'kW',  accent: true },
                      { label: 'DC Input',      value: fmt(inv.dc_input_power_kw, 2),       unit: 'kW',  accent: false },
                      { label: 'Efficiency',    value: fmt(inv.inverter_efficiency_pct, 1), unit: '%',   accent: false },
                      { label: 'Energy Today',  value: fmt(inv.energy_daily_kwh, 2),        unit: 'kWh', accent: false },
                      { label: 'Energy Total',  value: fmt(inv.energy_total_kwh, 1),        unit: 'kWh', accent: false },
                      { label: 'Grid Voltage',  value: fmt(inv.grid_voltage_a_v, 1),        unit: 'V',   accent: false },
                      { label: 'Grid Current',  value: fmt(inv.ac_current_phase_a, 2),      unit: 'A',   accent: false },
                      { label: 'Frequency',     value: fmt(inv.grid_frequency_hz, 2),       unit: 'Hz',  accent: false },
                      { label: 'Power Factor',  value: fmt(inv.ac_power_factor, 2),         unit: '',    accent: false },
                      { label: 'Internal Temp', value: fmt(inv.internal_temp_c, 1),         unit: '°C',  accent: false },
                    ].map((m) => (
                      <div key={m.label} className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-black/45 whitespace-nowrap">
                          {m.label}
                        </p>
                        <p className="flex items-baseline gap-1 mt-2 whitespace-nowrap">
                          <span className={`text-[20px] font-semibold tracking-tight tabular-nums leading-none ${m.accent ? 'text-[#e17100]' : 'text-black'}`}>
                            {m.value}
                          </span>
                          {m.unit && <span className="text-[11px] text-black/50 font-medium">{m.unit}</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ============ POWER TREND ============ */}
      <Divider />
      <Section>
        <PowerTrendCard
          chartData={chartData}
          trendLoading={trendLoading}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          expanded={chartExpanded}
          onToggle={() => setChartExpanded((o) => !o)}
          height="h-[240px] sm:h-[360px]"
          isMobile={isMobile}
        />
      </Section>

      {/* ============ DAILY ENERGY ============ */}
      <Divider />
      <Section>
        <DailyEnergyCard chartData={dailyEnergyChartData} loading={dailyEnergyLoading} />
      </Section>

      {/* ============ Expanded Power Trend ============ */}
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
