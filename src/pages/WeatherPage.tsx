import { useEffect, useState } from 'react'
import { Sun, Thermometer, Wind, Gauge, CloudRain, Droplets, Clock } from 'lucide-react'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

// ---- Types ----

interface WeatherData {
  site: string
  device: string
  irradiation_inclined_wm2: number
  ambient_temp_c: number
  module_temp_c: number
  wind_speed_ms: number
  wind_direction_deg: number
  pressure_hpa: number
  rain_mm: number
  humidity_pct: number
  status: string
  last_updated: string
}

// ---- Helpers ----

function formatLastUpdated(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function compassLabel(deg: number) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

// ---- Compass Rose ----

function CompassRose({ deg }: { deg: number }) {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="36" stroke="#E5E5E5" strokeWidth="1.5" />
      <circle cx="40" cy="40" r="28" stroke="#F1F1F1" strokeWidth="1" />
      <text x="40" y="10" textAnchor="middle" fontSize="9" fill="#8A8A8A" fontWeight="600">N</text>
      <text x="40" y="75" textAnchor="middle" fontSize="9" fill="#8A8A8A" fontWeight="600">S</text>
      <text x="75" y="43" textAnchor="middle" fontSize="9" fill="#8A8A8A" fontWeight="600">E</text>
      <text x="5" y="43" textAnchor="middle" fontSize="9" fill="#8A8A8A" fontWeight="600">W</text>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((tick) => {
        const rad = (tick - 90) * (Math.PI / 180)
        const x1 = 40 + 29 * Math.cos(rad)
        const y1 = 40 + 29 * Math.sin(rad)
        const x2 = 40 + 35 * Math.cos(rad)
        const y2 = 40 + 35 * Math.sin(rad)
        return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E5E5E5" strokeWidth="1" />
      })}
      <g transform={`rotate(${deg}, 40, 40)`}>
        <polygon points="40,14 36,32 40,28 44,32" fill="#e17100" />
        <polygon points="40,66 36,48 40,52 44,48" fill="#D4D4D4" />
      </g>
      <circle cx="40" cy="40" r="3" fill="#e17100" />
    </svg>
  )
}

// ---- Standard KPI Card ----

function KpiCard({
  title, value, unit, icon: Icon, footer,
}: {
  title: string
  value: string | number
  unit: string
  icon: React.ElementType
  footer?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] border-l-[#E5E5E5] px-4 py-4">
      <div className="flex items-start justify-between mb-2.5">
        <p className="text-[14px] uppercase tracking-wider text-black-400 font-medium">{title}</p>
        <div className="w-6 h-6 rounded-md flex items-center justify-center bg-[#FAFAFA]">
          <Icon size={13} className="text-gray-400" />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-black tracking-tight leading-none">{value}</span>
        <span className="text-[12px] text-gray-400">{unit}</span>
      </div>
      {footer && <p className="text-[11px] text-gray-400 mt-2">{footer}</p>}
    </div>
  )
}

// ---- Featured Irradiation card ----

function IrradiationCard({ value }: { value: number }) {
  const intensity = value > 800 ? 'Excellent' : value > 500 ? 'Good' : value > 200 ? 'Moderate' : value > 0 ? 'Low' : 'None'
  const intensityColor = value > 800 ? 'text-amber-600' : value > 500 ? 'text-amber-500' : value > 200 ? 'text-amber-400' : 'text-gray-400'
  const barWidth = Math.min(100, (value / 1000) * 100)

  return (
    <div className="bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] border-l-amber-600 px-5 py-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[14px] uppercase tracking-wider text-black-400 font-medium">Solar Irradiation</p>
        <div className="w-7 h-7 rounded-md flex items-center justify-center bg-amber-600/10">
          <Sun size={15} className="text-amber-600" />
        </div>
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-[40px] font-bold text-black tracking-tight leading-none">{value.toFixed(0)}</span>
        <span className="text-[14px] text-gray-400 mb-1">W/m²</span>
      </div>
      <p className={`text-[12px] font-semibold mb-3 ${intensityColor}`}>{intensity}</p>
      <div className="h-1.5 bg-[#F1F1F1] rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-700"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-gray-400">0</span>
        <span className="text-[9px] text-gray-400">500</span>
        <span className="text-[9px] text-gray-400">1000 W/m²</span>
      </div>
    </div>
  )
}

// ---- Temperature card with delta ----

function TemperatureCard({ ambient, module }: { ambient: number; module: number }) {
  const delta = module - ambient

  return (
    <div className="bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] border-l-[#E5E5E5] px-5 py-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[14px] uppercase tracking-wider text-black-400 font-medium">Temperature</p>
        <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[#FAFAFA]">
          <Thermometer size={15} className="text-gray-400" />
        </div>
      </div>
      <div className="flex gap-5 mb-4">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Ambient</p>
          <p className="text-[28px] font-bold text-black leading-none">
            {ambient.toFixed(1)}
            <span className="text-[14px] text-gray-400 font-normal ml-0.5">°C</span>
          </p>
        </div>
        <div className="w-px bg-[#F1F1F1]" />
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Module</p>
          <p className="text-[28px] font-bold text-black leading-none">
            {module.toFixed(1)}
            <span className="text-[14px] text-gray-400 font-normal ml-0.5">°C</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-[#F1F1F1] pt-2.5">
        <span className="text-[11px] text-gray-400">Module is</span>
        <span className={`text-[12px] font-semibold ${delta > 10 ? 'text-amber-600' : 'text-black'}`}>
          +{delta.toFixed(1)}°C
        </span>
        <span className="text-[11px] text-gray-400">above ambient</span>
      </div>
    </div>
  )
}

// ---- Wind card with compass ----

function WindCard({ speed, direction }: { speed: number; direction: number }) {
  return (
    <div className="bg-white rounded-xl border border-[#D4D4D4] border-l-[4px] border-l-[#E5E5E5] px-5 py-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[14px] uppercase tracking-wider text-black-400 font-medium">Wind</p>
        <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[#FAFAFA]">
          <Wind size={15} className="text-gray-400" />
        </div>
      </div>
      <div className="flex items-center gap-5">
        <CompassRose deg={direction} />
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Speed</p>
            <p className="text-[26px] font-bold text-black leading-none">
              {speed.toFixed(1)}
              <span className="text-[13px] text-gray-400 font-normal ml-0.5">m/s</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Direction</p>
            <p className="text-[18px] font-bold text-black leading-none">
              {compassLabel(direction)}
              <span className="text-[12px] text-gray-400 font-normal ml-1.5">{direction.toFixed(0)}°</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----

export default function WeatherPage() {
  const { site } = useSite()
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!site?.id) return
    const fetchWeather = async () => {
      setLoading(true)
      try {
        const res = await api.get<WeatherData>(`/influx/weather/?site=${site.id}`)
        setData(res.data)
      } catch (err) {
        console.error('Weather error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchWeather()
  }, [site?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-[13px] text-gray-400">Loading weather data...</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-black tracking-tight">
          Weather Station
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {data?.site} · {data?.device} · Last updated {data?.last_updated ? formatLastUpdated(data.last_updated) : '—'}
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ml-1 ${
            data?.status === 'online' ? 'bg-green-500/10 text-green-700' : 'bg-red-50 text-red-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${data?.status === 'online' ? 'bg-green-500' : 'bg-red-400'}`} />
            {data?.status ?? '—'}
          </span>
        </p>
      </div>

      {/* Row 1 — Solar + Temperature (featured) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IrradiationCard value={data?.irradiation_inclined_wm2 ?? 0} />
        <TemperatureCard
          ambient={data?.ambient_temp_c ?? 0}
          module={data?.module_temp_c ?? 0}
        />
      </div>

      {/* Row 2 — Wind (with compass) + atmospheric */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <WindCard
          speed={data?.wind_speed_ms ?? 0}
          direction={data?.wind_direction_deg ?? 0}
        />
        <div className="md:col-span-2 grid grid-cols-2 gap-4">
          <KpiCard
            title="Humidity"
            value={data?.humidity_pct.toFixed(1) ?? '—'}
            unit="%"
            icon={Droplets}
            footer="Relative humidity"
          />
          <KpiCard
            title="Pressure"
            value={data?.pressure_hpa.toFixed(1) ?? '—'}
            unit="hPa"
            icon={Gauge}
            footer="Atmospheric"
          />
          <KpiCard
            title="Rainfall"
            value={data?.rain_mm.toFixed(1) ?? '—'}
            unit="mm"
            icon={CloudRain}
            footer="Accumulated"
          />
        </div>
      </div>

    </div>
  )
}