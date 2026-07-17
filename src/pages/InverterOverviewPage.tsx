import { useEffect, useCallback, useState } from 'react'
import { Zap, TrendingUp, Cpu, Clock, RefreshCw, Sun } from 'lucide-react'
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
import { useAutoRefresh } from '@/api/useAutoRefresh'

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
  metricXL:     'text-[38px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricM:      'text-[16px] font-semibold text-black tabular-nums leading-none',
  unit:         'text-[13px] text-black font-medium',
}

// ---- Types ----

interface InverterData {
  device_id: string
  name: string
  ac_active_power_kw: number | null
  energy_daily_kwh: number | null
  energy_total_kwh: number | null
  ac_reactive_power_kvar: number | null
  ac_power_factor: number | null
  grid_frequency_hz: number | null
  inverter_efficiency_pct: number | null
  performance_ratio_pct: number | null
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
  const dot = online ? 'bg-green-500' : 'bg-black/25'
  const tone = online ? 'text-green-700' : 'text-black/50'
  return (
    <div className="inline-flex items-center gap-2 h-7 pl-2.5 pr-3 rounded-full border border-black/15 bg-white shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`text-[12px] font-semibold ${tone} uppercase tracking-[0.08em]`}>{status}</span>
    </div>
  )
}

function HealthFooter({ online, total }: { online: number; total: number }) {
  const allUp = online === total
  const off = total - online
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: allUp ? '#497d00' : '#dc2626' }} />
      <span style={{ color: allUp ? '#497d00' : '#dc2626' }}>
        {allUp ? 'All online' : `${off} offline`}
      </span>
    </span>
  )
}

function InverterSnapshotCard({ inv }: { inv: InverterData }) {
  const online = inv.status === 'online'
  return (
    <div className="flex items-stretch gap-3 min-w-0 pb-5">
      <span className={`w-1 rounded-full shrink-0 self-stretch ${online ? 'bg-[#497d00]' : 'bg-black/15'}`} />
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-[15px] font-semibold text-black truncate">{inv.name}</p>
          <StatusChip status={inv.status} />
        </div>
        <div className="flex items-baseline gap-1 mb-3">
          <span className={T.metricL}>{inv.performance_ratio_pct?.toFixed(1) ?? '—'}</span>
          <span className={T.unit}>% PR</span>
        </div>
        <div className="h-1.5 bg-black/[0.06] rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full bg-[#497d00]" style={{ width: `${Math.min(100, Math.max(0, inv.performance_ratio_pct ?? 0))}%` }} />
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="flex items-baseline gap-1">
            <span className="font-semibold tabular-nums text-black">{inv.ac_active_power_kw?.toFixed(1) ?? '—'}</span>
            <span className="text-black/50">kW</span>
          </span>
          <span className="flex items-baseline gap-1">
            <span className="font-semibold tabular-nums text-[#e17100]">{inv.energy_daily_kwh?.toLocaleString() ?? '—'}
              </span>
            <span className="text-black/50">kWh today</span>
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
                    {inv.ac_active_power_kw?.toFixed(2) ?? '—'}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.ac_reactive_power_kvar?.toFixed(2) ?? '—'}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.energy_daily_kwh?.toLocaleString() ?? '—'}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.energy_total_kwh != null ? (inv.energy_total_kwh / 1000).toFixed(1) : '—'}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.inverter_efficiency_pct != null ? `${inv.inverter_efficiency_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold tabular-nums text-black">
                    {inv.performance_ratio_pct != null ? `${inv.performance_ratio_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.ac_power_factor?.toFixed(2) ?? '—'}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {inv.grid_frequency_hz?.toFixed(2) ?? '—'}
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

const fetchOverview = useCallback(async () => {
    if (!site?.id) { setLoading(false); return }
    try {
      const res = await api.get<InverterOverview>(`/influx/inverter/overview/?site=${site.id}`)
      res.data.inverters.sort((a, b) => a.name.localeCompare(b.name))
      setOverview(res.data)
    } catch (err) {
      console.error('Inverter overview error:', err)
    } finally {
      setLoading(false)
    }
  }, [site?.id])

  const fetchTrend = useCallback(async () => {
    if (!site?.id) return
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
  }, [site?.id, selectedDate])

  useEffect(() => { fetchOverview() }, [fetchOverview])
  useEffect(() => { fetchTrend() }, [fetchTrend])

  // Full refresh — wake events + manual Refresh button.
  const fetchAll = useCallback(async () => {
    await Promise.all([fetchOverview(), fetchTrend()])
  }, [fetchOverview, fetchTrend])

  // Interval (60s): overview only. Wake events (visibility/focus/pageshow/online)
  // and manual refresh: full refresh via fetchAll.
  const { refetch, isRefetching } = useAutoRefresh(fetchOverview, {
    intervalMs: 60_000,
    onWake: fetchAll,
  })

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

    {/* ============ SUMMARY KPIS ============ */}
    <Divider />
    <section className="pt-8 pb-2">
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-0 lg:divide-x lg:divide-black/15">

        {/* Hero — Total Active Power */}
        <div className="lg:pr-10 min-w-0 lg:self-start">
          <div className="relative flex items-stretch gap-3 lg:pb-5">
            <span className="w-1 rounded-full bg-[#e17100] shrink-0 self-stretch" />
            <div className="flex-1 min-w-0 rounded-2xl bg-gradient-to-b from-[#e17100]/[0.05] to-transparent px-5 py-5">
              <div className="flex items-center justify-between mb-4">
                <p className={T.eyebrow}>Total Active Power</p>
                <Zap size={16} className="text-[#e17100]" strokeWidth={2} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className={T.metricXL}>
                  {overview?.summary.total_ac_active_power_kw.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '—'}
                </span>
                <span className={T.unit}>kW</span>
              </div>

              {/* Overall PR as the hero's progress bar — colored via prTone */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-black/50 font-medium">Overall performance ratio</span>
                  <span className={`text-[12px] font-semibold tabular-nums`}>{overallPR.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-black/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full`}
                    style={{ width: `${Math.min(100, Math.max(0, overallPR))}%` }}
                  />
                </div>
                <p className="text-[11px] text-black/40 mt-1.5 tabular-nums">
                  Target ≥ 78% · {overview?.summary.online_count ?? 0} inverters live
                </p>
              </div>
            </div>
          </div>
        </div>

    {/* Rail — supporting metrics */}
    <div className="lg:pl-10 flex flex-col justify-center divide-y divide-black/10">
      <div className="flex items-center justify-between py-3.5 gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <TrendingUp size={15} className="text-black/40 shrink-0" strokeWidth={2} />
          <span className={T.eyebrow}>Energy Today</span>
        </div>
        <span className={`${T.metricL} shrink-0`}>
          {overview?.summary.total_energy_daily_kwh?.toLocaleString() ?? '—'}
          <span className={`${T.unit} ml-1`}>kWh</span>
        </span>
      </div>

      <div className="flex items-center justify-between py-3.5 gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Cpu size={15} className="text-black/40 shrink-0" strokeWidth={2} />
          <span className={T.eyebrow}>Inverters Online</span>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={T.metricL}>
            {overview?.summary.online_count ?? '—'}<span className={`${T.unit} ml-1`}>/ {overview?.summary.total_count ?? '—'}</span>
          </span>
          {overview && <HealthFooter online={overview.summary.online_count} total={overview.summary.total_count} />}
        </div>
      </div>

      <div className="flex items-center justify-between py-3.5 gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sun size={15} className="text-black/40 shrink-0" strokeWidth={2} />
          <span className={T.eyebrow}>POA Irradiation</span>
        </div>
        <span className={`${T.metricL} shrink-0`}>
          {overview?.summary.poa_irradiation_kwh_m2?.toFixed(2) ?? '—'}
          <span className={`${T.unit} ml-1`}>kWh/m²</span>
        </span>
      </div>
    </div>
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