import { Card, CardContent } from '@/components/ui/card'
import { BarChart, Bar, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { useState } from 'react'

// ---- Legend ----
function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-[#F1F5F9]">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          <span className="text-[10px] text-gray-400">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ---- Metric Block ----
function MetricBlock({
  label,
  value,
  unit,
  dotColor,
}: {
  label: string
  value: string | number
  unit: string
  dotColor: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
        <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[20px] font-semibold text-[#0F1E3C] tracking-tight leading-none">
          {value}
        </span>
        <span className="text-[11px] text-gray-400">{unit}</span>
      </div>
    </div>
  )
}

// ---- Generation Card ----
function GenerationCard({ actualToday }: { actualToday: number }) {
  const data = [
    { name: 'Actual', value: actualToday, fill: '#22C55E' },
    { name: 'Projected', value: 5200, fill: '#CBD5E1' },
    { name: 'Targeted', value: 5500, fill: '#E2E8F0' },
  ]

  return (
    <Card className="border-[#E2E8F0] shadow-none rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3">
            Generation
          </p>
          <div className="flex gap-4">
            <MetricBlock label="Actual" value={actualToday.toLocaleString()} unit="kWh" dotColor="#22C55E" />
            <MetricBlock label="Projected" value="5,200" unit="kWh" dotColor="#CBD5E1" />
            <MetricBlock label="Targeted" value="5,500" unit="kWh" dotColor="#E2E8F0" />
          </div>
        </div>
        <div className="h-[80px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 16, left: 16, bottom: 0 }} barCategoryGap="30%">
              <YAxis hide />
              <Tooltip
                contentStyle={{ fontSize: '11px', border: '0.5px solid #E2E8F0', borderRadius: '8px', boxShadow: 'none' }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {data.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[
          { color: '#22C55E', label: 'Actual' },
          { color: '#CBD5E1', label: 'Projected' },
          { color: '#E2E8F0', label: 'Targeted' },
        ]} />
      </CardContent>
    </Card>
  )
}

// ---- PR% Card ----
function PRCard() {
  const data = [
    { name: 'Actual', value: 71.4, fill: '#22C55E' },
    { name: 'Targeted', value: 79.4, fill: '#E2E8F0' },
  ]

  return (
    <Card className="border-[#E2E8F0] shadow-none rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-3">
            Performance Ratio
          </p>
          <div className="flex gap-4">
            <MetricBlock label="Actual" value="71.4" unit="%" dotColor="#22C55E" />
            <MetricBlock label="Targeted" value="79.4" unit="%" dotColor="#E2E8F0" />
          </div>
        </div>
        <div className="h-[80px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 16, left: 16, bottom: 0 }} barCategoryGap="30%">
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                contentStyle={{ fontSize: '11px', border: '0.5px solid #E2E8F0', borderRadius: '8px', boxShadow: 'none' }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {data.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[
          { color: '#22C55E', label: 'Actual' },
          { color: '#E2E8F0', label: 'Targeted' },
        ]} />
      </CardContent>
    </Card>
  )
}

// ---- CUF% Card ----
function CUFCard() {
  const [mode, setMode] = useState<'AC' | 'DC'>('AC')

  const values = {
    AC: { actual: 19.2, targeted: 21.9 },
    DC: { actual: 16.4, targeted: 18.8 },
  }

  const data = [
    { name: 'Actual', value: values[mode].actual, fill: '#22C55E' },
    { name: 'Targeted', value: values[mode].targeted, fill: '#E2E8F0' },
  ]

  return (
    <Card className="border-[#E2E8F0] shadow-none rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
              Capacity Utilisation
            </p>
            <div className="flex bg-[#F4F6F9] rounded-md p-0.5 gap-0.5">
              {(['AC', 'DC'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-[5px] transition-all ${
                    mode === m
                      ? 'bg-white text-[#0F1E3C] border border-[#E2E8F0]'
                      : 'text-gray-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4">
            <MetricBlock label="Actual" value={values[mode].actual} unit="%" dotColor="#22C55E" />
            <MetricBlock label="Targeted" value={values[mode].targeted} unit="%" dotColor="#E2E8F0" />
          </div>
        </div>
        <div className="h-[80px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 16, left: 16, bottom: 0 }} barCategoryGap="30%">
              <YAxis hide domain={[0, 30]} />
              <Tooltip
                contentStyle={{ fontSize: '11px', border: '0.5px solid #E2E8F0', borderRadius: '8px', boxShadow: 'none' }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {data.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[
          { color: '#22C55E', label: 'Actual' },
          { color: '#E2E8F0', label: 'Targeted' },
        ]} />
      </CardContent>
    </Card>
  )
}

// ---- Export ----
export function GenerationCards({ actualToday }: { actualToday: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <GenerationCard actualToday={actualToday} />
      <PRCard />
      <CUFCard />
    </div>
  )
}