import { useEffect, useState, Fragment } from 'react'
import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'

// ---- Types ----

interface Meter {
  device_pk: number
  device_id: string
  name: string
  site_type: 'GENERATION' | 'SUBSTATION'
  active_power_total_kw: number
  reactive_power_total_kvar: number
  apparent_power_total_kva: number
  energy_active_export_kwh: number
  energy_active_import_kwh: number
  energy_active_net_kwh: number
  energy_reactive_export_kvarh: number
  energy_reactive_import_kvarh: number
  voltage_line_ab_v: number
  voltage_line_bc_v: number
  voltage_line_ca_v: number
  current_phase_a: number
  current_phase_b: number
  current_phase_c: number
  grid_frequency_hz: number
  power_factor_total: number
  status: string
  last_updated: string
}

interface MeterOverviewData {
  site: string
  substation: string | null
  meters: Meter[]
}

type ColumnKey = keyof Meter

interface ColumnDef {
  label: string
  key: ColumnKey
}

// ---- Column groups ----

const POWER_COLUMNS: ColumnDef[] = [
  { label: 'Active Power (kW)', key: 'active_power_total_kw' },
  { label: 'Reactive Power (kVAR)', key: 'reactive_power_total_kvar' },
  { label: 'Apparent Power (kVA)', key: 'apparent_power_total_kva' },
]

const ENERGY_COLUMNS: ColumnDef[] = [
  { label: 'Active Export (kWh)', key: 'energy_active_export_kwh' },
  { label: 'Active Import (kWh)', key: 'energy_active_import_kwh' },
  { label: 'Active Net (kWh)', key: 'energy_active_net_kwh' },
  { label: 'Reactive Export (kVARh)', key: 'energy_reactive_export_kvarh' },
  { label: 'Reactive Import (kVARh)', key: 'energy_reactive_import_kvarh' },
]

const VOLTAGE_COLUMNS: ColumnDef[] = [
  { label: 'Voltage A-B (V)', key: 'voltage_line_ab_v' },
  { label: 'Voltage B-C (V)', key: 'voltage_line_bc_v' },
  { label: 'Voltage C-A (V)', key: 'voltage_line_ca_v' },
]

const CURRENT_COLUMNS: ColumnDef[] = [
  { label: 'Phase A (A)', key: 'current_phase_a' },
  { label: 'Phase B (A)', key: 'current_phase_b' },
  { label: 'Phase C (A)', key: 'current_phase_c' },
]

const FREQ_PF_COLUMNS: ColumnDef[] = [
  { label: 'Frequency (Hz)', key: 'grid_frequency_hz' },
  { label: 'Power Factor', key: 'power_factor_total' },
]

// ---- Helpers ----

function formatValue(value: number) {
  return value.toFixed(2)
}

// ---- Status pill ----

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
      status === 'online' ? 'bg-[#22C55E]/10 text-[#16A34A]' : 'bg-red-50 text-red-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-[#22C55E]' : 'bg-red-400'}`} />
      {status}
    </span>
  )
}

// ---- Reusable grouped table — meters as rows (grouped by site type), parameters as columns ----

interface MeterGroup {
  label: string
  meters: Meter[]
}

function MeterTable({
  title, subtitle, groups, columns,
}: {
  title: string
  subtitle: string
  groups: MeterGroup[]
  columns: ColumnDef[]
}) {
  const colSpan = columns.length + 2 // Meter column + data columns + Status column
  let rowIndex = 0

  return (
    <Card className="border-[#E2E8F0] shadow-none rounded-xl">
      <CardHeader className="pb-2 px-6 pt-5">
        <CardTitle className="text-[14px] font-semibold text-[#0F1E3C]">{title}</CardTitle>
        <p className="text-[12px] text-gray-400 mt-0.5">{subtitle}</p>
      </CardHeader>
      <CardContent className="px-6 pb-5">
        <div className="rounded-lg border border-[#E2E8F0] overflow-x-auto">
          <table className="w-full text-[13px] min-w-[700px]">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                <th className="sticky left-0 z-10 bg-white text-left text-[11px] uppercase tracking-wider text-gray-400 font-medium px-4 py-2">
                  Meter
                </th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-medium px-3 py-2 whitespace-nowrap"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="text-right text-[11px] uppercase tracking-wider text-gray-400 font-medium px-4 py-2">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.label}>
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold bg-[#F8FAFC] border-b border-[#F1F5F9]"
                    >
                      {group.label}
                    </td>
                  </tr>
                  {group.meters.map((m) => {
                    const isStripe = rowIndex % 2 === 1
                    rowIndex += 1
                    const rowBg = isStripe ? '#FAFBFC' : '#FFFFFF'
                    return (
                      <tr
                        key={m.device_pk}
                        className={`border-b border-[#F8FAFC] hover:bg-[#F8FAFC] transition-colors group ${isStripe ? 'bg-[#FAFBFC]' : 'bg-white'}`}
                      >
                        <td
                          className="sticky left-0 z-10 py-3 px-4 font-medium text-[#0F1E3C] group-hover:bg-[#F8FAFC] transition-colors"
                          style={{ background: rowBg }}
                        >
                          {m.name}
                        </td>
                        {columns.map((c) => (
                          <td key={c.key} className="py-3 px-3 text-right text-[#0F1E3C] font-medium tabular-nums">
                            {formatValue(m[c.key] as number)}
                          </td>
                        ))}
                        <td className="py-3 px-4 text-right">
                          <StatusPill status={m.status} />
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- Main Page ----

export default function MeterOverviewPage() {
  const { site } = useSite()
  const [data, setData] = useState<MeterOverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!site?.id) return
    const fetchMeters = async () => {
      setLoading(true)
      try {
        const res = await api.get<MeterOverviewData>(`/influx/meter/overview/?site=${site.id}`)
        setData(res.data)
      } catch (err) {
        console.error('Meter overview error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchMeters()
  }, [site?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className="text-[13px] text-gray-400">Loading meter data...</p>
      </div>
    )
  }

  const generationMeters = data?.meters.filter((m) => m.site_type === 'GENERATION') ?? []
  const substationMeters = data?.meters.filter((m) => m.site_type === 'SUBSTATION') ?? []

  const groups: MeterGroup[] = [
    { label: 'Generation Site', meters: generationMeters },
    { label: data?.substation ?? 'Substation', meters: substationMeters },
  ].filter((g) => g.meters.length > 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight">
          Meter Overview
        </h1>
        <p className="text-[13px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Clock size={12} />
          {data?.site}
        </p>
      </div>

      {groups.length > 0 ? (
        <>
          <MeterTable title="Power" subtitle="Active, reactive & apparent power" groups={groups} columns={POWER_COLUMNS} />
          <MeterTable title="Energy" subtitle="Cumulative energy readings" groups={groups} columns={ENERGY_COLUMNS} />
          <MeterTable title="Voltage" subtitle="Line-to-line voltage" groups={groups} columns={VOLTAGE_COLUMNS} />
          <MeterTable title="Current" subtitle="Per-phase current" groups={groups} columns={CURRENT_COLUMNS} />
          <MeterTable title="Frequency & Power Factor" subtitle="Grid quality" groups={groups} columns={FREQ_PF_COLUMNS} />
        </>
      ) : (
        <div className="flex items-center justify-center h-40">
          <p className="text-[13px] text-gray-400">No meters found for this site.</p>
        </div>
      )}

    </div>
  )
}