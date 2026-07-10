import { BarChart, Bar, Cell, YAxis, ResponsiveContainer, LabelList, CartesianGrid } from 'recharts'

const COLORS = {
  actual: '#e17100',
  targeted: '#497d00',
}

// ---- Inline legend (sits next to the card title, not in a bordered row) ----
function InlineLegend() {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.actual }} />
        <span className="text-[12px] text-black font-medium">Actual</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.targeted }} />
        <span className="text-[12px] text-black font-medium">Targeted</span>
      </div>
    </div>
  )
}

// ---- One card, three configs ----
function ComparisonCard({
  title, actual, targeted, formatValue, domainMax,
}: {
  title: string
  actual: number
  targeted: number
  formatValue: (n: number) => string
  domainMax?: number
}) {
  const data = [
    { name: 'Actual', value: actual, fill: COLORS.actual },
    { name: 'Targeted', value: targeted, fill: COLORS.targeted },
  ]

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 mb-4">
        <p className="text-[15px] font-semibold text-black tracking-tight leading-snug">{title}</p>
        <InlineLegend />
      </div>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 28, right: 12, left: 12, bottom: 0 }}
            barCategoryGap="20%"
            barSize={56}
          >
            <CartesianGrid stroke="#F1F1F1" vertical={false} />
            <YAxis hide domain={[0, domainMax ?? 'auto']} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: unknown) => {
                  const num = Number(v)
                  return Number.isFinite(num) ? formatValue(num) : ''
                }}
                style={{ fontSize: 15, fontWeight: 700, fill: '#000' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-0 lg:divide-x lg:divide-black/15">
      <div className="lg:pr-8 min-w-0">
        <ComparisonCard
          title="Generation"
          actual={actualToday}
          targeted={5500}
          formatValue={(n) => `${n.toLocaleString()}\u00A0kWh`}
          domainMax={Math.max(actualToday, 5500) * 1.25}
        />
      </div>
      <div className="lg:px-8 min-w-0">
        <ComparisonCard
          title="Performance Ratio"
          actual={performanceRatio}
          targeted={79.4}
          formatValue={(n) => `${n.toFixed(1)}%`}
          domainMax={100}
        />
      </div>
      <div className="lg:pl-8 min-w-0">
        <ComparisonCard
          title="Capacity Utilisation Factor"
          actual={cuf}
          targeted={21.9}
          formatValue={(n) => `${n.toFixed(1)}%`}
          domainMax={Math.max(cuf, 21.9) * 1.3}
        />
      </div>
    </div>

  )
}