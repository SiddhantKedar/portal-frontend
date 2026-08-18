import { useCallback, useEffect, useState } from 'react'
import { Zap, TrendingUp, Cpu, RefreshCw,Building2, ChevronRight, Gauge, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/axios'
import { useAutoRefresh } from '@/api/useAutoRefresh'
import { useAuth } from '@/context/AuthContext'

// ---- Typography tokens (shared with PlantOverviewPage) ----
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
  metricXL:     'text-[38px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricL:      'text-[22px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricM:      'text-[15px] font-semibold text-black tabular-nums leading-none',
  unit:         'text-[13px] text-black font-medium',
}

// ---- Types ----

interface PortfolioSummary {
  total_active_power_kw: number
  total_energy_today_kwh: number | null
  ac_capacity_kw?: number
  sites_online: number
  sites_total: number
  inverters_online: number
  inverters_total: number
  states: { running: number; stopped: number; standby: number; warning: number; fault: number; other: number }
}

interface SiteSummary {
  site_id: number
  site_name: string
  installer_name: string | null
  active_power_kw: number
  energy_today_kwh: number | null
  dc_capacity_kw: number | null
  ac_capacity_kw: number | null
  meter_online: boolean
  inverters_online: number
  inverters_total: number
  states: { running: number; stopped: number; standby: number; warning: number; fault: number; other: number }
  last_updated: string | null
}

interface CustomerSummary {
  customer_id: number
  customer_name: string
  sites: SiteSummary[]
}

interface PortfolioData {
  portfolio_summary: PortfolioSummary
  customers: CustomerSummary[]
  scope_name: string | null
}

// ---- Helpers ----

function formatLastUpdated(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const STATE_META: Record<string, { label: string; text: string; bg: string }> = {
  fault:   { label: 'Fault',      text: 'text-[#dc2626]', bg: 'bg-[#dc2626]/[0.08]' },
  warning: { label: 'Warning',    text: 'text-[#e17100]', bg: 'bg-[#e17100]/[0.08]' },
  offline: { label: 'Offline',    text: 'text-black/50',  bg: 'bg-black/[0.05]' },
  running: { label: 'Generating', text: 'text-[#497d00]', bg: 'bg-[#497d00]/[0.08]' },
  standby: { label: 'Standby',    text: 'text-black/55',  bg: 'bg-black/[0.05]' },
  stopped: { label: 'Stopped',    text: 'text-black/55',  bg: 'bg-black/[0.05]' },
  other:   { label: 'Other',      text: 'text-black/55',  bg: 'bg-black/[0.05]' },
}
// Device states only (problems first). Offline is NOT here — comms lives in the count.
const STATE_ORDER = ['fault', 'warning', 'running', 'standby', 'stopped', 'other'] as const

// Ordered, zero-filtered state list for a site (offline folded in from comms).
function siteStates(site: SiteSummary) {
  const offline = site.inverters_total - site.inverters_online
  return [
    { key: 'fault',   count: site.states.fault },
    { key: 'warning', count: site.states.warning },
    { key: 'offline', count: offline },
    { key: 'running', count: site.states.running },
    { key: 'standby', count: site.states.standby },
    { key: 'stopped', count: site.states.stopped },
    { key: 'other',   count: site.states.other },
  ].filter((s) => s.count > 0)
}

// ============================================================
// Shared layout primitives (mirrors PlantOverviewPage)
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
    accent === 'olive' ? 'bg-[#497d00]' : 'bg-black'
  return (
    <div className="flex items-stretch justify-between flex-wrap gap-3 mb-5">
      <div className="flex items-stretch gap-3 min-w-0">
        {accent !== 'none' && (
          <span className={`w-1 rounded-full ${bar} shrink-0 self-stretch`} />
        )}
        <div className="min-w-0">
          <h2 className={T.sectionTitle}>{title}</h2>
          {meta && <p className={`${T.meta} mt-1`}>{meta}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 ml-auto shrink-0">{actions}</div>
      )}
    </div>
  )
}


// ============================================================
// Fleet health footer — online/total with a status dot
// ============================================================

function HealthFooter({ online, total }: { online: number; total: number }) {
  // total === 0 means nothing is configured yet — not a fault. Reporting
  // "0 offline" in amber implies a problem that doesn't exist.
  if (total === 0) {
    return <span className="text-[12px] font-medium text-black/40">Not configured</span>
  }
  const allGood = online === total
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
      <span className={`w-1.5 h-1.5 rounded-full ${allGood ? 'bg-green-500' : 'bg-[#e17100]'}`} />
      <span className={allGood ? 'text-green-700' : 'text-[#e17100]'}>
        {allGood ? 'All Online' : `${total - online} offline`}
      </span>
    </span>
  )
}

// ============================================================
// Per-customer card — site rows in the PlantOverview visual language
// ============================================================

function CustomerBlock({ customer }: { customer: CustomerSummary }) {
  const totalPower = customer.sites.reduce((sum, s) => sum + s.active_power_kw, 0)
  const hasEnergy = customer.sites.some((s) => s.energy_today_kwh !== null)
  const totalEnergy = hasEnergy
    ? customer.sites.reduce((sum, s) => sum + (s.energy_today_kwh ?? 0), 0)
    : null
  const sitesOnline = customer.sites.filter((s) => s.meter_online).length
  const allMetered = sitesOnline === customer.sites.length

  return (
    <div className="rounded-2xl border border-black/15 overflow-hidden">
      <div className="flex items-stretch justify-between flex-wrap gap-4 px-5 py-4 bg-black/[0.02] border-b border-black/10">
        <div className="flex items-stretch gap-3 min-w-0">
          <span className="w-1 rounded-full bg-[#e17100] shrink-0 self-stretch" />
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold text-black tracking-tight truncate">
              {customer.customer_name}
            </h3>
            <p className="text-[11px] text-black/50 mt-0.5">
              {customer.sites.length} site{customer.sites.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-[12px] font-semibold tabular-nums">
          <span className="text-black">{totalPower.toFixed(1)}<span className="text-black/40 font-medium ml-1">kW</span></span>
          <span className="w-px h-4 bg-black/15" />
          <span className="text-black">
            {totalEnergy?.toLocaleString() ?? '—'}<span className="text-black/40 font-medium ml-1">kWh</span>
          </span>
          <span className="w-px h-4 bg-black/15" />
          <span className="inline-flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${allMetered ? 'bg-green-500' : 'bg-[#e17100]'}`} />
            <span className={allMetered ? 'text-green-700' : 'text-[#e17100]'}>
              {sitesOnline}/{customer.sites.length}
            </span>
          </span>
        </div>
      </div>

      <div className="divide-y divide-black/[0.06]">
        {customer.sites.map((site) => (
          <SiteRow key={site.site_id} site={site} />
        ))}
      </div>
    </div>
  )
}

function FlatSiteList({ sites }: { sites: SiteSummary[] }) {
  return (
    <div className="rounded-2xl border border-black/15 overflow-hidden divide-y divide-black/[0.06]">
      {sites.map((site) => (
        <SiteRow key={site.site_id} site={site} showInstaller />
      ))}
    </div>
  )
}

// Site Row
function SiteRow({ site, showInstaller = false }: { site: SiteSummary; showInstaller?: boolean }) {
  const navigate = useNavigate()
  const util = site.ac_capacity_kw && site.ac_capacity_kw > 0
    ? Math.min(Math.round((site.active_power_kw / site.ac_capacity_kw) * 100), 100) : null
  const allOnline = site.inverters_total > 0 && site.inverters_online === site.inverters_total
  const segs = siteStates(site)

  return (
    <button type="button" onClick={() => navigate(`/sites/${site.site_id}/plant`)}
      className="group w-full text-left px-5 py-5 hover:bg-black/[0.02] transition-colors">

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
        <div className="min-w-0 sm:flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[15px] font-semibold text-black truncate group-hover:text-[#e17100] transition-colors">{site.site_name}</p>
            {!site.meter_online && (<span className="shrink-0 text-[10px] uppercase tracking-[0.08em] font-semibold text-[#dc2626] border border-[#dc2626]/30 bg-[#dc2626]/[0.06] rounded px-1.5 py-0.5">Offline</span>)}
          </div>
          <p className="mt-1.5 text-[11px] text-black/40 truncate">{showInstaller && site.installer_name ? `${site.installer_name} · ` : ''}{formatLastUpdated(site.last_updated)}</p>

          {site.inverters_total > 0 && (
            <div className="mt-2 flex items-center flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-black">
                <span className={`w-1.5 h-1.5 rounded-full ${allOnline ? 'bg-[#497d00]' : 'bg-[#e17100]'}`} />
                {site.inverters_online}/{site.inverters_total} online
              </span>
              {segs.map((s) => (
                <span key={s.key} className={`text-[12px] font-semibold px-1.5 py-0.5 rounded ${STATE_META[s.key].text} ${STATE_META[s.key].bg}`}>
                  {s.count} {STATE_META[s.key].label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 sm:flex sm:items-center sm:justify-end sm:gap-10 tabular-nums shrink-0">
          <div className="sm:text-right"><p className="text-[10px] uppercase tracking-[0.08em] text-black/50 font-semibold">Power</p><p className="text-[17px] sm:text-[16px] font-semibold text-[#e17100] mt-1">{site.active_power_kw.toFixed(1)}<span className="text-black/40 text-[11px] font-medium ml-1">kW</span></p></div>
          <div className="sm:text-right"><p className="text-[10px] uppercase tracking-[0.08em] text-black/50 font-semibold">Today</p><p className="text-[17px] sm:text-[16px] font-semibold text-black mt-1">{site.energy_today_kwh?.toLocaleString() ?? '—'}<span className="text-black/40 text-[11px] font-medium ml-1">kWh</span></p></div>
          <ChevronRight size={18} className="hidden sm:block text-black/20 group-hover:text-[#e17100] transition-colors shrink-0" />
        </div>
      </div>

      {util !== null && (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 bg-black/[0.06] rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#e17100]" style={{ width: `${util}%` }} /></div>
          <span className="text-[11px] text-black/45 tabular-nums shrink-0">{util}% of {site.ac_capacity_kw!.toLocaleString()} kW AC</span>
        </div>
      )}
    </button>
  )
}


// ============================================================
// TEMP — Admin inverter-status test section. Throwaway; remove after testing.
// Consumes /influx/admin/inverter-status/. All TEMP-tagged.
// ============================================================

// TEMP status code → colour + card tint. 0 Stopped · 1 Running · 2 Standby · 4 Warning · 8 Fault
const TEMP_STATUS: Record<number, { label: string; dot: string; text: string; seg: string; card: string }> = {
  0: { label: 'Stopped', dot: 'bg-black/40',  text: 'text-black/60',  seg: '#9ca3af', card: 'bg-black/[0.03] border-black/10' },
  1: { label: 'Running', dot: 'bg-green-500', text: 'text-green-700', seg: '#22c55e', card: 'bg-green-500/[0.07] border-green-600/20' },
  2: { label: 'Standby', dot: 'bg-black/30',  text: 'text-black/55',  seg: '#cbd5e1', card: 'bg-black/[0.03] border-black/10' },
  4: { label: 'Warning', dot: 'bg-[#e17100]', text: 'text-[#e17100]', seg: '#e17100', card: 'bg-[#e17100]/[0.08] border-[#e17100]/25' },
  8: { label: 'Fault',   dot: 'bg-red-600',   text: 'text-red-600',   seg: '#dc2626', card: 'bg-red-600/[0.06] border-red-600/25' },
}
const tempStatusMeta = (code: number) =>
  TEMP_STATUS[code] ?? { label: `Code ${code}`, dot: 'bg-black/30', text: 'text-black/50', seg: '#94a3b8', card: 'bg-black/[0.03] border-black/10' }

// TEMP types — mirror the admin payload
interface TempStatePoint { code: number; label: string; start: string; end: string | null }

interface TempInverter {
  device_id: string
  name: string
  current: { code: number; label: string; since: string } | null   // null when offline / not reporting
  history: TempStatePoint[]
}
interface TempSite {
  site_id: number
  site_name: string
  influx_site_id: string
  customer: string
  inverters: TempInverter[]
}
interface TempStatusData { history_window_hours: number; sites: TempSite[] }

// TEMP — IST clock
function tempTime(iso: string | null) {
  if (!iso) return 'now'
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })
}

// TEMP — inverters ascending by device_id (numeric-aware)
const tempSorted = (invs: TempInverter[]) =>
  [...invs].sort((a, b) => a.device_id.localeCompare(b.device_id, undefined, { numeric: true }))

// TEMP — small labelled sub-header with a coloured bar
function TempSubHead({ label, color, caption }: { label: string; color: string; caption: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="w-1 h-4 rounded-full" style={{ background: color }} />
        <h3 className="text-[15px] font-semibold text-black">{label}</h3>
      </div>
      <p className="text-[12px] text-black/50 mt-1">{caption}</p>
    </div>
  )
}

// TempLiveCard — line 283
function TempLiveCard({ inv }: { inv: TempInverter }) {
  // current is null when the inverter isn't reporting a device state (offline / no upstream data)
  if (!inv.current) {
    return (
      <div className="rounded-lg border px-2.5 py-2 bg-black/[0.03] border-black/10">
        <p className="text-[12px] font-semibold text-black truncate leading-tight">{inv.name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-black/25" />
          <span className="text-[11px] font-semibold truncate text-black/45">No data</span>
        </div>
        <p className="text-[10px] text-black/35 mt-0.5">—</p>
      </div>
    )
  }
  const m = tempStatusMeta(inv.current.code)
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${m.card}`}>
      <p className="text-[12px] font-semibold text-black truncate leading-tight">{inv.name}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.dot}`} />
        <span className={`text-[11px] font-semibold truncate ${m.text}`}>{inv.current.label}</span>
      </div>
      <p className="text-[10px] text-black/45 mt-0.5">since {tempTime(inv.current.since)}</p>
    </div>
  )
}

// TEMP — proportional status timeline for one inverter over the window
function TempTimeline({ history }: { history: TempStatePoint[] }) {
  const segs = [...history].reverse()   // oldest → newest, left → right
  if (!segs.length) return <div className="h-3 rounded bg-black/[0.06]" />

  const now = Date.now()
  const t0 = new Date(segs[0].start).getTime()
  const t1 = Math.max(now, ...segs.map((s) => new Date(s.end ?? now).getTime()))
  const span = Math.max(1, t1 - t0)

  return (
    <div className="flex h-3 rounded overflow-hidden bg-black/[0.06]">
      {segs.map((s, i) => {
        const a = new Date(s.start).getTime()
        const b = new Date(s.end ?? now).getTime()
        const m = tempStatusMeta(s.code)
        return (
          <div
            key={i}
            title={`${s.label} · ${tempTime(s.start)}–${tempTime(s.end)}`}
            style={{
              width: `${((b - a) / span) * 100}%`,
              minWidth: s.code === 8 || s.code === 4 ? 3 : 1,   // keep faults/warnings visible
              background: m.seg,
            }}
          />
        )
      })}
    </div>
  )
}

// TEMP — HISTORY: one inverter's timeline + plain-language fault/warning callouts
function TempHistoryRow({ inv }: { inv: TempInverter }) {
  const events = inv.history.filter((h) => h.code === 8 || h.code === 4)
  return (
    <div className="py-3 border-b border-black/[0.06] last:border-0">
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center sm:gap-4">
        <p className="text-[13px] font-semibold text-black truncate">{inv.name}</p>
        <TempTimeline history={inv.history} />
      </div>
      {events.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 sm:pl-[166px]">
          {events.map((e, i) => {
            const m = tempStatusMeta(e.code)
            return (
              <span key={i} className={`text-[11px] font-medium rounded-md border px-2 py-0.5 ${m.card}`}>
                <span className={m.text}>{e.label}</span>
                <span className="text-black/45"> · {tempTime(e.start)}–{tempTime(e.end)}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// TEMP — the whole admin-only section. Self-contained fetch. Remove after testing.
function TempFaultsSection() {
  const [data, setData] = useState<TempStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get<TempStatusData>('/influx/admin/inverter-status/')
      setData(res.data); setErr(null)
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? 'Failed to load inverter status.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])
  useAutoRefresh(fetchStatus, { intervalMs: 60_000 })   // TEMP: live-ish while testing

  const windowH = data?.history_window_hours ?? 12
  const flagged = data?.sites.reduce(
    (n, s) => n + s.inverters.reduce((m, inv) => m + inv.history.filter((h) => h.code === 8 || h.code === 4).length, 0),
    0,
  ) ?? 0

  return (
    <>
      <Divider />
      <section className="pt-8 space-y-8">
        {/* TEMP section — remove after inverter-status testing */}
        <SectionHeader
          title="Temporary Faults"
          meta={loading
            ? 'Loading…'
            : `Inverter status · last ${windowH}h · ${flagged} fault/warning event${flagged !== 1 ? 's' : ''} — TEMP TEST`}
          accent="none"
        />

        {err && <p className="text-[13px] text-red-600">{err}</p>}

        {!loading && !err && data && (
          <>
            {/* ---- LIVE (top) ---- */}
            <div>
              <TempSubHead label="Live Status" color="#497d00" caption="Current status of every inverter, grouped by site." />
              <div className="space-y-5">
                {data.sites.map((site) => (
                  <div key={site.site_id}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <h4 className="text-[13px] font-semibold text-black">{site.site_name}</h4>
                      <span className="text-[12px] text-black/45 truncate">{site.customer}</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                      {tempSorted(site.inverters).map((inv) => <TempLiveCard key={inv.device_id} inv={inv} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ---- HISTORY (below) ---- */}
            <div>
              <TempSubHead
                label="Recent Changes"
                color="#e17100"
                caption={`Each bar is the last ${windowH} hours — left is older, right is now. Hover a segment for details.`}
              />

              {/* TEMP legend */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4">
                {([1, 0, 2, 4, 8] as number[]).map((code) => {
                  const m = tempStatusMeta(code)
                  return (
                    <span key={code} className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.seg }} />
                      <span className="text-[11px] text-black/55 font-medium">{m.label}</span>
                    </span>
                  )
                })}
              </div>

              <div className="space-y-5">
                {data.sites.map((site) => (
                  <div key={site.site_id}>
                    <h4 className="text-[13px] font-semibold text-black mb-1">{site.site_name}</h4>
                    {tempSorted(site.inverters).map((inv) => <TempHistoryRow key={inv.device_id} inv={inv} />)}
                  </div>
                ))}
              </div>
            </div>

            {data.sites.length === 0 && <p className="text-[13px] text-black/50">No inverter status data.</p>}
          </>
        )}
      </section>
    </>
  )
}






// ============================================================
// Main Page
// ============================================================

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null)
  const [loading, setLoading] = useState(true)

  const { user } = useAuth()
  // A customer already knows who they are — grouping their own sites under
  // their own name repeats the page heading for no information gain.
  const groupByCustomer = user?.role !== 'CUSTOMER'
  const allSites = data?.customers.flatMap((c) => c.sites) ?? []

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get<PortfolioData>('/influx/portfolio/overview/')
      setData(res.data)
    } catch (err) {
      console.error('Portfolio overview error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOverview() }, [fetchOverview])

  // Same refresh model as PlantOverview: 60s interval while visible, immediate
  // refetch on wake (visibility/focus/pageshow/online), manual button bypasses throttle.
  const { refetch, isRefetching } = useAutoRefresh(fetchOverview, {
    intervalMs: 60_000,
  })

  const fleet = data?.portfolio_summary

  const fleetUtil = fleet?.ac_capacity_kw
    ? Math.round((fleet.total_active_power_kw / fleet.ac_capacity_kw) * 100)
    : 0


  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading portfolio…</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl px-0 mx-auto sm:px-6 md:px-4 lg:px-2 xl:px-0 pb-10">

      {/* ============ HEADER ============ */}
      <header className="pb-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6">
        {/* Refresh + timestamp */}
        <div className="order-1 sm:order-2 shrink-0">
          <button
            type="button"
            onClick={refetch}
            disabled={isRefetching}
            className="h-10 px-4 flex items-center gap-2 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold"
          >
            <RefreshCw size={14} strokeWidth={2} className={isRefetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Title block */}
        <div className="order-2 sm:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 rounded-full bg-[#e17100] shrink-0 self-stretch" />
            <div className="min-w-0">
              <p className={T.eyebrow}>{groupByCustomer ? 'Portfolio Overview' : 'Your Sites'}</p>
              <h1 className={`${T.siteH1} mt-2`}>{data?.scope_name ?? 'All Sites'}</h1>
              <p className={`${T.meta} text-black/50 mt-2`}>
                {groupByCustomer && (
                  <>{data?.customers.length ?? 0} customer{(data?.customers.length ?? 0) !== 1 ? 's' : ''} · </>
                )}
                {fleet?.sites_total ?? 0} site{(fleet?.sites_total ?? 0) !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ============ FLEET KPIS ============ */}
      <Divider />
      <section className="pt-8 pb-2">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-0 lg:divide-x lg:divide-black/15">

          {/* Hero — Total Active Power */}
          <div className="lg:pr-10 min-w-0">
            <div className="relative flex items-stretch gap-3">
              <span className="w-1 rounded-full bg-[#e17100] shrink-0 self-stretch" />
              <div className="flex-1 min-w-0 rounded-2xl bg-gradient-to-b from-[#e17100]/[0.05] to-transparent px-5 py-5">
                <div className="flex items-center justify-between mb-4">
                  <p className={T.eyebrow}>Total Active Power</p>
                  <Zap size={16} className="text-[#e17100]" strokeWidth={2} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className={T.metricXL}>
                    {fleet?.total_active_power_kw.toLocaleString(undefined, { maximumFractionDigits: 1 }) ?? '—'}
                  </span>
                  <span className={T.unit}>kW</span>
                </div>

                {/* Fleet utilisation vs total AC capacity — only shown when the
                    endpoint provides ac_capacity_kw; degrades gracefully otherwise. */}
                {fleet?.ac_capacity_kw ? (
                  <div className="mt-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-black/50 font-medium">Fleet utilisation</span>
                      <span className="text-[12px] font-semibold text-[#e17100] tabular-nums">{fleetUtil}%</span>
                    </div>
                    <div className="h-2 bg-black/[0.06] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#e17100]" style={{ width: `${fleetUtil}%` }} />
                    </div>
                    <p className="text-[11px] text-black/40 mt-1.5 tabular-nums">
                      of {fleet.ac_capacity_kw.toLocaleString()} kW AC capacity
                    </p>
                  </div>
                ) : (
                  <p className="text-[12px] text-[#497d00] font-semibold mt-3">Live across all sites</p>
                )}
              </div>
            </div>
          </div>

          {/* Rail — the three supporting metrics */}
          <div className="lg:pl-10 flex flex-col justify-center divide-y divide-black/10">
            <div className="flex items-center justify-between py-3.5 gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <TrendingUp size={15} className="text-black/40 shrink-0" strokeWidth={2} />
                <span className={T.eyebrow}>Energy Today</span>
              </div>
              <span className={`${T.metricL} shrink-0`}>
                {fleet?.total_energy_today_kwh?.toLocaleString() ?? '—'}
                <span className={`${T.unit} ml-1`}>kWh</span>
              </span>
            </div>

            <div className="flex items-center justify-between py-3.5 gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <Building2 size={15} className="text-black/40 shrink-0" strokeWidth={2} />
                <span className={T.eyebrow}>Sites Online</span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={T.metricL}>
                  {fleet?.sites_online ?? '—'}<span className={`${T.unit} ml-1`}>/ {fleet?.sites_total ?? '—'}</span>
                </span>
                {fleet && <HealthFooter online={fleet.sites_online} total={fleet.sites_total} />}
              </div>
            </div>

            <div className="flex items-center justify-between py-3.5 gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <Cpu size={15} className="text-black/40 shrink-0" strokeWidth={2} />
                <span className={T.eyebrow}>Inverters Online</span>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={T.metricL}>
                  {fleet?.inverters_online ?? '—'}<span className={`${T.unit} ml-1`}>/ {fleet?.inverters_total ?? '—'}</span>
                </span>
                {fleet && <HealthFooter online={fleet.inverters_online} total={fleet.inverters_total} />}
              </div>
            </div>
            <div className="flex items-start justify-between py-3.5 gap-4">
              <div className="flex items-center gap-2.5 min-w-0 pt-0.5">
                <Activity size={15} className="text-black/40 shrink-0" strokeWidth={2} />
                <span className={T.eyebrow}>Inverter Status</span>
              </div>
              {fleet && Object.values(fleet.states).some((v) => v > 0) ? (
                <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1.5 shrink-0">
                  {STATE_ORDER.map((k) => {
                    const c = fleet.states[k]
                    if (c <= 0) return null
                    return (
                      <span key={k} className="inline-flex items-baseline gap-1.5">
                        <span className={`text-[18px] font-semibold tabular-nums leading-none ${STATE_META[k].text}`}>{c}</span>
                        <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-black/45">{STATE_META[k].label}</span>
                      </span>
                    )
                  })}
                </div>
              ) : (
                <span className="text-[13px] text-black/40">—</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ============ CUSTOMERS ============ */}
      <Divider />
      <section className="pt-8 space-y-5">
        <SectionHeader
          title={groupByCustomer ? 'Customers' : 'Sites'}
          meta={groupByCustomer ? 'Sites grouped by customer' : 'Select a site to view its plant overview'}
          accent="orange"
        />

        {groupByCustomer
          ? data?.customers.map((customer) => (
              <CustomerBlock key={customer.customer_id} customer={customer} />
            ))
          : <FlatSiteList sites={allSites} />}

        {allSites.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Gauge size={22} className="text-black/25" />
            <p className={`${T.meta} text-black/50`}>No sites found.</p>
          </div>
        )}
      </section>

      {/* ============ TEMP — ADMIN INVERTER STATUS TEST (remove after testing) ============ */}
        {user?.role === 'ADMIN' && <TempFaultsSection />}
    </div>
  )
}