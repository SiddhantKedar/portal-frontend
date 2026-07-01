import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Zap, TrendingUp, Gauge, Activity, Clock, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  ComposedChart, BarChart, Bar, Cell, LabelList, Area, Line, XAxis, YAxis,
  CartesianGrid, ResponsiveContainer
} from 'recharts'
import { format } from 'date-fns'
import { DatePicker } from '@/components/DatePicker'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

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
  grid_frequency_hz: number
  ac_reactive_power_kvar: number
  internal_temp_c: number
  grid_voltage_ab_v: number
  grid_voltage_bc_v: number
  grid_voltage_ca_v: number
  status: string
  last_updated: string
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

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatLastUpdated(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

// De-dupe by date, keeping the last value seen for that date (defensive
// against the backend occasionally returning a repeated boundary day)
function dedupeDailyEnergy(points: DailyEnergyPoint[]) {
  const map = new Map<string, number>()
  points.forEach((p) => map.set(p.date, p.energy_kwh))
  return Array.from(map.entries()).map(([date, energy_kwh]) => ({ date, energy_kwh }))
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

// ---- Electrical detail row ----

function DetailRow({ label, value, unit, isLast = false }: { label: string; value: string | number; unit?: string; isLast?: boolean }) {
  return (
    <tr className={isLast ? '' : 'border-b border-[#F8FAFC]'}>
      <td className="py-2.5 text-[12px] text-gray-500">{label}</td>
      <td className="py-2.5 text-right text-[13px] font-medium text-[#0F1E3C]">
        {value}
        {unit && <span className="text-[10px] text-gray-400 ml-1">{unit}</span>}
      </td>
    </tr>
  )
}

// ---- Main Page ----

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

  const [dailyEnergy, setDailyEnergy] = useState<DailyEnergyPoint[]>([])
  const [dailyLoading, setDailyLoading] = useState(true)

  // Live snapshot
  useEffect(() => {
    if (!site?.id || !device?.id) return
    const fetchDetail = async () => {
      setLoading(true)
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
    }
    fetchDetail()
  }, [site?.id, device?.id])

  // Power trend
  useEffect(() => {
    if (!site?.id || !device?.id) return
    const fetchTrend = async () => {
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
    }
    fetchTrend()
  }, [site?.id, device?.id, selectedDate])

  // Daily energy (loads once)
  useEffect(() => {
    if (!site?.id || !device?.id) return
    const fetchDailyEnergy = async () => {
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
    }
    fetchDailyEnergy()
  }, [site?.id, device?.id])

  const trendChartData = useMemo(
    () =>
      trend.map((p) => ({
        time: formatTime(p.time),
        dc: p.dc_input_power_kw,
        ac: p.ac_active_power_kw,
        reactive: p.ac_reactive_power_kvar,
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

  // Device not found in current site's device list (stale link, etc.)
  if (!device) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-[13px] text-gray-400">Device not found for this site.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-[13px] text-gray-400">Loading inverter detail...</p>
      </div>
    )
  }

  const trendChartConfig = {
    ac: { label: 'AC Active Power (kW)', color: '#22C55E' },
    dc: { label: 'DC Input Power (kW)', color: '#0F1E3C' },
    reactive: { label: 'AC Reactive Power (kVAR)', color: '#9CA3AF' },
  }

  const dailyChartConfig = {
    energy: { label: 'Energy (kWh)', color: '#0F1E3C' },
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight">
            {detail?.name}
          </h1>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
            detail?.status === 'online' ? 'bg-[#22C55E]/10 text-[#16A34A]' : 'bg-red-50 text-red-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${detail?.status === 'online' ? 'bg-[#22C55E]' : 'bg-red-400'}`} />
            {detail?.status}
          </span>
        </div>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {detail?.site} · Last updated {detail?.last_updated ? formatLastUpdated(detail.last_updated) : '—'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Active Power"
          value={detail?.ac_active_power_kw ?? '—'}
          unit="kW"
          icon={Zap}
          accent
          footer="Live reading"
        />
        <KpiCard
          title="Energy Today"
          value={detail?.energy_daily_kwh?.toLocaleString() ?? '—'}
          unit="kWh"
          icon={TrendingUp}
          accent
          footer="Today so far"
        />
        <KpiCard
          title="Total Energy"
          value={detail ? (detail.energy_total_kwh / 1000).toFixed(1) : '—'}
          unit="MWh"
          icon={Gauge}
          footer="Lifetime"
        />
        <KpiCard
          title="Efficiency"
          value={detail ? detail.inverter_efficiency_pct.toFixed(1) : '—'}
          unit="%"
          icon={Activity}
          footer="Current"
        />
      </div>

      {/* Power Trend + Electrical Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* Power Trend - 2/3 width */}
        <Card className="border-[#E2E8F0] shadow-none rounded-xl md:col-span-2">
          <CardHeader className="pb-2 px-6 pt-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">
                  Power Trend
                </CardTitle>
                <p className="text-[12px] text-gray-400 mt-0.5">
                  DC input · AC active · AC reactive · {selectedDate === todayString() ? 'Today' : selectedDate}
                </p>
              </div>
              <DatePicker
                value={selectedDate}
                onChange={setSelectedDate}
                maxDate={new Date()}
              />
            </div>
            {/* Legend — click to toggle a series on/off */}
            <div className="flex items-center gap-4 mt-3">
              <button
                type="button"
                onClick={() => toggleSeries('ac')}
                className="flex items-center gap-1.5"
              >
                <span
                  className="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: hiddenSeries.has('ac') ? 'transparent' : '#22C55E',
                    borderColor: hiddenSeries.has('ac') ? '#CBD5E1' : '#22C55E',
                  }}
                >
                  {!hiddenSeries.has('ac') && <Check size={10} className="text-white" strokeWidth={3} />}
                </span>
                <span className="text-[11px] text-gray-500">AC Active</span>
              </button>
              <button
                type="button"
                onClick={() => toggleSeries('dc')}
                className="flex items-center gap-1.5"
              >
                <span
                  className="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: hiddenSeries.has('dc') ? 'transparent' : '#0F1E3C',
                    borderColor: hiddenSeries.has('dc') ? '#CBD5E1' : '#0F1E3C',
                  }}
                >
                  {!hiddenSeries.has('dc') && <Check size={10} className="text-white" strokeWidth={3} />}
                </span>
                <span className="text-[11px] text-gray-500">DC Input</span>
              </button>
              <button
                type="button"
                onClick={() => toggleSeries('reactive')}
                className="flex items-center gap-1.5"
              >
                <span
                  className="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: hiddenSeries.has('reactive') ? 'transparent' : '#9CA3AF',
                    borderColor: hiddenSeries.has('reactive') ? '#CBD5E1' : '#9CA3AF',
                  }}
                >
                  {!hiddenSeries.has('reactive') && <Check size={10} className="text-white" strokeWidth={3} />}
                </span>
                <span className="text-[11px] text-gray-500">AC Reactive</span>
              </button>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {trendLoading ? (
              <div className="h-[240px] flex items-center justify-center">
                <p className="text-[13px] text-gray-400">Loading chart...</p>
              </div>
            ) : (
              <ChartContainer config={trendChartConfig} className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="acPowerGradient" x1="0" y1="0" x2="0" y2="1">
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
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {!hiddenSeries.has('ac') && (
                      <Area
                        type="monotone"
                        dataKey="ac"
                        stroke="#22C55E"
                        strokeWidth={1.5}
                        fill="url(#acPowerGradient)"
                        dot={false}
                        connectNulls={false}
                        activeDot={{ r: 4, fill: '#22C55E' }}
                      />
                    )}
                    {!hiddenSeries.has('dc') && (
                      <Line
                        type="monotone"
                        dataKey="dc"
                        stroke="#0F1E3C"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls={false}
                        activeDot={{ r: 4, fill: '#0F1E3C' }}
                      />
                    )}
                    {!hiddenSeries.has('reactive') && (
                      <Line
                        type="monotone"
                        dataKey="reactive"
                        stroke="#9CA3AF"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls={false}
                        activeDot={{ r: 4, fill: '#9CA3AF' }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Electrical Details - 1/3 width */}
        <Card className="border-[#E2E8F0] shadow-none rounded-xl">
          <CardHeader className="pb-2 px-6 pt-5">
            <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">
              Electrical Details
            </CardTitle>
            <p className="text-[12px] text-gray-400 mt-0.5">Grid & power quality</p>
          </CardHeader>
          <CardContent className="px-6 pb-5">
            <table className="w-full">
              <tbody>
                <DetailRow label="Voltage A-B" value={detail ? (detail.grid_voltage_ab_v / 1000).toFixed(2) : '—'} unit="kV" />
                <DetailRow label="Voltage B-C" value={detail ? (detail.grid_voltage_bc_v / 1000).toFixed(2) : '—'} unit="kV" />
                <DetailRow label="Voltage C-A" value={detail ? (detail.grid_voltage_ca_v / 1000).toFixed(2) : '—'} unit="kV" />
                <DetailRow label="Frequency" value={detail?.grid_frequency_hz ?? '—'} unit="Hz" />
                <DetailRow label="Power Factor" value={detail?.ac_power_factor.toFixed(2) ?? '—'} />
                <DetailRow label="Reactive Power" value={detail?.ac_reactive_power_kvar ?? '—'} unit="kVAR" />
                <DetailRow label="Internal Temp" value={detail?.internal_temp_c ?? '—'} unit="°C" isLast />
              </tbody>
            </table>
          </CardContent>
        </Card>

      </div>

      {/* Daily Energy */}
      <Card className="border-[#E2E8F0] shadow-none rounded-xl">
        <CardHeader className="pb-2 px-6 pt-5">
          <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">
            Daily Energy
          </CardTitle>
          <p className="text-[12px] text-gray-400 mt-0.5">Last 7 days</p>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {dailyLoading ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-[13px] text-gray-400">Loading chart...</p>
            </div>
          ) : (
            <ChartContainer config={dailyChartConfig} className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyChartData} margin={{ top: 24, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="label"
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
                  <Bar dataKey="energy" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey="energy"
                      position="top"
                      formatter={(value) => {
                        const num = typeof value === 'number' ? value : Number(value)
                        return Number.isFinite(num) ? num.toFixed(1) : ''
                      }}
                      style={{ fontSize: 12, fontWeight: 600, fill: '#475569' }}
                    />
                    {dailyChartData.map((d, i) => (
                      <Cell key={i} fill={d.isToday ? '#22C55E' : '#0F1E3C'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

    </div>
  )
}