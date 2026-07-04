import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Zap, TrendingUp, Activity, Gauge, Clock, Maximize2, Minimize2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { GenerationCards } from '@/components/dashboard/GenerationCards'
import { DatePicker } from '@/components/DatePicker'
import {
  Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer, Line, ComposedChart
} from 'recharts'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'



// ---- Types ----

interface PlantOverview {
  site: string
  last_updated: string
  plant: {
    active_power_kw: number
    energy_today_kwh: number
    frequency_hz: number
    power_factor: number
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

// ---- Helpers ----

// Numeric position on a fixed 24hr axis (0–1440), instead of a formatted
// string label — lets Recharts use a real numeric domain so the axis
// always spans the full day, even if actual data only covers part of it.
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

// ---- KPI Card ----

function KpiCard({
  title, value, unit, icon: Icon, accent = false, footer,
}: {
  title: string
  value: string | number
  unit: string
  icon: React.ElementType
  accent?: boolean
  footer?: string
}) {
  return (
    <div className={`bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] px-4 py-4 ${accent ? 'border-l-amber-600' : 'border-l-[#E5E5E5]'}`}>
      <div className="flex items-start justify-between mb-2.5">
        <p className="text-[14px] uppercase tracking-wider text-black-400 font-medium">{title}</p>
        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${accent ? 'bg-amber-600/10' : 'bg-[#FAFAFA]'}`}>
          <Icon size={13} className={accent ? 'text-amber-600' : 'text-gray-400'} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-black tracking-tight leading-none">
          {value}
        </span>
        <span className="text-[12px] text-black-400">{unit}</span>
      </div>
      {footer && (
        <div className="flex items-center gap-1.5 mt-2">
          {accent && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
          <span className="text-[11px] text-green-700">{footer}</span>
        </div>
      )}
    </div>
  )
}

// Power Trend chart component
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
              className="h-9 w-9 flex items-center justify-center border border-[#E5E5E5] rounded-lg text-gray-400 hover:text-black hover:border-[#D4D4D4] transition-colors"
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
// ---- Main Page ----

export default function PlantOverviewPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<PlantOverview | null>(null)
  const [trend, setTrend] = useState<PowerTrendPoint[]>([])
  const [stats, setStats] = useState<PowerTrendData['stats']>(null)
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [trendLoading, setTrendLoading] = useState(false)
  const [chartExpanded, setChartExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const { site } = useSite()

  // Fetch overview once
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
  }, [navigate])

  // Fetch trend whenever date changes
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

  const chartData = trend.map((p) => ({
    time: minutesSinceMidnight(p.time),
    power: p.active_power_total_kw > 0 ? p.active_power_total_kw : null,
    irradiation: p.irradiation_inclined_wm2 > 0 ? p.irradiation_inclined_wm2 : null,
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

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Page Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-black tracking-tight">
          Plant Overview
        </h1>
        <p className="text-[13px] text-black-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {overview?.site} · Last updated {overview?.last_updated ? formatLastUpdated(overview.last_updated) : '—'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="DC Capacity"
          value="1,200"
          unit="kW"
          icon={Zap}
          accent
          footer="Installed"
        />
        <KpiCard
          title="AC Capacity"
          value="1,050"
          unit="kW"
          icon={Gauge}
          accent
          footer="Rated"
        />
        <KpiCard
          title="Active Power"
          value={overview?.plant.active_power_kw ?? '—'}
          unit="kW"
          icon={Activity}
          accent
          footer="Live reading"
        />
        <KpiCard
          title="Energy Today"
          value={overview?.plant.energy_today_kwh?.toLocaleString() ?? '—'}
          unit="kWh"
          icon={TrendingUp}
          accent
          footer="Today so far"
        />
      </div>

      {/* Weather Strip */}
      {overview?.weather && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] border-l-[#22C55E] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">Irradiation</p>
            <div className="flex items-baseline gap-1">
              <span className="text-[22px] font-semibold text-black">{overview.weather.irradiation_inclined_wm2}</span>
              <span className="text-[12px] text-gray-400">W/m²</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] border-l-[#22C55E] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">Ambient Temp</p>
            <div className="flex items-baseline gap-1">
              <span className="text-[22px] font-semibold text-black">{overview.weather.ambient_temp_c}</span>
              <span className="text-[12px] text-gray-400">°C</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] border-l-[#22C55E] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">Module Temp</p>
            <div className="flex items-baseline gap-1">
              <span className="text-[22px] font-semibold text-black">{overview.weather.module_temp_c}</span>
              <span className="text-[12px] text-gray-400">°C</span>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] border-l-[#22C55E] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">C02 avoided</p>
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
              overview.weather.status === 'online' ? 'bg-[#22C55E]/10 text-[#16A34A]' : 'bg-red-50 text-red-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${overview.weather.status === 'online' ? 'bg-[#22C55E]' : 'bg-red-400'}`} />
              {overview.weather.status}
            </span>
          </div>
        </div>
      )}

      {/* Generation Cards */}
    <GenerationCards actualToday={overview?.plant.energy_today_kwh ?? 0} />

{/* Power Trend + Grid Table */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

      {/* Power Trend - always in normal position, modal handles expansion */}
      <Card className="border-[#E5E5E5] shadow-none rounded-xl md:col-span-2">
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
      </Card>

      {/* Grid Table */}
      <Card className="border-[#E5E5E5] shadow-none rounded-xl">
        <CardHeader className="pb-2 px-6 pt-5">
          <CardTitle className="text-[18px] font-semibold text-black">Grid</CardTitle>
          <p className="text-[12px] text-gray-400 mt-0.5">Voltage, current & power quality</p>
        </CardHeader>
        <CardContent className="px-6 pb-5 flex flex-col justify-center h-full">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#E5E5E5]">
                <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2"></th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2">Voltage</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2">Current</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2">Freq</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2">PF</th>
              </tr>
            </thead>
            <tbody>
              {[
                { phase: 'AB / A', voltage: overview?.grid.voltage_ab, current: overview?.grid.current_a },
                { phase: 'BC / B', voltage: overview?.grid.voltage_bc, current: overview?.grid.current_b },
                { phase: 'CA / C', voltage: overview?.grid.voltage_ca, current: overview?.grid.current_c },
              ].map((row, i) => (
                <tr key={row.phase} className={`border-b border-[#FAFAFA] ${i % 2 === 1 ? 'bg-[#FCFCFC]' : 'bg-white'}`}>
                  <td className="py-2.5 font-medium text-black">{row.phase}</td>
                  <td className="py-2.5 text-right text-gray-600">
                    {row.voltage != null ? (row.voltage / 1000).toFixed(2) : '—'}
                    <span className="text-[10px] text-gray-400 ml-0.5">kV</span>
                  </td>
                  <td className="py-2.5 text-right text-gray-600">
                    {row.current?.toFixed(2) ?? '—'}
                    <span className="text-[10px] text-gray-400 ml-0.5">A</span>
                  </td>
                  <td className="py-2.5 text-right text-gray-600">
                    {overview?.plant.frequency_hz ?? '—'}
                    <span className="text-[10px] text-gray-400 ml-0.5">Hz</span>
                  </td>
                  <td className="py-2.5 text-right text-gray-600">
                    {overview?.plant.power_factor ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

    </div>

    {/* Modal overlay — renders via portal above everything */}
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