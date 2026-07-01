import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X, Plus, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { DatePicker } from '@/components/DatePicker'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'
import type { SiteDevice } from '@/context/SiteContext'

// ---- Types ----

interface Metric {
  key: string
  label: string
  unit: string
  device_types: string[]
}

interface SeriesPoint {
  time: string
  value: number
}

interface AnalyticsSeries {
  device_id: number
  device_name: string
  device_type: string
  data: SeriesPoint[]
}

interface AnalyticsResponse {
  metric: string
  label: string
  unit: string
  date: string
  series: AnalyticsSeries[]
}

// Each row is now fully self-contained: its own metric, devices, date,
// loading state, and fetched result. Generating one row never touches
// any other row's data or fires any other row's request.
interface ChartRow {
  id: string
  metricKey: string
  deviceIds: number[]
  date: string
  loading: boolean
  hasGenerated: boolean
  data: AnalyticsResponse | null
  error: string | null
}

// ---- Constants ----

const PALETTE = [
  '#22C55E', '#0F1E3C', '#F59E0B', '#3B82F6', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#84CC16', '#F97316',
]

// ---- Helpers ----

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function newChartRow(): ChartRow {
  return {
    id: crypto.randomUUID(),
    metricKey: '',
    deviceIds: [],
    date: todayString(),
    loading: false,
    hasGenerated: false,
    data: null,
    error: null,
  }
}

// ---- Device multi-select (searchable) ----

function DeviceMultiSelect({
  devices, selected, onChange,
}: {
  devices: SiteDevice[]
  selected: number[]
  onChange: (ids: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = devices.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: number) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-9 px-3 text-[12px] border border-[#E2E8F0] rounded-lg bg-white text-left min-w-[180px] flex items-center justify-between gap-2"
      >
        <span className={selected.length === 0 ? 'text-gray-400' : 'text-[#0F1E3C]'}>
          {selected.length === 0
            ? 'Select devices'
            : `${selected.length} device${selected.length > 1 ? 's' : ''} selected`}
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-[100] mt-1 w-64 bg-white border border-[#E2E8F0] rounded-lg shadow-lg">
          <div className="p-2 border-b border-[#F1F5F9]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search devices..."
              className="w-full h-8 px-2 text-[12px] border border-[#E2E8F0] rounded-md focus:outline-none focus:border-[#0F1E3C]"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-gray-400">No devices found</p>
            )}
            {filtered.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#F8FAFC] cursor-pointer text-[12px]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(d.id)}
                  onChange={() => toggle(d.id)}
                  className="rounded border-[#CBD5E1]"
                />
                <span className="text-[#0F1E3C]">{d.name}</span>
                <span className="text-gray-400 text-[10px] ml-auto">
                  {d.device_type === 'INVERTER' ? 'Inverter' : 'Meter'}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- One self-contained chart row ----

function ChartRowCard({
  row, metrics, metricsLoading, devices, onChange, onRemove, onGenerate, canRemove,
}: {
  row: ChartRow
  metrics: Metric[]
  metricsLoading: boolean
  devices: SiteDevice[]
  onChange: (patch: Partial<ChartRow>) => void
  onRemove: () => void
  onGenerate: () => void
  canRemove: boolean
}) {
  const metric = metrics.find((m) => m.key === row.metricKey)
  const canGenerate = !!row.metricKey && row.deviceIds.length > 0 && !row.loading

  // No metric picked yet → show every device. Once one's picked, only
  // show device types the backend says this metric actually applies to.
  const eligibleDevices = useMemo(() => {
    if (!metric) return devices
    return devices.filter((d) => metric.device_types.includes(d.device_type))
  }, [devices, metric])

  const lines = useMemo(() => {
    if (!row.data) return []
    return row.data.series.map((s, i) => ({
      dataKey: `d${s.device_id}`,
      name: s.device_name,
      color: PALETTE[i % PALETTE.length],
    }))
  }, [row.data])

  const chartData = useMemo(() => {
    if (!row.data) return []
    const timeMap = new Map<string, Record<string, string | number>>()
    row.data.series.forEach((s) => {
      s.data.forEach((point) => {
        const t = formatTime(point.time)
        if (!timeMap.has(t)) timeMap.set(t, { time: t })
        timeMap.get(t)![`d${s.device_id}`] = point.value
      })
    })
    return Array.from(timeMap.values())
  }, [row.data])

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {}
    lines.forEach((l) => {
      cfg[l.dataKey] = { label: l.name, color: l.color }
    })
    return cfg
  }, [lines])

  return (
    <Card className="border-[#E2E8F0] shadow-none rounded-xl overflow-visible">
      <CardHeader className="pb-2 px-6 pt-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">
              {metric ? `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}` : 'New Chart'}
            </CardTitle>
            {row.hasGenerated && row.data && (
              <p className="text-[12px] text-gray-400 mt-0.5">
                {row.date === todayString() ? 'Today' : row.date}
              </p>
            )}
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          <select
            value={row.metricKey}
            onChange={(e) => {
              const newMetric = metrics.find((m) => m.key === e.target.value)
              const validIds = newMetric
                ? row.deviceIds.filter((id) => {
                    const d = devices.find((dev) => dev.id === id)
                    return d && newMetric.device_types.includes(d.device_type)
                  })
                : row.deviceIds
              onChange({
                metricKey: e.target.value,
                deviceIds: validIds,
                data: null,
                hasGenerated: false,
                error: null,
              })
            }}
            className="h-9 px-3 text-[12px] border border-[#E2E8F0] rounded-lg bg-white text-[#0F1E3C] min-w-[190px] focus:outline-none focus:border-[#0F1E3C]"
          >
            <option value="">
              {metricsLoading ? 'Loading metrics...' : 'Select metric...'}
            </option>
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}{m.unit ? ` (${m.unit})` : ''}
              </option>
            ))}
          </select>

          <DeviceMultiSelect
            devices={eligibleDevices}
            selected={row.deviceIds}
            onChange={(ids) => onChange({ deviceIds: ids })}
          />

          <DatePicker
            value={row.date}
            onChange={(d) => onChange({ date: d })}
            maxDate={new Date()}
          />

          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="h-9 px-4 text-[12px] font-medium rounded-lg bg-[#0F1E3C] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#162847] transition-colors flex items-center gap-1.5"
          >
            {row.loading && <Loader2 size={13} className="animate-spin" />}
            {row.loading ? 'Loading...' : 'Generate'}
          </button>
        </div>

        {lines.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap mt-3">
            {lines.map((l) => (
              <div key={l.dataKey} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="text-[11px] text-gray-500">{l.name}</span>
              </div>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="px-2 pb-4">
        {!row.hasGenerated ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-[13px] text-gray-400">Pick a metric and devices, then click Generate</p>
          </div>
        ) : row.error ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-[13px] text-red-400">{row.error}</p>
          </div>
        ) : lines.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-[13px] text-gray-400">No data available for this combination.</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                  width={42}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {lines.map((line) => (
                  <Line
                    key={line.dataKey}
                    type="monotone"
                    dataKey={line.dataKey}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls={false}
                    activeDot={{ r: 4, fill: line.color }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ---- Main Page ----

export default function AnalyticsPage() {
  const { site, devices } = useSite()
  const activeDevices = devices.filter(
    (d) => d.is_active && (d.device_type === 'INVERTER' || d.device_type === 'METER')
  )

  const [metrics, setMetrics] = useState<Metric[]>([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [chartRows, setChartRows] = useState<ChartRow[]>([newChartRow()])

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await api.get<Metric[]>('/influx/analytics/metrics/')
        setMetrics(res.data)
      } catch (err) {
        console.error('Analytics metrics error:', err)
      } finally {
        setMetricsLoading(false)
      }
    }
    fetchMetrics()
  }, [])

  function updateRow(id: string, patch: Partial<ChartRow>) {
    setChartRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    setChartRows((prev) => prev.filter((r) => r.id !== id))
  }

  function addRow() {
    setChartRows((prev) => [...prev, newChartRow()])
  }

  // Only this row's request fires — every other row's data and chart
  // stay exactly as they are.
  async function generateRow(row: ChartRow) {
    if (!site?.id || !row.metricKey || row.deviceIds.length === 0) return
    updateRow(row.id, { loading: true, error: null })
    try {
      const res = await api.get<AnalyticsResponse>(
        `/influx/analytics/?site=${site.id}&metric=${row.metricKey}&devices=${row.deviceIds.join(',')}&date=${row.date}`
      )
      updateRow(row.id, { data: res.data, loading: false, hasGenerated: true, error: null })
    } catch (err) {
      console.error('Analytics fetch error:', err)
      updateRow(row.id, { loading: false, hasGenerated: true, error: 'Failed to load this chart.' })
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight">
          Analytics
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5">
          Build a chart for any metric and device combination — each one is independent
        </p>
      </div>

      {chartRows.map((row) => (
        <ChartRowCard
          key={row.id}
          row={row}
          metrics={metrics}
          metricsLoading={metricsLoading}
          devices={activeDevices}
          onChange={(patch) => updateRow(row.id, patch)}
          onRemove={() => removeRow(row.id)}
          onGenerate={() => generateRow(row)}
          canRemove={chartRows.length > 1}
        />
      ))}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-[#0F1E3C] transition-colors"
      >
        <Plus size={14} />
        Add Chart
      </button>

    </div>
  )
}