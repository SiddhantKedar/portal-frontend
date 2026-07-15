import { useCallback, useEffect, useState } from 'react'
import { Zap, TrendingUp, Building2, Cpu, RefreshCw, ChevronRight, Gauge } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/axios'
import { useAutoRefresh } from '@/api/useAutoRefresh'

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

interface FleetSummary {
  total_active_power_kw: number
  total_energy_today_kwh: number
  sites_online: number
  sites_total: number
  inverters_online: number
  inverters_total: number
  ac_capacity_kw?: number
}

interface SiteSummary {
  site_id: number
  site_name: string
  active_power_kw: number
  energy_today_kwh: number
  meter_online: boolean
  inverters_online: number
  inverters_total: number
  last_updated: string
}

interface CustomerSummary {
  customer_id: number
  customer_name: string
  sites: SiteSummary[]
}

interface InstallerOverviewData {
  fleet_summary: FleetSummary
  customers: CustomerSummary[]
  installer_name: string
}

// ---- Helpers ----

function formatLastUpdated(iso: string) {
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

// Small online/total footer line with a status dot
function HealthFooter({ online, total }: { online: number; total: number }) {
  const allGood = total > 0 && online === total
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
  const totalEnergy = customer.sites.reduce((sum, s) => sum + s.energy_today_kwh, 0)
  const sitesOnline = customer.sites.filter((s) => s.meter_online).length
  const allMetered = sitesOnline === customer.sites.length

  return (
    <div className="rounded-2xl border border-black/15 overflow-hidden">
      {/* Header strip */}
      <div className="flex items-start justify-between flex-wrap gap-4 px-6 py-5 border-b border-black/10">
        <button
          type="button"
          onClick={() => navigate(`/customers/${customer.customer_id}`, { state: { customer } })}
          className="group flex items-center gap-2 min-w-0 text-left"
        >
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5">
              <h3 className="text-[18px] font-semibold text-black tracking-tight truncate group-hover:text-[#e17100] transition-colors">
                {customer.customer_name}
              </h3>
              <ChevronRight size={16} className="text-black/30 group-hover:text-[#e17100] transition-colors shrink-0" />
            </span>
            <p className="text-[12px] text-black/50 mt-0.5">
              {customer.sites.length} site{customer.sites.length !== 1 ? 's' : ''}
            </p>
          </div>
        </button>

        {/* Summary rail */}
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-[0.1em] text-black/50 font-semibold">Active Power</span>
            <span className={`${T.metricM} mt-1`}>
              {totalPower.toFixed(1)}<span className={`${T.unit} ml-1`}>kW</span>
            </span>
          </div>
          <span className="w-px h-8 bg-black/10" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-[0.1em] text-black/50 font-semibold">Energy Today</span>
            <span className={`${T.metricM} mt-1`}>
              {totalEnergy.toLocaleString()}<span className={`${T.unit} ml-1`}>kWh</span>
            </span>
          </div>
          <span className="w-px h-8 bg-black/10" />
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
            <span className={`w-1.5 h-1.5 rounded-full ${allMetered ? 'bg-green-500' : 'bg-[#e17100]'}`} />
            <span className={allMetered ? 'text-green-700' : 'text-[#e17100]'}>
              {sitesOnline}/{customer.sites.length} metered
            </span>
          </span>
        </div>
      </div>

      {/* Site table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[720px]">
          <thead>
            <tr className="border-b border-black/10">
              <th className="text-left text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold px-6 py-3">Site</th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold px-3 py-3 whitespace-nowrap">Active Power</th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold px-3 py-3 whitespace-nowrap">Energy Today</th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold px-3 py-3 whitespace-nowrap">Inverters</th>
              <th className="text-center text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold px-3 py-3 whitespace-nowrap">Meter</th>
              <th className="text-right text-[11px] uppercase tracking-[0.1em] text-black/50 font-semibold px-6 py-3 whitespace-nowrap">Updated</th>
            </tr>
          </thead>
          <tbody>
            {customer.sites.map((site) => {
              const invHealthy = site.inverters_online === site.inverters_total
              return (
                <tr
                  key={site.site_id}
                  onClick={() => navigate(`/customers/${customer.customer_id}`, { state: { customer } })}
                  className="border-b border-black/[0.06] last:border-0 hover:bg-black/[0.02] transition-colors cursor-pointer"
                >
                  <td className="py-3.5 px-6 font-semibold text-black">{site.site_name}</td>
                  <td className="py-3.5 px-3 text-right text-black font-medium tabular-nums">
                    {site.active_power_kw.toFixed(1)} <span className="text-black/40 text-[11px]">kW</span>
                  </td>
                  <td className="py-3.5 px-3 text-right text-black font-medium tabular-nums">
                    {site.energy_today_kwh.toLocaleString()} <span className="text-black/40 text-[11px]">kWh</span>
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums">
                    <span className={`font-semibold ${invHealthy ? 'text-green-700' : 'text-[#e17100]'}`}>
                      {site.inverters_online}
                    </span>
                    <span className="text-black/40 text-[11px]"> / {site.inverters_total}</span>
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                      <span className={`w-1.5 h-1.5 rounded-full ${site.meter_online ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className={site.meter_online ? 'text-green-700' : 'text-red-600'}>
                        {site.meter_online ? 'Online' : 'Offline'}
                      </span>
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right text-black/50 text-[12px] tabular-nums whitespace-nowrap">
                    {formatLastUpdated(site.last_updated)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Main Page
// ============================================================

export default function InstallerOverviewPage() {
  const [data, setData] = useState<InstallerOverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get<InstallerOverviewData>('/influx/installer/overview/')
      setData(res.data)
    } catch (err) {
      console.error('Installer overview error:', err)
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

  const fleet = data?.fleet_summary

  const fleetUtil = fleet?.ac_capacity_kw
    ? Math.round((fleet.total_active_power_kw / fleet.ac_capacity_kw) * 100)
    : 0


  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading fleet overview…</p>
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
              <p className={T.eyebrow}>Fleet Overview</p>
              <h1 className={`${T.siteH1} mt-2`}>{data?.installer_name ?? 'All Sites'}</h1>
              <p className={`${T.meta} text-black/50 mt-2`}>
                {data?.customers.length ?? 0} customer{(data?.customers.length ?? 0) !== 1 ? 's' : ''} · {fleet?.sites_total ?? 0} site{(fleet?.sites_total ?? 0) !== 1 ? 's' : ''}
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
                {fleet?.total_energy_today_kwh.toLocaleString() ?? '—'}
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
        <SectionHeader title="Customers" meta="Sites grouped by customer" accent="orange" />

        {data?.customers.map((customer) => (
          <CustomerBlock key={customer.customer_id} customer={customer} />
        ))}

        {data?.customers.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <Gauge size={22} className="text-black/25" />
            <p className={`${T.meta} text-black/50`}>No customers found.</p>
          </div>
        )}
      </section>

    </div>
  )
}