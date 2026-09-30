import { useCallback, useEffect, useState } from 'react'
import { Zap, TrendingUp, Cpu, RefreshCw, Building2, ChevronRight, Gauge, Activity, CalendarDays, Leaf } from 'lucide-react'
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
  total_energy_month_kwh: number | null  
  cuf_pct: number | null
  co2_avoided_today_kg: number | null 
  ac_capacity_kw?: number
  sites_online: number
  sites_total: number
  inverters_online: number
  inverters_total: number
  loggers_online?: number
  loggers_total?: number
  states: { running: number; stopped: number; standby: number; warning: number; fault: number; other: number }
}

interface SiteSummary {
  site_id: number
  site_name: string
  location: string
  installer_name: string | null
  active_power_kw: number
  energy_today_kwh: number | null
  energy_month_kwh: number | null        
  performance_ratio_pct: number | null   
  cuf_pct: number | null                   
  capabilities: { weather: boolean } 
  dc_capacity_kw: number | null
  ac_capacity_kw: number | null
  meter_online: boolean
  logger_online: boolean
  logger_last_seen: string | null
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

const RED_CHIP = 'shrink-0 text-[10px] uppercase tracking-[0.08em] font-semibold text-[#dc2626] border border-[#dc2626]/30 bg-[#dc2626]/[0.06] rounded px-1.5 py-0.5'

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

// Visual-only clustering of same-location sites. Location is never displayed.


interface SiteBlock { key: string; sites: SiteSummary[]; located: boolean }

function groupByLocation(sites: SiteSummary[]): SiteBlock[] {
  const byLoc = new Map<string, SiteSummary[]>()
  const loose: SiteSummary[] = []
  for (const s of sites) {
    const k = (s.location ?? '').trim().toLowerCase()
    if (!k) { loose.push(s); continue }
    const g = byLoc.get(k)
    if (g) g.push(s); else byLoc.set(k, [s])
  }
  const blocks: SiteBlock[] = [...byLoc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, g]) => ({ key: k, sites: g, located: true }))
  if (loose.length) blocks.push({ key: '__none__', sites: loose, located: false })
  return blocks
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


// Multi-site locations sit in a lifted white card; single-site locations and
// no-location sites render plain, aligned to the same inset.
function SiteGroups({ sites, showInstaller = false }: { sites: SiteSummary[]; showInstaller?: boolean }) {
  const blocks = groupByLocation(sites)

  return (
    <div className="p-2.5 space-y-2.5">
      {blocks.map((b) => (
        <div
          key={b.key}
          className={`rounded-xl overflow-hidden divide-y divide-black/[0.06] ${
            b.located && b.sites.length > 1
              ? 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.04]'
              : ''
          }`}
        >
          {b.sites.map((s) => (
            <SiteRow key={s.site_id} site={s} showInstaller={showInstaller} />
          ))}
        </div>
      ))}
    </div>
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
  const sitesOnline = customer.sites.filter((s) => s.logger_online).length
  const allOnline = sitesOnline === customer.sites.length

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
            <span className={`w-1.5 h-1.5 rounded-full ${allOnline ? 'bg-green-500' : 'bg-[#e17100]'}`} />
            <span className={allOnline ? 'text-green-700' : 'text-[#e17100]'}>
              {sitesOnline}/{customer.sites.length}
            </span>
          </span>
        </div>
      </div>

      <SiteGroups sites={customer.sites} />
    </div>
  )
}

function FlatSiteList({ sites }: { sites: SiteSummary[] }) {
  return (
    <div className="rounded-2xl border border-black/15 overflow-hidden">
      <SiteGroups sites={sites} showInstaller />
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
  // Fixed 5 slots; PR slot stays empty (not removed) so columns align across rows
  const metrics = [
    { label: 'Power',        value: site.active_power_kw.toLocaleString(undefined, { maximumFractionDigits: 1 }), unit: 'kW', accent: true },
    { label: 'Energy Today', value: site.energy_today_kwh?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', unit: 'kWh', accent: false },
    { label: 'This Month',   value: site.energy_month_kwh?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', unit: 'kWh', accent: false },
    { label: 'CUF',          value: site.cuf_pct?.toFixed(1) ?? '—', unit: '%', accent: false },
    site.capabilities?.weather
      ? { label: 'PR', value: site.performance_ratio_pct?.toFixed(1) ?? '—', unit: '%', accent: false }
      : null,
  ]

  return (
    <button type="button" onClick={() => navigate(`/sites/${site.site_id}/plant`)}
      className="group w-full text-left px-5 py-5 hover:bg-black/[0.02] transition-colors">

      <div className="flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-8">
        <div className="min-w-0 xl:flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[15px] font-semibold text-black truncate group-hover:text-[#e17100] transition-colors">{site.site_name}</p>
            {!site.logger_online && (<span className={RED_CHIP}>Offline</span>)}
            {!site.meter_online && (<span className={RED_CHIP}>Grid offline</span>)}
          </div>
          <p className="mt-1.5 text-[11px] text-black/40 truncate">
            {showInstaller && site.installer_name ? `${site.installer_name} · ` : ''}{formatLastUpdated(site.last_updated)}
          </p>
          {site.inverters_total > 0 && (
            <div className="mt-2 flex items-center flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-black whitespace-nowrap">
                <span className={`w-1.5 h-1.5 rounded-full ${allOnline ? 'bg-[#497d00]' : 'bg-[#e17100]'}`} />
                {site.inverters_online}/{site.inverters_total} online
              </span>
              {segs.map((s) => (
                <span key={s.key} className={`text-[12px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${STATE_META[s.key].text} ${STATE_META[s.key].bg}`}>
                  {s.count} {STATE_META[s.key].label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-[repeat(5,104px)] gap-x-4 gap-y-3 xl:gap-x-5 tabular-nums shrink-0">
          {metrics.map((m, i) => m ? (
            <div key={m.label} className="min-w-0 xl:text-right">
              <p className="text-[10px] uppercase tracking-[0.08em] text-black/50 font-semibold whitespace-nowrap">{m.label}</p>
              <p className={`text-[16px] font-semibold mt-1 whitespace-nowrap ${m.accent ? 'text-[#e17100]' : 'text-black'}`}>
                {m.value}<span className="text-black/40 text-[11px] font-medium ml-1">{m.unit}</span>
              </p>
            </div>
          ) : (
            <div key={`empty-${i}`} className="hidden sm:block" />
          ))}
        </div>

        <ChevronRight size={18} className="hidden xl:block text-black/20 group-hover:text-[#e17100] transition-colors shrink-0" />
      </div>

      {util !== null && (
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 bg-black/[0.06] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#e17100]" style={{ width: `${util}%` }} />
          </div>
          <span className="text-[11px] text-black/45 tabular-nums shrink-0">{util}% of {site.ac_capacity_kw!.toLocaleString()} kW AC</span>
        </div>
      )}
    </button>
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

  const fmtKwh = (v?: number | null) =>
    v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: 0 })

  // 86,837 kg reads better as 86.8 t; small sites stay in kg
  const fmtCo2 = (kg?: number | null) =>
    kg == null ? { value: '—', unit: 't' }
    : kg >= 1000 ? { value: (kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }), unit: 't' }
    : { value: kg.toLocaleString(undefined, { maximumFractionDigits: 0 }), unit: 'kg' }

  const energyKpis = [
    { label: 'Energy Today', icon: TrendingUp,   value: fmtKwh(fleet?.total_energy_today_kwh), unit: 'kWh' },
    { label: 'Energy This Month',   icon: CalendarDays, value: fmtKwh(fleet?.total_energy_month_kwh), unit: 'kWh' },
  ]

  const co2 = fmtCo2(fleet?.co2_avoided_today_kg)


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

          {/* Hero — generation: live power + energy */}
          <div className="lg:pr-10 min-w-0">
            <div className="relative flex items-stretch gap-3 h-full">
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

                {fleet?.ac_capacity_kw ? (
                  <div className="mt-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-black/50 font-medium">Capacity utilisation</span>
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

                {/* Energy strip: 2 items now, 3 columns on desktop once CO₂ is added */}
                <div className={`mt-6 pt-5 border-t border-black/10 grid grid-cols-2 ${energyKpis.length >= 3 ? 'sm:grid-cols-3' : ''} gap-x-6 gap-y-4`}>
                  {energyKpis.map((k) => (
                    <div key={k.label} className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-2">
                        <k.icon size={13} className="text-black/40 shrink-0" strokeWidth={2} />
                        <span className="text-[11px] uppercase tracking-[0.1em] font-semibold text-black/55 whitespace-nowrap">
                          {k.label}
                        </span>
                      </div>
                      <span className={T.metricL}>
                        {k.value}<span className={`${T.unit} ml-1`}>{k.unit}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Rail — the three supporting metrics */}
          <div className="lg:pl-10 flex flex-col justify-center divide-y divide-black/10">
            
            <div className="flex items-center justify-between py-3.5 gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <Leaf size={15} className="text-black/40 shrink-0" strokeWidth={2} />
                <span className={T.eyebrow}>CO₂ Avoided Today</span>
              </div>
              <span className={`${T.metricL} shrink-0`}>
                {co2.value}<span className={`${T.unit} ml-1`}>{co2.unit}</span>
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
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between py-3.5 gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
              <Activity size={15} className="text-black/40 shrink-0" strokeWidth={2} />
              <span className={`${T.eyebrow} whitespace-nowrap`}>Inverter Status</span>
            </div>
            {fleet && Object.values(fleet.states).some((v) => v > 0) ? (
              <div className="flex flex-wrap items-baseline justify-start sm:justify-end gap-x-4 gap-y-1.5 min-w-0">
                {STATE_ORDER.map((k) => {
                  const c = fleet.states[k]
                  if (c <= 0) return null
                  return (
                    <span key={k} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
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

      
    </div>
  )
}