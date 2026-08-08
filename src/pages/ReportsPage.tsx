import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, addDays, differenceInCalendarDays } from 'date-fns'
import { CalendarIcon, ChevronDown, Download } from 'lucide-react'
import { type DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'
import { useAutoRefresh } from '@/api/useAutoRefresh'

// ============================================================
// TYPE SCALE — shared with PlantOverview / Portfolio. Never freehand.
// ============================================================
const T = {
  eyebrow: 'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:    'text-[13px] text-black',
  body:    'text-[14px] text-black',
  siteH1:  'text-[26px] font-semibold text-black tracking-tight',
}

const OLIVE = '#497d00'

// ---- Types (summary-less contract; every numeric is number | null) ----

interface DailyRow {
  date: string
  energy_kwh: number | null
  inverter_sum_kwh: number | null
  specific_yield_kwh_kwp: number | null
  performance_ratio_pct: number | null
  cuf_pct: number | null
  peak_power_kw: number | null
  peak_power_time: string | null
  generation_start_time: string | null
  generation_end_time: string | null
  generation_hours: number | null
  poa_irradiation_kwh_m2: number | null
  co2_avoided_kg: number | null
  meter_status: string | null
  inverters_online_count: number | null
  inverters_total_count: number | null
}

interface ReportsData {
  site: string
  customer: string
  range: {
    start: string
    end: string
    days: number
    days_with_data: number
    data_current_through: string | null
  }
  daily: DailyRow[]
}

// ---- Formatters (null is never 0 — it renders as an em dash) ----

const DASH = '—'

function num(v: number | null | undefined, dp = 0) {
  if (v == null) return DASH
  return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
}
function fmtDay(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtDayLong(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(iso: string | null | undefined) {
  if (!iso) return DASH
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit',
  })
}

// ---- IST date helpers ----
// en-CA gives ISO YYYY-MM-DD; we build local-midnight Dates from those parts so
// the calendar shows the intended IST calendar day and date-fns formats it back
// to the same day (no timezone drift).
function istToday() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
function istYesterday() { return new Date(Date.now() - 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
function localDate(iso: string) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
function toApiDate(d: Date) { return format(d, 'yyyy-MM-dd') }

// ============================================================
// CSV export — built from the loaded rows, no dependencies.
// Numbers stay raw (full precision, Excel-parseable); nulls become blank cells;
// timestamps become sortable IST datetimes. Opens directly in Excel / Sheets.
// ============================================================

const raw = (v: number | null | undefined) => (v == null ? '' : String(v))

function istDateTime(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })                       // YYYY-MM-DD
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

const CSV_COLUMNS: { header: string; value: (r: DailyRow) => string }[] = [
  { header: 'Date', value: (r) => r.date },
  { header: 'Energy Today (kWh)', value: (r) => raw(r.energy_kwh) },
  { header: 'Inverter Energy Today (kWh)', value: (r) => raw(r.inverter_sum_kwh) },
  { header: 'Specific Yield (kWh/kWp)', value: (r) => raw(r.specific_yield_kwh_kwp) },
  { header: 'PR (%)', value: (r) => raw(r.performance_ratio_pct) },
  { header: 'CUF (%)', value: (r) => raw(r.cuf_pct) },
  { header: 'Peak Power (kW)', value: (r) => raw(r.peak_power_kw) },
  { header: 'Peak Time (IST)', value: (r) => istDateTime(r.peak_power_time) },
  { header: 'Generation Start (IST)', value: (r) => istDateTime(r.generation_start_time) },
  { header: 'Generation End (IST)', value: (r) => istDateTime(r.generation_end_time) },
  { header: 'Generation Hours', value: (r) => raw(r.generation_hours) },
  { header: 'POA Irradiation (kWh/m2)', value: (r) => raw(r.poa_irradiation_kwh_m2) },
  { header: 'CO2 Avoided (kg)', value: (r) => raw(r.co2_avoided_kg) },
  { header: 'Meter Status', value: (r) => r.meter_status ?? '' },
  { header: 'Inverters Online', value: (r) => raw(r.inverters_online_count) },
  { header: 'Inverters Total', value: (r) => raw(r.inverters_total_count) },
]

function toCsv(rows: DailyRow[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const header = CSV_COLUMNS.map((c) => esc(c.header)).join(',')
  const body = rows.map((r) => CSV_COLUMNS.map((c) => esc(c.value(r))).join(',')).join('\n')
  return '\uFEFF' + header + '\n' + body + '\n'   // BOM so Excel reads UTF-8 correctly
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ============================================================
// Range picker — shadcn Calendar (mode="range") + presets.
// A range picker can't produce an inverted range, so "end before start" is gone.
// ============================================================

function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return mobile
}

function ReportRangePicker({
  range, onChange, maxDate,
}: {
  range: DateRange | undefined
  onChange: (r: DateRange | undefined) => void
  maxDate: Date
}) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()

  // Compact label — collapse the shared year to one appearance.
  const label = (() => {
    if (!range?.from) return 'Pick a range'
    if (!range.to) return format(range.from, 'LLL d, y')
    const sameYear = range.from.getFullYear() === range.to.getFullYear()
    return sameYear
      ? `${format(range.from, 'LLL d')} – ${format(range.to, 'LLL d, y')}`
      : `${format(range.from, 'LLL d, y')} – ${format(range.to, 'LLL d, y')}`
  })()

  // Presets are built off yesterday (newest settled day) and today's IST month.
  const presets = useMemo(() => {
    const yest = maxDate
    const [ty, tm] = istToday().split('-').map(Number)
    return [
      { label: 'This month', from: new Date(ty, tm - 1, 1), to: yest },
      { label: 'Last month', from: new Date(ty, tm - 2, 1), to: new Date(ty, tm - 1, 0) },
      { label: 'Last 7 days', from: addDays(yest, -6), to: yest },
      { label: 'Last 30 days', from: addDays(yest, -29), to: yest },
    ]
  }, [maxDate])

  const isActive = (p: { from: Date; to: Date }) =>
    !!range?.from && !!range.to &&
    toApiDate(range.from) === toApiDate(p.from) &&
    toApiDate(range.to) === toApiDate(p.to)

  const dayCount = range?.from && range.to ? differenceInCalendarDays(range.to, range.from) + 1 : 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-10 w-full sm:w-auto gap-2.5 justify-between sm:justify-start rounded-xl px-3.5 text-[13px] font-semibold text-black bg-white transition-colors
            ${open ? 'border-[#e17100] ring-1 ring-[#e17100]/20' : 'border-black/20 hover:bg-black/[0.03]'}`}
        >
          <span className="flex items-center gap-2 min-w-0">
            <CalendarIcon size={15} className="text-black/45 shrink-0" strokeWidth={2} />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown
            size={15}
            strokeWidth={2}
            className={`text-black/35 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-auto max-w-[calc(100vw-1.5rem)] p-0 rounded-2xl border-black/10 shadow-xl overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row">
          {/* Presets — horizontal chip row on mobile, labelled rail on desktop */}
          <div className="flex sm:flex-col gap-1 p-2.5 sm:p-3 border-b sm:border-b-0 sm:border-r border-black/[0.08] overflow-x-auto sm:w-[136px] shrink-0">
            <p className="hidden sm:block text-[10px] uppercase tracking-[0.1em] font-semibold text-black/40 px-1.5 pb-1.5">
              Quick ranges
            </p>
            {presets.map((p) => {
              const active = isActive(p)
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onChange({ from: p.from, to: p.to }); setOpen(false) }}
                  className={`text-left whitespace-nowrap text-[12.5px] font-medium px-2.5 py-1.5 rounded-lg transition-colors shrink-0
                    ${active ? 'bg-[#e17100]/10 text-[#e17100]' : 'text-black/70 hover:bg-black/[0.05] hover:text-black'}`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Calendar (keeps its own padding) */}
          <Calendar
            mode="range"
            defaultMonth={range?.from}
            selected={range}
            onSelect={onChange}
            numberOfMonths={isMobile ? 1 : 2}
            disabled={{ after: maxDate }}
            autoFocus
          />
        </div>

        {/* Footer — selection summary + explicit close (matters on mobile, where
            a completed range otherwise leaves the sheet open) */}
        <div className="flex items-center justify-between gap-3 border-t border-black/[0.08] px-3.5 py-2.5">
          <span className="text-[12px] text-black/55 tabular-nums truncate">
            {dayCount > 0 ? `${dayCount} day${dayCount !== 1 ? 's' : ''} selected` : 'Select a start and end date'}
          </span>
          <Button
            size="sm"
            onClick={() => setOpen(false)}
            disabled={!range?.from || !range?.to}
            className="h-8 rounded-lg bg-[#e17100] hover:bg-[#c96400] text-white text-[12px] font-semibold px-4 disabled:opacity-40"
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================
// Table cells
// ============================================================

function Th({ children, left = false, sticky = false }: { children: React.ReactNode; left?: boolean; sticky?: boolean }) {
  return (
    <th
      className={`text-[10px] uppercase tracking-[0.1em] font-semibold text-black/40 whitespace-nowrap py-3 px-3
        ${left ? 'text-left' : 'text-right'} ${sticky ? 'sticky left-0 z-20 bg-white' : ''}`}
    >
      {children}
    </th>
  )
}

function Td({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <td className="py-3 px-3 text-right text-[13px] font-semibold tabular-nums whitespace-nowrap" style={tone ? { color: tone } : undefined}>
      {children}
    </td>
  )
}

// ============================================================
// Page
// ============================================================

export default function ReportsPage() {
  const { site } = useSite()
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Newest settled day is always yesterday (IST) — everything caps there.
  const maxDate = useMemo(() => localDate(istYesterday()), [])

  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: localDate(istToday().slice(0, 8) + '01'),  // 1st of this month
    to: localDate(istYesterday()),
  }))

  const start = range?.from ? toApiDate(range.from) : ''
  const end = range?.to ? toApiDate(range.to) : ''

  const fetchReport = useCallback(async () => {
    if (!site?.id) { setLoading(false); return }
    // Only fetch a complete range — mid-selection (from set, to not yet) waits.
    if (!start || !end) { setLoading(false); return }
    try {
      const params = new URLSearchParams({ site: String(site.id), start, end })
      const res = await api.get<ReportsData>(`/reports/summary/?${params.toString()}`)
      setData(res.data)
      setError(null)
    } catch (err: any) {
      // Surface the backend's message cleanly instead of leaving stale data.
      setError(err?.response?.data?.detail ?? 'Could not load reports. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [site?.id, start, end])

  useEffect(() => { fetchReport() }, [fetchReport])

  // Refresh on page visit / tab wake, like the live pages. Slow interval — reports
  // are settled T-1 data, so there's nothing to poll for but the nightly snapshot.
  useAutoRefresh(fetchReport, { intervalMs: 15 * 60_000 })

  const rows = useMemo(
    () => [...(data?.daily ?? [])].sort((a, b) => b.date.localeCompare(a.date)),   // latest on top
    [data],
  )

  const handleDownload = () => {
    if (!data || data.daily.length === 0) return
    // Export chronologically (ascending) — the natural order for a data file.
    const asc = [...data.daily].sort((a, b) => a.date.localeCompare(b.date))
    const safeSite = (data.site || 'site').replace(/[^\w-]+/g, '_')
    downloadCsv(`${safeSite}_${data.range.start}_to_${data.range.end}.csv`, toCsv(asc))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading reports…</p>
      </div>
    )
  }

  const apiRange = data?.range
  const hasData = rows.length > 0

  return (
    <div className="max-w-6xl px-0 mx-auto sm:px-6 md:px-4 lg:px-2 xl:px-0 pb-12">

      {/* ============ HEADER ============ */}
      <header className="pb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 sm:gap-6">
        <div className="order-2 sm:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 rounded-full bg-[#e17100] shrink-0 self-stretch" />
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <p className={T.eyebrow}>Reports</p>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-black/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-black/25" />
                  {apiRange?.data_current_through ? `Data through ${fmtDayLong(apiRange.data_current_through)}` : 'No settled data in range'}
                </span>
              </div>
              <h1 className={`${T.siteH1} mt-2 break-words`}>{data?.site ?? '—'}</h1>
              {apiRange && (
                <p className={`${T.meta} text-black/50 mt-2`}>
                  {fmtDayLong(apiRange.start)} – {fmtDayLong(apiRange.end)} · {apiRange.days_with_data} of {apiRange.days} days
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="order-1 sm:order-2 w-full sm:w-auto flex flex-col sm:flex-row gap-2 sm:items-end sm:shrink-0">
          <ReportRangePicker range={range} onChange={setRange} maxDate={maxDate} />
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={!hasData}
            className="h-10 w-full sm:w-auto gap-2 rounded-xl border-black/20 bg-white text-[13px] font-semibold text-black hover:bg-black/[0.03] disabled:opacity-40"
          >
            <Download size={15} strokeWidth={2} className="text-black/45" />
            Download CSV
          </Button>
        </div>
      </header>

      {/* ============ TABLE ============ */}
      <div className="h-px w-full bg-black/15" />

      {error ? (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-[#e17100]/30 bg-[#e17100]/[0.05] px-4 py-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#e17100] shrink-0" />
          <p className="text-[13px] text-[#9a6a2a] font-medium">{error}</p>
        </div>
      ) : hasData ? (
        <div className="mt-6 rounded-2xl border border-black/15 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-black/15 bg-black/[0.015]">
                  <Th left sticky>Date</Th>
                  <Th>Energy Today (kWh)</Th>
                  <Th>Inverter Energy Today (kWh)</Th>
                  <Th>Yield (kWh/kWp)</Th>
                  <Th>PR %</Th>
                  <Th>CUF %</Th>
                  <Th>Gen Start</Th>
                  <Th>Gen End</Th>
                  <Th>POA (kWh/m²)</Th>
                  <Th>CO₂ (kg)</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-b border-black/[0.06] last:border-0 hover:bg-black/[0.015]">
                    <td className="py-3 px-3 sticky left-0 z-10 bg-white text-left whitespace-nowrap">
                      <span className="text-[13px] font-semibold text-black">{fmtDay(r.date)}</span>
                    </td>
                    <Td>{num(r.energy_kwh, 2)}</Td>
                    <Td tone="rgba(0,0,0,0.55)">{num(r.inverter_sum_kwh, 0)}</Td>
                    <Td>{num(r.specific_yield_kwh_kwp, 2)}</Td>
                    <Td tone={OLIVE}>{num(r.performance_ratio_pct, 2)}</Td>
                    <Td>{num(r.cuf_pct, 2)}</Td>
                    <Td tone="rgba(0,0,0,0.55)">{fmtTime(r.generation_start_time)}</Td>
                    <Td tone="rgba(0,0,0,0.55)">{fmtTime(r.generation_end_time)}</Td>
                    <Td>{num(r.poa_irradiation_kwh_m2, 3)}</Td>
                    <Td tone={OLIVE}>{num(r.co2_avoided_kg, 2)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center gap-3 py-20 px-6">
          <span className="w-10 h-px bg-black/20" />
          <p className={`${T.body} font-semibold`}>No settled data in this range</p>
          <p className="text-[13px] text-black/50 max-w-sm leading-relaxed">
            Reports cover completed days only — the newest available is yesterday. Pick a range that ends on or before then.
          </p>
        </div>
      )}
    </div>
  )
}