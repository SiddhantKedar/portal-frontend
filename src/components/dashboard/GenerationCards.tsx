import { BarChart, Bar, Cell, YAxis, ResponsiveContainer, Tooltip, LabelList, CartesianGrid } from 'recharts'

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
    <div className="flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-[15px] font-semibold text-black tracking-tight">{title}</p>
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
            <Tooltip
              cursor={false}
              formatter={(value, _name, props) => [formatValue(Number(value)), props.payload.name]}
              labelFormatter={() => ''}
              contentStyle={{
                fontSize: '13px',
                color: '#000',
                border: '1px solid #000',
                borderRadius: '8px',
                boxShadow: 'none',
                fontWeight: 500,
              }}
            />
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0 md:divide-x md:divide-black/15">
      <div className="md:pr-8">
        <ComparisonCard
          title="Generation"
          actual={actualToday}
          targeted={5500}
          formatValue={(n) => `${n.toLocaleString()}\u00A0kWh`}
        />
      </div>
      <div className="md:px-8">
        <ComparisonCard
          title="Performance Ratio"
          actual={performanceRatio}
          targeted={79.4}
          formatValue={(n) => `${n.toFixed(1)}%`}
          domainMax={100}
        />
      </div>
      <div className="md:pl-8">
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