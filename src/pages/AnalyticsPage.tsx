import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X, Plus, Loader2, RefreshCw} from 'lucide-react'
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

// ============================================================
// TYPE SCALE — matches PlantOverview / MeterOverview / InverterOverview. Keep in sync.
// ============================================================
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  body:         'text-[14px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
  unit:         'text-[13px] text-black font-medium',
}

// ---- Types ----

interface Metric {
  key: string
  label: string
  unit: string
  device_types: string[]
}

// One entry per device×metric series actually present in the response.
interface LegendEntry {
  key: string // opaque — "{influx_device_id}__{metric_key}", never parse
  device_id: number
  device_name: string
  device_type: string
  metric: string
  label: string
  unit: string
}

// Sparse row: only has keys for series that reported at that timestamp.
type DataRow = { time: string } & Record<string, number | undefined>

interface AnalyticsResponse {
  date: string
  legend: LegendEntry[]
  data: DataRow[]
}

// Each row is fully self-contained: its own metrics, devices, date,
// loading state, and fetched result. Generating one row never touches
// any other row's data or fires any other row's request.
interface ChartRow {
  id: string
  metricKeys: string[]
  deviceIds: number[]
  date: string
  loading: boolean
  hasGenerated: boolean
  data: AnalyticsResponse | null
  error: string | null
}

// ---- Constants ----

// Categorical palette for distinguishing an arbitrary number of series on
// one chart. First slot uses the brand orange; rest stay diverse/high-contrast.
const PALETTE = [
  '#e17100', '#497d00', '#3B82F6', '#EF4444', '#8B5CF6',
  '#EC4899', '#14B8A6', '#84CC16', '#F97316', '#1A1A1A',
]

const DEVICE_TYPE_LABEL: Record<string, string> = {
  INVERTER: 'Inverter',
  METER: 'Meter',
  WEATHER_STATION: 'Weather Station',
}

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
    metricKeys: [],
    deviceIds: [],
    date: todayString(),
    loading: false,
    hasGenerated: false,
    data: null,
    error: null,
  }
}

// ============================================================
// Shared building blocks — identical to Plant/Meter/Inverter Overview
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

// ---- Generic multi-select (metrics + devices both use this shape) ----

interface MultiSelectOption {
  id: string | number
  label: string
  sublabel?: string
}

function MultiSelect({
  placeholder, options, selected, onChange, minWidth = 200,
}: {
  placeholder: string
  options: MultiSelectOption[]
  selected: (string | number)[]
  onChange: (ids: (string | number)[]) => void
  minWidth?: number
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

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(id: string | number) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id))
    } else {
      onChange([...selected, id])
    }
  }

  return (
    <div className="relative" ref={ref} style={{ minWidth }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-10 px-3 text-[13px] border border-black/25 rounded-lg bg-white text-left w-full flex items-center justify-between gap-2 font-medium"
      >
        <span className={selected.length === 0 ? 'text-black/40' : 'text-black'}>
          {selected.length === 0
            ? placeholder
            : `${selected.length} selected`}
        </span>
        <ChevronDown size={14} className="text-black/50 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-[100] mt-1 w-72 bg-white border border-black/15 rounded-lg shadow-lg">
          <div className="p-2 border-b border-black/10">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full h-8 px-2 text-[13px] border border-black/15 rounded-md focus:outline-none focus:border-black"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-[13px] text-black/50">No results</p>
            )}
            {filtered.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-black/[0.03] cursor-pointer text-[13px]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={() => toggle(o.id)}
                  className="rounded border-black/25"
                />
                <span className="text-black font-medium truncate">{o.label}</span>
                {o.sublabel && (
                  <span className="text-black/40 text-[11px] ml-auto shrink-0">{o.sublabel}</span>
                )}
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
  const selectedMetrics = metrics.filter((m) => row.metricKeys.includes(m.key))
  const canGenerate = row.metricKeys.length > 0 && row.deviceIds.length > 0 && !row.loading

  // No metrics picked yet → show every device. Once metrics are picked,
  // only show devices whose type applies to at least one selected metric —
  // this is how WEATHER_STATION devices surface automatically once an
  // irradiation/ambient_temp/module_temp metric is selected.
  const eligibleDevices = useMemo(() => {
    if (selectedMetrics.length === 0) return devices
    const validTypes = new Set(selectedMetrics.flatMap((m) => m.device_types))
    return devices.filter((d) => validTypes.has(d.device_type))
  }, [devices, selectedMetrics])

  // Distinct units among the legend actually returned — drives whether we
  // split into two Y-axes (left/right), same convention as Plant Power Trend.
  const units = useMemo(() => {
    if (!row.data) return []
    return Array.from(new Set(row.data.legend.map((l) => l.unit))).filter(Boolean)
  }, [row.data])

  const dualAxis = units.length >= 2
  // If there are >2 units we still only split left/right; anything past the
  // second unit shares the right axis rather than adding more axes.
  const leftUnit = units[0]

  const lines = useMemo(() => {
    if (!row.data) return []
    return row.data.legend.map((entry, i) => ({
      dataKey: entry.key,
      name: `${entry.device_name} · ${entry.label}`,
      unit: entry.unit,
      color: PALETTE[i % PALETTE.length],
      axisId: dualAxis && entry.unit !== leftUnit ? 'right' : 'left',
    }))
  }, [row.data, dualAxis, leftUnit])

  // data rows are already sparse/merged from the backend — just format the
  // time for display, never coerce missing keys to 0.
  const chartData = useMemo(() => {
    if (!row.data) return []
    return row.data.data.map((point) => ({
      ...point,
      time: formatTime(point.time),
    }))
  }, [row.data])

  const chartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {}
    lines.forEach((l) => {
      cfg[l.dataKey] = { label: l.name, color: l.color }
    })
    return cfg
  }, [lines])

  const headerTitle = selectedMetrics.length === 0
    ? 'New Chart'
    : selectedMetrics.map((m) => m.label).join(' + ')

  return (
    <div className="rounded-xl border border-black/15 bg-white overflow-visible">
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-black truncate">{headerTitle}</p>
            {row.hasGenerated && row.data && (
              <p className={`${T.meta} mt-0.5`}>
                {row.date === todayString() ? 'Today' : row.date}
              </p>
            )}
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-black/40 hover:text-red-600 transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <MultiSelect
            placeholder={metricsLoading ? 'Loading metrics…' : 'Select metrics'}
            options={metrics.map((m) => ({
              id: m.key,
              label: m.label,
              sublabel: m.unit,
            }))}
            selected={row.metricKeys}
            onChange={(ids) => {
              const keys = ids as string[]
              const newMetrics = metrics.filter((m) => keys.includes(m.key))
              const validTypes = new Set(newMetrics.flatMap((m) => m.device_types))
              const validIds = row.deviceIds.filter((id) => {
                const d = devices.find((dev) => dev.id === id)
                return d && validTypes.has(d.device_type)
              })
              onChange({
                metricKeys: keys,
                deviceIds: validIds,
                data: null,
                hasGenerated: false,
                error: null,
              })
            }}
            minWidth={200}
          />

          <MultiSelect
            placeholder="Select devices"
            options={eligibleDevices.map((d) => ({
              id: d.id,
              label: d.name,
              sublabel: DEVICE_TYPE_LABEL[d.device_type] ?? d.device_type,
            }))}
            selected={row.deviceIds}
            onChange={(ids) => onChange({ deviceIds: ids as number[] })}
            minWidth={200}
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
            className="h-10 px-4 text-[13px] font-semibold rounded-lg bg-[#e17100] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#b85c00] transition-colors flex items-center gap-1.5"
          >
            {row.loading && <Loader2 size={14} className="animate-spin" />}
            {row.loading ? 'Loading…' : 'Generate'}
          </button>
        </div>

        {lines.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap mt-4 pt-4 border-t border-black/10">
            {lines.map((l) => (
              <div key={l.dataKey} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-[12px] text-black font-medium">{l.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-2 pb-5">
        {!row.hasGenerated ? (
          <div className="h-[220px] flex items-center justify-center">
            <p className={T.meta}>Pick metrics and devices, then click Generate</p>
          </div>
        ) : row.error ? (
          <div className="h-[220px] flex items-center justify-center">
            <p className="text-[13px] text-red-600 font-medium">{row.error}</p>
          </div>
        ) : lines.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center">
            <p className={T.meta}>No data available for this combination.</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} style={{ height: 240, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: dualAxis ? 20 : 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 12, fill: '#171717' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: '#171717' }}
                  tickLine={false}
                  axisLine={false}
                  width={46}
                  label={leftUnit ? { value: leftUnit, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#171717' } : undefined}
                />
                {dualAxis && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12, fill: '#171717' }}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                  />
                )}
                <ChartTooltip content={<ChartTooltipContent />} />
                {lines.map((line) => (
                  <Line
                    key={line.dataKey}
                    yAxisId={dualAxis ? line.axisId : 'left'}
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
      </div>
    </div>
  )
}

// ---- Main Page ----

export default function AnalyticsPage() {
  const { site, devices } = useSite()
  const activeDevices = devices.filter(
    (d) => d.is_active && (d.device_type === 'INVERTER' || d.device_type === 'METER' || d.device_type === 'WEATHER_STATION')
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
    if (!site?.id || row.metricKeys.length === 0 || row.deviceIds.length === 0) return
    updateRow(row.id, { loading: true, error: null })
    try {
      const res = await api.get<AnalyticsResponse>(
        `/influx/analytics/?site=${site.id}&metrics=${row.metricKeys.join(',')}&devices=${row.deviceIds.join(',')}&date=${row.date}`
      )
      updateRow(row.id, { data: res.data, loading: false, hasGenerated: true, error: null })
    } catch (err) {
      console.error('Analytics fetch error:', err)
      updateRow(row.id, { loading: false, hasGenerated: true, error: 'Failed to load this chart.' })
    }
  }

  function refreshAllGenerated() {
    chartRows.forEach((row) => {
      if (row.hasGenerated && row.metricKeys.length > 0 && row.deviceIds.length > 0) {
        generateRow(row)
      }
    })
  }

  return (
    <div className="w-full max-w-[1152px] mx-auto px-0 sm:px-6 md:px-6 lg:px-6 pb-10">

      {/* ============ HEADER ============ */}
      <header className="pb-5 flex flex-col md:flex-row md:items-start md:justify-between md:flex-wrap gap-3 md:gap-6">
        <div className="order-1 md:order-2 flex items-center justify-between md:flex-col md:items-end gap-3 md:gap-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap`}>
            <span className="hidden md:inline">Build charts on demand</span>
          </p>
          <button
            type="button"
            onClick={refreshAllGenerated}
            className="h-10 px-4 flex items-center gap-2 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Refresh All
          </button>
        </div>

        <div className="order-2 md:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 self-stretch rounded-full bg-[#e17100] shrink-0" />
            <div className="min-w-0 py-0.5">
              <p className={T.eyebrow}>Analytics</p>
              <h1 className={`${T.siteH1} mt-1 leading-tight break-words`}>{site?.name ?? 'Custom Charts'}</h1>
              <p className={`${T.body} mt-1`}>
                Build a chart for any metric and device combination — each one is independent
              </p>
            </div>
          </div>
        </div>
      </header>

      <Divider />

      <div className="pt-8 space-y-6">
        {chartRows.map((row, i) => (
          <div key={row.id}>
            <SectionHeader
              title={`Chart ${i + 1}`}
              accent={i % 2 === 0 ? 'orange' : 'olive'}
            />
            <ChartRowCard
              row={row}
              metrics={metrics}
              metricsLoading={metricsLoading}
              devices={activeDevices}
              onChange={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeRow(row.id)}
              onGenerate={() => generateRow(row)}
              canRemove={chartRows.length > 1}
            />
          </div>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 text-[13px] font-semibold text-black hover:text-[#e17100] transition-colors"
        >
          <Plus size={16} strokeWidth={2} />
          Add Chart
        </button>
      </div>

    </div>
  )
}