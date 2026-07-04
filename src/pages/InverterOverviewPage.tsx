import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, TrendingUp, Cpu, Activity, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer
} from 'recharts'
import { DatePicker } from '@/components/DatePicker'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

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

// Numeric position on a fixed 24hr axis (0–1440) so the chart always
// spans the full day regardless of how much real data exists yet.
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

function avgEfficiency(inverters: InverterData[]) {
  if (!inverters.length) return '—'
  const avg = inverters.reduce((sum, i) => sum + i.inverter_efficiency_pct, 0) / inverters.length
  return avg.toFixed(1)
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
    <div className={`bg-white rounded-xl border border-[#E5E5E5] border-l-[3px] px-4 py-4 ${accent ? 'border-l-[#CC785C]' : 'border-l-[#E5E5E5]'}`}>
      <div className="flex items-start justify-between mb-2.5">
        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">{title}</p>
        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${accent ? 'bg-amber-600/10' : 'bg-[#FAFAFA]'}`}>
          <Icon size={13} className={accent ? 'text-amber-600' : 'text-gray-400'} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-[#1A1A1A] tracking-tight leading-none">
          {value}
        </span>
        <span className="text-[12px] text-gray-400">{unit}</span>
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

// ---- Main Page ----

export default function InverterOverviewPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<InverterOverview | null>(null)
  const [trend, setTrend] = useState<PowerTrendPoint[]>([])
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [trendLoading, setTrendLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const { site } = useSite()

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await api.get<InverterOverview>(`/influx/inverter/overview/?site=${site?.id}`)
        res.data.inverters.sort((a, b) => a.name.localeCompare(b.name))
        setOverview(res.data)
        } catch (err) {
        console.error('Inverter overview error:', err)
        } finally {
        setLoading(false)
        }
    }
    fetchOverview()
  }, [navigate])

  useEffect(() => {
    const fetchTrend = async () => {
      setTrendLoading(true)
      try {
        const res = await api.get<PowerTrendData>(
          `/influx/inverter/power-trend/?site=${site?.id}&date=${selectedDate}`
        )
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
    power: { label: 'Active Power (kW)', color: '#e17100' },
  }

  const lastUpdated = overview?.inverters[0]?.last_updated

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-[13px] text-gray-400">Loading inverter overview...</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-[#1A1A1A] tracking-tight">
          Inverter Overview
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {overview?.site} · Last updated {lastUpdated ? formatLastUpdated(lastUpdated) : '—'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 ">
        <KpiCard
          title="Total Active Power"
          value={overview?.summary.total_ac_active_power_kw ?? '—'}
          unit="kW"
          icon={Zap}
          accent
          footer="Live reading"
        />
        <KpiCard
          title="Total Energy Today"
          value={overview?.summary.total_energy_daily_kwh?.toLocaleString() ?? '—'}
          unit="kWh"
          icon={TrendingUp}
          accent
          footer="Today so far"
        />
        <KpiCard
          title="Inverters Online"
          value={`${overview?.summary.online_count ?? '—'}`}
          unit={`/ ${overview?.summary.total_count ?? '—'}`}
          icon={Cpu}
          accent
          footer="All operational"
        />
        <KpiCard
          title="Avg Efficiency"
          value={overview ? avgEfficiency(overview.inverters) : '—'}
          unit="%"
          icon={Activity}
          accent
          footer="Across all inverters"
        />
      </div>

      {/* Inverters Table — combined live data + efficiency/performance */}
      <Card className="border-[#E5E5E5] shadow-none rounded-xl">
        <CardHeader className="pb-2 px-6 pt-5">
          <CardTitle className="text-[14px] font-semibold text-[#1A1A1A]">
            Inverters
          </CardTitle>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Live data & efficiency for all inverters on this site
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          <div className="rounded-lg border border-[#E5E5E5] overflow-auto max-h-[460px]">
            <table className="w-full text-[13px] min-w-[940px]">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-30 bg-[#FAFAFA] text-left text-[11px] uppercase tracking-wider text-gray-400 font-semibold px-4 py-3 align-middle rounded-tl-lg border-b border-[#E5E5E5]"
                  >
                    Inverter
                  </th>
                  <th
                    colSpan={4}
                    className="bg-[#FAFAFA] text-center text-[11px] uppercase tracking-wider text-gray-500 font-semibold py-2 border-b border-[#E5E5E5]"
                  >
                    Live Data
                  </th>
                  <th
                    colSpan={3}
                    className="bg-[#FAFAFA] text-center text-[11px] uppercase tracking-wider text-gray-500 font-semibold py-2 border-b border-[#E5E5E5] border-l-2 border-l-[#E5E5E5]"
                  >
                    Efficiency &amp; Performance
                  </th>
                  <th
                    rowSpan={2}
                    className="bg-[#FAFAFA] text-right text-[11px] uppercase tracking-wider text-gray-400 font-semibold px-4 py-3 align-middle rounded-tr-lg border-b border-[#E5E5E5]"
                  >
                    Status
                  </th>
                </tr>
                <tr className="border-b border-[#E5E5E5]">
                  <th className="bg-[#FAFAFA] text-right text-[11px] text-gray-500 font-medium pb-2.5 pt-1 px-3 whitespace-nowrap">
                    Active Power <span className="text-gray-400">(kW)</span>
                  </th>
                  <th className="bg-[#FAFAFA] text-right text-[11px] text-gray-500 font-medium pb-2.5 pt-1 px-3 whitespace-nowrap">
                    Reactive Power <span className="text-gray-400">(kVAR)</span>
                  </th>
                  <th className="bg-[#FAFAFA] text-right text-[11px] text-gray-500 font-medium pb-2.5 pt-1 px-3 whitespace-nowrap">
                    Energy Today <span className="text-gray-400">(kWh)</span>
                  </th>
                  
                  <th className="bg-[#FAFAFA] text-right text-[11px] text-gray-500 font-medium pb-2.5 pt-1 px-3 whitespace-nowrap">
                    Energy Total <span className="text-gray-400">(MWh)</span>
                  </th>
                  <th className="bg-[#FAFAFA] text-right text-[11px] text-gray-500 font-medium pb-2.5 pt-1 px-3 whitespace-nowrap border-l-2 border-l-[#E5E5E5]">
                    Efficiency
                  </th>
                  <th className="bg-[#FAFAFA] text-right text-[11px] text-gray-500 font-medium pb-2.5 pt-1 px-3 whitespace-nowrap">
                    Power Factor
                  </th>
                  <th className="bg-[#FAFAFA] text-right text-[11px] text-gray-500 font-medium pb-2.5 pt-1 px-3 whitespace-nowrap">
                    Frequency <span className="text-gray-400">(Hz)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {overview?.inverters.map((inv, i) => {
                  const isStripe = i % 2 === 1
                  const rowBg = isStripe ? '#FAFAFA' : '#FFFFFF'
                  return (
                    <tr
                      key={inv.device_id}
                      className={`border-b border-[#F1F1F1] hover:bg-[#FAFAFA] transition-colors group ${isStripe ? 'bg-[#FAFAFA]' : 'bg-white'}`}
                    >
                      <td
                        className="sticky left-0 z-10 py-3 px-4 font-medium text-[#1A1A1A] group-hover:bg-[#FAFAFA] transition-colors"
                        style={{ background: rowBg }}
                      >
                        {inv.name}
                      </td>
                      <td className="py-3 px-3 text-right text-[#1A1A1A] font-medium ">
                        {inv.ac_active_power_kw}
                      </td>
                      <td className="py-3 px-3 text-right text-[#1A1A1A] font-medium ">
                        {inv.ac_reactive_power_kvar}
                      </td>
                      <td className="py-3 px-3 text-right text-[#1A1A1A] font-medium ">
                        {inv.energy_daily_kwh.toLocaleString()}
                      </td>
                      
                      <td className="py-3 px-3 text-right text-[#1A1A1A] font-medium ">
                        {(inv.energy_total_kwh / 1000).toFixed(1)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#1A1A1A] font-medium border-l-2 border-l-[#F1F1F1]">
                        {inv.inverter_efficiency_pct}%
                      </td>
                      <td className="py-3 px-3 text-right text-[#1A1A1A] font-medium ">
                        {inv.ac_power_factor.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right text-[#1A1A1A] font-medium">
                        {inv.grid_frequency_hz}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          inv.status === 'online' ? 'bg-green-500/10 text-green-700' : 'bg-red-50 text-red-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${inv.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`} />
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Power Trend */}
      <Card className="border-[#E5E5E5] shadow-none rounded-xl">
        <CardHeader className="pb-2 px-6 pt-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-[14px] font-semibold text-[#1A1A1A]">
                Power Trend
              </CardTitle>
              <p className="text-[12px] text-gray-400 mt-0.5">
                Total inverter output · {selectedDate === todayString() ? 'Today' : selectedDate}
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
                    <linearGradient id="invPowerGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#CC785C" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#CC785C" stopOpacity={0} />
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
                    tick={{ fontSize: 10, fill: '#8A8A8A' }}
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
                    stroke="#CC785C"
                    strokeWidth={1.5}
                    fill="url(#invPowerGradient)"
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 4, fill: '#CC785C' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

    </div>
  )
}