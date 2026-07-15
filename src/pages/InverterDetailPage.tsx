import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  TrendingUp, Gauge, Activity, Clock, Check, Maximize2, Minimize2, RefreshCw, Sun,
} from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  ComposedChart, BarChart, Bar, Cell, LabelList, Area, Line, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'
import { format } from 'date-fns'
import { DatePicker } from '@/components/DatePicker'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'
import { useAutoRefresh } from '@/api/useAutoRefresh'

// ============================================================
// TYPE SCALE — matches Plant/Meter/Inverter Overview. Keep in sync.
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

// ---- Types ----

interface InverterDetail {
  site: string
  device_id: string
  name: string
  ac_active_power_kw: number
  energy_daily_kwh: number
  energy_total_kwh: number
  ac_power_factor: number
  inverter_efficiency_pct: number
  performance_ratio_pct: number
  grid_frequency_hz: number
  ac_reactive_power_kvar: number
  internal_temp_c: number
  grid_voltage_ab_v: number
  grid_voltage_bc_v: number
  grid_voltage_ca_v: number
  status: string
  last_updated: string | null
}

interface TrendPoint {
  time: string
  dc_input_power_kw: number
  ac_active_power_kw: number
  ac_reactive_power_kvar: number
}

interface TrendData {
  data: TrendPoint[]
}

interface DailyEnergyPoint {
  date: string
  energy_kwh: number
}

interface DailyEnergyData {
  data: DailyEnergyPoint[]
}

// ---- Helpers ----

function minutesSinceMidnight(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function formatMinutesTick(minutes: number) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const DAY_TICKS = [0, 180, 360, 540, 720, 900, 1080, 1260, 1440]

function formatLastUpdated(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function dedupeDailyEnergy(points: DailyEnergyPoint[]) {
  const map = new Map<string, number>()
  points.forEach((p) => map.set(p.date, p.energy_kwh))
  return Array.from(map.entries()).map(([date, energy_kwh]) => ({ date, energy_kwh }))
}

// PR color coding — same thresholds as InverterOverviewPage, kept in sync
function prTone(pr: number) {
  if (pr >= 78) return { text: 'text-[#497d00]', fill: '#497d00' }
  if (pr >= 65) return { text: 'text-[#e17100]', fill: '#e17100' }
  return { text: 'text-red-600', fill: '#dc2626' }
}

// ============================================================
// Shared building blocks — identical to Plant/Meter/Inverter Overview
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
    <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
      <div className="flex items-stretch gap-3 min-w-0">
        {accent !== 'none' && (
          <span className={`w-1 self-stretch rounded-full ${bar} shrink-0`} />
        )}
        <div className="min-w-0 py-0.5">
          <h2 className={`${T.sectionTitle} leading-tight`}>{title}</h2>
          {meta && <p className={`${T.meta} mt-0.5`}>{meta}</p>}
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

function StatusChip({ status }: { status: string }) {
  const online = status === 'online'
  const dot = online ? 'bg-green-500' : 'bg-red-500'
  const tone = online ? 'text-green-700' : 'text-red-600'
  return (
    <div className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full border border-black/15 bg-white shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`text-[12px] font-semibold ${tone} uppercase tracking-[0.08em]`}>{status}</span>
    </div>
  )
}

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

// KPI metric — editorial version, matches Inverter Overview's KpiMetric
function KpiMetric({
  label, value, unit, icon: Icon, tone,
}: {
  label: string
  value: string | number
  unit?: string
  icon: React.ElementType
  tone?: 'orange' | 'olive' | 'red'
}) {
  const colorMap = { orange: 'text-[#e17100]', olive: 'text-[#497d00]', red: 'text-red-600' }
  const iconColor = tone ? colorMap[tone] : 'text-black'
  const valColor = tone ? colorMap[tone] : ''
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon size={14} className={`${iconColor} shrink-0`} strokeWidth={2} />
        <p className={T.eyebrow}>{label}</p>
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`${T.metricL} ${valColor}`}>{value}</span>
        {unit && <span className={T.unit}>{unit}</span>}
      </div>
    </div>
  )
}

function ActivePowerGauge({ value }: { value: number }) {
  // No fixed capacity field on this endpoint, so scale the arc against a
  // generous round number rather than leaving it perpetually near-empty or
  // clipped. 500kW covers a typical single-inverter range comfortably —
  // swap for a real per-inverter capacity field if one becomes available.
  const capacity = 500
  const pct = Math.min(100, (value / capacity) * 100)
  const data = [{ name: 'power', value: pct }]
  return (
    <div className="relative w-[180px] h-[180px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={225}
          endAngle={-45}
          innerRadius="78%"
          outerRadius="100%"
          barSize={11}
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
        <span className="text-[32px] font-semibold tracking-tight tabular-nums leading-none text-[#e17100]">
          {value.toFixed(1)}
        </span>
        <span className={`${T.unit} mt-1`}>kW</span>
      </div>
    </div>
  )
}

// Electrical detail row — editorial hairline list
function DetailRow({ label, value, unit, isLast = false }: { label: string; value: string | number; unit?: string; isLast?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-3 ${isLast ? '' : 'border-b border-black/10'}`}>
      <p className={T.eyebrow}>{label}</p>
      <div className="flex items-baseline gap-1 shrink-0">
        <span className={T.metricM}>{value}</span>
        {unit && <span className={T.unit}>{unit}</span>}
      </div>
    </div>
  )
}

// ============================================================
// Power Trend chart
// ============================================================
function PowerTrendCard({
  trendChartData, trendChartConfig, trendLoading, selectedDate, setSelectedDate,
  hiddenSeries, toggleSeries, expanded, onToggle, height,
}: {
  trendChartData: { time: number; dc: number | null; ac: number | null; reactive: number | null }[]
  trendChartConfig: Record<string, { label: string; color: string }>
  trendLoading: boolean
  selectedDate: string
  setSelectedDate: (d: string) => void
  hiddenSeries: Set<string>
  toggleSeries: (key: string) => void
  expanded: boolean
  onToggle: () => void
  height: number
}) {
  const SERIES = [
    { key: 'ac', label: 'AC Active', color: '#e17100' },
    { key: 'dc', label: 'DC Input', color: '#497d00' },
    { key: 'reactive', label: 'AC Reactive', color: '#8A8A8A' },
  ]

  return (
    <div className={expanded ? 'px-6 pt-5 pb-5' : ''}>
      <SectionHeader
        title="Power Trend"
        meta={`DC input · AC active · AC reactive · ${selectedDate === todayString() ? 'Today' : selectedDate}`}
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

      <div className="flex items-center gap-4 flex-wrap mb-4">
        {SERIES.map((s) => (
          <button key={s.key} type="button" onClick={() => toggleSeries(s.key)} className="flex items-center gap-1.5">
            <span
              className="w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors"
              style={{
                backgroundColor: hiddenSeries.has(s.key) ? 'transparent' : s.color,
                borderColor: hiddenSeries.has(s.key) ? '#D4D4D4' : s.color,
              }}
            >
              {!hiddenSeries.has(s.key) && <Check size={11} className="text-white" strokeWidth={3} />}
            </span>
            <span className="text-[13px] text-black font-semibold">{s.label}</span>
          </button>
        ))}
      </div>

      {trendLoading ? (
        <div style={{ height }} className="flex items-center justify-center">
          <p className={T.meta}>Loading chart…</p>
        </div>
      ) : (
        <ChartContainer config={trendChartConfig} style={{ height, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="acPowerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e17100" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#e17100" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={[0, 1440]}
                ticks={DAY_TICKS}
                tickFormatter={formatMinutesTick}
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) => {
                      const time = payload?.[0]?.payload?.time
                      return typeof time === 'number' ? formatMinutesTick(time) : ''
                    }}
                  />
                }
              />
              {!hiddenSeries.has('ac') && (
                <Area
                  type="monotone"
                  dataKey="ac"
                  stroke="#e17100"
                  strokeWidth={1.5}
                  fill="url(#acPowerGradient)"
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 4, fill: '#e17100' }}
                />
              )}
              {!hiddenSeries.has('dc') && (
                <Line
                  type="monotone"
                  dataKey="dc"
                  stroke="#497d00"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 4, fill: '#497d00' }}
                />
              )}
              {!hiddenSeries.has('reactive') && (
                <Line
                  type="monotone"
                  dataKey="reactive"
                  stroke="#8A8A8A"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 4, fill: '#8A8A8A' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
    </div>
  )
}

//  Energy Card 
// NEW — add this component definition, placed near PowerTrendCard in the file
function DailyEnergyCard({
  chartData, loading,
}: {
  chartData: { label: string; energy: number; isToday: boolean }[]
  loading: boolean
  chartConfig: Record<string, { label: string; color: string }>
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
      <SectionHeader title="Daily Energy" meta="Last 7 days" accent="orange" />
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
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#171717' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#171717' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Bar dataKey="energy" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList
                    dataKey="energy"
                    position="top"
                    formatter={(value: unknown) => {
                      const num = typeof value === 'number' ? value : Number(value)
                      return Number.isFinite(num) ? `${num.toFixed(1)}\u00A0kWh` : ''
                    }}
                    style={{ fontSize: isMobile ? 10 : 12, fontWeight: 600, fill: '#171717' }}
                  />
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.isToday ? '#e17100' : '#497d00'} />
                  ))}
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
// Main Page
// ============================================================
export default function InverterDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const { site, devices } = useSite()

  const device = devices.find((d) => d.influx_device_id === deviceId)

  const [detail, setDetail] = useState<InverterDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())
  const [chartExpanded, setChartExpanded] = useState(false)

  const [dailyEnergy, setDailyEnergy] = useState<DailyEnergyPoint[]>([])
  const [dailyLoading, setDailyLoading] = useState(true)

  function toggleSeries(key: string) {
    setHiddenSeries((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }


  const fetchDetail = useCallback(async () => {
    if (!site?.id || !device?.id) { setLoading(false); return }
    try {
      const res = await api.get<InverterDetail>(
        `/influx/inverter/detail/?site=${site.id}&device=${device.id}`
      )
      setDetail(res.data)
    } catch (err) {
      console.error('Inverter detail error:', err)
    } finally {
      setLoading(false)
    }
  }, [site?.id, device?.id])

  const fetchTrend = useCallback(async () => {
    if (!site?.id || !device?.id) return
    setTrendLoading(true)
    try {
      const res = await api.get<TrendData>(
        `/influx/inverter/detail/power-trend/?site=${site.id}&device=${device.id}&date=${selectedDate}&interval=5`
      )
      setTrend(res.data.data)
    } catch {
      setTrend([])
    } finally {
      setTrendLoading(false)
    }
  }, [site?.id, device?.id, selectedDate])

  const fetchDailyEnergy = useCallback(async () => {
    if (!site?.id || !device?.id) return
    setDailyLoading(true)
    try {
      const res = await api.get<DailyEnergyData>(
        `/influx/inverter/detail/daily-energy/?site=${site.id}&device=${device.id}&days=7`
      )
      setDailyEnergy(dedupeDailyEnergy(res.data.data))
    } catch {
      setDailyEnergy([])
    } finally {
      setDailyLoading(false)
    }
  }, [site?.id, device?.id])

  useEffect(() => { fetchDetail() }, [fetchDetail])
  useEffect(() => { fetchTrend() }, [fetchTrend])
  useEffect(() => { fetchDailyEnergy() }, [fetchDailyEnergy])

  // Full refresh — wake events + manual Refresh button.
  const fetchAll = useCallback(async () => {
    await Promise.all([fetchDetail(), fetchTrend(), fetchDailyEnergy()])
  }, [fetchDetail, fetchTrend, fetchDailyEnergy])

  // Interval (60s): detail snapshot only. Wake events (visibility/focus/pageshow/online)
  // and manual refresh: full refresh via fetchAll.
  const { refetch, isRefetching } = useAutoRefresh(fetchDetail, {
    intervalMs: 60_000,
    onWake: fetchAll,
  })

  const trendChartData = useMemo(
    () =>
      trend.map((p) => ({
        time: minutesSinceMidnight(p.time),
        dc: p.dc_input_power_kw > 0 ? p.dc_input_power_kw : null,
        ac: p.ac_active_power_kw > 0 ? p.ac_active_power_kw : null,
        reactive: p.ac_reactive_power_kvar > 0 ? p.ac_reactive_power_kvar : null,
      })),
    [trend]
  )

  const dailyChartData = useMemo(
    () =>
      dailyEnergy.map((d) => ({
        label: format(new Date(d.date), 'MMM d'),
        energy: d.energy_kwh,
        isToday: d.date === todayString(),
      })),
    [dailyEnergy]
  )

  if (!device) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Device not found for this site.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading inverter detail…</p>
      </div>
    )
  }

  const trendChartConfig = {
    ac: { label: 'AC Active Power (kW)', color: '#e17100' },
    dc: { label: 'DC Input Power (kW)', color: '#497d00' },
    reactive: { label: 'AC Reactive Power (kVAR)', color: '#8A8A8A' },
  }

  const dailyChartConfig = {
    energy: { label: 'Energy (kWh)', color: '#e17100' },
  }

  const pr = detail?.performance_ratio_pct ?? 0
  const prToneVal = prTone(pr)

  return (
    <div className="w-full max-w-[1152px] mx-auto px-0 sm:px-6 md:px-6 lg:px-6 pb-10">

      {/* ============ HEADER ============ */}
      <header className="pb-5 flex flex-col md:flex-row md:items-start md:justify-between md:flex-wrap gap-3 md:gap-6">
        <div className="order-1 md:order-2 flex items-center justify-between md:flex-col md:items-end gap-3 md:gap-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap`}>
            <Clock size={13} strokeWidth={2} />
            {detail?.last_updated ? (
              <>
                <span className="hidden md:inline">Updated&nbsp;</span>
                {formatLastUpdated(detail.last_updated)}
              </>
            ) : (
              <span className="text-red-600 font-semibold">OFFLINE</span>
            )}
          </p>
          <button
            type="button"
            onClick={refetch}
            disabled={isRefetching}
            className="h-10 px-4 flex items-center gap-2 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Refresh
          </button>
        </div>

        <div className="order-2 md:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 self-stretch rounded-full bg-[#e17100] shrink-0" />
            <div className="min-w-0 py-0.5">
              <p className={T.eyebrow}>Inverter Detail</p>
              <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                <h1 className={`${T.siteH1} leading-tight break-words`}>{detail?.name}</h1>
                {detail && <StatusChip status={detail.status} />}
              </div>
              <p className={`${T.body} mt-1`}>{detail?.site}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ============ KPI ROW + PR GAUGE ============ */}
      <Divider />
      <section className="pt-8 pb-8">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 md:gap-12 items-center">

            {/* Active Power gauge column */}
            <div className="flex flex-col items-center">
              <p className={`${T.eyebrow} mb-3`}>Active Power</p>
              <ActivePowerGauge value={detail?.ac_active_power_kw ?? 0} />
            </div>

            {/* KPI grid — PR now sits here as a plain colored number */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-6">
              <KpiMetric
                label="Performance Ratio"
                value={pr.toFixed(1)}
                unit="%"
                icon={Gauge}
                tone={prToneVal.text.includes('497d00') ? 'olive' : prToneVal.text.includes('dc2626') ? 'red' : 'orange'}
              />
              <KpiMetric
                label="Energy Today"
                value={detail?.energy_daily_kwh?.toLocaleString() ?? '—'}
                unit="kWh"
                icon={Sun}
                tone="orange"
              />
              <KpiMetric
                label="Total Energy"
                value={detail ? (detail.energy_total_kwh / 1000).toFixed(1) : '—'}
                unit="MWh"
                icon={TrendingUp}
                tone="olive"
              />
              <KpiMetric
                label="Efficiency"
                value={detail ? detail.inverter_efficiency_pct.toFixed(1) : '—'}
                unit="%"
                icon={Activity}
              />
            </div>
          </div>
        </section>

      {/* ============ POWER TREND + ELECTRICAL DETAILS ============ */}
      <Divider />
      <Section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          <div className="md:col-span-2 min-w-0">
            <PowerTrendCard
              trendChartData={trendChartData}
              trendChartConfig={trendChartConfig}
              trendLoading={trendLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              hiddenSeries={hiddenSeries}
              toggleSeries={toggleSeries}
              expanded={chartExpanded}
              onToggle={() => setChartExpanded(o => !o)}
              height={240}
            />
          </div>

          <div className="min-w-0">
            <SectionHeader title="Electrical Details" meta="Grid & power quality" accent="olive" />
            <div className="flex flex-col">
              <DetailRow label="Voltage A-B" value={detail ? (detail.grid_voltage_ab_v / 1000).toFixed(2) : '—'} unit="kV" />
              <DetailRow label="Voltage B-C" value={detail ? (detail.grid_voltage_bc_v / 1000).toFixed(2) : '—'} unit="kV" />
              <DetailRow label="Voltage C-A" value={detail ? (detail.grid_voltage_ca_v / 1000).toFixed(2) : '—'} unit="kV" />
              <DetailRow label="Frequency" value={detail?.grid_frequency_hz.toFixed(2) ?? '—'} unit="Hz" />
              <DetailRow label="Power Factor" value={detail?.ac_power_factor.toFixed(2) ?? '—'} />
              <DetailRow label="Reactive Power" value={detail?.ac_reactive_power_kvar.toFixed(2) ?? '—'} unit="kVAR" />
              <DetailRow label="Internal Temp" value={detail?.internal_temp_c.toFixed(1) ?? '—'} unit="°C" isLast />
            </div>
          </div>
        </div>
      </Section>

      {/* ============ DAILY ENERGY ============ */}
      <Divider />
      <Section>
        <DailyEnergyCard
          chartData={dailyChartData}
          loading={dailyLoading}
          chartConfig={dailyChartConfig}
        />
      </Section>

      {/* ============ Modal ============ */}
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
              trendChartData={trendChartData}
              trendChartConfig={trendChartConfig}
              trendLoading={trendLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              hiddenSeries={hiddenSeries}
              toggleSeries={toggleSeries}
              expanded={chartExpanded}
              onToggle={() => setChartExpanded(false)}
              height={480}
            />
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}