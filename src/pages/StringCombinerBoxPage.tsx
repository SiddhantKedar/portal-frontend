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

// ---- PV String tile ----

function PvStringTile({ s }: { s: PvString }) {
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-2.5 text-center">
      <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-1">Str {s.number}</p>
      <p className="text-[12px] font-semibold text-[#0F1E3C]">
        {s.current_a.toFixed(2)}
        <span className="text-[9px] text-gray-400 ml-0.5">A</span>
      </p>
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
      <div>
        <h1 className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight">
          String Combiner Box
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {data?.site} · Raw current readings per string
        </p>
      </div>

      {/* Per-inverter string blocks */}
      {data?.inverters.map((inv) => {
        const strings = [...inv.pv_strings].sort((a, b) => a.number.localeCompare(b.number))
        return (
          <Card key={inv.device_id} className="border-[#E2E8F0] shadow-none rounded-xl">
            <CardHeader className="pb-2 px-6 pt-5">
              <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">
                {inv.name}
              </CardTitle>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {strings.length} strings
              </p>
            </CardHeader>
            <CardContent className="px-6 pb-5">
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