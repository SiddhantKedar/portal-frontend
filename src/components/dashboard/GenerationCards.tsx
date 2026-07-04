import { Card, CardContent } from '@/components/ui/card'
import { BarChart, Bar, YAxis, ResponsiveContainer, Tooltip, LabelList, CartesianGrid  } from 'recharts'
import { useState } from 'react'

// ---- Legend ----
function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-[#F1F1F1]">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          <span className="text-[10px] text-gray-400">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ---- Generation Card ----
function GenerationCard({ actualToday }: { actualToday: number }) {
  const data = [
    { name: 'Actual', value: actualToday, fill: '#e17100' },
    { name: 'Targeted', value: 5500, fill: '#497d00' },
  ]

  return (
    <Card className="border-[#E5E5E5] shadow-none rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-2 pb-4">
          <p className="text-[16px] font-semibold text-black-800 uppercase tracking-wider">
            Generation
          </p>
        </div>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
                data={data}
                margin={{ top: 22, right: 8, left: 8, bottom: 0 }}
                barCategoryGap="20%"
                barSize={48}
              >
              <CartesianGrid  stroke="#f3e5e57a"  vertical={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ fontSize: '11px', border: '0.5px solid #E5E5E5', borderRadius: '8px', boxShadow: 'none' }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: unknown) => {
                    const num = Number(v)
                    return Number.isFinite(num) ? `${num.toLocaleString()}\u00A0kWh` : ''
                  }}
                  style={{ fontSize: 14, fontWeight: 500, fill: '#02060c' }}
                />
                {data.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[
          { color: '#e17100', label: 'Actual' },
          { color: '#497d00', label: 'Targeted' },
        ]} />
      </CardContent>
    </Card>
  )
}

// ---- PR% Card ----
function PRCard() {
  const data = [
    { name: 'Actual', value: 71.4, fill: '#e17100' },
    { name: 'Targeted', value: 79.4, fill: '#497d00' },
  ]

  return (
    <Card className="border-[#E5E5E5] shadow-none rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-2 pb-4">
          <p className="text-[16px] font-semibold text-black-800 uppercase tracking-wider">
            Performance Ratio
          </p>
        </div>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 22, right: 8, left: 8, bottom: 0 }} barCategoryGap="20%" barSize={48}>
              <CartesianGrid stroke="#f3e5e57a" vertical={false} />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                contentStyle={{ fontSize: '11px', border: '0.5px solid #E5E5E5', borderRadius: '8px', boxShadow: 'none' }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: unknown) => {
                    const num = Number(v)
                    return Number.isFinite(num) ? `${num.toLocaleString()}\u00A0%` : ''
                  }}
                  style={{ fontSize: 14, fontWeight: 500, fill: '#02060c' }}
                />
                {data.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[
          { color: '#e17100', label: 'Actual' },
          { color: '#497d00', label: 'Targeted' },
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
    { name: 'Actual', value: values[mode].actual, fill: '#e17100' },
    { name: 'Targeted', value: values[mode].targeted, fill: '#497d00' },
  ]

  return (
    <Card className="border-[#E5E5E5] shadow-none rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-2 pb-4">
          <div className="flex items-center justify-between">
            <p className="text-[16px] font-semibold text-black-800 uppercase tracking-wider">
              Capacity Utilisation Factor
            </p>
            <div className="flex bg-[#FAFAFA] rounded-md p-0.5 gap-0.5">
              
            </div>
          </div>
        </div>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 22, right: 8, left: 8, bottom: 0 }} barCategoryGap="20%" barSize={48}>
              <CartesianGrid stroke="#f3e5e57a" vertical={false} />
              <YAxis hide domain={[0, 30]} />
              <Tooltip
                contentStyle={{ fontSize: '11px', border: '0.5px solid #E5E5E5', borderRadius: '8px', boxShadow: 'none' }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: unknown) => {
                    const num = Number(v)
                    return Number.isFinite(num) ? `${num.toLocaleString()}\u00A0%` : ''
                  }}
                  style={{ fontSize: 14, fontWeight: 500, fill: '#02060c' }}
                />
                {data.map((entry, index) => (
                  <rect key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[
          { color: '#e17100', label: 'Actual' },
          { color: '#497d00', label: 'Targeted' },
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