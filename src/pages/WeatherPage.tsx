import { useEffect, useState } from 'react'
import { Sun, Thermometer, Wind, Compass, Gauge, CloudRain, Droplets, Clock } from 'lucide-react'
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

// ---- KPI Card ----

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
    <div className={`bg-white rounded-xl border border-[#E2E8F0] border-l-[3px] px-4 py-4 ${accent ? 'border-l-[#22C55E]' : 'border-l-[#E2E8F0]'}`}>
      <div className="flex items-start justify-between mb-2.5">
        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">{title}</p>
        <div className={`w-6 h-6 rounded-md flex items-center justify-center ${accent ? 'bg-[#22C55E]/10' : 'bg-[#F4F6F9]'}`}>
          <Icon size={13} className={accent ? 'text-[#22C55E]' : 'text-gray-400'} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[24px] font-semibold text-[#0F1E3C] tracking-tight leading-none">
          {value}
        </span>
        <span className="text-[12px] text-gray-400">{unit}</span>
      </div>
      {footer && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[11px] text-gray-400">{footer}</span>
        </div>
      )}
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
        <h1 className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight">
          Weather Station
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {data?.site} · {data?.device} · Last updated {data?.last_updated ? formatLastUpdated(data.last_updated) : '—'}
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ml-1 ${
            data?.status === 'online' ? 'bg-[#22C55E]/10 text-[#16A34A]' : 'bg-red-50 text-red-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${data?.status === 'online' ? 'bg-[#22C55E]' : 'bg-red-400'}`} />
            {data?.status ?? '—'}
          </span>
        </p>
      </div>

      {/* Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Solar Irradiation"
          value={data?.irradiation_inclined_wm2.toFixed(1) ?? '—'}
          unit="W/m²"
          icon={Sun}
          accent
          footer="Inclined plane"
        />
        <KpiCard
          title="Ambient Temp"
          value={data?.ambient_temp_c.toFixed(1) ?? '—'}
          unit="°C"
          icon={Thermometer}
          footer="Air temperature"
        />
        <KpiCard
          title="Module Temp"
          value={data?.module_temp_c.toFixed(1) ?? '—'}
          unit="°C"
          icon={Thermometer}
          footer="Panel surface"
        />
        <KpiCard
          title="Humidity"
          value={data?.humidity_pct.toFixed(1) ?? '—'}
          unit="%"
          icon={Droplets}
          footer="Relative humidity"
        />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Wind Speed"
          value={data?.wind_speed_ms.toFixed(1) ?? '—'}
          unit="m/s"
          icon={Wind}
          footer="Average speed"
        />
        <KpiCard
          title="Wind Direction"
          value={data?.wind_direction_deg.toFixed(1) ?? '—'}
          unit="°"
          icon={Compass}
          footer="Degrees from north"
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
  )
}