import { Card, CardContent } from '@/components/ui/card'
import { BarChart, Bar, YAxis, ResponsiveContainer, Tooltip, LabelList, CartesianGrid, Cell } from 'recharts'

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
              
              <CartesianGrid stroke="#f3e5e57a" vertical={false} />
              <YAxis hide />
              <Tooltip
                formatter={(value, _name, props) => [value, props.payload.name]}
                labelFormatter={() => ''}
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
function PRCard({ actual }: { actual: number }) {
  const targeted = 79.4
  const data = [
    { name: 'Actual', value: actual, fill: '#e17100' },
    { name: 'Targeted', value: targeted, fill: '#497d00' },
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
                formatter={(value, _name, props) => [value, props.payload.name]}
                labelFormatter={() => ''}
                contentStyle={{ fontSize: '11px', border: '0.5px solid #E5E5E5', borderRadius: '8px', boxShadow: 'none' }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: unknown) => {
                    const num = Number(v)
                    return Number.isFinite(num) ? `${num.toFixed(1)}\u00A0%` : ''
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
function CUFCard({ actual }: { actual: number }) {
  const targeted = 21.9
  const data = [
    { name: 'Actual', value: actual, fill: '#e17100' },
    { name: 'Targeted', value: targeted, fill: '#497d00' },
  ]

  return (
    <Card className="border-[#E5E5E5] shadow-none rounded-xl overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 pt-2 pb-4">
          <p className="text-[16px] font-semibold text-black-800 uppercase tracking-wider">
            Capacity Utilisation Factor
          </p>
        </div>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 22, right: 8, left: 8, bottom: 0 }} barCategoryGap="20%" barSize={48}>
              <CartesianGrid stroke="#f3e5e57a" vertical={false} />
              <YAxis hide domain={[0, Math.max(actual, targeted) * 1.3]} />
              <Tooltip
                  formatter={(value, _name, props) => [value, props.payload.name]}
                  labelFormatter={() => ''}
                  contentStyle={{ fontSize: '11px', border: '0.5px solid #E5E5E5', borderRadius: '8px', boxShadow: 'none' }}
                />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: unknown) => {
                    const num = Number(v)
                    return Number.isFinite(num) ? `${num.toFixed(1)}\u00A0%` : ''
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
export function GenerationCards({
  actualToday,
  performanceRatio,
  cuf,
}: {
  actualToday: number
  performanceRatio: number
  cuf: number
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <GenerationCard actualToday={actualToday} />
      <PRCard actual={performanceRatio} />
      <CUFCard actual={cuf} />
    </div>
  )
}