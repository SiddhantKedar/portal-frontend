import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Activity, TrendingUp, Gauge, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, BarChart, Bar
} from 'recharts'
import api from '@/api/axios'

import { useAuth } from '@/context/AuthContext'
import { useSite } from '@/context/SiteContext'

// ---- Types ----

interface PlantData {
  active_power_kw: number
  reactive_power_kvar: number
  energy_today_kwh: number
  frequency_hz: number
  power_factor: number
}

interface GridData {
  current_a: number
  current_b: number
  current_c: number
  voltage_ab: number
  voltage_bc: number
  voltage_ca: number
}

interface Inverter {
  device_id: string
  name: string
  active_power_kw: number
  daily_gen_kwh: number
  internal_temp_c: number
  inverter_efficiency_pct: number
  status: string
  last_updated: string
}

interface PowerTrendPoint {
  time: string
  total_kw: number
}

interface DashboardOverview {
  site: string
  last_updated: string
  plant: PlantData
  grid: GridData
  inverters: Inverter[]
  power_trend: PowerTrendPoint[]
}

interface DailyEnergyPoint {
  date: string
  energy_kwh: number
}

interface DailyEnergyData {
  data: DailyEnergyPoint[]
}

// ---- Helpers ----

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatLastUpdated(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
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

export default function DashboardPage() {
  const navigate = useNavigate()
  const { site } = useSite()
  const { user } = useAuth()
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [dailyEnergy, setDailyEnergy] = useState<DailyEnergyPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!site?.id) return
    const fetchAll = async () => {
      try {
        const [overviewRes, energyRes] = await Promise.all([
          api.get<DashboardOverview>(`/influx/dashboard/overview/?site=${site.id}`),
          api.get<DailyEnergyData>(`/influx/dashboard/daily-energy/?site=${site.id}&days=5`),
        ])
        setOverview(overviewRes.data)
        setDailyEnergy(energyRes.data.data)
      } catch (err) {
        console.error('Dashboard overview error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [navigate, site?.id])

  // Build full 24h skeleton with real data merged in
  const chartData = overview?.power_trend.map((p) => ({
    time: formatTime(p.time),
    power: p.total_kw,
    })) ?? []

  const energyChartData = useMemo(() => {
    return dailyEnergy
      .filter((d) => d.energy_kwh > 0)
      .map((d) => ({
        date: formatDate(d.date),
        energy: Math.round(d.energy_kwh),
      }))
  }, [dailyEnergy])

  const powerChartConfig = {
    power: { label: 'Active Power (kW)', color: '#22C55E' },
  }

  const energyChartConfig = {
    energy: { label: 'Energy (kWh)', color: '#0F1E3C' },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-[13px] text-gray-400">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Page Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight">
          Welcome back, {user?.first_name}
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {overview?.site} · Last updated {overview?.last_updated ? formatLastUpdated(overview.last_updated) : '—'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Active Power"
          value={overview?.plant.active_power_kw ?? '—'}
          unit="kW"
          icon={Zap}
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
        <KpiCard
          title="Grid Frequency"
          value={overview?.plant.frequency_hz ?? '—'}
          unit="Hz"
          icon={Activity}
          footer="Nominal 50 Hz"
        />
        <KpiCard
          title="Power Factor"
          value={overview?.plant.power_factor ?? '—'}
          unit="PF"
          icon={Gauge}
          footer="Unity — optimal"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6">


        {/* Power Trend */}
        <Card className="border-[#E2E8F0] shadow-none rounded-xl">
          <CardHeader className="pb-2 px-6 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">
                  Power Trend
                </CardTitle>
                <p className="text-[12px] text-gray-400 mt-0.5">Active power · today</p>
              </div>
              <span style={{fontSize:'11px', color:'#9CA3AF', background:'#F8FAFC', border:'0.5px solid #E2E8F0', borderRadius:'6px', padding:'3px 10px'}}>kW</span>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ChartContainer config={powerChartConfig} className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    tickLine={false}
                    axisLine={false}
                    interval={9}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="power"
                    stroke="#22C55E"
                    strokeWidth={1.5}
                    fill="url(#powerGradient)"
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 4, fill: '#22C55E' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Daily Energy */}
        

      </div>

      {/* Inverters Table */}
      <Card className="border-[#E2E8F0] shadow-none rounded-xl">
        <CardHeader className="pb-2 px-6 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">Inverters</CardTitle>
              <p className="text-[12px] text-gray-400 mt-0.5">Live status for all inverters on this site</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#22C55E]/10 text-[#16A34A]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              {overview?.inverters.filter(i => i.status === 'online').length} online
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-5">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[600px]">
              <thead>
                <tr className="border-b border-[#E2E8F0]">
                  <th className="text-left text-[11px] uppercase tracking-wider text-gray-400 font-medium pb-2">Inverter</th>
                  <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-medium pb-2">Power (kW)</th>
                  <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-medium pb-2">Daily (kWh)</th>
                  <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-medium pb-2">Temp (°C)</th>
                  <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-medium pb-2">Efficiency</th>
                  <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-medium pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {overview?.inverters.map((inv, i) => (
                  <tr
                    key={inv.device_id}
                    className={`border-b border-[#F8FAFC] ${i % 2 === 1 ? 'bg-[#FAFBFC]' : 'bg-white'}`}
                  >
                    <td className="py-3 font-medium text-[#0F1E3C]">{inv.name}</td>
                    <td className="py-3 text-right text-gray-600">{inv.active_power_kw}</td>
                    <td className="py-3 text-right text-gray-600">{inv.daily_gen_kwh.toLocaleString()}</td>
                    <td className={`py-3 text-right font-medium ${inv.internal_temp_c >= 55 ? 'text-amber-600' : 'text-gray-600'}`}>
                    {inv.internal_temp_c}
                    </td>
                    <td className="py-3 text-right text-gray-600">{inv.inverter_efficiency_pct}%</td>
                    <td className="py-3 text-right">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${
                        inv.status === 'online' ? 'bg-[#22C55E]/10 text-[#16A34A]' : 'bg-red-50 text-red-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${inv.status === 'online' ? 'bg-[#22C55E]' : 'bg-red-400'}`} />
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

                {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6">
            <Card className="border-[#E2E8F0] shadow-none rounded-xl">
                <CardHeader className="pb-2 px-6 pt-5">
                    <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">
                        Daily Energy
                        </CardTitle>
                        <p className="text-[12px] text-gray-400 mt-0.5">Generation last 7 days</p>
                    </div>
                    <span style={{fontSize:'11px', color:'#9CA3AF', background:'#F8FAFC', border:'0.5px solid #E2E8F0', borderRadius:'6px', padding:'3px 10px'}}>kWh</span>
                    </div>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                    <ChartContainer config={energyChartConfig} className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={energyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis
                            dataKey="date"
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
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                            dataKey="energy"
                            fill="#0F1E3C"
                            radius={[4, 4, 0, 0]}
                        />
                        </BarChart>
                    </ResponsiveContainer>
                    </ChartContainer>
                </CardContent>
                </Card>
        </div>

    </div>
  )
}