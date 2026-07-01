import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, TrendingUp, Activity, Gauge, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { GenerationCards } from '@/components/dashboard/GenerationCards'
import { DatePicker } from '@/components/DatePicker'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer
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
}

interface PowerTrendPoint {
  time: string
  power_kw: number
}

interface PowerTrendData {
  data: PowerTrendPoint[]
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
    <div className={`bg-white rounded-xl border border-[#E2E8F0] border-l-[3px] px-4 py-4 ${accent ? 'border-l-[#22C55E]' : 'border-l-[#E2E8F0]'}`}>
      <div className="flex items-start justify-between mb-2.5">
        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">{title}</p>
        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${accent ? 'bg-[#22C55E]/10' : 'bg-[#F4F6F9]'}`}>
          <Icon size={13} className={accent ? 'text-[#22C55E]' : 'text-gray-400'} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-[#0F1E3C] tracking-tight leading-none">
          {value}
        </span>
        <span className="text-[12px] text-gray-400">{unit}</span>
      </div>
      {footer && (
        <div className="flex items-center gap-1.5 mt-2">
          {accent && <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />}
          <span className="text-[11px] text-gray-400">{footer}</span>
        </div>
      )}
    </div>
  )
}

// ---- Main Page ----

export default function PlantOverviewPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<PlantOverview | null>(null)
  const [trend, setTrend] = useState<PowerTrendPoint[]>([])
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [trendLoading, setTrendLoading] = useState(false)
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
    power: p.power_kw,
    }))

  const chartConfig = {
    power: { label: 'Active Power (kW)', color: '#22C55E' },
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
        <h1 className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight">
          Plant Overview
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
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
          footer="Installed"
        />
        <KpiCard
          title="AC Capacity"
          value="1,050"
          unit="kW"
          icon={Gauge}
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
          title="Total Energy"
          value={overview?.plant.energy_today_kwh?.toLocaleString() ?? '—'}
          unit="kWh"
          icon={TrendingUp}
          accent
          footer="Today so far"
        />
      </div>

      {/* Generation Cards */}
    <GenerationCards actualToday={overview?.plant.energy_today_kwh ?? 0} />

    {/* Power Trend + Grid Table */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

    {/* Power Trend - takes 2/3 width */}
    <Card className="border-[#E2E8F0] shadow-none rounded-xl md:col-span-2">
        <CardHeader className="pb-2 px-6 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
            <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">
                Power Trend
            </CardTitle>
            <p className="text-[12px] text-gray-400 mt-0.5">
                Active power · {selectedDate === todayString() ? 'Today' : selectedDate}
            </p>
            </div>
            <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            maxDate={new Date()}
            />
        </div>
        </CardHeader>
        <CardContent className="px-2 pb-4">
        {trendLoading ? (
            <div className="h-[240px] flex items-center justify-center">
            <p className="text-[13px] text-gray-400">Loading chart...</p>
            </div>
        ) : (
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="plantPowerGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                    dataKey="time"
                    type="number"
                    domain={[0, 1440]}
                    ticks={DAY_TICKS}
                    tickFormatter={formatMinutesTick}
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    tickLine={false}
                    axisLine={false}
                />
                <YAxis
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                />
                <ChartTooltip
                    content={<ChartTooltipContent labelFormatter={(label) => formatMinutesTick(Number(label))} />}
                />
                <Area
                    type="monotone"
                    dataKey="power"
                    stroke="#22C55E"
                    strokeWidth={1.5}
                    fill="url(#plantPowerGradient)"
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 4, fill: '#22C55E' }}
                />
                </AreaChart>
            </ResponsiveContainer>
            </ChartContainer>
        )}
        </CardContent>
    </Card>

    {/* Grid Table - takes 1/3 width */}
    <Card className="border-[#E2E8F0] shadow-none rounded-xl">
        <CardHeader className="pb-2 px-6 pt-5">
        <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">Grid</CardTitle>
        <p className="text-[12px] text-gray-400 mt-0.5">Voltage, current & power quality</p>
        </CardHeader>
        <CardContent className="px-6 pb-5 flex flex-col justify-center h-full">
        <table className="w-full text-[12px]">
            <thead>
            <tr className="border-b border-[#E2E8F0]">
                <th className="text-left text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2"></th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2">Voltage</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2">Current</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2">Freq</th>
                <th className="text-right text-[10px] uppercase tracking-wider text-gray-400 font-medium pb-2">PF</th>
            </tr>
            </thead>
            <tbody>
            {[
                {
                phase: 'AB / A',
                voltage: overview?.grid.voltage_ab,
                current: overview?.grid.current_a,
                },
                {
                phase: 'BC / B',
                voltage: overview?.grid.voltage_bc,
                current: overview?.grid.current_b,
                },
                {
                phase: 'CA / C',
                voltage: overview?.grid.voltage_ca,
                current: overview?.grid.current_c,
                },
            ].map((row, i) => (
                <tr
                key={row.phase}
                className={`border-b border-[#F8FAFC] ${i % 2 === 1 ? 'bg-[#FAFBFC]' : 'bg-white'}`}
                >
                <td className="py-2.5 font-medium text-[#0F1E3C]">{row.phase}</td>
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
    </div>
  )
}