import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Zap, TrendingUp, Gauge, Activity, Clock, Check, Maximize2, Minimize2 } from 'lucide-react'
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

function dedupeDailyEnergy(points: DailyEnergyPoint[]) {
  const map = new Map<string, number>()
  points.forEach((p) => map.set(p.date, p.energy_kwh))
  return Array.from(map.entries()).map(([date, energy_kwh]) => ({ date, energy_kwh }))
}

// ---- KPI Card — matches PlantOverviewPage exactly ----

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

// ---- Electrical detail row ----

function DetailRow({ label, value, unit, isLast = false }: { label: string; value: string | number; unit?: string; isLast?: boolean }) {
  return (
    <tr className={isLast ? '' : 'border-b border-[#F1F1F1]'}>
      <td className="py-2.5 text-[12px] text-gray-500">{label}</td>
      <td className="py-2.5 text-right text-[13px] font-medium text-black">
        {value}
        {unit && <span className="text-[10px] text-gray-400 ml-1">{unit}</span>}
      </td>
    </tr>
  )
}

// Power trend chart 
function PowerTrendCard({
  trendChartData, trendChartConfig, trendLoading, selectedDate, setSelectedDate,
  hiddenSeries, toggleSeries, expanded, onToggle, height,
}: {
  trendChartData: { time: number; dc: number | null; ac: number | null; reactive: number | null }[]
  trendChartConfig: Record<string, { label: string; color: string }>
  trendLoading: boolean
  selectedDate: string
  setSelectedDate: (d: string) => void
  hiddenSeries: Set<string>
  toggleSeries: (key: string) => void
  expanded: boolean
  onToggle: () => void
  height: string
}) {
  return (
    <>
      <CardHeader className="pb-2 px-6 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-[18px] font-semibold text-black">
              Power Trend
            </CardTitle>
            <p className="text-[12px] text-gray-400 mt-0.5">
              DC input · AC active · AC reactive · {selectedDate === todayString() ? 'Today' : selectedDate}
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
        <div className="flex items-center gap-4 mt-3">
          <button type="button" onClick={() => toggleSeries('ac')} className="flex items-center gap-1.5">
            <span
              className="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors"
              style={{
                backgroundColor: hiddenSeries.has('ac') ? 'transparent' : '#e17100',
                borderColor: hiddenSeries.has('ac') ? '#D4D4D4' : '#e17100',
              }}
            >
              {!hiddenSeries.has('ac') && <Check size={10} className="text-white" strokeWidth={3} />}
            </span>
            <span className="text-[11px] text-gray-500">AC Active</span>
          </button>
          <button type="button" onClick={() => toggleSeries('dc')} className="flex items-center gap-1.5">
            <span
              className="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors"
              style={{
                backgroundColor: hiddenSeries.has('dc') ? 'transparent' : '#497d00',
                borderColor: hiddenSeries.has('dc') ? '#D4D4D4' : '#497d00',
              }}
            >
              {!hiddenSeries.has('dc') && <Check size={10} className="text-white" strokeWidth={3} />}
            </span>
            <span className="text-[11px] text-gray-500">DC Input</span>
          </button>
          <button type="button" onClick={() => toggleSeries('reactive')} className="flex items-center gap-1.5">
            <span
              className="w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center transition-colors"
              style={{
                backgroundColor: hiddenSeries.has('reactive') ? 'transparent' : '#8A8A8A',
                borderColor: hiddenSeries.has('reactive') ? '#D4D4D4' : '#8A8A8A',
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
          <div className={`${height} flex items-center justify-center`}>
            <p className="text-[13px] text-gray-400">Loading chart...</p>
          </div>
        ) : (
          <ChartContainer config={trendChartConfig} className={`${height} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="acPowerGradient" x1="0" y1="0" x2="0" y2="1">
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
                {!hiddenSeries.has('ac') && (
                  <Area
                    type="monotone"
                    dataKey="ac"
                    stroke="#e17100"
                    strokeWidth={1.5}
                    fill="url(#acPowerGradient)"
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 4, fill: '#e17100' }}
                  />
                )}
                {!hiddenSeries.has('dc') && (
                  <Line
                    type="monotone"
                    dataKey="dc"
                    stroke="#497d00"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 4, fill: '#497d00' }}
                  />
                )}
                {!hiddenSeries.has('reactive') && (
                  <Line
                    type="monotone"
                    dataKey="reactive"
                    stroke="#8A8A8A"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 4, fill: '#8A8A8A' }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </>
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
  const [chartExpanded, setChartExpanded] = useState(false)

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

  // Daily energy
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
        time: minutesSinceMidnight(p.time),
        dc: p.dc_input_power_kw > 0 ? p.dc_input_power_kw : null,
        ac: p.ac_active_power_kw > 0 ? p.ac_active_power_kw : null,
        reactive: p.ac_reactive_power_kvar > 0 ? p.ac_reactive_power_kvar : null,
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
    ac: { label: 'AC Active Power (kW)', color: '#e17100' },
    dc: { label: 'DC Input Power (kW)', color: '#497d00' },
    reactive: { label: 'AC Reactive Power (kVAR)', color: '#8A8A8A' },
  }

  const dailyChartConfig = {
    energy: { label: 'Energy (kWh)', color: '#e17100' },
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[20px] font-semibold text-black tracking-tight">
            {detail?.name}
          </h1>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
            detail?.status === 'online' ? 'bg-green-500/10 text-green-700' : 'bg-red-50 text-red-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${detail?.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`} />
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
          accent
          footer="Lifetime"
        />
        <KpiCard
          title="Efficiency"
          value={detail ? detail.inverter_efficiency_pct.toFixed(1) : '—'}
          unit="%"
          icon={Activity}
          accent
          footer="Current"
        />
      </div>

      {/* Power Trend + Electrical Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* Power Trend - 2/3 width */}
        <Card className="border-[#E5E5E5] shadow-none rounded-xl md:col-span-2">
          <PowerTrendCard
            trendChartData={trendChartData}
            trendChartConfig={trendChartConfig}
            trendLoading={trendLoading}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            hiddenSeries={hiddenSeries}
            toggleSeries={toggleSeries}
            expanded={chartExpanded}
            onToggle={() => setChartExpanded(o => !o)}
            height="h-[240px]"
          />
        </Card>

        {/* Electrical Details - 1/3 width */}
        <Card className="border-[#E5E5E5] shadow-none rounded-xl">
          <CardHeader className="pb-2 px-6 pt-5">
            <CardTitle className="text-[18px] font-semibold text-black">
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

      {/* Modal overlay */}
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
              trendChartData={trendChartData}
              trendChartConfig={trendChartConfig}
              trendLoading={trendLoading}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              hiddenSeries={hiddenSeries}
              toggleSeries={toggleSeries}
              expanded={chartExpanded}
              onToggle={() => setChartExpanded(false)}
              height="h-[480px]"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Daily Energy */}
      <Card className="border-[#E5E5E5] shadow-none rounded-xl">
        <CardHeader className="pb-2 px-6 pt-5">
          <CardTitle className="text-[18px] font-semibold text-black">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
                  <XAxis
                    dataKey="label"
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
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="energy" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList
                      dataKey="energy"
                      position="top"
                      formatter={(value: unknown) => {
                        const num = typeof value === 'number' ? value : Number(value)
                        return Number.isFinite(num) ? `${num.toFixed(1)}\u00A0kWh` : ''
                      }}
                      style={{ fontSize: 11, fontWeight: 600, fill: '#02060c' }}
                    />
                    {dailyChartData.map((d, i) => (
                      <Cell key={i} fill={d.isToday ? '#e17100' : '#1A1A1A'} />
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