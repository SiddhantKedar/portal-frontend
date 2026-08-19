import { useCallback, useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

// ============================================================
// TYPE SCALE — matches PlantOverviewPage / InverterOverviewPage. Keep in sync.
// ============================================================
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  body:         'text-[14px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
}

// ---- Types (GET /influx/faults/?site=&date=) ----
interface StateSeg { code: number | null; label: string; start: string; end: string }
interface FaultInverter {
  device_id: string
  name: string
  current: { code: number; label: string } | null
  timeline: StateSeg[]
}
interface FaultTimeline {
  site: string
  date: string
  is_today: boolean
  window: { start: string; end: string }
  gap_threshold_seconds: number
  inverters: FaultInverter[]
}

// ============================================================
// State colour system — code-driven (label + colour from code, not payload).
// Red reserved for faults only. No frontend metrics — display only.
// ============================================================
const SEG: Record<number, { label: string; bar: string; ink: string; soft: string }> = {
  1: { label: 'Generating', bar: '#497d00', ink: 'text-[#3f6d00]', soft: 'bg-[#497d00]/[0.10]' },
  2: { label: 'Standby',    bar: '#cbd2dc', ink: 'text-black/55',   soft: 'bg-black/[0.05]' },
  4: { label: 'Warning',    bar: '#e17100', ink: 'text-[#e17100]',  soft: 'bg-[#e17100]/[0.12]' },
  8: { label: 'Fault',      bar: '#dc2626', ink: 'text-[#dc2626]',  soft: 'bg-[#dc2626]/[0.10]' },
  0: { label: 'Stopped',    bar: '#9aa3b0', ink: 'text-black/55',   soft: 'bg-black/[0.05]' },
}
const NODATA = { label: 'No Data', bar: '#ececec', ink: 'text-black/35', soft: 'bg-black/[0.04]' }
const segMeta = (code: number | null) => (code == null ? NODATA : SEG[code] ?? NODATA)
const LEGEND_ORDER = [1, 2, 4, 8, 0, null] as const
const HATCH = 'repeating-linear-gradient(45deg,#efefef,#efefef 5px,#e6e6e6 5px,#e6e6e6 10px)'

// ---- time helpers (IST) — geometry/formatting only ----
function todayString() {
  return new Date().toISOString().split('T')[0]
}
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
function istClock(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
}

const DAY_TICKS = [0, 180, 360, 540, 720, 900, 1080, 1260, 1440]
const DAY_TICKS_MOBILE = [0, 360, 720, 1080, 1440]

// ============================================================
// Shared building blocks — identical to the other overview pages
// ============================================================
function SectionHeader({
  title, meta, accent = 'orange', actions,
}: { title: string; meta?: string; accent?: 'orange' | 'olive' | 'none'; actions?: React.ReactNode }) {
  const bar = accent === 'orange' ? 'bg-[#e17100]' : accent === 'olive' ? 'bg-[#497d00]' : 'bg-black'
  return (
    <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
      <div className="flex items-stretch gap-3 min-w-0">
        {accent !== 'none' && <span className={`w-1 self-stretch rounded-full ${bar} shrink-0`} />}
        <div className="min-w-0 py-0.5">
          <h2 className={`${T.sectionTitle} leading-tight`}>{title}</h2>
          {meta && <p className={`${T.meta} mt-0.5`}>{meta}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 ml-auto shrink-0">{actions}</div>}
    </div>
  )
}
function Divider() {
  return <div className="h-px w-full bg-black/15" />
}

export default function FaultsPage() {
  const { site } = useSite()
  const [data, setData] = useState<FaultTimeline | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayString())
  const [loading, setLoading] = useState(true)

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // active tooltip = "invIdx:segIdx"
  const [active, setActive] = useState<string | null>(null)

  const fetchTimeline = useCallback(async () => {
    if (!site?.id) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await api.get<FaultTimeline>(`/influx/faults/?site=${site.id}&date=${selectedDate}`)
      res.data.inverters.sort((a, b) => a.device_id.localeCompare(b.device_id, undefined, { numeric: true }))
      setData(res.data)
    } catch (err) {
      console.error('Faults timeline error:', err)
    } finally {
      setLoading(false)
    }
  }, [site?.id, selectedDate])

  // Load on mount + whenever site or date changes. No polling, no manual refresh.
  useEffect(() => { fetchTimeline() }, [fetchTimeline])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading fault timeline…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>No fault timeline available.</p>
      </div>
    )
  }

  const ticks = isMobile ? DAY_TICKS_MOBILE : DAY_TICKS

  return (
    <div className="w-full max-w-[1152px] mx-auto px-0 sm:px-6 md:px-6 lg:px-6">

      {/* ============ HEADER (no refresh) ============ */}
      <header className="pb-5 flex flex-col md:flex-row md:items-start md:justify-between md:flex-wrap gap-3 md:gap-6">
        <div className="order-2 md:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 self-stretch rounded-full bg-[#e17100] shrink-0" />
            <div className="min-w-0 py-0.5">
              <p className={T.eyebrow}>Fault Timeline</p>
              <h1 className={`${T.siteH1} mt-1 leading-tight break-words`}>{data.site}</h1>
              <p className={`${T.body} mt-1`}>
                {data.inverters.length} inverter{data.inverters.length !== 1 ? 's' : ''}
                <span className="mx-2 text-black">·</span>
                <span className="tabular-nums">{new Date(selectedDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="order-1 md:order-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap`}>
            <Clock size={13} strokeWidth={2} />
            {data.is_today ? (
              <span className="inline-flex items-center gap-1.5 text-[#3f6d00] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#497d00]" />
                Today · to {istClock(data.window.end)}
              </span>
            ) : (
              <span>{selectedDate}</span>
            )}
          </p>
        </div>
      </header>

      {/* ============ CURRENT STATE (straight from API `current`) ============ */}
      <Divider />
      <section className="pt-8 pb-2">
        <SectionHeader title="Current Status" meta="Latest reported state per inverter" accent="olive" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.inverters.map((inv) => {
            const noData = inv.current == null
            const m = noData ? NODATA : segMeta(inv.current!.code)
            return (
              <div key={inv.device_id} className="rounded-xl border border-black/10 bg-white px-4 py-3.5">
                <p className={`text-[13px] font-semibold truncate ${noData ? 'text-black/45' : 'text-black'}`}>{inv.name}</p>
                <span className="mt-2 inline-flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: m.bar, boxShadow: noData ? 'inset 0 0 0 1px rgba(0,0,0,0.15)' : 'none' }}
                  />
                  <span className={`text-[12px] font-semibold ${m.ink}`}>{m.label}</span>
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ============ TIMELINE ============ */}
      <div className="pt-8"><Divider /></div>
      <section className="pt-8">
        <SectionHeader
          title="Status Timeline"
          meta="Inverter state across the day · times in IST"
          actions={<DatePicker value={selectedDate} onChange={setSelectedDate} maxDate={new Date()} />}
        />

        {/* legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-5">
          {LEGEND_ORDER.map((c) => {
            const m = segMeta(c)
            return (
              <span key={String(c)} className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-[3px]"
                  style={{ background: m.bar, boxShadow: c === null ? 'inset 0 0 0 1px rgba(0,0,0,0.12)' : 'none' }}
                />
                <span className="text-[12px] text-black/60 font-medium">{m.label}</span>
              </span>
            )
          })}
        </div>

        {/* axis */}
        <div className="relative h-5 mb-1">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute text-[10.5px] font-semibold text-black/35 tabular-nums whitespace-nowrap"
              style={{ left: `${(t / 1440) * 100}%`, transform: t === 0 ? 'none' : t === 1440 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              {formatMinutesTick(t)}
            </span>
          ))}
        </div>

        {/* lanes */}
        <div>
          {data.inverters.map((inv, i) => {
            const noData = inv.current == null
            const cur = noData ? NODATA : segMeta(inv.current!.code)
            const activeSeg = active?.startsWith(`${i}:`) ? Number(active.split(':')[1]) : null

            return (
              <div key={inv.device_id} className={`py-4 ${i === 0 ? '' : 'border-t border-black/[0.06]'}`}>
                {/* lane header — name + current state only */}
                <div className="flex items-center gap-2 mb-2.5 min-w-0">
                  <span className={`text-[14px] font-semibold ${noData ? 'text-black/45' : 'text-black'}`}>{inv.name}</span>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${cur.ink} ${cur.soft}`}>
                    <span className="w-[5px] h-[5px] rounded-full" style={{ background: cur.bar }} />
                    {cur.label}
                  </span>
                </div>

                {/* the swimlane */}
                <div className="relative">
                  <div
                    className="relative h-[34px] rounded-md overflow-hidden bg-black/[0.03]"
                    style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)' }}
                    onMouseLeave={() => setActive((a) => (a?.startsWith(`${i}:`) ? null : a))}
                  >
                    {/* gridlines */}
                    <div className="absolute inset-0 pointer-events-none">
                      {ticks.map((t) => (
                        <div key={t} className="absolute top-0 bottom-0" style={{ left: `${(t / 1440) * 100}%`, width: 1, background: 'rgba(0,0,0,0.05)' }} />
                      ))}
                    </div>


                    {/* segments — full-height bands; faults get min-width + ring + glow + top z */}
                    {inv.timeline.map((s, j) => {
                      const startMin = Math.max(0, minutesFromIstDayStart(s.start, data.date))
                      const endMin = Math.min(1440, minutesFromIstDayStart(s.end, data.date))
                      if (endMin <= startMin) return null
                      const m = segMeta(s.code)
                      const fault = s.code === 8, warn = s.code === 4
                      const isActive = activeSeg === j
                      return (
                        <button
                          key={j}
                          type="button"
                          onMouseEnter={() => setActive(`${i}:${j}`)}
                          onClick={() => setActive(`${i}:${j}`)}
                          className="absolute top-0 bottom-0 cursor-pointer outline-none"
                          style={{
                            left: `${(startMin / 1440) * 100}%`,
                            width: `${((endMin - startMin) / 1440) * 100}%`,
                            minWidth: fault ? 6 : warn ? 4 : undefined,
                            background: s.code == null ? HATCH : m.bar,
                            boxShadow: fault ? '0 0 0 1px #fff, 0 0 7px rgba(220,38,38,0.55)' : warn ? '0 0 0 1px #fff' : 'none',
                            outline: isActive ? '2px solid rgba(0,0,0,0.6)' : 'none',
                            outlineOffset: -2,
                            zIndex: fault ? 3 : warn ? 2 : 1,
                          }}
                        />
                      )
                    })}

                  </div>

                  {/* tooltip — label + time range only, no computed duration */}
                  {activeSeg != null && (() => {
                    const s = inv.timeline[activeSeg]
                    const startMin = minutesFromIstDayStart(s.start, data.date)
                    const endMin = minutesFromIstDayStart(s.end, data.date)
                    const centerPct = Math.min(88, Math.max(12, ((startMin + endMin) / 2 / 1440) * 100))
                    const m = segMeta(s.code)
                    return (
                      <div
                        className="absolute z-10 rounded-lg border border-black bg-white px-3 py-2 whitespace-nowrap pointer-events-none shadow-sm"
                        style={{ bottom: 'calc(100% + 6px)', left: `${centerPct}%`, transform: 'translateX(-50%)' }}
                      >
                        <p className="text-[12px] font-semibold" style={{ color: s.code == null ? '#a3a3a3' : m.bar }}>{m.label}</p>
                        <p className="text-[11px] text-black/55 tabular-nums mt-0.5">{istClock(s.start)} – {istClock(s.end)}</p>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}