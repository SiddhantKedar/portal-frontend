import { useEffect, useState } from 'react'
import { Zap, TrendingUp, Building2, Cpu, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import api from '@/api/axios'

// ---- Types ----

interface FleetSummary {
  total_active_power_kw: number
  total_energy_today_kwh: number
  sites_online: number
  sites_total: number
  inverters_online: number
  inverters_total: number
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
}

// ---- Helpers ----

function formatLastUpdated(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---- KPI Card — matches PlantOverviewPage ----

function KpiCard({
  title, value, unit, icon: Icon, accent = false, footer,
}: {
  title: string
  value: string | number
  unit: string
  icon: React.ElementType
  accent?: boolean
  footer?: string
}) {
  return (
    <div className={`bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] px-4 py-4 ${accent ? 'border-l-amber-600' : 'border-l-[#E5E5E5]'}`}>
      <div className="flex items-start justify-between mb-2.5">
        <p className="text-[14px] uppercase tracking-wider text-black-400 font-medium">{title}</p>
        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${accent ? 'bg-amber-600/10' : 'bg-[#FAFAFA]'}`}>
          <Icon size={13} className={accent ? 'text-amber-600' : 'text-gray-400'} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-black tracking-tight leading-none">
          {value}
        </span>
        <span className="text-[12px] text-black-400">{unit}</span>
      </div>
      {footer && (
        <div className="flex items-center gap-1.5 mt-2">
          {accent && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
          <span className="text-[11px] text-green-700">{footer}</span>
        </div>
      )}
    </div>
  )
}

// ---- Fleet health bar ----

function HealthBar({ label, online, total }: { label: string; online: number; total: number }) {
  const pct = total > 0 ? Math.round((online / total) * 100) : 0
  const allGood = online === total
  return (
    <div className="flex-1 min-w-[140px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{label}</span>
        <span className={`text-[12px] font-semibold ${allGood ? 'text-green-700' : 'text-amber-600'}`}>
          {online} / {total}
        </span>
      </div>
      <div className="h-1.5 bg-[#F1F1F1] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${allGood ? 'bg-green-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">{pct}% online</p>
    </div>
  )
}

// ---- Per-customer site table ----

function CustomerCard({ customer }: { customer: CustomerSummary }) {
  const totalPower = customer.sites.reduce((sum, s) => sum + s.active_power_kw, 0)
  const totalEnergy = customer.sites.reduce((sum, s) => sum + s.energy_today_kwh, 0)
  const sitesOnline = customer.sites.filter((s) => s.meter_online).length

  return (
    <Card className="border-[#E5E5E5] shadow-none rounded-xl">
      <CardHeader className="pb-0 px-6 pt-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-[18px] font-semibold text-black">
              {customer.customer_name}
            </CardTitle>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {customer.sites.length} site{customer.sites.length !== 1 ? 's' : ''}
            </p>
          </div>
          {/* Customer-level summary pills */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-gray-400 uppercase tracking-wide">Active Power</span>
              <span className="text-[16px] font-bold text-black leading-tight">
                {totalPower.toFixed(1)}
                <span className="text-[11px] text-gray-400 font-normal ml-1">kW</span>
              </span>
            </div>
            <div className="w-px h-8 bg-[#E5E5E5]" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-gray-400 uppercase tracking-wide">Energy Today</span>
              <span className="text-[16px] font-bold text-black leading-tight">
                {totalEnergy.toLocaleString()}
                <span className="text-[11px] text-gray-400 font-normal ml-1">kWh</span>
              </span>
            </div>
            <div className="w-px h-8 bg-[#E5E5E5]" />
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${
              sitesOnline === customer.sites.length
                ? 'bg-green-500/10 text-green-700'
                : 'bg-amber-500/10 text-amber-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sitesOnline === customer.sites.length ? 'bg-green-500' : 'bg-amber-500'}`} />
              {sitesOnline} / {customer.sites.length} metered
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-5 pt-4">
        <div className="rounded-lg border border-[#E5E5E5] overflow-x-auto">
          <table className="w-full text-[13px] min-w-[700px]">
            <thead>
              <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA]">
                <th className="text-left text-[11px] uppercase tracking-wider text-gray-400 font-semibold px-4 py-2.5">
                  Site
                </th>
                <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-semibold px-3 py-2.5 whitespace-nowrap">
                  Active Power <span className="text-gray-400">(kW)</span>
                </th>
                <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-semibold px-3 py-2.5 whitespace-nowrap">
                  Energy Today <span className="text-gray-400">(kWh)</span>
                </th>
                <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-semibold px-3 py-2.5 whitespace-nowrap">
                  Inverters
                </th>
                <th className="text-center text-[11px] uppercase tracking-wider text-gray-400 font-semibold px-3 py-2.5 whitespace-nowrap">
                  Meter
                </th>
                <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-semibold px-3 py-2.5 whitespace-nowrap">
                  Last Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {customer.sites.map((site, i) => (
                <tr
                  key={site.site_id}
                  className={`border-b border-[#F1F1F1] hover:bg-[#FAFAFA] transition-colors ${i % 2 === 1 ? 'bg-[#FAFAFA]' : 'bg-white'}`}
                >
                  <td className="py-3 px-4 font-medium text-black">
                    {site.site_name}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {site.active_power_kw.toFixed(1)}
                  </td>
                  <td className="py-3 px-3 text-right text-black font-medium tabular-nums">
                    {site.energy_today_kwh.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    <span className={`font-medium ${site.inverters_online === site.inverters_total ? 'text-green-700' : 'text-amber-600'}`}>
                      {site.inverters_online}
                    </span>
                    <span className="text-gray-400 text-[11px]"> / {site.inverters_total}</span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      site.meter_online ? 'bg-green-500/10 text-green-700' : 'bg-red-50 text-red-500'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${site.meter_online ? 'bg-green-500' : 'bg-red-400'}`} />
                      {site.meter_online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right text-gray-400 text-[12px]">
                    {formatLastUpdated(site.last_updated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- Main Page ----

export default function InstallerOverviewPage() {
  const [data, setData] = useState<InstallerOverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true)
      try {
        const res = await api.get<InstallerOverviewData>('/influx/installer/overview/')
        setData(res.data)
      } catch (err) {
        console.error('Installer overview error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchOverview()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-[13px] text-gray-400">Loading fleet overview...</p>
      </div>
    )
  }

  const fleet = data?.fleet_summary

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-black tracking-tight">
          Fleet Overview
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {data?.customers.length ?? 0} customer{(data?.customers.length ?? 0) !== 1 ? 's' : ''} · {fleet?.sites_total ?? 0} site{(fleet?.sites_total ?? 0) !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Fleet KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Total Active Power"
          value={fleet?.total_active_power_kw.toFixed(1) ?? '—'}
          unit="kW"
          icon={Zap}
          accent
          footer="Live across all sites"
        />
        <KpiCard
          title="Total Energy Today"
          value={fleet?.total_energy_today_kwh.toLocaleString() ?? '—'}
          unit="kWh"
          icon={TrendingUp}
          accent
          footer="Today so far"
        />
        <KpiCard
          title="Sites Online"
          value={fleet?.sites_online ?? '—'}
          unit={`/ ${fleet?.sites_total ?? '—'}`}
          icon={Building2}
          footer={fleet?.sites_online === fleet?.sites_total ? 'All operational' : 'Some sites offline'}
        />
        <KpiCard
          title="Inverters Online"
          value={fleet?.inverters_online ?? '—'}
          unit={`/ ${fleet?.inverters_total ?? '—'}`}
          icon={Cpu}
          footer={fleet?.inverters_online === fleet?.inverters_total ? 'All operational' : 'Some inverters offline'}
        />
      </div>

      {/* Fleet health bars */}
      {fleet && (
        <Card className="border-[#E5E5E5] shadow-none rounded-xl">
          <CardContent className="px-6 py-4">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-3">Fleet Health</p>
            <div className="flex gap-8 flex-wrap">
              <HealthBar label="Sites" online={fleet.sites_online} total={fleet.sites_total} />
              <HealthBar label="Inverters" online={fleet.inverters_online} total={fleet.inverters_total} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-customer site tables */}
      {data?.customers.map((customer) => (
        <CustomerCard key={customer.customer_id} customer={customer} />
      ))}

      {data?.customers.length === 0 && (
        <div className="flex items-center justify-center h-40">
          <p className="text-[13px] text-gray-400">No customers found.</p>
        </div>
      )}

    </div>
  )
}