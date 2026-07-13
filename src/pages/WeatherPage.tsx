import { useEffect, useRef, useState } from 'react'
import {
  Sun, Gauge, CloudRain, Droplets, Clock, RefreshCw,
} from 'lucide-react'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

// ============================================================
// TYPE SCALE — matches Plant/Meter/Inverter Overview. Keep in sync.
// ============================================================
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  body:         'text-[14px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
  metricXL:     'text-[44px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricL:      'text-[28px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricM:      'text-[16px] font-semibold text-black tabular-nums leading-none',
  unit:         'text-[13px] text-black font-medium',
}

const TEMP_GRADIENT =
  'linear-gradient(to right, #6b7280 0%, #497d00 40%, #e17100 60%, #e17100 100%)'

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
  last_updated: string | null
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

function irradianceIntensity(w: number) {
  if (w >= 800) return { label: 'Peak Sun', tone: 'text-[#e17100]', pct: Math.min(100, (w / 1200) * 100) }
  if (w >= 500) return { label: 'Strong',   tone: 'text-[#e17100]', pct: (w / 1200) * 100 }
  if (w >= 200) return { label: 'Moderate', tone: 'text-[#497d00]', pct: (w / 1200) * 100 }
  if (w >  0)   return { label: 'Low',      tone: 'text-black',      pct: (w / 1200) * 100 }
  return             { label: 'Night',    tone: 'text-black/50',   pct: 0 }
}

// Wind gusts: Beaufort-ish labels tuned for solar plant relevance
function windIntensity(ms: number) {
  if (ms >= 15) return { label: 'Strong Gust', tone: 'text-red-600' }
  if (ms >= 8)  return { label: 'Breezy',      tone: 'text-[#e17100]' }
  if (ms >= 3)  return { label: 'Light Wind',  tone: 'text-[#497d00]' }
  if (ms >  0)  return { label: 'Calm Air',    tone: 'text-black' }
  return           { label: 'Still',        tone: 'text-black/50' }
}

// ============================================================
// Shared building blocks — identical to Plant/Meter/Inverter Overview
// ============================================================
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

function Divider() {
  return <div className="h-px w-full bg-black/15" />
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="pt-6">{children}</section>
}

function StatusChip({ status }: { status: string }) {
  const online = status === 'online'
  const dot = online ? 'bg-green-500' : 'bg-red-500'
  const tone = online ? 'text-green-700' : 'text-red-600'
  return (
    <div className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full border border-black/15 bg-white shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`text-[12px] font-semibold ${tone} uppercase tracking-[0.08em]`}>{status}</span>
    </div>
  )
}

// ============================================================
// Animated Sun — the playful centerpiece.
// Rays grow, brighten, and rotate based on irradiance.
// At 0 W/m² it becomes a subtle moon (night mode).
// ============================================================
function AnimatedSun({ irradiance }: { irradiance: number }) {
  const isNight = irradiance <= 10
  const intensityPct = Math.min(1, irradiance / 1000)
  // Rays extend further and get warmer with higher irradiance
  const rayLength = 8 + intensityPct * 10
  const rayOpacity = 0.35 + intensityPct * 0.6
  const coreSize = 32 + intensityPct * 6

if (isNight) {
  const stars = [
      { cx: 24, cy: 34, r: 1.8, delay: '0s'   },
      { cx: 136, cy: 28, r: 1.4, delay: '0.7s' },
      { cx: 18, cy: 112, r: 1.5, delay: '1.4s' },
      { cx: 142, cy: 104, r: 1.9, delay: '0.4s' },
      { cx: 50, cy: 146, r: 1.3, delay: '1.8s' },
      { cx: 116, cy: 140, r: 1.4, delay: '1.1s' },
      { cx: 82, cy: 18, r: 1.2, delay: '2.1s' },
      { cx: 8, cy: 72, r: 1.1, delay: '0.9s' },
      { cx: 150, cy: 66, r: 1.2, delay: '1.6s' },
    ]
  return (
    <div className="relative w-[160px] h-[160px] flex items-center justify-center">
      <div
        className="absolute rounded-full"
        style={{
          width: 145, height: 145,
          background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
          animation: 'weatherMoonGlow 5s ease-in-out infinite',
        }}
      />
      <svg viewBox="0 0 160 160" className="absolute inset-0 w-full h-full">
        {stars.map((s, i) => (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#e2e8f0"
            style={{ animation: `weatherStarTwinkle 3s ease-in-out ${s.delay} infinite`,
                     transformOrigin: `${s.cx}px ${s.cy}px` }} />
        ))}
      </svg>
      <div style={{ animation: 'weatherMoonSway 6s ease-in-out infinite', transformOrigin: 'center' }}>
        <svg viewBox="0 0 100 100" width="90" height="90" style={{ transform: 'rotate(-18deg)' }}>
          <defs>
            <radialGradient id="moonV1Surface" cx="30%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="70%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#64748b" />
            </radialGradient>
            <mask id="moonV1Mask">
              <rect width="100" height="100" fill="white" />
              <circle cx="64" cy="40" r="34" fill="black" />
            </mask>
          </defs>
          <circle cx="50" cy="50" r="34" fill="#1e293b" opacity="0.06" />
          <circle cx="50" cy="50" r="32" fill="url(#moonV1Surface)" mask="url(#moonV1Mask)" />
          <circle cx="34" cy="60" r="2.5" fill="#94a3b8" opacity="0.35" mask="url(#moonV1Mask)" />
          <circle cx="42" cy="74" r="1.8" fill="#94a3b8" opacity="0.3"  mask="url(#moonV1Mask)" />
          <circle cx="28" cy="46" r="1.4" fill="#94a3b8" opacity="0.28" mask="url(#moonV1Mask)" />
        </svg>
      </div>
      <style>{`
        @keyframes weatherMoonSway  { 0%,100% { transform: rotate(-1.5deg) translateY(0); } 50% { transform: rotate(1.5deg) translateY(-2px); } }
        @keyframes weatherMoonGlow  { 0%,100% { opacity: 0.8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
        @keyframes weatherStarTwinkle { 0%,100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
      `}</style>
    </div>
  )
}
  return (
    <div className="relative w-[160px] h-[160px] flex items-center justify-center">
      {/* Outer glow — softly pulses at high irradiance */}
      <div
        className="absolute rounded-full"
        style={{
          width: coreSize * 3.6,
          height: coreSize * 3.6,
          background: `radial-gradient(circle, rgba(225,113,0,${0.15 * intensityPct}) 0%, transparent 70%)`,
          animation: intensityPct > 0.5 ? 'weatherSunPulse 3s ease-in-out infinite' : 'none',
        }}
      />
      {/* Rays — rotate slowly */}
      <svg
        viewBox="0 0 160 160"
        className="absolute inset-0 w-full h-full"
        style={{ animation: `weatherSunRotate ${30 - intensityPct * 10}s linear infinite` }}
      >
        {[...Array(12)].map((_, i) => {
          const angle = (i * 30 * Math.PI) / 180
          const innerR = coreSize / 2 + 6
          const outerR = innerR + rayLength
          const x1 = 80 + innerR * Math.cos(angle)
          const y1 = 80 + innerR * Math.sin(angle)
          const x2 = 80 + outerR * Math.cos(angle)
          const y2 = 80 + outerR * Math.sin(angle)
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#e17100"
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={rayOpacity}
            />
          )
        })}
      </svg>
      {/* Core sun */}
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: coreSize * 1.6,
          height: coreSize * 1.6,
          background: `radial-gradient(circle at 30% 30%, #f59e0b, #e17100)`,
          boxShadow: `0 4px 24px rgba(225,113,0,${0.3 + intensityPct * 0.3})`,
        }}
      >
        <Sun size={coreSize * 0.65} className="text-white" strokeWidth={1.5} />
      </div>
      {/* Keyframes injected via style tag — scoped to this component */}
      <style>{`
        @keyframes weatherSunRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes weatherSunPulse  { 0%,100% { opacity: 0.8; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
      `}</style>
    </div>
  )
}

// ============================================================
// Wind Vane — SVG compass with a needle that rotates to direction.
// The whole vane also slow-rotates a full turn when wind is high,
// suggesting motion without being distracting.
// ============================================================
function WindVane({ deg, speed }: { deg: number; speed: number }) {
  // Only "gust spin" at genuinely high wind — 10 m/s+ is a real breeze.
  // Below that, the needle just points to direction and smoothly
  // transitions when direction changes.
  const gusting = speed > 10

  return (
    <div className="relative w-[140px] h-[140px] flex items-center justify-center shrink-0">
      <svg viewBox="0 0 140 140" className="w-full h-full">
        <circle cx="70" cy="70" r="62" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="1.5" />
        <circle cx="70" cy="70" r="50" fill="none" stroke="#000" strokeOpacity="0.06" strokeWidth="1" />

        <text x="70" y="15" textAnchor="middle" fontSize="11" fill="#000" fontWeight="700">N</text>
        <text x="70" y="132" textAnchor="middle" fontSize="11" fill="#000" fontWeight="700">S</text>
        <text x="128" y="74" textAnchor="middle" fontSize="11" fill="#000" fontWeight="700">E</text>
        <text x="12" y="74" textAnchor="middle" fontSize="11" fill="#000" fontWeight="700">W</text>

        {[0, 45, 90, 135, 180, 225, 270, 315].map((tick) => {
          const rad = (tick - 90) * (Math.PI / 180)
          const x1 = 70 + 55 * Math.cos(rad)
          const y1 = 70 + 55 * Math.sin(rad)
          const x2 = 70 + 62 * Math.cos(rad)
          const y2 = 70 + 62 * Math.sin(rad)
          return <line key={tick} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeOpacity="0.25" strokeWidth="1.5" />
        })}

        {/* Outer group: rotates smoothly to wind direction via CSS transition.
            Inner group: adds a constant-speed spin animation ONLY when gusting.
            Split like this so direction changes tween smoothly without ever
            restarting the animation. */}
        <g
          style={{
            transform: `rotate(${deg}deg)`,
            transformOrigin: '70px 70px',
            transition: 'transform 0.8s cubic-bezier(0.4, 0.0, 0.2, 1)',
          }}
        >
          <g
            style={{
              transformOrigin: '70px 70px',
              animation: gusting ? 'weatherVaneGustSpin 4s linear infinite' : 'none',
            }}
          >
            <polygon points="70,20 62,52 70,46 78,52" fill="#e17100" />
            <polygon points="70,120 62,88 70,94 78,88" fill="#000" fillOpacity="0.25" />
          </g>
        </g>

        <circle cx="70" cy="70" r="4" fill="#e17100" />
        <circle cx="70" cy="70" r="1.5" fill="#fff" />
      </svg>
      {/* Static keyframes — doesn't reference deg, so direction changes
          never regenerate this rule or restart the animation. */}
      <style>{`
        @keyframes weatherVaneGustSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}


// ============================================================
// Temperature comparison — horizontal dual bars, same visual
// language as the irradiance scale bar in the hero section.
// Ambient and module are directly comparable at a glance;
// the gap between bar-ends IS the delta, no separate marker needed.
// ============================================================
function TemperatureVis({ ambient, module }: { ambient: number; module: number }) {
  const min = -10
  const max = 80
  const range = max - min
  const ambientPct = Math.min(100, Math.max(0, ((ambient - min) / range) * 100))
  const modulePct = Math.min(100, Math.max(0, ((module - min) / range) * 100))

  return (
    <div className="flex flex-col gap-5 w-full max-w-md">
      {/* Module bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <p className={T.eyebrow}>Module</p>
          <div className="flex items-baseline gap-1">
            <span className={`${T.metricM} text-[#e17100]`}>{module.toFixed(1)}</span>
            <span className={T.unit}>°C</span>
          </div>
        </div>
        <div className="h-3 bg-black/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${modulePct}%`,
              background: TEMP_GRADIENT,
              backgroundSize: `${(100 / Math.max(modulePct, 0.5)) * 100}% 100%`,
              backgroundPosition: 'left center',
            }}
          />
        </div>
      </div>

      {/* Ambient bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <p className={T.eyebrow}>Ambient</p>
          <div className="flex items-baseline gap-1">
            <span className={T.metricM}>{ambient.toFixed(1)}</span>
            <span className={T.unit}>°C</span>
          </div>
        </div>
        <div className="h-3 bg-black/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${ambientPct}%`,
              background: TEMP_GRADIENT,
              backgroundSize: `${(100 / Math.max(ambientPct, 0.5)) * 100}% 100%`,
              backgroundPosition: 'left center',
            }}
          />
        </div>
      </div>

      {/* Shared scale ticks */}
      <div className="flex justify-between text-[11px] text-black/50 tabular-nums -mt-2">
        <span>{min}°</span>
        <span>35°</span>
        <span>{max}°</span>
      </div>
    </div>
  )
}
// ============================================================
// Small metric with icon — used for humidity/pressure/rain
// ============================================================
function WeatherStat({
  icon: Icon, label, value, unit, sublabel, tone,
}: {
  icon: React.ElementType
  label: string
  value: string
  unit: string
  sublabel?: string
  tone?: 'orange' | 'olive'
}) {
  const iconColor = tone === 'orange' ? 'text-[#e17100]' : tone === 'olive' ? 'text-[#497d00]' : 'text-black'
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon size={14} className={`${iconColor} shrink-0`} strokeWidth={2} />
        <p className={T.eyebrow}>{label}</p>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={T.metricL}>{value}</span>
        <span className={T.unit}>{unit}</span>
      </div>
      {sublabel && <p className={T.meta}>{sublabel}</p>}
    </div>
  )
}

// ============================================================
// Main Page
// ============================================================
export default function WeatherPage() {
  const { site } = useSite()
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(true)

  const [refreshTick, setRefreshTick] = useState(0)
  const lastActivity = useRef(Date.now())

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
    const fetchWeather = async () => {
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
  }, [site?.id, refreshTick])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading weather data…</p>
      </div>
    )
  }

  const irr = data?.irradiation_inclined_wm2 ?? 0
  const intensity = irradianceIntensity(irr)
  const wind = windIntensity(data?.wind_speed_ms ?? 0)
  const delta = data ? data.module_temp_c - data.ambient_temp_c : 0
  const deltaSign = delta > 0 ? '+' : ''
  const deltaColor = delta > 10 ? 'text-[#e17100]' : delta < 0 ? 'text-black' : 'text-[#497d00]'

  return (
    <div className="w-full max-w-[1152px] mx-auto px-4 sm:px-6 md:px-6 lg:px-6 pb-10">

      {/* ============ HEADER ============ */}
      <header className="pb-5 flex flex-col md:flex-row md:items-start md:justify-between md:flex-wrap gap-3 md:gap-6">
        <div className="order-1 md:order-2 flex items-center justify-between md:flex-col md:items-end gap-3 md:gap-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap`}>
            <Clock size={13} strokeWidth={2} />
            {data?.last_updated ? (
              <>
                <span className="hidden md:inline">Updated&nbsp;</span>
                {formatLastUpdated(data.last_updated)}
              </>
            ) : (
              <span className="text-red-600 font-semibold">OFFLINE</span>
            )}
          </p>
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
            <span className="w-1 self-stretch rounded-full bg-[#e17100] shrink-0" />
            <div className="min-w-0 py-0.5">
              <p className={T.eyebrow}>Weather Station</p>
              <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                <h1 className={`${T.siteH1} leading-tight break-words`}>{data?.site ?? '—'}</h1>
                {data && <StatusChip status={data.status} />}
              </div>
              <p className={`${T.body} mt-1`}>{data?.device}</p>
            </div>
          </div>
        </div>
      </header>

      {/* ============ HERO: Animated sun + irradiance ============ */}
      <Divider />
      <section className="pt-8 pb-8">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8 md:gap-12 items-center">

          {/* Animated sun */}
          <div className="flex justify-center md:justify-start">
            <AnimatedSun irradiance={irr} />
          </div>

          {/* Irradiance number + scale */}
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <p className={T.eyebrow}>Solar Irradiance</p>
              <div className="flex items-baseline gap-2 mt-2">
                <span className={`${T.metricXL} ${intensity.tone}`}>{irr.toFixed(0)}</span>
                <span className={T.unit}>W/m²</span>
              </div>
              <p className={`text-[15px] font-semibold mt-2 ${intensity.tone}`}>
                {intensity.label}
              </p>
            </div>

            {/* Scale bar */}
            <div className="pt-2">
              <div className="h-2 bg-black/5 rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${intensity.pct}%`,
                    background: 'linear-gradient(to right, #497d00 0%, #e17100 50%, #dc2626 100%)',
                  }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[11px] text-black/50 tabular-nums">
                <span>0</span>
                <span>400</span>
                <span>800</span>
                <span>1200 W/m²</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ TEMPERATURE ============ */}
      <Divider />
      <Section>
        <SectionHeader
          title="Temperature"
          accent="orange"
        />
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 md:gap-12 items-center">
          <TemperatureVis
            ambient={data?.ambient_temp_c ?? 0}
            module={data?.module_temp_c ?? 0}
          />
          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className={T.eyebrow}>Delta</p>
              <span className={`${T.metricL} ${deltaColor}`}>{deltaSign}{delta.toFixed(1)}</span>
              <span className={T.unit}>°C</span>
            </div>
            <p className={T.meta}>
              {delta > 15 ? 'Modules running hot — high thermal loss expected.' :
               delta > 8  ? 'Typical operating gap under sunlight.' :
               delta > 0  ? 'Modules slightly warmer than ambient — normal for low sun.' :
               delta < 0  ? 'Modules cooler than ambient — likely no sun or evening cooling.' :
                            'Modules at ambient temperature.'}
            </p>
          </div>
        </div>
      </Section>

      {/* ============ WIND ============ */}
      <Divider />
      <Section>
        <SectionHeader title="Wind" meta={wind.label} accent="olive" />
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 md:gap-12 items-center">
          <WindVane
            deg={data?.wind_direction_deg ?? 0}
            speed={data?.wind_speed_ms ?? 0}
          />
          <div className="grid grid-cols-2 gap-6 min-w-0">
            <div>
              <p className={T.eyebrow}>Speed</p>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className={`${T.metricL} ${wind.tone}`}>{(data?.wind_speed_ms ?? 0).toFixed(1)}</span>
                <span className={T.unit}>m/s</span>
              </div>
            </div>
            <div>
              <p className={T.eyebrow}>Direction</p>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className={T.metricL}>{compassLabel(data?.wind_direction_deg ?? 0)}</span>
                <span className={T.unit}>{(data?.wind_direction_deg ?? 0).toFixed(0)}°</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ============ ATMOSPHERIC ============ */}
      <Divider />
      <Section>
        <SectionHeader title="Atmospheric" meta="Humidity · Pressure · Rainfall" accent="orange" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          <WeatherStat
            icon={Droplets}
            label="Humidity"
            value={(data?.humidity_pct ?? 0).toFixed(1)}
            unit="%"
            sublabel="Relative"
          />
          <WeatherStat
            icon={Gauge}
            label="Pressure"
            value={(data?.pressure_hpa ?? 0).toFixed(1)}
            unit="hPa"
            sublabel="Atmospheric"
          />
          <WeatherStat
            icon={CloudRain}
            label="Rainfall"
            value={(data?.rain_mm ?? 0).toFixed(1)}
            unit="mm"
            sublabel="Accumulated today"
            tone="olive"
          />
        </div>
      </Section>

    </div>
  )
}