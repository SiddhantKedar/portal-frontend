import { useCallback, useEffect, useState } from 'react'
import { Zap, TrendingUp, Building2, Cpu, RefreshCw, ChevronRight, Gauge } from 'lucide-react'
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
  total_energy_today_kwh: number | null   // null when ?detail=basic
  ac_capacity_kw?: number
  sites_online: number
  sites_total: number
  inverters_online: number
  inverters_total: number
}

interface SiteSummary {
  site_id: number
  site_name: string
  installer_name: string | null
  active_power_kw: number
  energy_today_kwh: number | null
  meter_online: boolean
  inverters_online: number
  inverters_total: number
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
        {allGood ? 'All operational' : `${total - online} offline`}
      </span>
    </span>
  )
}

// ============================================================
// Per-customer card — site rows in the PlantOverview visual language
// ============================================================

function CustomerBlock({ customer }: { customer: CustomerSummary }) {
  const navigate = useNavigate()
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
          <SiteRow
            key={site.site_id}
            site={site}
            share={totalPower > 0 ? Math.round((site.active_power_kw / totalPower) * 100) : 0}
          />
        ))}
      </div>
    </div>
  )
}

function FlatSiteList({ sites }: { sites: SiteSummary[] }) {
  const totalPower = sites.reduce((sum, s) => sum + s.active_power_kw, 0)
  return (
    <div className="rounded-2xl border border-black/15 overflow-hidden divide-y divide-black/[0.06]">
      {sites.map((site) => (
        <SiteRow
          key={site.site_id}
          site={site}
          share={totalPower > 0 ? Math.round((site.active_power_kw / totalPower) * 100) : 0}
          showInstaller
        />
      ))}
    </div>
  )
}

// Site Row

function SiteRow({
  site,
  share,
  showInstaller = false,
}: {
  site: SiteSummary
  share: number
  showInstaller?: boolean
}) {
  const navigate = useNavigate()
  const hasInverters = site.inverters_total > 0
  const invHealthy = hasInverters && site.inverters_online === site.inverters_total

  return (
    <button
      type="button"
      onClick={() => navigate(`/sites/${site.site_id}/plant`)}
      className="group w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-black/[0.02] transition-colors"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[13px] font-semibold text-black truncate group-hover:text-[#e17100] transition-colors">
            {site.site_name}
          </p>
          {!site.meter_online && (
            <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] font-semibold text-[#dc2626] border border-[#dc2626]/30 bg-[#dc2626]/[0.06] rounded px-1.5 py-0.5">
              Offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {share > 0 && (
            <div className="h-1 w-24 bg-black/[0.06] rounded-full overflow-hidden shrink-0">
              <div className="h-full rounded-full bg-[#e17100]" style={{ width: `${Math.min(share, 100)}%` }} />
            </div>
          )}
          <span className="text-[11px] text-black/40 tabular-nums truncate">
            {/* Customers see who maintains the plant — the one bit of context
                the customer-grouping layout was hiding from them. */}
            {showInstaller && site.installer_name
              ? `${site.installer_name} · ${formatLastUpdated(site.last_updated)}`
              : formatLastUpdated(site.last_updated)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-5 sm:gap-7 shrink-0 tabular-nums">
        <div className="text-right w-20">
          <p className="text-[10px] uppercase tracking-[0.08em] text-black/50 font-semibold">Power</p>
          <p className="text-[14px] font-semibold text-black mt-0.5">
            {site.active_power_kw.toFixed(1)}<span className="text-black/40 text-[11px] font-medium ml-1">kW</span>
          </p>
        </div>
        <div className="text-right w-24 hidden sm:block">
          <p className="text-[10px] uppercase tracking-[0.08em] text-black/50 font-semibold">Today</p>
          <p className="text-[14px] font-semibold text-black mt-0.5">
            {site.energy_today_kwh?.toLocaleString() ?? '—'}<span className="text-black/40 text-[11px] font-medium ml-1">kWh</span>
          </p>
        </div>
        <div className="text-right w-14 hidden md:block">
          <p className="text-[10px] uppercase tracking-[0.08em] text-black/50 font-semibold">Inv</p>
          <p className="text-[14px] font-semibold mt-0.5">
            {hasInverters ? (
              <>
                <span className={invHealthy ? 'text-[#497d00]' : 'text-[#e17100]'}>{site.inverters_online}</span>
                <span className="text-black/40 text-[11px]">/{site.inverters_total}</span>
              </>
            ) : (
              <span className="text-black/30">—</span>
            )}
          </p>
        </div>
        <ChevronRight size={16} className="text-black/20 group-hover:text-[#e17100] transition-colors shrink-0" />
      </div>
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