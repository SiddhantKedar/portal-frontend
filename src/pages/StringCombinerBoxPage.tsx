import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

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

// ---- Helpers ----

// Classify a string's current into a status bucket so we can color it.
// Thresholds are intentionally conservative — adjust to your site's typical values.
function stringStatus(current: number): 'active' | 'low' | 'inactive' {
  if (current <= 0.05) return 'inactive'
  if (current < 2) return 'low'
  return 'active'
}

const STATUS_STYLES = {
  active: {
    bg: 'bg-[#fff7ed]',
    border: 'border-[#e17100]',
    dot: 'bg-[#e17100]',
    label: 'text-[#e17100]',
    value: 'text-black',
  },
  low: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    dot: 'bg-amber-400',
    label: 'text-amber-600',
    value: 'text-black',
  },
  inactive: {
    bg: 'bg-[#FAFAFA]',
    border: 'border-[#E5E5E5]',
    dot: 'bg-gray-300',
    label: 'text-gray-400',
    value: 'text-gray-400',
  },
}

// ---- PV String tile ----

function PvStringTile({ s }: { s: PvString }) {
  const status = stringStatus(s.current_a)
  const style = STATUS_STYLES[status]

  return (
    <div className={`${style.bg} border ${style.border} rounded-lg px-2 py-2.5 text-center`}>
      <div className="flex items-center justify-center gap-1 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
        <p className={`text-[9px] uppercase tracking-wide font-medium ${style.label}`}>
          Str {s.number}
        </p>
      </div>
      <p className={`text-[13px] font-semibold ${style.value} leading-none`}>
        {s.current_a.toFixed(2)}
        <span className="text-[9px] text-gray-400 ml-0.5">A</span>
      </p>
    </div>
  )
}

// ---- Inverter summary bar ----

function InverterSummary({ strings }: { strings: PvString[] }) {
  const active = strings.filter((s) => stringStatus(s.current_a) === 'active').length
  const low = strings.filter((s) => stringStatus(s.current_a) === 'low').length
  const inactive = strings.filter((s) => stringStatus(s.current_a) === 'inactive').length
  const totalCurrent = strings.reduce((sum, s) => sum + s.current_a, 0)
  const avgCurrent = strings.length ? totalCurrent / strings.length : 0

  return (
    <div className="flex items-center gap-6 mb-4 flex-wrap">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Total Current</p>
        <p className="text-[18px] font-bold text-black leading-tight">
          {totalCurrent.toFixed(1)}
          <span className="text-[12px] text-gray-400 font-normal ml-1">A</span>
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Avg / String</p>
        <p className="text-[18px] font-bold text-black leading-tight">
          {avgCurrent.toFixed(2)}
          <span className="text-[12px] text-gray-400 font-normal ml-1">A</span>
        </p>
      </div>
      <div className="flex items-center gap-3 ml-auto flex-wrap">
        {active > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#fff7ed] text-[#e17100] border border-[#e17100]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e17100]" />
            {active} active
          </span>
        )}
        {low > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {low} low
          </span>
        )}
        {inactive > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#FAFAFA] text-gray-400 border border-[#E5E5E5]">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
            {inactive} inactive
          </span>
        )}
      </div>
    </div>
  )
}

// ---- Main Page ----

export default function ScbPage() {
  const { site } = useSite()
  const [data, setData] = useState<ScbData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!site?.id) return
    const fetchScb = async () => {
      setLoading(true)
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
  }, [site?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-[13px] text-gray-400">Loading string data...</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-black tracking-tight">
            String Combiner Box
          </h1>
          <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
            <Clock size={12} />
            {data?.site} · Live current readings per string
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-full bg-[#e17100]" /> Active (≥ 2A)
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Low (&lt; 2A)
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="w-2 h-2 rounded-full bg-gray-300" /> Inactive
          </span>
        </div>
      </div>

      {/* Per-inverter string blocks */}
      {data?.inverters.map((inv) => {
        const strings = [...inv.pv_strings].sort((a, b) => a.number.localeCompare(b.number))
        return (
          <Card key={inv.device_id} className="border-[#E5E5E5] shadow-none rounded-xl">
            <CardHeader className="pb-2 px-6 pt-5">
              <CardTitle className="text-[18px] font-semibold text-black">
                {inv.name}
              </CardTitle>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {strings.length} strings
              </p>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              <InverterSummary strings={strings} />
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-2">
                {strings.map((s) => (
                  <PvStringTile key={s.number} s={s} />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {data && data.inverters.length === 0 && (
        <div className="flex items-center justify-center h-40">
          <p className="text-[13px] text-gray-400">No inverters found for this site.</p>
        </div>
      )}

    </div>
  )
}