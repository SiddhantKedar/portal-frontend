import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
TrendingUp, Sun, Thermometer, Clock, Maximize2, Minimize2, Leaf,
  RefreshCw, Power, Cpu, Wind,
} from 'lucide-react'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { DatePicker } from '@/components/DatePicker'
import {
  Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Line, ComposedChart, Tooltip, BarChart, Bar, LabelList,
} from 'recharts'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

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

// ---- New: Radial Gauge (270° arc) for the hero Active Power visual ----

function RadialGauge({
  value, max, unit, color = '#e17100', label,
}: {
  value: number
  max: number
  unit: string
  color?: string
  label?: string
}) {
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  const radius = 92
  const strokeWidth = 14
  const circumference = 2 * Math.PI * radius
  const arcFraction = 0.75 // 270° of the full circle
  const arcLength = circumference * arcFraction
  const progressLength = arcLength * pct

  return (
    <div className="relative flex items-center justify-center" style={{ width: 230, height: 230 }}>
      <svg width="230" height="230" viewBox="0 0 230 230" style={{ transform: 'rotate(135deg)' }}>
        {/* Background track */}
        <circle
          cx="115" cy="115" r={radius}
          fill="none"
          stroke="#F1F1F1"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Progress */}
        <circle
          cx="115" cy="115" r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${progressLength} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.7s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {label && (
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium mb-1">
            {label}
          </p>
        )}
        <div className="flex items-baseline gap-1.5">
          <span className="text-[44px] font-semibold text-black tracking-tight leading-none">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
        </div>
        <span className="text-[12px] text-gray-500 mt-1">{unit}</span>
        <div className="mt-2.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">
            {(pct * 100).toFixed(0)}% of {max.toLocaleString()} kW
          </span>
        </div>
      </div>
    </div>
  )
}

// ---- New: Semi-circular gauge for PR / CUF ----

function SemiGauge({
  value, label, tone = 'accent',
}: {
  value: number
  label: string
  tone?: 'accent' | 'olive'
}) {
  const pct = Math.min(Math.max(value / 100, 0), 1)
  const color = tone === 'accent' ? '#e17100' : '#497d00'
  const radius = 62
  const circumference = Math.PI * radius
  const dashOffset = circumference * (1 - pct)

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: 158, height: 88 }}>
        <svg width="158" height="88" viewBox="0 0 158 88">
          <path
            d="M 17 80 A 62 62 0 0 1 141 80"
            fill="none"
            stroke="#F1F1F1"
            strokeWidth={10}
            strokeLinecap="round"
          />
          <path
            d="M 17 80 A 62 62 0 0 1 141 80"
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.7s ease' }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-[26px] font-semibold text-black leading-none tracking-tight">
            {value.toFixed(1)}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">%</span>
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-medium">{label}</p>
    </div>
  )
}

// ---- New: Inline stat (used inside hero and elsewhere) ----

function InlineStat({
  label, value, unit, tone,
}: {
  label: string
  value: string | number
  unit?: string
  tone?: 'default' | 'accent' | 'olive'
}) {
  const valueColor =
    tone === 'accent' ? 'text-[#e17100]' :
    tone === 'olive' ? 'text-[#497d00]' : 'text-black'
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={`text-[22px] font-semibold tracking-tight leading-none ${valueColor}`}>
          {value}
        </span>
        {unit && <span className="text-[11px] text-gray-400">{unit}</span>}
      </div>
    </div>
  )
}

// ---- New: Status pill (used inline in hero) ----

function StatusPill({
  label, value, healthy, icon: Icon,
}: {
  label: string
  value: string
  healthy: boolean | null
  icon: React.ElementType
}) {
  const dot =
    healthy === null ? 'bg-gray-300' :
    healthy ? 'bg-green-500' : 'bg-red-500'
  const valueTone =
    healthy === null ? 'text-gray-500' :
    healthy ? 'text-green-700' : 'text-red-600'
  return (
    <div className="inline-flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white border border-[#EDEDED]">
      <span className="w-6 h-6 rounded-full bg-[#FAFAFA] flex items-center justify-center text-gray-400">
        <Icon size={12} />
      </span>
      <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">{label}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className={`text-[11px] font-semibold ${valueTone}`}>{value}</span>
    </div>
  )
}

// ---- New: Weather chip (tiny inline reading) ----

function WeatherChip({
  icon: Icon, label, value, unit,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  unit: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-lg bg-[#FAFAFA] flex items-center justify-center text-gray-400 shrink-0">
        <Icon size={14} />
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-widest text-gray-400 font-medium">{label}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-[15px] font-semibold text-black">{value}</span>
          <span className="text-[10px] text-gray-400">{unit}</span>
        </div>
      </div>
    </div>
  )
}

// ---- Reused Chart Cards (unchanged from original) ----

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
    <>
      <CardHeader className="pb-2 px-6 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-[18px] font-semibold text-black">Power Trend</CardTitle>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Active power · {selectedDate === todayString() ? 'Today' : selectedDate}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DatePicker value={selectedDate} onChange={setSelectedDate} maxDate={new Date()} />
            <button
              type="button"
              onClick={onToggle}
              className="h-9 w-9 flex items-center justify-center border border-[#EDEDED] rounded-lg text-gray-400 hover:text-black hover:border-[#D4D4D4] transition-colors"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-0">
        {trendLoading ? (
          <div className={`${height} flex items-center justify-center`}>
            <p className="text-[13px] text-gray-400">Loading chart...</p>
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
                  tick={{ fontSize: 10, fill: '#8A8A8A' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="power"
                  tick={{ fontSize: 10, fill: '#8A8A8A' }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <YAxis
                  yAxisId="irr"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#8A8A8A' }}
                  tickLine={false}
                  axisLine={false}
                  width={42}
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
          <div className={`flex flex-col gap-1.5 px-4 pt-3 border-t border-[#F1F1F1] ${expanded ? 'pb-4' : 'pb-0'}`}>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-amber-600 uppercase tracking-wider font-semibold w-20 shrink-0">Power</span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">Last</span>
                <span className="text-[12px] font-semibold text-black">{stats.active_power_total_kw.last}</span>
                <span className="text-[10px] text-gray-400">kW</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">Avg</span>
                <span className="text-[12px] font-semibold text-black">{stats.active_power_total_kw.mean}</span>
                <span className="text-[10px] text-gray-400">kW</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">Peak</span>
                <span className="text-[12px] font-semibold text-amber-600">{stats.active_power_total_kw.max}</span>
                <span className="text-[10px] text-gray-400">kW</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-[11px] text-[#22C55E] uppercase tracking-wider font-semibold w-20 shrink-0">Irradiation</span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">Last</span>
                <span className="text-[12px] font-semibold text-black">{stats.irradiation_inclined_wm2.last}</span>
                <span className="text-[10px] text-gray-400">W/m²</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">Avg</span>
                <span className="text-[12px] font-semibold text-black">{stats.irradiation_inclined_wm2.mean}</span>
                <span className="text-[10px] text-gray-400">W/m²</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-400">Peak</span>
                <span className="text-[12px] font-semibold text-[#22C55E]">{stats.irradiation_inclined_wm2.max}</span>
                <span className="text-[10px] text-gray-400">W/m²</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </>
  )
}

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
    <>
      <CardHeader className="pb-2 px-6 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-[18px] font-semibold text-black">Electrical Trend</CardTitle>
            <p className="text-[12px] text-gray-400 mt-0.5">
              Voltage · Current · Frequency · {selectedDate === todayString() ? 'Today' : selectedDate}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DatePicker value={selectedDate} onChange={setSelectedDate} maxDate={new Date()} />
            <button
              type="button"
              onClick={onToggleExpand}
              className="h-9 w-9 flex items-center justify-center border border-[#EDEDED] rounded-lg text-gray-400 hover:text-black hover:border-[#D4D4D4] transition-colors"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3">
          {ELEC_GROUPS.map((g) => (
            <button key={g.key} type="button" onClick={() => onSeriesToggle(g.key)} className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors"
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
              <span className="text-[11px] text-gray-500">{g.label}</span>
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-4">
        {trendLoading ? (
          <div className={`${height} flex items-center justify-center`}>
            <p className="text-[13px] text-gray-400">Loading chart...</p>
          </div>
        ) : (
          <div className={`${height} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 56, left: 52, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: '#8A8A8A' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="voltage"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickFormatter={(v) => `${Number(v).toFixed(1)}kV`}
                />
                <YAxis
                  yAxisId="current"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v) => `${Number(v).toFixed(0)}A`}
                />
                <YAxis yAxisId="freq" hide domain={[45, 55]} />
                <Tooltip
                  contentStyle={{ fontSize: '11px', border: '0.5px solid #E5E5E5', borderRadius: '8px', boxShadow: 'none' }}
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
      </CardContent>
    </>
  )
}

function DailyEnergyCard({
  chartData, loading,
}: {
  chartData: { date: string; energy_kwh: number; fill: string }[]
  loading: boolean
}) {
  return (
    <>
      <CardHeader className="pb-2 px-6 pt-5">
        <CardTitle className="text-[18px] font-semibold text-black">Daily Energy</CardTitle>
        <p className="text-[12px] text-gray-400 mt-0.5">
          Generation over the last {chartData.length} days
        </p>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        {loading ? (
          <div className="h-[280px] flex items-center justify-center">
            <p className="text-[13px] text-gray-400">Loading chart...</p>
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 24, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateTick}
                  tick={{ fontSize: 10, fill: '#8A8A8A' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#8A8A8A' }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={{ fontSize: '11px', border: '0.5px solid #E5E5E5', borderRadius: '8px', boxShadow: 'none' }}
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
                    style={{ fontSize: 10, fill: '#525252' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </>
  )
}

// ---- Main Page (V2) ----

export default function PlantOverviewPageV2() {
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
        <p className="text-[13px] text-gray-400">Loading plant overview...</p>
      </div>
    )
  }

  const activePower = overview?.plant.active_power_kw ?? 0
  const acCapacity = overview?.plant.ac_capacity_kw ?? 1

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0 pb-8">

      {/* ============ HERO PANEL ============ */}
      <section className="relative bg-[#FAFAFA] rounded-3xl overflow-hidden">
        {/* Top row: title left, refresh right */}
        <div className="flex items-start justify-between px-8 pt-7 pb-2 flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1.5">
              Plant Overview
            </p>
            <h1 className="text-[26px] font-semibold text-black tracking-tight leading-tight">
              {overview?.site}
            </h1>
            <p className="text-[13px] text-gray-500 mt-0.5">
              {overview?.customer ?? '—'}
              <span className="text-gray-300 mx-2">·</span>
              AC {overview?.plant.ac_capacity_kw?.toLocaleString() ?? '—'} kW
              <span className="text-gray-300 mx-1">/</span>
              DC {overview?.plant.dc_capacity_kw?.toLocaleString() ?? '—'} kW
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              className="h-9 px-3 flex items-center gap-1.5 bg-white border border-[#EDEDED] rounded-full text-gray-500 hover:text-black hover:border-[#D4D4D4] transition-colors text-[12px] font-medium"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
            <p className="text-[11px] text-gray-500 flex items-center gap-1">
              <Clock size={11} />
              Updated {overview?.last_updated ? formatLastUpdated(overview.last_updated) : '—'}
            </p>
          </div>
        </div>

        {/* Status pills row */}
        <div className="flex flex-wrap items-center gap-2 px-8 pt-2">
          <StatusPill
            label="Breaker"
            value={overview?.breaker_status ? overview.breaker_status.toUpperCase() : 'UNKNOWN'}
            healthy={overview?.breaker_status ? overview.breaker_status === 'on' : null}
            icon={Power}
          />
          <StatusPill
            label="Inverters"
            value={`${overview?.device_summary.online ?? 0} / ${overview?.device_summary.total ?? 0}`}
            healthy={overview ? overview.device_summary.online === overview.device_summary.total : null}
            icon={Cpu}
          />
        </div>

        {/* Main hero content: gauge (left) + secondary stats (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_1fr] gap-6 lg:gap-10 items-center px-8 py-8">

          {/* Radial gauge */}
          <div className="flex justify-center lg:justify-start">
            <RadialGauge
              value={activePower}
              max={acCapacity}
              unit="kW · Active Power"
              color="#e17100"
            />
          </div>

          {/* Secondary metrics: 2x2 with hairline dividers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 divide-x divide-[#EDEDED]">
            <div className="pl-0 md:pl-0">
              <InlineStat
                label="Energy Today"
                value={overview?.plant.energy_today_kwh?.toLocaleString() ?? '—'}
                unit="kWh"
              />
            </div>
            <div className="pl-6">
              <InlineStat
                label="Energy Total"
                value={overview?.plant.energy_active_export_kwh?.toLocaleString() ?? '—'}
                unit="kWh"
              />
            </div>
            <div className="pl-6">
              <InlineStat
                label="CO₂ Avoided"
                value={overview?.performance?.co2_avoided_today_kg?.toFixed(1) ?? '—'}
                unit="kg"
                tone="olive"
              />
            </div>
            <div className="pl-6">
              <InlineStat
                label="Power Factor"
                value={overview?.plant.power_factor ?? '—'}
              />
            </div>
          </div>
        </div>

        {/* Weather strip in the hero footer */}
        {overview?.weather && (
          <div className="border-t border-[#EDEDED] bg-white/60 px-8 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
            <WeatherChip
              icon={Sun}
              label="Irradiance"
              value={overview.weather.irradiation_inclined_wm2}
              unit="W/m²"
            />
            <WeatherChip
              icon={Thermometer}
              label="Ambient"
              value={overview.weather.ambient_temp_c}
              unit="°C"
            />
            <WeatherChip
              icon={Wind}
              label="Module"
              value={overview.weather.module_temp_c}
              unit="°C"
            />
            {tempDelta && (
              <div className="ml-auto text-[11px] text-gray-500">
                Module {' '}
                <span className={`font-semibold ${Number(tempDelta) > 10 ? 'text-amber-600' : 'text-[#497d00]'}`}>
                  +{tempDelta}°C
                </span>
                {' '} above ambient
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============ PERFORMANCE STRIP (gauges) ============ */}
      <section className="bg-white rounded-2xl border border-[#EDEDED] px-8 py-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-black tracking-tight">Performance</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Today · Live</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 items-center gap-4">
          <SemiGauge
            value={overview?.performance?.performance_ratio_pct ?? 0}
            label="Performance Ratio"
            tone="accent"
          />
          <SemiGauge
            value={overview?.performance?.cuf_pct ?? 0}
            label="Capacity Utilisation"
            tone="olive"
          />
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-[#FAFAFA] flex items-center justify-center text-[#e17100]">
              <TrendingUp size={20} />
            </div>
            <span className="text-[22px] font-semibold text-black leading-none mt-2">
              {overview?.performance?.poa_irradiation_kwh_m2?.toFixed(2) ?? '—'}
            </span>
            <span className="text-[10px] text-gray-400 mt-1">kWh/m²</span>
            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-medium mt-1">POA Irradiation</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-[#FAFAFA] flex items-center justify-center text-[#497d00]">
              <Leaf size={20} />
            </div>
            <span className="text-[22px] font-semibold text-black leading-none mt-2">
              {overview?.performance?.co2_avoided_today_kg?.toFixed(1) ?? '—'}
            </span>
            <span className="text-[10px] text-gray-400 mt-1">kg CO₂</span>
            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-500 font-medium mt-1">Avoided Today</p>
          </div>
        </div>
      </section>

      {/* ============ POWER TREND + GRID DATA ============ */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Power Trend — borderless */}
        <div className="bg-white rounded-2xl border border-[#EDEDED] md:col-span-2">
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

        {/* Grid data as clean list (no boxy table) */}
        <div className="bg-white rounded-2xl border border-[#EDEDED] px-6 py-5">
          <div className="mb-4">
            <h2 className="text-[15px] font-semibold text-black tracking-tight">Grid</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {overview?.plant.frequency_hz ?? '—'} Hz
              <span className="text-gray-300 mx-1.5">·</span>
              PF {overview?.plant.power_factor ?? '—'}
            </p>
          </div>
          <div className="flex flex-col divide-y divide-[#F1F1F1]">
            {[
              { phase: 'AB / A', voltage: overview?.grid.voltage_ab, current: overview?.grid.current_a },
              { phase: 'BC / B', voltage: overview?.grid.voltage_bc, current: overview?.grid.current_b },
              { phase: 'CA / C', voltage: overview?.grid.voltage_ca, current: overview?.grid.current_c },
            ].map((row) => (
              <div key={row.phase} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium">Phase</span>
                  <span className="text-[13px] font-semibold text-black">{row.phase}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[13px] font-semibold text-black tabular-nums">
                      {row.voltage != null ? (row.voltage / 1000).toFixed(2) : '—'}
                    </span>
                    <span className="text-[10px] text-gray-400">kV</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[13px] font-semibold text-[#497d00] tabular-nums">
                      {row.current?.toFixed(2) ?? '—'}
                    </span>
                    <span className="text-[10px] text-gray-400">A</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ DAILY ENERGY ============ */}
      <section className="bg-white rounded-2xl border border-[#EDEDED]">
        <DailyEnergyCard chartData={dailyEnergyChartData} loading={dailyEnergyLoading} />
      </section>

      {/* ============ ELECTRICAL TREND ============ */}
      <section className="bg-white rounded-2xl border border-[#EDEDED]">
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
      </section>

      {/* Modals */}
      {elecExpanded && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
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
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
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