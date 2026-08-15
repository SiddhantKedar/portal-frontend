import { useEffect, useCallback, useState, useMemo } from 'react'
import { Zap, TrendingUp, Cpu, Clock, RefreshCw, Sun, Activity } from 'lucide-react'
import {
  Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Line, ComposedChart, Tooltip,
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
  inverter_status: { code: number; label: string } | null
  last_updated: string | null 
}

interface InverterOverview {
  site: string
  summary: {
    total_ac_active_power_kw: number
    total_energy_daily_kwh: number
    online_count: number
    total_count: number
    states: {
      running: number
      stopped: number
      standby: number
      warning: number
      fault: number
      other: number
    }
    performance_ratio_pct: number
    poa_irradiation_kwh_m2: number
  }
  inverters: InverterData[]
}

interface PowerTrendPoint {
  time: string
  active_power_total_kw: number | null
  irradiation_inclined_wm2: number | null
}

interface PowerTrendData {
  data: PowerTrendPoint[]
  stats: {
    active_power_total_kw: { max: number; mean: number; last: number }
    irradiation_inclined_wm2: { max: number; mean: number; last: number }
  } | null
}

// ---- Helpers ----
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


// Device-reported status code → colours. Canonical: 0 Stopped · 1 Running · 2 Standby · 4 Warning · 8 Fault
const INV_STATE: Record<number, { label: string; dot: string; text: string; hex: string; tint: string }> = {
  0: { label: 'Stopped', dot: 'bg-black/40',  text: 'text-black/60',  hex: '#9ca3af', tint: 'rgba(0,0,0,0.03)' },
  1: { label: 'Running', dot: 'bg-green-500', text: 'text-green-700', hex: '#22c55e', tint: 'rgba(73,125,0,0.04)' },
  2: { label: 'Standby', dot: 'bg-black/30',  text: 'text-black/55',  hex: '#94a3b8', tint: 'rgba(0,0,0,0.03)' },
  4: { label: 'Warning', dot: 'bg-[#e17100]', text: 'text-[#e17100]', hex: '#e17100', tint: 'rgba(225,113,0,0.05)' },
  8: { label: 'Fault',   dot: 'bg-red-600',   text: 'text-red-600',   hex: '#dc2626', tint: 'rgba(220,38,38,0.04)' },
}

const INV_OFFLINE = { label: 'Offline', dot: 'bg-red-500', text: 'text-red-600', hex: '#dc2626', tint: 'rgba(0,0,0,0.03)' }

// Two axes: offline (unreachable) wins — there's no last-known state to carry.
function invStatusMeta(inv: Pick<InverterData, 'status' | 'inverter_status'>) {
  if (inv.status === 'offline' || inv.inverter_status == null) return INV_OFFLINE
  const { code, label } = inv.inverter_status
  return INV_STATE[code] ?? { label: label || `Code ${code}`, dot: 'bg-black/30', text: 'text-black/55', hex: '#94a3b8', tint: 'rgba(0,0,0,0.03)' }
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

function StatusChip({ inv }: { inv: Pick<InverterData, 'status' | 'inverter_status'> }) {
  const { label, dot, text } = invStatusMeta(inv)
  return (
    <div className="inline-flex items-center gap-2 h-7 pl-2.5 pr-3 rounded-full border border-black/15 bg-white shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`text-[12px] font-semibold ${text} uppercase tracking-[0.08em]`}>{label}</span>
    </div>
  )
}


function ChartEmpty({ height, label = 'No data for this day' }: { height: string; label?: string }) {
  return (
    <div className={`${height} flex flex-col items-center justify-center gap-2`}>
      <p className="text-[13px] text-black/45">{label}</p>
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

const POWER_GROUPS = [
  { key: 'power',       label: 'Active Power', color: '#e17100' },
  { key: 'irradiation', label: 'Irradiance',   color: '#497d00' },
]

function PowerTrendCard({
  chartData, trendLoading, selectedDate, setSelectedDate,
  hidden, onSeriesToggle, height, isMobile, stats,
}: {
  chartData: { time: number; power: number | null; irradiation: number | null }[]
  trendLoading: boolean
  selectedDate: string
  setSelectedDate: (d: string) => void
  hidden: Set<string>
  onSeriesToggle: (key: string) => void
  height: string
  isMobile: boolean
  stats: PowerTrendData['stats']
}) {
  return (
    <div>
      <SectionHeader
        title="Power Trend"
        meta={`Active power · Irradiance · ${selectedDate === todayString() ? 'Today' : selectedDate}`}
        accent="orange"
        actions={
          <DatePicker value={selectedDate} onChange={setSelectedDate} maxDate={new Date()} />
        }
      />

      {/* Series toggles */}
      <div className="flex items-center gap-4 sm:gap-5 mb-4 flex-wrap">
        {POWER_GROUPS.map((g) => (
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
      ) : chartData.length === 0 ? (
        <ChartEmpty height={height} />
      ) : (
        <div className={`${height} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="invPowerGradient" x1="0" y1="0" x2="0" y2="1">
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
                tick={{ fontSize: 12, fill: '#497d00' }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip cursor={{ stroke: '#00000022', strokeWidth: 1 }} content={<PowerTrendTooltip />} />
              {!hidden.has('irradiation') && (
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
                  activeDot={{ r: 3.5, fill: '#497d00' }}
                />
              )}
              {!hidden.has('power') && (
                <Area
                  yAxisId="power"
                  type="monotone"
                  dataKey="power"
                  name="Active Power"
                  stroke="#e17100"
                  strokeWidth={1.75}
                  fill="url(#invPowerGradient)"
                  baseValue={0}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, fill: '#e17100' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {stats && (
        <div className="mt-4 pt-3 border-t border-black/15">
          <div className="grid grid-cols-[1fr_76px_76px] sm:grid-cols-[1fr_140px_140px] pb-1.5">
            <span />
            {['Now', 'Peak'].map((h) => (
              <span key={h} className="text-[10px] uppercase tracking-[0.12em] font-semibold text-black/40 text-right">{h}</span>
            ))}
          </div>
          {[
            { key: 'power',       name: 'Active Power', unit: 'kW',   color: '#e17100', s: stats.active_power_total_kw, clampZero: false },
            { key: 'irradiation', name: 'Irradiation',  unit: 'W/m²', color: '#497d00', s: stats.irradiation_inclined_wm2, clampZero: true },
          ].filter((g) => !hidden.has(g.key)).map((g) => (
            <div key={g.name} className="grid grid-cols-[1fr_76px_76px] sm:grid-cols-[1fr_140px_140px] items-baseline py-1">
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-2px]" style={{ background: g.color }} />
                <span className="text-[13px] font-semibold text-black truncate">{g.name}</span>
                <span className="text-[10px] text-black/40 shrink-0">{g.unit}</span>
              </span>
              {(['last', 'max'] as const).map((k) => {
                const val = g.clampZero ? Math.max(0, Number(g.s[k])) : Number(g.s[k])
                return (
                  <span key={k} className={`text-[13px] font-semibold tabular-nums text-right ${k === 'last' ? '' : 'text-black/55'}`}
                        style={k === 'last' ? { color: g.color } : undefined}>
                    {val.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InverterSnapshotCard({ inv }: { inv: InverterData }) {
  const online = inv.status === 'online'
  const st = invStatusMeta(inv)

  return (
    <div className="rounded-xl px-4 py-4" style={{ background: st.tint }}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <p className={`text-[15px] font-semibold truncate ${online ? 'text-black' : 'text-black/50'}`}>{inv.name}</p>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className="w-[7px] h-[7px] rounded-full" style={{ background: st.hex }} />
          <span className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${st.text}`}>{st.label}</span>
        </span>
      </div>

      <div className="flex items-end gap-4 mb-3.5 flex-wrap">
        <div>
          <p className="text-[11px] text-black/50 mb-0.5">Power</p>
          <div className="flex items-baseline gap-1">
            <span
              className="text-[26px] font-semibold tracking-tight tabular-nums leading-none"
              style={{ color: online ? '#000' : 'rgba(0,0,0,0.3)' }}
            >
              {online ? (inv.ac_active_power_kw?.toFixed(1) ?? '—') : '—'}
            </span>
            <span className="text-[12px] text-black/50 font-medium">kW</span>
          </div>
        </div>
        <div className="pl-4 border-l border-black/[0.08]">
          <p className="text-[11px] text-black/50 mb-0.5">Today</p>
          <div className="flex items-baseline gap-1">
            <span className="text-[19px] font-semibold tabular-nums leading-none" style={{ color: '#e17100' }}>
              {inv.energy_daily_kwh?.toLocaleString() ?? '—'}
            </span>
            <span className="text-[12px] text-black/50 font-medium">kWh</span>
          </div>
        </div>
      </div>

      <p className="text-[12px] text-black/55">
        Eff {inv.inverter_efficiency_pct != null ? `${inv.inverter_efficiency_pct.toFixed(1)}%` : '—'}
        <span className="mx-1.5 text-black/25">·</span>
        PR {inv.performance_ratio_pct != null ? `${inv.performance_ratio_pct.toFixed(1)}%` : '—'}
        <span className="mx-1.5 text-black/25">·</span>
        {inv.last_updated ? formatLastUpdated(inv.last_updated) : '—'}
      </p>
    </div>
  )
}


const STATE_ORDER: { key: keyof InverterOverview['summary']['states']; label: string; text: string }[] = [
  { key: 'fault',   label: 'Fault',   text: 'text-red-600' },
  { key: 'warning', label: 'Warning', text: 'text-[#e17100]' },
  { key: 'running', label: 'Running', text: 'text-green-700' },
  { key: 'standby', label: 'Standby', text: 'text-black/70' },
  { key: 'stopped', label: 'Stopped', text: 'text-black/70' },
  { key: 'other',   label: 'Other',   text: 'text-black/70' },
]

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
                      <StatusChip inv={inv} />
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
  const [stats, setStats] = useState<PowerTrendData['stats']>(null)
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [trendLoading, setTrendLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [powerHidden, setPowerHidden] = useState<Set<string>>(new Set())

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  function togglePower(group: string) {
    setPowerHidden((prev) => {
      const next = new Set(prev)
      next.has(group) ? next.delete(group) : next.add(group)
      return next
    })
  }

  const fetchOverview = useCallback(async () => {
      if (!site?.id) { setLoading(false); return }
      try {
        const res = await api.get<InverterOverview>(`/influx/inverter/overview/?site=${site.id}`)
        res.data.inverters.sort((a, b) =>
          a.device_id.localeCompare(b.device_id, undefined, { numeric: true })
        )
        setOverview(res.data)
      } catch (err) {
        console.error('Inverter overview error:', err)
      } finally {
        setLoading(false)
      }
    }, [site?.id])

  const fetchTrend = useCallback(async (silent = false) => {
    if (!site?.id) return
    if (!silent) setTrendLoading(true)
    try {
      const res = await api.get<PowerTrendData>(
        `/influx/inverter/power-trend/?site=${site.id}&date=${selectedDate}`
      )
      setTrend(res.data.data)
      setStats(res.data.stats)
    } catch {
      setTrend([])
      setStats(null)
    } finally {
      if (!silent) setTrendLoading(false)
    }
  }, [site?.id, selectedDate])

  useEffect(() => { fetchOverview() }, [fetchOverview])
  useEffect(() => { fetchTrend() }, [fetchTrend])

  // Live trend poll on its own 5-min cadence (data is 5-min aggregated).
  // Silent, and only while viewing *today* — past days are immutable.
  useEffect(() => {
    if (selectedDate !== todayString()) return
    const id = setInterval(() => fetchTrend(true), 5 * 60_000)
    return () => clearInterval(id)
  }, [selectedDate, fetchTrend])

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

  const POWER_TREND_INTERVAL_MIN = 5   // must match backend interval
  const GAP_FACTOR = 2.5

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

  const anyState = overview ? Object.values(overview.summary.states).some((v) => v > 0) : false

  return (
    <div className="w-full max-w-[1152px] mx-auto px-0 sm:px-6 md:px-6 lg:px-6">

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
  className="h-full rounded-full"
  style={{ width: `${Math.min(100, Math.max(0, overallPR))}%`, background: '#e17100' }}
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
        <span className={`${T.metricL} shrink-0`}>
          {overview?.summary.online_count ?? '—'}<span className={`${T.unit} ml-1`}>/ {overview?.summary.total_count ?? '—'}</span>
        </span>
      </div>

      <div className="flex items-start justify-between py-3.5 gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Activity size={15} className="text-black/40 shrink-0" strokeWidth={2} />
          <span className={T.eyebrow}>Status</span>
        </div>
        {anyState ? (
          <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1.5 shrink-0">
            {STATE_ORDER.map(({ key, label, text }) => {
              const count = overview!.summary.states[key]
              if (count <= 0) return null
              return (
                <span key={key} className="inline-flex items-baseline gap-1.5">
                  <span className={`text-[18px] font-semibold tabular-nums leading-none ${text}`}>{count}</span>
                  <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-black/45">{label}</span>
                </span>
              )
            })}
          </div>
        ) : (
          <span className="text-[13px] text-black/40">—</span>
        )}
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
              className="grid gap-4 pb-5"
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
        <PowerTrendCard
          chartData={chartData}
          trendLoading={trendLoading}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          stats={stats}
          height="h-[240px] sm:h-[360px]"
          isMobile={isMobile}
          hidden={powerHidden}
          onSeriesToggle={togglePower}
        />
      </Section>

    </div>
  )
}