
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Zap, TrendingUp, Cpu, Gauge, Clock,
  Building2, Sun, Leaf, Activity
} from 'lucide-react'
import { Card, CardContent} from '@/components/ui/card'
import {
  AreaChart, Area, XAxis, YAxis,
  ResponsiveContainer, Tooltip
} from 'recharts'

// ---- Dummy Data ----

const CUSTOMER = {
  name: 'Sunrise Textiles Pvt Ltd',
  id: 1,
  since: 'March 2023',
  contact: 'Mr. Ramesh Agarwal',
  email: 'ramesh.agarwal@sunrisetextiles.com',
}

const SITES = [
  {
    id: 1,
    name: 'Sunrise Unit 1 — Surat',
    location: 'Surat, Gujarat',
    dc_capacity_kw: 500,
    ac_capacity_kw: 450,
    active_power_kw: 312.4,
    energy_today_kwh: 1842.6,
    performance_ratio_pct: 78.3,
    co2_avoided_kg: 1308.2,
    inverters_online: 4,
    inverters_total: 4,
    meter_online: true,
    last_updated: '09:41:22 AM',
    status: 'healthy',
    trend: [
      { t: '06:00', v: 12 }, { t: '07:00', v: 68 }, { t: '08:00', v: 145 },
      { t: '09:00', v: 230 }, { t: '10:00', v: 290 }, { t: '11:00', v: 312 },
    ],
  },
  {
    id: 2,
    name: 'Sunrise Unit 2 — Ahmedabad',
    location: 'Ahmedabad, Gujarat',
    dc_capacity_kw: 400,
    ac_capacity_kw: 350,
    active_power_kw: 198.7,
    energy_today_kwh: 1104.3,
    performance_ratio_pct: 71.6,
    co2_avoided_kg: 784.1,
    inverters_online: 3,
    inverters_total: 3,
    meter_online: true,
    last_updated: '09:41:18 AM',
    status: 'healthy',
    trend: [
      { t: '06:00', v: 8 }, { t: '07:00', v: 52 }, { t: '08:00', v: 110 },
      { t: '09:00', v: 165 }, { t: '10:00', v: 188 }, { t: '11:00', v: 199 },
    ],
  },
  {
    id: 3,
    name: 'Sunrise Warehouse — Vadodara',
    location: 'Vadodara, Gujarat',
    dc_capacity_kw: 300,
    ac_capacity_kw: 260,
    active_power_kw: 141.2,
    energy_today_kwh: 763.8,
    performance_ratio_pct: 74.1,
    co2_avoided_kg: 542.3,
    inverters_online: 2,
    inverters_total: 3,
    meter_online: true,
    last_updated: '09:40:55 AM',
    status: 'degraded', // one inverter offline
    trend: [
      { t: '06:00', v: 5 }, { t: '07:00', v: 38 }, { t: '08:00', v: 82 },
      { t: '09:00', v: 118 }, { t: '10:00', v: 135 }, { t: '11:00', v: 141 },
    ],
  },
]

// ---- Derived fleet totals ----

const FLEET = {
  totalPower: SITES.reduce((s, x) => s + x.active_power_kw, 0),
  totalEnergy: SITES.reduce((s, x) => s + x.energy_today_kwh, 0),
  totalCO2: SITES.reduce((s, x) => s + x.co2_avoided_kg, 0),
  invertersOnline: SITES.reduce((s, x) => s + x.inverters_online, 0),
  invertersTotal: SITES.reduce((s, x) => s + x.inverters_total, 0),
  sitesHealthy: SITES.filter((x) => x.status === 'healthy').length,
  avgPR: (SITES.reduce((s, x) => s + x.performance_ratio_pct, 0) / SITES.length).toFixed(1),
}

// ---- KPI Card ----

function KpiCard({
  title, value, unit, icon: Icon, accent = false, sub,
}: {
  title: string
  value: string | number
  unit: string
  icon: React.ElementType
  accent?: boolean
  sub?: string
}) {
  return (
    <div className={`bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] px-4 py-4
      ${accent ? 'border-l-amber-600' : 'border-l-[#E5E5E5]'}`}>
      <div className="flex items-start justify-between mb-2.5">
        <p className="text-[13px] uppercase tracking-wider text-gray-500 font-medium">{title}</p>
        <div className={`w-6 h-6 rounded-md flex items-center justify-center
          ${accent ? 'bg-amber-600/10' : 'bg-[#FAFAFA]'}`}>
          <Icon size={13} className={accent ? 'text-amber-600' : 'text-gray-400'} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-black tracking-tight leading-none">{value}</span>
        <span className="text-[12px] text-gray-400">{unit}</span>
      </div>
      {sub && <p className="text-[11px] text-gray-400 mt-1.5">{sub}</p>}
    </div>
  )
}

// ---- Mini sparkline inside site card ----

function Sparkline({ data }: { data: { t: string; v: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#e17100" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#e17100" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke="#e17100"
          strokeWidth={1.5}
          fill="url(#sparkGrad)"
          dot={false}
        />
        <XAxis dataKey="t" hide />
        <YAxis hide />
        <Tooltip
          contentStyle={{ fontSize: '10px', border: '0.5px solid #E5E5E5', borderRadius: '6px', boxShadow: 'none' }}
          formatter={(v: unknown) => [`${v} kW`, 'Power'] as [string, string]}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ---- Site Card ----

function SiteCard({ site }: { site: typeof SITES[0] }) {
  const allInvertersOnline = site.inverters_online === site.inverters_total
  const healthy = site.status === 'healthy'

  return (
    <Card className={`shadow-none rounded-xl border border-[#D4D4D4] border-l-[4px]
      ${healthy ? 'border-l-amber-600' : 'border-l-amber-400'}`}>
      <CardContent className="px-5 pt-5 pb-4">

        {/* Site header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-[15px] font-semibold text-black leading-tight">{site.name}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{site.location}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ml-2 ${
            healthy ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-700'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-green-500' : 'bg-amber-500'}`} />
            {healthy ? 'All systems normal' : '1 inverter offline'}
          </span>
        </div>

        <p className="text-[10px] text-gray-400 flex items-center gap-1 mb-3">
          <Clock size={9} /> Updated {site.last_updated}
        </p>

        {/* Sparkline */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Power today (kW)</p>
          <Sparkline data={site.trend} />
        </div>

        {/* Key metrics row */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-3">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Active Power</p>
            <p className="text-[18px] font-bold text-black leading-tight">
              {site.active_power_kw.toFixed(1)}
              <span className="text-[11px] text-gray-400 font-normal ml-1">kW</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Energy Today</p>
            <p className="text-[18px] font-bold text-black leading-tight">
              {site.energy_today_kwh.toLocaleString()}
              <span className="text-[11px] text-gray-400 font-normal ml-1">kWh</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Performance Ratio</p>
            <p className="text-[18px] font-bold text-black leading-tight">
              {site.performance_ratio_pct}
              <span className="text-[11px] text-gray-400 font-normal ml-0.5">%</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">CO₂ Avoided</p>
            <p className="text-[18px] font-bold text-black leading-tight">
              {site.co2_avoided_kg.toFixed(0)}
              <span className="text-[11px] text-gray-400 font-normal ml-1">kg</span>
            </p>
          </div>
        </div>

        {/* Capacity + status footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[#F1F1F1]">
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span>DC {site.dc_capacity_kw} kW</span>
            <span className="text-gray-300">|</span>
            <span>AC {site.ac_capacity_kw} kW</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              allInvertersOnline ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-700'
            }`}>
              <Cpu size={9} />
              {site.inverters_online}/{site.inverters_total} inv
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
              site.meter_online ? 'bg-green-500/10 text-green-700' : 'bg-red-50 text-red-500'
            }`}>
              <Gauge size={9} />
              {site.meter_online ? 'Metered' : 'No meter'}
            </span>
          </div>
        </div>

      </CardContent>
    </Card>
  )
}

// ---- Main Page ----

export default function CustomerOverviewPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Back + Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-black transition-colors mb-3"
        >
          <ArrowLeft size={13} />
          Back to Fleet Overview
        </button>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/10 flex items-center justify-center">
              <Building2 size={18} className="text-amber-600" />
            </div>
            <div>
              <h1 className="text-[20px] font-semibold text-black tracking-tight">
                {CUSTOMER.name}
              </h1>
              <p className="text-[12px] text-gray-400 mt-0.5">
                Customer since {CUSTOMER.since} · {CUSTOMER.contact} · {CUSTOMER.email}
              </p>
            </div>
          </div>

          {/* Overall status */}
          <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full ${
            FLEET.sitesHealthy === SITES.length
              ? 'bg-green-500/10 text-green-700'
              : 'bg-amber-500/10 text-amber-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              FLEET.sitesHealthy === SITES.length ? 'bg-green-500' : 'bg-amber-500'
            }`} />
            {FLEET.sitesHealthy}/{SITES.length} sites fully operational
          </span>
        </div>
      </div>

      {/* Fleet KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Total Active Power"
          value={FLEET.totalPower.toFixed(1)}
          unit="kW"
          icon={Zap}
          accent
          sub="Across all 3 sites"
        />
        <KpiCard
          title="Total Energy Today"
          value={FLEET.totalEnergy.toLocaleString()}
          unit="kWh"
          icon={TrendingUp}
          accent
          sub="Today so far"
        />
        <KpiCard
          title="Avg Performance Ratio"
          value={FLEET.avgPR}
          unit="%"
          icon={Activity}
          sub="Portfolio weighted"
        />
        <KpiCard
          title="CO₂ Avoided Today"
          value={FLEET.totalCO2.toFixed(0)}
          unit="kg"
          icon={Leaf}
          sub="Combined all sites"
        />
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#E5E5E5] px-5 py-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-[#FAFAFA] flex items-center justify-center">
            <Building2 size={16} className="text-gray-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400">Total DC Capacity</p>
            <p className="text-[20px] font-bold text-black">1,200 <span className="text-[12px] text-gray-400 font-normal">kW</span></p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E5E5] px-5 py-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-[#FAFAFA] flex items-center justify-center">
            <Cpu size={16} className="text-gray-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400">Inverters Online</p>
            <p className="text-[20px] font-bold text-black">
              <span className={FLEET.invertersOnline === FLEET.invertersTotal ? 'text-green-700' : 'text-amber-600'}>
                {FLEET.invertersOnline}
              </span>
              <span className="text-gray-400 text-[14px] font-normal"> / {FLEET.invertersTotal}</span>
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#E5E5E5] px-5 py-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg bg-[#FAFAFA] flex items-center justify-center">
            <Sun size={16} className="text-gray-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400">Total AC Capacity</p>
            <p className="text-[20px] font-bold text-black">1,060 <span className="text-[12px] text-gray-400 font-normal">kW</span></p>
          </div>
        </div>
      </div>

      {/* Site Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-semibold text-black">
            Sites <span className="text-gray-400 font-normal text-[14px]">({SITES.length})</span>
          </h2>
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Healthy</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Degraded</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {SITES.map((site) => (
            <SiteCard key={site.id} site={site} />
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[11px] text-gray-300 text-center pb-2">
        ⚠ This is a demo view with placeholder data — wire up to <code className="bg-[#FAFAFA] px-1 rounded">/influx/customer/overview/?customer=&#123;id&#125;</code> when the endpoint is ready
      </p>

    </div>
  )
}