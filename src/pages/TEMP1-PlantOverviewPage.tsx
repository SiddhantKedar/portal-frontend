import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Sun, Thermometer, Clock, Maximize2, Minimize2, RefreshCw, Power, Cpu,
} from 'lucide-react'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { GenerationCards } from '@/components/dashboard/GenerationCards'
import { DatePicker } from '@/components/DatePicker'
import {
  Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Line, ComposedChart, Tooltip, BarChart, Bar, LabelList,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

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

interface ElecTrendData {
  data: ElecTrendPoint[]
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

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
      <div className="flex items-start gap-3 min-w-0">
        {accent !== 'none' && (
          <span className={`w-1 h-6 rounded-full ${bar} mt-1.5 shrink-0`} />
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

// Weather cell — same visual weight as any other metric on the page
function WeatherCell({
  icon: Icon, label, value, unit, accent,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  unit: string
  accent?: 'orange' | 'olive'
}) {
  const iconColor = accent === 'orange' ? 'text-[#e17100]' : accent === 'olive' ? 'text-[#497d00]' : 'text-black'
  const valColor  = accent === 'orange' ? 'text-[#e17100]' : accent === 'olive' ? 'text-[#497d00]' : ''
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon size={14} className={`${iconColor} shrink-0`} strokeWidth={2} />
        <p className={T.eyebrow}>{label}</p>
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`${T.metricL} ${valColor}`}>{value}</span>
        <span className={T.unit}>{unit}</span>
      </div>
    </div>
  )
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
        <span className={`${T.metricXL} text-[#e17100]`}>{value.toLocaleString()}</span>
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
  chartData, chartConfig, trendLoading, selectedDate, setSelectedDate,
  stats, expanded, onToggle, height,
}: {
  chartData: { time: number; power: number | null; irradiation: number | null }[]
  chartConfig: Record<string, { label: string; color: string }>
  trendLoading: boolean
  selectedDate: string
  setSelectedDate: (d: string) => void
  stats: PowerTrendData['stats']
  expanded: boolean
  onToggle: () => void
  height: string
}) {
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
      ) : (
        <ChartContainer config={chartConfig} className={`${height} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="plantPowerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#D97706" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#D97706" stopOpacity={0} />
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
                yAxisId="power"
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <YAxis
                yAxisId="irr"
                orientation="right"
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v) => `${v}`}
              />
              <ChartTooltip
                content={<ChartTooltipContent labelFormatter={(label) => formatMinutesTick(Number(label))} />}
              />
              <Area
                yAxisId="power"
                type="monotone"
                dataKey="power"
                stroke="#D97706"
                strokeWidth={1.5}
                fill="url(#plantPowerGradient)"
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: '#D97706' }}
              />
              <Line
                yAxisId="irr"
                type="monotone"
                dataKey="irradiation"
                stroke="#22C55E"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                activeDot={{ r: 4, fill: '#22C55E' }}
                strokeDasharray="4 3"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
      {stats && (
        <div className="flex flex-col gap-3 pt-4 pb-2 mt-2 border-t border-black/10">
          {/* Power row — label stacks above stats on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
            <span className="text-[12px] text-[#e17100] uppercase tracking-[0.12em] font-semibold sm:w-24 shrink-0">
              Power
            </span>
            <div className="flex items-center gap-5 flex-wrap">
              {(['last', 'mean', 'max'] as const).map((k) => (
                <div key={k} className="flex items-baseline gap-1.5">
                  <span className={T.eyebrow}>{k === 'mean' ? 'Avg' : k === 'max' ? 'Peak' : 'Last'}</span>
                  <span className={`text-[15px] font-semibold tabular-nums ${k === 'max' ? 'text-[#e17100]' : 'text-black'}`}>
                    {stats.active_power_total_kw[k]}
                  </span>
                  <span className={T.unit}>kW</span>
                </div>
              ))}
            </div>
          </div>
          {/* Irradiation row — same treatment */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
            <span className="text-[12px] text-[#22C55E] uppercase tracking-[0.12em] font-semibold sm:w-24 shrink-0">
              Irradiation
            </span>
            <div className="flex items-center gap-5 flex-wrap">
              {(['last', 'mean', 'max'] as const).map((k) => (
                <div key={k} className="flex items-baseline gap-1.5">
                  <span className={T.eyebrow}>{k === 'mean' ? 'Avg' : k === 'max' ? 'Peak' : 'Last'}</span>
                  <span className={`text-[15px] font-semibold tabular-nums ${k === 'max' ? 'text-[#22C55E]' : 'text-black'}`}>
                    {stats.irradiation_inclined_wm2[k]}
                  </span>
                  <span className={T.unit}>W/m²</span>
                </div>
              ))}
            </div>
          </div>
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

function ElectricalTrendCard({
  chartData, trendLoading, selectedDate, setSelectedDate,
  hidden, onSeriesToggle, expanded, onToggleExpand, height,
}: {
  chartData: { time: string; [key: string]: number | string | null }[]
  trendLoading: boolean
  selectedDate: string
  setSelectedDate: (d: string) => void
  hidden: Set<string>
  onSeriesToggle: (key: string) => void
  expanded: boolean
  onToggleExpand: () => void
  height: string
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
            <ComposedChart data={chartData} margin={{ top: 10, right: 56, left: 52, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                yAxisId="voltage"
                domain={['auto', 'auto']}
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={60}
                tickFormatter={(v) => `${Number(v).toFixed(1)}kV`}
              />
              <YAxis
                yAxisId="current"
                orientation="right"
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v) => `${Number(v).toFixed(0)}A`}
              />
              <YAxis yAxisId="freq" hide domain={[45, 55]} />
              <Tooltip
                contentStyle={{
                  fontSize: '13px', color: '#000', border: '1px solid #000',
                  borderRadius: '8px', boxShadow: 'none', fontWeight: 500,
                }}
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
        <div className="h-[280px] w-full">
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
              <Tooltip
                contentStyle={{
                  fontSize: '13px', color: '#000', border: '1px solid #000',
                  borderRadius: '8px', boxShadow: 'none', fontWeight: 500,
                }}
                labelFormatter={(label) => formatDateTick(String(label))}
                formatter={(value) => [`${Number(value).toLocaleString()} kWh`, 'Energy']}
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
                  formatter={(v) => `${Number(v).toLocaleString()}\u00A0kWh`}
                  style={{ fontSize: 12, fill: '#171717', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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

  const [refreshTick, setRefreshTick] = useState(0)
  const lastActivity = useRef(Date.now())

  const [dailyEnergy, setDailyEnergy] = useState<DailyEnergyPoint[]>([])
  const [dailyEnergyLoading, setDailyEnergyLoading] = useState(false)

  const tempDelta = overview?.weather
    ? (overview.weather.module_temp_c - overview.weather.ambient_temp_c).toFixed(1)
    : null

  useEffect(() => {
    if (!site?.id) return
    const fetchDailyEnergy = async () => {
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
    }
    fetchDailyEnergy()
  }, [site?.id, refreshTick])

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

  function toggleElec(group: string) {
    setElecHidden((prev) => {
      const next = new Set(prev)
      next.has(group) ? next.delete(group) : next.add(group)
      return next
    })
  }

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await api.get<PlantOverview>(`/influx/plant/overview/?site=${site?.id}`)
        res.data.inverters.sort((a, b) => a.name.localeCompare(b.name))
        setOverview(res.data)
      } catch (err) {
        console.error('Plant overview error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchOverview()
  }, [site?.id, refreshTick])

  useEffect(() => {
    const fetchTrend = async () => {
      setTrendLoading(true)
      try {
        const url = `/influx/plant/power-trend/?site=${site?.id}&date=${selectedDate}`
        const res = await api.get<PowerTrendData>(url)
        setTrend(res.data.data)
        setStats(res.data.stats)
      } catch {
        setTrend([])
      } finally {
        setTrendLoading(false)
      }
    }
    fetchTrend()
  }, [selectedDate])

  useEffect(() => {
    if (!site?.id) return
    const fetchElec = async () => {
      setElecTrendLoading(true)
      try {
        const res = await api.get<ElecTrendData>(
          `/influx/plant/electrical-trend/?site=${site.id}&date=${elecSelectedDate}&interval=5`
        )
        setElecTrend(res.data.data)
      } catch {
        setElecTrend([])
      } finally {
        setElecTrendLoading(false)
      }
    }
    fetchElec()
  }, [site?.id, elecSelectedDate])

  const chartData = trend.map((p) => ({
    time: minutesSinceMidnight(p.time),
    power: p.active_power_total_kw > 0 ? p.active_power_total_kw : null,
    irradiation: p.irradiation_inclined_wm2 > 0 ? p.irradiation_inclined_wm2 : null,
  }))

  const elecChartData = elecTrend.map((p) => ({
    time: formatTime(p.time),
    voltage_ab: +(p.voltage_line_ab_v / 1000).toFixed(2),
    voltage_bc: +(p.voltage_line_bc_v / 1000).toFixed(2),
    voltage_ca: +(p.voltage_line_ca_v / 1000).toFixed(2),
    current_a: p.current_phase_a,
    current_b: p.current_phase_b,
    current_c: p.current_phase_c,
    frequency: p.grid_frequency_hz,
  }))

  const dailyEnergyChartData = dailyEnergy.map((d) => ({
    date: d.date,
    energy_kwh: d.energy_kwh,
    fill: d.date === todayString() ? '#e17100' : '#497d00',
  }))

  const chartConfig = {
    power: { label: 'Active Power (kW)', color: '#D97706' },
    irradiation: { label: 'Irradiation (W/m²)', color: '#22C55E' },
  }

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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-4 lg:px-2 xl:px-0 pb-10">

      {/* ============ HEADER ============ */}
      {/* On mobile (order-1/2 flip): refresh row appears at the top with timestamp on the left,
          Refresh button on the right. Title block sits below. On desktop, columns are side by side. */}
      <header className="pb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        {/* Refresh + timestamp */}
        <div className="order-1 sm:order-2 flex items-center justify-between sm:flex-col sm:items-end gap-3 sm:gap-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap order-2 sm:order-2`}>
            <Clock size={13} strokeWidth={2} />
            <span className="hidden sm:inline">Updated&nbsp;</span>
            {overview?.last_updated ? formatLastUpdated(overview.last_updated) : '—'}
          </p>
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            className="h-10 px-4 flex items-center gap-2 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold order-1 sm:order-1"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Refresh
          </button>
        </div>

        {/* Title block */}
        <div className="order-2 sm:order-1 min-w-0">
          <div className="flex items-start gap-3">
            <span className="w-1 h-8 rounded-full bg-[#e17100] mt-1.5 shrink-0" />
            <div className="min-w-0">
              <p className={T.eyebrow}>Plant Overview</p>
              <h1 className={`${T.siteH1} mt-2 break-words`}>{overview?.site ?? '—'}</h1>
              <p className={`${T.body} mt-1`}>
                <span className="tabular-nums whitespace-nowrap">AC {overview?.plant.ac_capacity_kw?.toLocaleString() ?? '—'} kW</span>
                <span className="mx-1 text-black">/</span>
                <span className="tabular-nums whitespace-nowrap">DC {overview?.plant.dc_capacity_kw?.toLocaleString() ?? '—'} kW</span>
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <StatusChip
                  label="Breaker"
                  value={overview?.breaker_status ? overview.breaker_status.toUpperCase() : 'UNKNOWN'}
                  healthy={overview?.breaker_status ? overview.breaker_status === 'on' : null}
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
      <section className="pt-8 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8 md:gap-16 items-center">

          {/* Gauge column */}
          <div className="flex flex-col items-center">
            <p className={`${T.eyebrow} mb-3`}>Active Power</p>
            <PowerGauge
              value={overview?.plant.active_power_kw ?? 0}
              capacity={overview?.plant.ac_capacity_kw ?? 1}
            />
            <div className="flex items-center gap-1.5 mt-3">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className={T.meta}>
                <span className="tabular-nums font-semibold text-black">{capacityPct}%</span>
                {' '}of {overview?.plant.ac_capacity_kw?.toLocaleString() ?? '—'} kW AC
              </span>
            </div>
          </div>

          {/* Energy rail — 3 stacked metrics divided by hairlines */}
          <div className="flex flex-col">
            <div className="flex items-baseline justify-between gap-3 py-3.5 border-b border-black/10">
              <p className={`${T.eyebrow} min-w-0`}>Energy Today</p>
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className={`${T.metricL} text-[#e17100]`}>
                  {overview?.plant.energy_today_kwh?.toLocaleString() ?? '—'}
                </span>
                <span className={T.unit}>kWh</span>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3.5 border-b border-black/10">
              <p className={`${T.eyebrow} min-w-0`}>Energy Total</p>
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className={T.metricL}>
                  {overview?.plant.energy_active_export_kwh?.toLocaleString() ?? '—'}
                </span>
                <span className={T.unit}>kWh</span>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-3.5">
              <p className={`${T.eyebrow} min-w-0`}>CO₂ Avoided Today</p>
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className={`${T.metricL} text-[#497d00]`}>
                  {overview?.performance?.co2_avoided_today_kg?.toFixed(1) ?? '—'}
                </span>
                <span className={T.unit}>kg</span>
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
            <SectionHeader title="Weather" meta="Live · on-site sensors" accent="orange" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 pb-3">
              <WeatherCell
                icon={Sun}
                label="Irradiance"
                value={overview.weather.irradiation_inclined_wm2}
                unit="W/m²"
                accent="orange"
              />
              <WeatherCell
                icon={Thermometer}
                label="Ambient Temp"
                value={overview.weather.ambient_temp_c}
                unit="°C"
                accent="orange"
              />
              <WeatherCell
                icon={Thermometer}
                label="Module Temp"
                value={overview.weather.module_temp_c}
                unit="°C"
                accent="orange"
              />
              {tempDelta && (
                <div className="flex flex-col gap-1.5 min-w-0">
                  <p className={T.eyebrow}>Module Δ</p>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className={`${T.metricL} ${deltaColor}`}>{deltaSign}{tempDelta}</span>
                    <span className={T.unit}>°C vs ambient</span>
                  </div>
                </div>
              )}
            </div>
          </Section>
        </>
      )}

      {/* ============ PERFORMANCE (GenerationCards) ============ */}
      <Divider />
      <Section>
        <SectionHeader title="Performance" meta="Today · Live" accent="orange" />
        <GenerationCards
          actualToday={overview?.plant.energy_today_kwh ?? 0}
          performanceRatio={overview?.performance?.performance_ratio_pct ?? 0}
          cuf={overview?.performance?.cuf_pct ?? 0}
        />
      </Section>

      {/* ============ POWER TREND + GRID ============ */}
      <Divider />
      <Section>
        <div className="grid grid-cols-1 md:grid-cols-3 pt-2 gap-8 md:gap-10">
          <div className="md:col-span-2 min-w-0">
            <PowerTrendCard
              chartData={chartData}
              chartConfig={chartConfig}
              trendLoading={trendLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              stats={stats}
              expanded={chartExpanded}
              onToggle={() => setChartExpanded(o => !o)}
              height="h-[240px]"
            />
          </div>

          {/* Grid — editorial list, no zebra, no table borders. Freq/PF live in the subtitle. */}
          <div className="min-w-0">
            <SectionHeader
              title="Grid"
              meta={`${overview?.plant.frequency_hz ?? '—'} Hz · PF ${overview?.plant.power_factor ?? '—'}`}
              accent="olive"
            />
            <div className="flex flex-col">
              {[
                { phase: 'AB / A', voltage: overview?.grid.voltage_ab, current: overview?.grid.current_a },
                { phase: 'BC / B', voltage: overview?.grid.voltage_bc, current: overview?.grid.current_b },
                { phase: 'CA / C', voltage: overview?.grid.voltage_ca, current: overview?.grid.current_c },
              ].map((row, i, arr) => (
                <div
                  key={row.phase}
                  className={`flex items-center justify-between gap-3 py-3 ${i < arr.length - 1 ? 'border-b border-black/10' : ''}`}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={T.eyebrow}>Phase</span>
                    <span className={T.metricM}>{row.phase}</span>
                  </div>
                  <div className="flex items-baseline gap-3 sm:gap-5">
                    <div className="flex items-baseline gap-1">
                      <span className={T.metricM}>
                        {row.voltage != null ? (row.voltage / 1000).toFixed(2) : '—'}
                      </span>
                      <span className={T.unit}>kV</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`${T.metricM} text-[#497d00]`}>
                        {row.current?.toFixed(2) ?? '—'}
                      </span>
                      <span className={T.unit}>A</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ============ DAILY ENERGY ============ */}
      <Divider />
      <Section>
        <DailyEnergyCard chartData={dailyEnergyChartData} loading={dailyEnergyLoading} />
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
          height="h-[280px]"
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
              height="h-[480px]"
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
              chartConfig={chartConfig}
              trendLoading={trendLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              stats={stats}
              expanded={chartExpanded}
              onToggle={() => setChartExpanded(false)}
              height="h-[480px]"
            />
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}