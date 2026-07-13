import { useEffect, useRef, useState } from 'react'
import api from '@/api/axios'
import { RefreshCw } from 'lucide-react'
import { useSite } from '@/context/SiteContext'

// ============================================================
// TYPE SCALE — matches Plant/Meter/Inverter/Weather Overview.
// ============================================================
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  body:         'text-[14px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
  metricL:      'text-[22px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricM:      'text-[15px] font-semibold text-black tabular-nums leading-none',
  unit:         'text-[13px] text-black font-medium',
}

// ---- Types ----

interface PvString {
  number: string
  current_a: number
}

interface ScbInverter {
  device_id: number
  name: string
  pv_strings: PvString[]
}

interface ScbData {
  site: string
  inverters: ScbInverter[]
}


// Classify a string's current into a status bucket.
// Thresholds tuned for typical residential/C&I solar strings; adjust if
// your site's expected current range differs.
type StringStatus = 'active' | 'low' | 'inactive'
function stringStatus(current: number): StringStatus {
  if (current <= 0.05) return 'inactive'
  if (current < 2) return 'low'
  return 'active'
}

// ============================================================
// Color palette — colors carry SEMANTIC meaning here:
//   olive  = healthy production
//   amber  = under-producing (warning)
//   muted  = not producing (idle / night / disconnected)
// ============================================================
const STATUS_STYLES: Record<StringStatus, {
  bg: string; border: string; dot: string; label: string; value: string
}> = {
  active: {
    bg: 'bg-[#f4f7ea]',            // very light olive tint
    border: 'border-[#497d00]/30',
    dot: 'bg-[#497d00]',
    label: 'text-[#497d00]',
    value: 'text-black',
  },
  low: {
    bg: 'bg-[#fff7ed]',            // very light amber tint
    border: 'border-[#e17100]/30',
    dot: 'bg-[#e17100]',
    label: 'text-[#e17100]',
    value: 'text-black',
  },
  inactive: {
    bg: 'bg-black/[0.02]',
    border: 'border-black/10',
    dot: 'bg-black/25',
    label: 'text-black/40',
    value: 'text-black/40',
  },
}

// ============================================================
// Shared building blocks
// ============================================================

function Divider() {
  return <div className="h-px w-full bg-black/15" />
}

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
    accent === 'olive'  ? 'bg-[#497d00]' : 'bg-black'
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


// ============================================================
// PV String tile — editorial, minimal, status-colored
// ============================================================
function PvStringTile({ s }: { s: PvString }) {
  const status = stringStatus(s.current_a)
  const style = STATUS_STYLES[status]

  return (
    <div className={`${style.bg} border ${style.border} rounded-lg px-2 py-2.5 text-center transition-colors`}>
      <div className="flex items-center justify-center gap-1 mb-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} shrink-0`} />
        <p className={`text-[10px] uppercase tracking-[0.08em] font-semibold ${style.label}`}>
          Str{'\u00A0'}{s.number}
        </p>
      </div>
      <p className={`text-[13px] font-semibold ${style.value} leading-none tabular-nums`}>
        {s.current_a.toFixed(2)}
        <span className="text-[10px] text-black/40 ml-0.5 font-medium">A</span>
      </p>
    </div>
  )
}

// ============================================================
// Inverter summary — total/avg current + status counts
// ============================================================
function InverterSummary({ strings }: { strings: PvString[] }) {
  const active   = strings.filter((s) => stringStatus(s.current_a) === 'active').length
  const low      = strings.filter((s) => stringStatus(s.current_a) === 'low').length
  const inactive = strings.filter((s) => stringStatus(s.current_a) === 'inactive').length
  const totalCurrent = strings.reduce((sum, s) => sum + s.current_a, 0)
  const avgCurrent   = strings.length ? totalCurrent / strings.length : 0

  return (
    <div className="flex items-end gap-8 mb-5 flex-wrap">
      <div>
        <p className={T.eyebrow}>Total Current</p>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className={`${T.metricL} text-[#497d00]`}>{totalCurrent.toFixed(1)}</span>
          <span className={T.unit}>A</span>
        </div>
      </div>
      <div>
        <p className={T.eyebrow}>Avg / String</p>
        <div className="flex items-baseline gap-1.5 mt-2">
          <span className={T.metricL}>{avgCurrent.toFixed(2)}</span>
          <span className={T.unit}>A</span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto flex-wrap">
        {active > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] px-2.5 h-7 rounded-full bg-[#f4f7ea] text-[#497d00] border border-[#497d00]/25">
            <span className="w-1.5 h-1.5 rounded-full bg-[#497d00] shrink-0" />
            {active} Active
          </span>
        )}
        {low > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] px-2.5 h-7 rounded-full bg-[#fff7ed] text-[#e17100] border border-[#e17100]/25">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e17100] shrink-0" />
            {low} Low
          </span>
        )}
        {inactive > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] px-2.5 h-7 rounded-full bg-black/[0.03] text-black/50 border border-black/15">
            <span className="w-1.5 h-1.5 rounded-full bg-black/30 shrink-0" />
            {inactive} Inactive
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Main Page
// ============================================================
export default function ScbPage() {
  const { site } = useSite()
  const [data, setData] = useState<ScbData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const lastActivity = useRef(Date.now())

  // Activity tracking — pause auto-refresh when user is idle or tab hidden
  useEffect(() => {
    const updateActivity = () => { lastActivity.current = Date.now() }
    window.addEventListener('mousemove', updateActivity)
    window.addEventListener('keydown', updateActivity)
    window.addEventListener('click', updateActivity)
    return () => {
      window.removeEventListener('mousemove', updateActivity)
      window.removeEventListener('keydown', updateActivity)
      window.removeEventListener('click', updateActivity)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivity.current
      const isIdle = idleMs > 60_000
      const isHidden = document.visibilityState !== 'visible'
      if (!isIdle && !isHidden) {
        setRefreshTick((t) => t + 1)
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!site?.id) return
    const fetchScb = async () => {
      try {
        const res = await api.get<ScbData>(`/influx/inverter/pv-strings/?site=${site.id}`)
        setData(res.data)
      } catch (err) {
        console.error('SCB error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchScb()
  }, [site?.id, refreshTick])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading string data…</p>
      </div>
    )
  }

  const totalStrings = data?.inverters.reduce((n, inv) => n + inv.pv_strings.length, 0) ?? 0

  return (
    <div className="w-full max-w-[1152px] mx-auto px-0 sm:px-6 md:px-6 lg:px-6 pb-10">

      {/* ============ HEADER ============ */}
      <header className="pb-5 flex flex-col md:flex-row md:items-start md:justify-between md:flex-wrap gap-3 md:gap-6">
        <div className="order-1 md:order-2 shrink-0">
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            className="h-10 px-4 flex items-center gap-2 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Refresh
          </button>
        </div>

        <div className="order-2 md:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 self-stretch rounded-full bg-[#497d00] shrink-0" />
            <div className="min-w-0 py-0.5">
              <p className={T.eyebrow}>String Combiner Box</p>
              <h1 className={`${T.siteH1} mt-2 break-words`}>{data?.site ?? '—'}</h1>
              <p className={`${T.body} mt-1`}>
                {data?.inverters.length ?? 0} inverters · {totalStrings} strings total
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ============ PER-INVERTER SECTIONS ============ */}
      {data?.inverters.map((inv, idx) => {
        const strings = [...inv.pv_strings].sort((a, b) => a.number.localeCompare(b.number))
        return (
          <div key={inv.device_id}>
            <Divider />
            <section className="pt-6 pb-8">
              <SectionHeader
                title={inv.name}
                meta={`${strings.length} strings`}
                accent={idx % 2 === 0 ? 'orange' : 'olive'}
              />
              <InverterSummary strings={strings} />
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2">
                {strings.map((s) => (
                  <PvStringTile key={s.number} s={s} />
                ))}
              </div>
            </section>
          </div>
        )
      })}

      {data && data.inverters.length === 0 && (
        <>
          <Divider />
          <div className="flex items-center justify-center h-40">
            <p className={T.meta}>No inverters found for this site.</p>
          </div>
        </>
      )}

    </div>
  )
}