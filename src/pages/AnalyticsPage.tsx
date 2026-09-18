import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X, Plus, Loader2, RefreshCw, Download} from 'lucide-react'
import {
  Area, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ComposedChart, Tooltip, ReferenceArea,
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

// Selected devices, grouped by which site they belong to — plant devices
// under the plant's own site id, each substation's meters under that
// substation's own id. Analytics is strictly single-site (`site` and
// `devices` must belong to the same site on the backend), so this grouping
// is what drives how many requests generateRow fires.
interface DeviceSelection {
  siteId: number
  deviceIds: number[]
}

// Each row is fully self-contained: its own metrics, devices, date,
// loading state, and fetched result. Generating one row never touches
// any other row's data or fires any other row's request.
interface ChartRow {
  id: string
  metricKeys: string[]
  selections: DeviceSelection[]
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
  TRANSFORMER: 'Transformer',
}

// Extends SiteDevice with the id of the site it actually belongs to (plant
// or substation) plus an optional substation tag for internal bookkeeping —
// siteId drives request scoping; substationName is deliberately NOT shown
// in the picker (real meter names — Main/Check/Standby — must stay visible).
type AnalyticsDevice = SiteDevice & { siteId: number; substationName?: string }

// ---- Helpers ----

function minutesFromIstDayStart(iso: string, day: string) {
  const dayStartMs = Date.parse(`${day}T00:00:00+05:30`)
  return (Date.parse(iso) - dayStartMs) / 60000
}

function formatMinutesTick(minutes: number) {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const DAY_TICKS = [0, 180, 360, 540, 720, 900, 1080, 1260, 1440]

function todayString() {
  return new Date().toISOString().split('T')[0]
}


function newChartRow(): ChartRow {
  return {
    id: crypto.randomUUID(),
    metricKeys: [],
    selections: [],
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

function AnalyticsTooltip({ active, payload, lines }: any) {
  if (!active || !payload?.length) return null
  const t = payload[0]?.payload?.time
  return (
    <div className="rounded-lg border border-black bg-white px-3 py-2 min-w-[180px]">
      <p className="text-[12px] font-semibold text-black mb-1.5">
        {typeof t === 'number' ? formatMinutesTick(t) : ''}
      </p>
      {payload.map((e: any) => {
        const line = lines.find((l: any) => l.dataKey === e.dataKey)
        return (
          <div key={e.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: e.color }} />
            <span className="text-[12px] text-black/50 truncate">{e.name}</span>
            <span className="text-[12px] font-semibold tabular-nums text-black ml-auto">
              {e.value == null ? '—' : Number(e.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11px] text-black/50 shrink-0">{line?.unit ?? ''}</span>
          </div>
        )
      })}
    </div>
  )
}

// --- CSV Downloader --
function downloadAnalyticsCsv(row: ChartRow) {
  if (!row.data || row.data.legend.length === 0) return

  const legend = row.data.legend
  const headers = ['Timestamp (IST)', ...legend.map((l) => `${l.device_name} - ${l.label} (${l.unit})`)]

  const rows = row.data.data.map((point) => {
    const ist = new Date(point.time).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).replace(',', '')
    const values = legend.map((l) => {
      const v = point[l.key]
      return v == null ? '' : String(v)
    })
    return [ist, ...values]
  })

  const csvLines = [headers, ...rows].map((r) =>
    r.map((cell) => (cell.includes(',') ? `"${cell}"` : cell)).join(',')
  )
  const csvContent = '\uFEFF' + csvLines.join('\r\n') // UTF-8 BOM, matches Reports export

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `analytics_${row.date}_${row.id.slice(0, 8)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}


// ---- One self-contained chart row ----

function ChartRowCard({
  row, metrics, metricsLoading, devices, onChange, onRemove, onGenerate, canRemove,
}: {
  row: ChartRow
  metrics: Metric[]
  metricsLoading: boolean
  devices: AnalyticsDevice[]
  onChange: (patch: Partial<ChartRow>) => void
  onRemove: () => void
  onGenerate: () => void
  canRemove: boolean
}) {
  const selectedMetrics = metrics.filter((m) => row.metricKeys.includes(m.key))
  const canGenerate = row.metricKeys.length > 0 && row.selections.some((s) => s.deviceIds.length > 0) && !row.loading

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
    const pts = row.data.data
      .map((point) => ({
        ...point,
        time: minutesFromIstDayStart(point.time, row.date),
      }))
      .filter((p) => p.time >= 0 && p.time <= 1440)
      .sort((a, b) => a.time - b.time)

    if (pts.length < 2) return pts

    // Infer typical sample spacing from the data itself, then break the line
    // wherever a gap exceeds ~2.5x that spacing (offline device, dropped poll).
    const gaps = pts.slice(1).map((p, i) => p.time - pts[i].time).filter((g) => g > 0)
    const median = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 5
    const gapThreshold = median * 2.5

    const out: typeof pts = []
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i - 1]
      if (prev && pts[i].time - prev.time > gapThreshold) {
        out.push({ time: prev.time + median, ...Object.fromEntries(row.data!.legend.map((l) => [l.key, undefined])) })
      }
      out.push(pts[i])
    }
    return out
  }, [row.data, row.date])


  const headerTitle = selectedMetrics.length === 0
    ? 'New Chart'
    : selectedMetrics.map((m) => m.label).join(' + ')

  const [refLeft, setRefLeft] = useState<number | null>(null)
  const [refRight, setRefRight] = useState<number | null>(null)
  const [zoomLeft, setZoomLeft] = useState<number | null>(null)
  const [zoomRight, setZoomRight] = useState<number | null>(null)

  // Reset zoom whenever new data comes in (new Generate click, new date, etc.)
  useEffect(() => {
    setZoomLeft(null)
    setZoomRight(null)
    setRefLeft(null)
    setRefRight(null)
  }, [row.data])

  function handleMouseDown(e: any) {
    if (e?.activeLabel == null) return
    setRefLeft(e.activeLabel)
    setRefRight(e.activeLabel)
  }

  function handleMouseMove(e: any) {
    if (refLeft === null || e?.activeLabel == null) return
    setRefRight(e.activeLabel)
  }

  function handleMouseUp() {
    if (refLeft === null || refRight === null) {
      setRefLeft(null)
      setRefRight(null)
      return
    }
    let [lo, hi] = [refLeft, refRight].sort((a, b) => a - b)
    // Ignore accidental clicks/tiny drags — require at least 15 minutes of selection
    if (hi - lo < 15) {
      setRefLeft(null)
      setRefRight(null)
      return
    }
    setZoomLeft(lo)
    setZoomRight(hi)
    setRefLeft(null)
    setRefRight(null)
  }

  function zoomOut() {
    setZoomLeft(null)
    setZoomRight(null)
  }

  const isZoomed = zoomLeft !== null && zoomRight !== null

  const xDomain: [number, number] = isZoomed ? [zoomLeft!, zoomRight!] : [0, 1440]

  const xTicks = useMemo(() => {
    if (!isZoomed) return DAY_TICKS
    const span = zoomRight! - zoomLeft!
    const step = span > 360 ? 60 : span > 120 ? 30 : span > 40 ? 10 : 5
    const ticks: number[] = []
    const start = Math.ceil(zoomLeft! / step) * step
    for (let t = start; t <= zoomRight!; t += step) ticks.push(t)
    return ticks
  }, [isZoomed, zoomLeft, zoomRight])

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
        <div className="flex items-center gap-3 shrink-0">
          {row.hasGenerated && row.data && row.data.legend.length > 0 && (
            <button
              type="button"
              onClick={() => downloadAnalyticsCsv(row)}
              className="h-9 px-3 flex items-center gap-1.5 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold shrink-0"
            >
              <Download size={14} strokeWidth={2} />
              Download
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-black/40 hover:text-red-600 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
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
              const validSelections = row.selections
                .map((s) => ({
                  siteId: s.siteId,
                  deviceIds: s.deviceIds.filter((id) => {
                    const d = devices.find((dev) => dev.id === id)
                    return d && validTypes.has(d.device_type)
                  }),
                }))
                .filter((s) => s.deviceIds.length > 0)
              onChange({
                metricKeys: keys,
                selections: validSelections,
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
            selected={row.selections.flatMap((s) => s.deviceIds)}
            onChange={(ids) => {
              const picked = eligibleDevices.filter((d) => ids.includes(d.id))
              const bySite = new Map<number, number[]>()
              for (const d of picked) {
                bySite.set(d.siteId, [...(bySite.get(d.siteId) ?? []), d.id])
              }
              onChange({
                selections: Array.from(bySite, ([siteId, deviceIds]) => ({ siteId, deviceIds })),
              })
            }}
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
          <div className="h-[280px] sm:h-[380px] w-full relative">
          {isZoomed && (
            <button
              type="button"
              onClick={zoomOut}
              className="absolute -top-8 right-0 z-10 h-7 px-2.5 flex items-center gap-1 text-[12px] font-semibold text-black border border-black/25 rounded-md hover:bg-black hover:text-white transition-colors"
            >
              Zoom Out
            </button>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              style={{ cursor: 'crosshair', userSelect: 'none' }}
            >
              <defs>
                <linearGradient id={`analyticsGradient-${row.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lines[0]?.color ?? '#e17100'} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={lines[0]?.color ?? '#e17100'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F1F1" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                scale="linear"
                domain={xDomain}
                allowDataOverflow
                ticks={xTicks}
                tickFormatter={formatMinutesTick}
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                domain={([dataMin, dataMax]: readonly [number, number]) => {
                  const lo = Math.min(0, dataMin)
                  const hi = Math.max(0, dataMax)
                  const span = hi - lo || 1
                  const pad = span * 0.08
                  return [Math.floor(lo - pad), Math.ceil(hi + pad)]
                }}
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              {dualAxis && (
               <YAxis
                yAxisId="right"
                orientation="right"
                domain={([dataMin, dataMax]: readonly [number, number]) => {
                  const lo = Math.min(0, dataMin)
                  const hi = Math.max(0, dataMax)
                  const span = hi - lo || 1
                  const pad = span * 0.08
                  return [Math.floor(lo - pad), Math.ceil(hi + pad)]
                }}
                tick={{ fontSize: 12, fill: '#171717' }}
                tickLine={false}
                axisLine={false}
                width={46}
              />
            )}
              <Tooltip cursor={{ stroke: '#00000022', strokeWidth: 1 }} content={<AnalyticsTooltip lines={lines} />} />
              {lines.map((line, i) =>
                i === 0 ? (
                  <Area
                    key={line.dataKey}
                    yAxisId={dualAxis ? line.axisId : 'left'}
                    type="monotone"
                    dataKey={line.dataKey}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={1.75}
                    fill={`url(#analyticsGradient-${row.id})`}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    activeDot={{ r: 4, fill: line.color }}
                  />
                ) : (
                  <Line
                    key={line.dataKey}
                    yAxisId={dualAxis ? line.axisId : 'left'}
                    type="monotone"
                    dataKey={line.dataKey}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={1.25}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                    activeDot={{ r: 3.5, fill: line.color }}
                  />
                )
              )}
              {refLeft !== null && refRight !== null && refLeft !== refRight && (
                <ReferenceArea
                  yAxisId="left"
                  x1={refLeft}
                  x2={refRight}
                  strokeOpacity={0.3}
                  fill="#e17100"
                  fillOpacity={0.12}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        )}
      </div>
    </div>
  )
}

// ---- Main Page ----

export default function AnalyticsPage() {
  const { site, devices, allSites } = useSite()

  const [metrics, setMetrics] = useState<Metric[]>([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [chartRows, setChartRows] = useState<ChartRow[]>([newChartRow()])
  const [subMeters, setSubMeters] = useState<AnalyticsDevice[]>([])

  // Chartable device types follow the metric catalog — no hard-coded list, so
  // transformer (and any future type) surfaces automatically once a metric
  // for it exists.
  const metricDeviceTypes = useMemo(
    () => new Set(metrics.flatMap((m) => m.device_types)),
    [metrics],
  )

  // Substations linked to this site — checked both directions (a substation
  // that is a child of this site, or this site's parent if it's a
  // substation), so it works whichever way parent_site points.
  const substationSites = useMemo(() => {
    if (!site) return []
    const children = allSites.filter((s) => s.site_type === 'SUBSTATION' && s.parent_site === site.id && s.is_active)
    const parent = allSites.find((s) => s.id === site.parent_site && s.site_type === 'SUBSTATION' && s.is_active)
    return parent ? [...children, parent] : children
  }, [allSites, site])

  const activeDevices: AnalyticsDevice[] = [
    ...devices
      .filter((d) => d.is_active && metricDeviceTypes.has(d.device_type))
      .map((d): AnalyticsDevice => ({ ...d, siteId: site?.id ?? -1 })),
    ...subMeters,
  ]

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

  // Substation meters live on a different site, so fetch them per linked
  // Substation meters live on a different site than the plant, so fetch them
  // per linked substation. Tagged with the substation's OWN site id — the
  // backend requires `site` and `devices` to belong to the same site, so
  // this is what generateRow uses to scope each request correctly.
  useEffect(() => {
    if (substationSites.length === 0) { setSubMeters([]); return }
    let cancelled = false
    Promise.all(
      substationSites.map((s) =>
        api.get<{ devices: SiteDevice[] }>(`/sites/${s.id}/`)
          .then((res) => (res.data.devices ?? [])
            .filter((d) => d.device_type === 'METER' && d.is_active)
            .map((d): AnalyticsDevice => ({ ...d, siteId: s.id, substationName: s.name })))
          .catch(() => [] as AnalyticsDevice[]),
      ),
    ).then((groups) => { if (!cancelled) setSubMeters(groups.flat()) })
    return () => { cancelled = true }
  }, [substationSites])

  function updateRow(id: string, patch: Partial<ChartRow>) {
    setChartRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    setChartRows((prev) => prev.filter((r) => r.id !== id))
  }

  function addRow() {
    setChartRows((prev) => [...prev, newChartRow()])
  }

  // One analytics call per site present in this row's selections — the
  // backend filters devices with .filter(site=site, ...), so `site` and
  // `devices` must belong together or the mismatched devices silently drop.
  // Results are merged client-side: legends concatenate, and data rows union
  // on timestamp so plant and substation series land on one chart/axis.
  async function generateRow(row: ChartRow) {
    const activeSelections = row.selections.filter((s) => s.deviceIds.length > 0)
    if (activeSelections.length === 0 || row.metricKeys.length === 0) return
    updateRow(row.id, { loading: true, error: null })
    try {
      const responses = await Promise.all(
        activeSelections.map((s) =>
          api.get<AnalyticsResponse>(
            `/influx/analytics/?site=${s.siteId}&metrics=${row.metricKeys.join(',')}&devices=${s.deviceIds.join(',')}&date=${row.date}`
          )
        )
      )

      const legend = responses.flatMap((r) => r.data.legend)

      // Union rows by timestamp — each response only contributes its own
      // legend's keys, so merging is a plain per-timestamp object spread.
      const byTime = new Map<string, DataRow>()
      for (const res of responses) {
        for (const dataRow of res.data.data) {
          const existing = byTime.get(dataRow.time) ?? ({ time: dataRow.time } as DataRow)
          byTime.set(dataRow.time, { ...existing, ...dataRow })
        }
      }
      const data = Array.from(byTime.values()).sort((a, b) => a.time.localeCompare(b.time))

      updateRow(row.id, {
        data: { date: responses[0].data.date, legend, data },
        loading: false,
        hasGenerated: true,
        error: null,
      })
    } catch (err) {
      console.error('Analytics fetch error:', err)
      updateRow(row.id, { loading: false, hasGenerated: true, error: 'Failed to load this chart.' })
    }
  }

  function refreshAllGenerated() {
    chartRows.forEach((row) => {
      if (row.hasGenerated && row.metricKeys.length > 0 && row.selections.some((s) => s.deviceIds.length > 0)) {
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