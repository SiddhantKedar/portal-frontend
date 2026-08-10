import { useCallback, useEffect, useState, Fragment } from 'react'
import { Clock, RefreshCw, } from 'lucide-react'

import api from '@/api/axios'
import { useSite } from '@/context/SiteContext'
import { useAutoRefresh } from '@/api/useAutoRefresh'

// ============================================================
// TYPE SCALE — matches PlantOverviewPage.tsx exactly. Keep in sync.
// ============================================================
const T = {
  eyebrow:      'text-[12px] uppercase tracking-[0.12em] text-black font-semibold',
  meta:         'text-[13px] text-black',
  body:         'text-[14px] text-black',
  sectionTitle: 'text-[19px] font-semibold text-black tracking-tight',
  siteH1:       'text-[26px] font-semibold text-black tracking-tight',
  metricL:      'text-[22px] font-semibold text-black tracking-tight tabular-nums leading-none',
  metricM:      'text-[16px] font-semibold text-black tabular-nums leading-none',
  metricS:      'text-[13px] font-semibold text-black tabular-nums leading-none',
  unit:         'text-[13px] text-black font-medium',
}

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
  energy_today_kwh: number
  status: string
  last_updated: string | null
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
  { label: 'Today (kWh)', key: 'energy_today_kwh' },
  { label: 'Total Export (kWh)', key: 'energy_active_export_kwh' },
  { label: 'Total Import (kWh)', key: 'energy_active_import_kwh' },
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
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatLastUpdated(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function formatEnergyKwh(kwh: number | null | undefined): { value: string; unit: string } {
  if (kwh == null) return { value: '—', unit: 'kWh' }
  const abs = Math.abs(kwh)
  if (abs >= 1_000_000) return { value: (kwh / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }), unit: 'GWh' }
  if (abs >= 1_000) return { value: (kwh / 1_000).toLocaleString(undefined, { maximumFractionDigits: 2 }), unit: 'MWh' }
  return { value: kwh.toLocaleString(undefined, { maximumFractionDigits: 0 }), unit: 'kWh' }
}


// ============================================================
// Shared building blocks — pulled 1:1 from PlantOverviewPage.tsx
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

// Status chip — same pill treatment as PlantOverview's Breaker/Inverters chips
function StatusChip({ status }: { status: string }) {
  const online = status === 'online'
  const dot = online ? 'bg-green-500' : 'bg-red-500'
  const tone = online ? 'text-green-700' : 'text-red-600'
  return (
    <div className="inline-flex items-center gap-2 h-7 pl-2.5 pr-3 rounded-full border border-black/15 bg-white shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`text-[12px] font-semibold ${tone} uppercase tracking-[0.08em]`}>{status}</span>
    </div>
  )
}

// ============================================================
// Live snapshot card per meter — kept as a bordered surface
// (per your call: the boxy comparison format works here),
// but restyled to the shared type scale + orange/olive accents.
// ============================================================

function MeterSnapshotCard({ meter }: { meter: Meter }) {
  const online = meter.status === 'online'
  const today = formatEnergyKwh(meter.energy_today_kwh)
  const total = formatEnergyKwh(meter.energy_active_export_kwh)

  return (
    <div className="rounded-lg px-4 py-3" style={{ background: online ? 'rgba(73,125,0,0.04)' : 'rgba(0,0,0,0.03)' }}>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: online ? '#22c55e' : 'rgba(0,0,0,0.25)' }} />
          <p className="text-[13px] font-semibold text-black truncate">{meter.name}</p>
        </div>
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-[22px] font-semibold tracking-tight tabular-nums leading-none" style={{ color: online ? '#000' : 'rgba(0,0,0,0.3)' }}>
            {online ? meter.active_power_total_kw.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
          </span>
          <span className="text-[11px] text-black/50 font-medium">kW</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-black/[0.08] pt-2">
        <div>
          <p className="text-[9.5px] text-black/50 mb-0.5">Today</p>
          <p className="text-[12px] font-semibold tabular-nums" style={{ color: '#e17100' }}>
            {today.value}<span className="text-[9px] text-black/40 font-normal ml-0.5">{today.unit}</span>
          </p>
        </div>
        <div>
          <p className="text-[9.5px] text-black/50 mb-0.5">Export</p>
          <p className="text-[12px] font-semibold text-black tabular-nums">
            {total.value}<span className="text-[9px] text-black/40 font-normal ml-0.5">{total.unit}</span>
          </p>
        </div>
        <div>
          <p className="text-[9.5px] text-black/50 mb-0.5">PF</p>
          <p className="text-[12px] font-semibold text-black tabular-nums">{meter.power_factor_total.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[9.5px] text-black/50 mb-0.5">Freq</p>
          <p className="text-[12px] font-semibold text-black tabular-nums">{meter.grid_frequency_hz.toFixed(2)}</p>
        </div>
      </div>
    </div>
  )
}


// ============================================================
// Editorial data table — no header shading, no zebra stripes.
// Group labels use the accent-bar treatment; hairlines separate rows.
// ============================================================
interface MeterGroup {
  label: string
  meters: Meter[]
}

function MeterTable({
  title, meta, accent, groups, columns,
}: {
  title: string
  meta: string
  accent: 'orange' | 'olive'
  groups: MeterGroup[]
  columns: ColumnDef[]
}) {
  return (
    <div>
      <SectionHeader title={title} meta={meta} accent={accent} />
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full text-[13px] border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-black/15">
              <th className="text-left text-[10.5px] uppercase tracking-[0.08em] text-black font-semibold px-2.5 py-2 whitespace-nowrap">
                Meter
              </th>
              <th className="w-px text-center text-[10.5px] uppercase tracking-[0.08em] text-black font-semibold px-2.5 py-2 whitespace-nowrap">
                Status
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="text-right text-[10.5px] uppercase tracking-[0.08em] text-black font-semibold px-2.5 py-2 whitespace-nowrap"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td
                    colSpan={columns.length + 2}
                    className="px-2.5 pt-3 pb-1 text-[10.5px] uppercase tracking-[0.1em] text-black/50 font-semibold whitespace-nowrap"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.meters.map((m) => (
                  <tr key={m.device_pk} className="border-b border-black/[0.07]">
                    <td className="py-2 px-2.5 font-semibold text-black whitespace-nowrap">
                      {m.name}
                    </td>
                    <td className="w-px py-2 px-2.5 text-center whitespace-nowrap">
                      <StatusChip status={m.status} />
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className="py-2 px-2.5 text-right text-black font-medium tabular-nums whitespace-nowrap">
                        {formatValue(m[c.key] as number)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================
// Main Page
// ============================================================
export default function MeterOverviewPage() {
  const { site } = useSite()
  const [data, setData] = useState<MeterOverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMeters = useCallback(async () => {
    if (!site?.id) { setLoading(false); return }
    try {
      const res = await api.get<MeterOverviewData>(`/influx/meter/overview/?site=${site.id}`)
      setData(res.data)
    } catch (err) {
      console.error('Meter overview error:', err)
    } finally {
      setLoading(false)
    }
  }, [site?.id])

  useEffect(() => { fetchMeters() }, [fetchMeters])

  // Interval (60s) + wake events (visibility/focus/pageshow/online) + manual
  // refresh all pull the same overview snapshot — no heavy trend queries here.
  const { refetch, isRefetching } = useAutoRefresh(fetchMeters, {
    intervalMs: 60_000,
    onWake: fetchMeters,
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-60">
        <p className={T.meta}>Loading meter data…</p>
      </div>
    )
  }

  const generationMeters = data?.meters.filter((m) => m.site_type === 'GENERATION') ?? []
  const substationMeters = data?.meters.filter((m) => m.site_type === 'SUBSTATION') ?? []

  const groups: MeterGroup[] = [
    { label: 'Generation Site', meters: generationMeters },
    { label: data?.substation ?? 'Substation', meters: substationMeters },
  ].filter((g) => g.meters.length > 0)

  const onlineCount = data?.meters.filter((m) => m.status === 'online').length ?? 0
  const totalCount = data?.meters.length ?? 0

  // Most recent timestamp across all meters, for the header clock
  const latestUpdate = data?.meters
    .map((m) => m.last_updated)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1)

  return (
    <div className="max-w-6xl px-0 mx-auto sm:px-6 md:px-4 lg:px-2 xl:px-0 pb-10">

      {/* ============ HEADER ============ */}
      <header className="pb-5 flex flex-col md:flex-row md:items-start md:justify-between md:flex-wrap gap-3 md:gap-6">
        {/* Refresh + timestamp — same order-flip pattern as PlantOverview */}
        <div className="order-1 sm:order-2 flex items-center justify-between sm:flex-col sm:items-end gap-3 sm:gap-2 shrink-0">
          <p className={`${T.meta} flex items-center gap-1.5 whitespace-nowrap`}>
            <Clock size={13} strokeWidth={2} />
            {latestUpdate ? (
              <>
                <span className="hidden sm:inline">Updated&nbsp;</span>
                {formatLastUpdated(latestUpdate)}
              </>
            ) : (
              <span className="text-red-600 font-semibold">OFFLINE</span>
            )}
          </p>
          <button
            type="button"
            onClick={refetch}
            disabled={isRefetching}
            className="h-10 px-4 flex items-center gap-2 border border-black/25 rounded-lg text-black hover:bg-black hover:text-white transition-colors text-[13px] font-semibold"
          >
            <RefreshCw size={14} strokeWidth={2} />
            Refresh
          </button>
        </div>

        {/* Title block */}
        <div className="order-2 md:order-1 min-w-0">
          <div className="flex items-stretch gap-3">
            <span className="w-1 self-stretch rounded-full bg-[#e17100] shrink-0" />
            <div className="min-w-0 py-0.5">
              <p className={T.eyebrow}>Meter Overview</p>
              <h1 className={`${T.siteH1} mt-1 leading-tight break-words`}>{data?.site ?? '—'}</h1>
              <p className={`${T.body} mt-1`}>
                {totalCount} meter{totalCount !== 1 ? 's' : ''}
                <span className="mx-2 text-black">·</span>
                <span className="tabular-nums">{onlineCount}/{totalCount} online</span>
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ============ LIVE SNAPSHOTS ============ */}
      {totalCount > 0 && (
        <>
          <Divider />
          <Section>
            <SectionHeader
              title="Live Snapshot"
              meta={`${todayString()} · Today's generation vs cumulative export`}
              accent="orange"
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 mb-4">
              {data?.meters.map((m) => (
                <MeterSnapshotCard key={m.device_pk} meter={m} />
              ))}
            </div>
            
          </Section>
        </>
      )}

      {/* ============ DETAILED TABLES ============ */}
      {groups.length > 0 ? (
        <>
          <Divider />
          <Section>
            <MeterTable
              title="Power"
              meta="Active, reactive & apparent power"
              accent="orange"
              groups={groups}
              columns={POWER_COLUMNS}
            />
          </Section>

          <Divider />
          <Section>
            <MeterTable
              title="Energy"
              meta="Today's generation & cumulative readings"
              accent="olive"
              groups={groups}
              columns={ENERGY_COLUMNS}
            />
          </Section>

          <Divider />
          <Section>
            <MeterTable
              title="Voltage"
              meta="Line-to-line voltage"
              accent="orange"
              groups={groups}
              columns={VOLTAGE_COLUMNS}
            />
          </Section>

          <Divider />
          <Section>
            <MeterTable
              title="Current"
              meta="Per-phase current"
              accent="olive"
              groups={groups}
              columns={CURRENT_COLUMNS}
            />
          </Section>

          <Divider />
          <Section>
            <MeterTable
              title="Frequency & Power Factor"
              meta="Grid quality"
              accent="orange"
              groups={groups}
              columns={FREQ_PF_COLUMNS}
            />
          </Section>
        </>
      ) : (
        <>
          <Divider />
          <div className="flex items-center justify-center h-40">
            <p className={T.meta}>No meters found for this site.</p>
          </div>
        </>
      )}

    </div>
  )
}