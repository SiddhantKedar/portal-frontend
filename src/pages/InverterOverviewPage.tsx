import { useEffect, useRef, useState } from 'react'
import { Zap, TrendingUp, Cpu, Gauge, Clock, RefreshCw, Sun } from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { DatePicker } from '@/components/DatePicker'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

// ============================================================
// TYPE SCALE — matches PlantOverviewPage.tsx / MeterOverviewPage.tsx. Keep in sync.
// ============================================================
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  body:         'text-[14px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
  metricL:      'text-[22px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricM:      'text-[16px] font-semibold text-black tabular-nums leading-none',
  unit:         'text-[13px] text-black font-medium',
}

// ---- Types ----

interface InverterData {
  device_id: string
  name: string
  ac_active_power_kw: number
  energy_daily_kwh: number
  energy_total_kwh: number
  ac_reactive_power_kvar: number
  ac_power_factor: number
  grid_frequency_hz: number
  inverter_efficiency_pct: number
  performance_ratio_pct: number
  status: string
  last_updated: string
}

interface InverterOverview {
  site: string
  summary: {
    total_ac_active_power_kw: number
    total_energy_daily_kwh: number
    online_count: number
    total_count: number
    performance_ratio_pct: number
    poa_irradiation_kwh_m2: number
  }
  inverters: InverterData[]
}

interface PowerTrendPoint {
  time: string
  power_kw: number
}

interface PowerTrendData {
  data: PowerTrendPoint[]
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

// PR color coding — shared threshold logic so the gauge, table cells, and
// KPI callout all agree on what counts as "good".
function prTone(pr: number) {
  if (pr >= 78) return { text: 'text-[#497d00]', bar: 'bg-[#497d00]' }
  if (pr >= 65) return { text: 'text-[#e17100]', bar: 'bg-[#e17100]' }
  return { text: 'text-red-600', bar: 'bg-red-500' }
}

// ============================================================
// Shared building blocks — identical to PlantOverview/MeterOverview
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
    <div className="inline-flex items-center gap-2 h-7 pl-2.5 pr-3 rounded-full border border-black/15 bg-white shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`text-[12px] font-semibold ${tone} uppercase tracking-[0.08em]`}>{status}</span>
    </div>
  )
}

// KPI metric — editorial version of the old bordered KpiCard, matches
// Plant Overview's energy-rail rows: eyebrow, value, unit, no boxes.
function KpiMetric({
  label, value, unit, icon: Icon, tone,
}: {
  label: string
  value: string | number
  unit?: string
  icon: React.ElementType
  tone?: 'orange' | 'olive'
}) {
  const iconColor = tone === 'orange' ? 'text-[#e17100]' : tone === 'olive' ? 'text-[#497d00]' : 'text-black'
  const valColor  = tone === 'orange' ? 'text-[#e17100]' : tone === 'olive' ? 'text-[#497d00]' : ''
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

// ============================================================
// Per-inverter snapshot card — same shell as Meter cards for consistency,
// PR is the lead metric since that's the ask for this page.
// ============================================================
function InverterSnapshotCard({ inv }: { inv: InverterData }) {
  const isOnline = inv.status === 'online'
  const tone = prTone(inv.performance_ratio_pct)

  return (
    <div className="rounded-xl border border-black/15 overflow-hidden bg-white">
      <div className={`h-1 w-full ${tone.bar}`} />
      <div className="px-5 pt-4 pb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <p className="text-[16px] font-semibold text-black truncate">{inv.name}</p>
          <StatusChip status={inv.status} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">

          <div className="flex items-start gap-2">
            <Zap size={14} className="text-black mt-0.5 shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <p className={T.eyebrow}>Active Power</p>
              <p className={`${T.metricM} mt-0.5`}>
                {inv.ac_active_power_kw.toFixed(1)}
                <span className={`${T.unit} ml-1`}>kW</span>
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Sun size={14} className="text-[#e17100] mt-0.5 shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <p className={T.eyebrow}>Energy Today</p>
              <p className={`${T.metricM} text-[#e17100] mt-0.5`}>
                {inv.energy_daily_kwh.toLocaleString()}
                <span className={`${T.unit} ml-1`}>kWh</span>
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Gauge size={14} className={`${tone.text} mt-0.5 shrink-0`} strokeWidth={2} />
            <div className="min-w-0">
              <p className={T.eyebrow}>Perf. Ratio</p>
              <p className={`${T.metricM} ${tone.text} mt-0.5`}>
                {inv.performance_ratio_pct.toFixed(1)}
                <span className={`${T.unit} ml-1`}>%</span>
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <TrendingUp size={14} className="text-black mt-0.5 shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <p className={T.eyebrow}>Efficiency</p>
              <p className={`${T.metricM} mt-0.5`}>{inv.inverter_efficiency_pct.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-black/10">
          <div className="flex items-center gap-1.5">
            <span className={T.meta}>PF {inv.ac_power_factor.toFixed(2)}</span>
            <span className="text-black/30">·</span>
            <span className={T.meta}>{inv.grid_frequency_hz.toFixed(2)} Hz</span>
          </div>
          <span className={`${T.meta} flex items-center gap-1`}>
            <Clock size={11} strokeWidth={2} />
            {isOnline && inv.last_updated ? formatLastUpdated(inv.last_updated) : (
              <span className="text-red-600 font-semibold">OFFLINE</span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Editorial inverters table — PR + efficiency both shown as distinct columns
// ============================================================
function InvertersTable({ inverters }: { inverters: InverterData[] }) {
  return (
    <div>
      <SectionHeader
        title="Inverters"
        meta="Live data, efficiency & performance ratio per inverter"
        accent="orange"
      />
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[13px] min-w-[820px] border-collapse">
          <thead>
            <tr className="border-b border-black/15">
              <th className="sticky left-0 bg-white text-left text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5">
                Inverter
              </th>
              <th className="text-center text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5">
                Status
              </th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5 whitespace-nowrap">
                Active Power (kW)
              </th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5 whitespace-nowrap">
                Reactive Power (kVAR)
              </th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5 whitespace-nowrap">
                Energy Today (kWh)
              </th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5 whitespace-nowrap">
                Energy Total (MWh)
              </th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5 whitespace-nowrap">
                Efficiency
              </th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5 whitespace-nowrap">
                Perf. Ratio
              </th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5 whitespace-nowrap">
                Power Factor
              </th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black font-semibold px-3 py-2.5 whitespace-nowrap">
                Frequency (Hz)
              </th>
              
            </tr>
          </thead>
          <tbody>
            {inverters.map((inv) => {
              const tone = prTone(inv.performance_ratio_pct)
              return (
                <tr key={inv.device_id} className="border-b border-black/10">
                  <td className="sticky left-0 bg-white py-3 px-3 font-semibold text-black whitespace-nowrap">
                    {inv.name}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className="inline-flex">
                      <StatusChip status={inv.status} />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.ac_active_power_kw.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.ac_reactive_power_kvar.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.energy_daily_kwh.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {(inv.energy_total_kwh / 1000).toFixed(1)}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.inverter_efficiency_pct.toFixed(1)}%
                  </td>
                  <td className={`py-3 px-3 text-right font-semibold tabular-nums ${tone.text}`}>
                    {inv.performance_ratio_pct.toFixed(1)}%
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.ac_power_factor.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.grid_frequency_hz.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Main Page
// ============================================================
export default function InverterOverviewPage() {
  const { site } = useSite()
  const [overview, setOverview] = useState<InverterOverview | null>(null)
  const [trend, setTrend] = useState<PowerTrendPoint[]>([])
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [trendLoading, setTrendLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  const [refreshTick, setRefreshTick] = useState(0)
  const lastActivity = useRef(Date.now())

  // Activity tracking for auto-refresh backoff — identical to Plant/Meter Overview
  useEffect(() => {
    const updateActivity = () => { lastActivity.current = Date.now() }
    window.addEventListener('mousemove', updateActivity)
    window.addEventListener('keydown', updateActivity)
    window.addEventListener('click', updateActivity)
    return () => {
      window.removeEventListener('mousemove', updateActivity)
      window.removeEventListener('keydown', updateActivity)
      window.removeEventListener('click', updateActivity)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivity.current
      const isIdle = idleMs > 60_000
      const isHidden = document.visibilityState !== 'visible'
      if (!isIdle && !isHidden) {
        setRefreshTick((t) => t + 1)
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!site?.id) return
    const fetchOverview = async () => {
      try {
        const res = await api.get<InverterOverview>(`/influx/inverter/overview/?site=${site.id}`)
        res.data.inverters.sort((a, b) => a.name.localeCompare(b.name))
        setOverview(res.data)
      } catch (err) {
        console.error('Inverter overview error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchOverview()
  }, [site?.id, refreshTick])

  useEffect(() => {
    if (!site?.id) return
    const fetchTrend = async () => {
      setTrendLoading(true)
      try {
        const res = await api.get<PowerTrendData>(
          `/influx/inverter/power-trend/?site=${site.id}&date=${selectedDate}`
        )
        setTrend(res.data.data)
      } catch {
        setTrend([])
      } finally {
        setTrendLoading(false)
      }
    }
    fetchTrend()
  }, [site?.id, selectedDate])

  const chartData = trend.map((p) => ({
    time: minutesSinceMidnight(p.time),
    power: p.power_kw > 0 ? p.power_kw : null,
  }))

  const chartConfig = {
    power: { label: 'Active Power (kW)', color: '#e17100' },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading inverter overview…</p>
      </div>
    )
  }

  const latestUpdate = overview?.inverters
    .map((i) => i.last_updated)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1)

  const overallPR = overview?.summary.performance_ratio_pct ?? 0
  const overallTone = prTone(overallPR)

  return (
    <div className="w-full max-w-[1152px] mx-auto px-0 sm:px-6 md:px-6 lg:px-6 pb-10">

      {/* ============ HEADER ============ */}
      <header className="pb-5 flex flex-col md:flex-row md:items-start md:justify-between md:flex-wrap gap-3 md:gap-6">
        <div className="order-1 md:order-2 flex items-center justify-between md:flex-col md:items-end gap-3 md:gap-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap`}>
            <Clock size={13} strokeWidth={2} />
            {latestUpdate ? (
              <>
                <span className="hidden md:inline">Updated&nbsp;</span>
                {formatLastUpdated(latestUpdate)}
              </>
            ) : (
              <span className="text-red-600 font-semibold">OFFLINE</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
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
              <p className={T.eyebrow}>Inverter Overview</p>
              <h1 className={`${T.siteH1} mt-1 leading-tight break-words`}>{overview?.site ?? '—'}</h1>
              <p className={`${T.body} mt-1`}>
                {overview?.summary.total_count ?? 0} inverter{(overview?.summary.total_count ?? 0) !== 1 ? 's' : ''}
                <span className="mx-2 text-black">·</span>
                <span className="tabular-nums">{overview?.summary.online_count ?? 0}/{overview?.summary.total_count ?? 0} online</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ============ KPI ROW ============ */}
      <Divider />
      <section className="pt-8 pb-8">
        <div className="grid gap-x-6 gap-y-8 grid-cols-2 lg:grid-cols-4">
          <KpiMetric
            label="Total Active Power"
            value={overview?.summary.total_ac_active_power_kw.toLocaleString() ?? '—'}
            unit="kW"
            icon={Zap}
            tone="orange"
          />
          <KpiMetric
            label="Energy Today"
            value={overview?.summary.total_energy_daily_kwh?.toLocaleString() ?? '—'}
            unit="kWh"
            icon={Sun}
            tone="orange"
          />
          <KpiMetric
            label="Inverters Online"
            value={`${overview?.summary.online_count ?? '—'}/${overview?.summary.total_count ?? '—'}`}
            icon={Cpu}
          />
          <KpiMetric
            label="Overall Performance Ratio"
            value={overallPR.toFixed(1)}
            unit="%"
            icon={Gauge}
            tone={overallTone.text.includes('497d00') ? 'olive' : 'orange'}
          />
        </div>
      </section>

      {/* ============ PER-INVERTER SNAPSHOTS ============ */}
      {(overview?.inverters.length ?? 0) > 0 && (
        <>
          <Divider />
          <Section>
            <SectionHeader
              title="Live Snapshot"
              meta={`${todayString()} · Performance ratio per inverter`}
              accent="olive"
            />
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
            >
              {overview?.inverters.map((inv) => (
                <InverterSnapshotCard key={inv.device_id} inv={inv} />
              ))}
            </div>
          </Section>
        </>
      )}

      {/* ============ INVERTERS TABLE ============ */}
      <Divider />
      <Section>
        <InvertersTable inverters={overview?.inverters ?? []} />
      </Section>

      {/* ============ POWER TREND ============ */}
      <Divider />
      <Section>
        <SectionHeader
          title="Power Trend"
          meta={`Total inverter output · ${selectedDate === todayString() ? 'Today' : selectedDate}`}
          accent="orange"
          actions={
            <DatePicker value={selectedDate} onChange={setSelectedDate} maxDate={new Date()} />
          }
        />
        {trendLoading ? (
          <div className="h-[240px] flex items-center justify-center">
            <p className={T.meta}>Loading chart…</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="invPowerGradient" x1="0" y1="0" x2="0" y2="1">
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
                <Area
                  type="monotone"
                  dataKey="power"
                  stroke="#e17100"
                  strokeWidth={1.5}
                  fill="url(#invPowerGradient)"
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 4, fill: '#e17100' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </Section>

    </div>
  )
}