// ============================================================
// Energy Flow — solid isometric scene with shaded faces (dummy data)
// Solar Array → 3 Inverters → ACDB → LT → HT → Grid pylon
// Tailwind + inline SVG only. No API, no router.
// ============================================================

const ORANGE = '#e17100'
const ORANGE_HI = '#f59e0b'
const ORANGE_MID = '#c2410c'
const OLIVE = '#497d00'
const STEEL_TOP = '#ffffff'
const STEEL_MID = '#d4d4d4'
const STEEL_LO = '#737373'
const INK = '#ffffff'
const GROUND = '#f6f6f4'

const V = {
  dc: '2,450 kW',
  ac: '2,408 kW',
  acdb: '2,402 kW',
  lt: '2,395 kW',
  ht: '2,378 kW',
  energyToday: '14,832',
  totalLossKw: '72.4',
  totalLossPct: '2.96',
}

// ---- iso projection ----
const S = 42, CX = 575, CY = 40
const iso = (x: number, y: number, z = 0): [number, number] =>
  [CX + (x - y) * 0.866 * S, CY + (x + y) * 0.5 * S - z * S]
const ptStr = (arr: [number, number, number?][]) =>
  arr.map(([x, y, z]) => iso(x, y, z ?? 0).map(n => n.toFixed(1)).join(',')).join(' ')

// ---- primitives ----
function ILine({ a, b, ...rest }: { a: [number, number, number?]; b: [number, number, number?] } & React.SVGProps<SVGLineElement>) {
  const [x1, y1] = iso(a[0], a[1], a[2] ?? 0)
  const [x2, y2] = iso(b[0], b[1], b[2] ?? 0)
  return <line x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} {...rest} />
}

function Shadow({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  const pts = ptStr([[cx - rx, cy, 0], [cx, cy - ry, 0], [cx + rx, cy, 0], [cx, cy + ry, 0]])
  return <polygon points={pts} fill="rgba(0,0,0,0.18)" filter="url(#softShadow)" />
}

// Solid iso box: 3 shaded faces (top, right, front). Stroke keeps edges crisp.
function Box({ x, y, w, d, h, top, right, front }: { x: number; y: number; w: number; d: number; h: number; top: string; right: string; front: string }) {
  const T = ptStr([[x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h]])
  const R = ptStr([[x + w, y, h], [x + w, y + d, h], [x + w, y + d, 0], [x + w, y, 0]])
  const F = ptStr([[x, y + d, h], [x + w, y + d, h], [x + w, y + d, 0], [x, y + d, 0]])
  const stroke = 'rgba(0,0,0,0.35)'
  return (
    <g>
      <polygon points={F} fill={front} stroke={stroke} strokeWidth={0.8} />
      <polygon points={R} fill={right} stroke={stroke} strokeWidth={0.8} />
      <polygon points={T} fill={top} stroke={stroke} strokeWidth={0.8} />
    </g>
  )
}

// Tilted solar panel: back edge higher than front. Filled top with a lit face.
function Panel({ x, y }: { x: number; y: number }) {
  const zLow = 0.35, zHigh = 0.85
  const top = ptStr([[x, y + 0.9, zLow], [x + 1.0, y + 0.9, zLow], [x + 1.0, y, zHigh], [x, y, zHigh]])
  return (
    <g>
      <Shadow cx={x + 0.5} cy={y + 0.95} rx={0.65} ry={0.35} />
      {/* posts */}
      <ILine a={[x + 0.15, y + 0.75, 0]} b={[x + 0.15, y + 0.75, zLow + 0.05]} stroke={STEEL_LO} strokeWidth={1.2} />
      <ILine a={[x + 0.85, y + 0.15, 0]} b={[x + 0.85, y + 0.15, zHigh - 0.05]} stroke={STEEL_LO} strokeWidth={1.2} />
      {/* underside — hint of dark bottom */}
      <polygon points={top} fill="#1f2937" transform="translate(2,4)" opacity={0.4} />
      {/* top face */}
      <polygon points={top} fill={ORANGE_HI} stroke={ORANGE_MID} strokeWidth={0.9} />
      {/* highlight stripe along top edge */}
      <ILine a={[x, y + 0.45, (zLow + zHigh) / 2]} b={[x + 1.0, y + 0.45, (zLow + zHigh) / 2]} stroke={ORANGE_MID} strokeWidth={0.7} opacity={0.7} />
    </g>
  )
}

function Inverter({ x, y }: { x: number; y: number }) {
  const w = 0.9, d = 0.6, h = 1.0
  return (
    <g>
      <Shadow cx={x + w / 2 + 0.15} cy={y + d + 0.12} rx={0.8} ry={0.4} />
      <Box x={x} y={y} w={w} d={d} h={h} top={STEEL_TOP} right={STEEL_MID} front={STEEL_LO} />
      {/* orange status band on front face */}
      <polygon
        points={ptStr([[x, y + d, h * 0.75], [x + w, y + d, h * 0.75], [x + w, y + d, h * 0.62], [x, y + d, h * 0.62]])}
        fill={ORANGE}
      />
      {/* vent lines */}
      {[0, 1, 2].map(i => (
        <ILine key={i}
          a={[x + 0.15, y + d, h * 0.5 - i * 0.09]}
          b={[x + w - 0.15, y + d, h * 0.5 - i * 0.09]}
          stroke="rgba(0,0,0,0.4)" strokeWidth={0.7}
        />
      ))}
    </g>
  )
}

function MeterCabinet({ x, y, accent }: { x: number; y: number; accent: string }) {
  const w = 0.75, d = 0.75, h = 0.9
  return (
    <g>
      <Shadow cx={x + w / 2 + 0.1} cy={y + d + 0.12} rx={0.7} ry={0.36} />
      <Box x={x} y={y} w={w} d={d} h={h} top={STEEL_TOP} right={STEEL_MID} front={STEEL_LO} />
      {/* colored front-face band */}
      <polygon
        points={ptStr([[x + 0.08, y + d, h * 0.85], [x + w - 0.08, y + d, h * 0.85], [x + w - 0.08, y + d, h * 0.72], [x + 0.08, y + d, h * 0.72]])}
        fill={accent}
      />
      {/* display panel */}
      <polygon
        points={ptStr([[x + 0.15, y + d, h * 0.6], [x + w - 0.15, y + d, h * 0.6], [x + w - 0.15, y + d, h * 0.3], [x + 0.15, y + d, h * 0.3]])}
        fill="#111827" stroke={accent} strokeWidth={0.8}
      />
      <ILine a={[x + 0.22, y + d, h * 0.48]} b={[x + w - 0.22, y + d, h * 0.48]} stroke={accent} strokeWidth={0.9} opacity={0.85} />
    </g>
  )
}

function Pylon({ x, y, half, h }: { x: number; y: number; half: number; h: number }) {
  const base: [number, number, number][] = [
    [x - half, y - half, 0], [x + half, y - half, 0], [x + half, y + half, 0], [x - half, y + half, 0],
  ]
  const waistZ = h * 0.7
  const waist: [number, number, number][] = [
    [x - 0.25, y - 0.25, waistZ], [x + 0.25, y - 0.25, waistZ], [x + 0.25, y + 0.25, waistZ], [x - 0.25, y + 0.25, waistZ],
  ]
  const armY = h * 0.88
  const apex: [number, number, number] = [x, y, h]
  return (
    <g>
      <Shadow cx={x} cy={y + 0.05} rx={1.6} ry={0.85} />
      {/* 4 tapering legs */}
      {base.map((b, i) => <ILine key={`leg${i}`} a={b} b={waist[i]} stroke={ORANGE} strokeWidth={1.7} />)}
      {/* X bracing on the two visible faces (right and front) */}
      <ILine a={base[1]} b={waist[2]} stroke={ORANGE} strokeWidth={1} opacity={0.85} />
      <ILine a={base[2]} b={waist[1]} stroke={ORANGE} strokeWidth={1} opacity={0.85} />
      <ILine a={base[2]} b={waist[3]} stroke={ORANGE} strokeWidth={1} opacity={0.85} />
      <ILine a={base[3]} b={waist[2]} stroke={ORANGE} strokeWidth={1} opacity={0.85} />
      {/* horizontal ring at waist */}
      {waist.map((w, i) => <ILine key={`w${i}`} a={w} b={waist[(i + 1) % 4]} stroke={ORANGE} strokeWidth={1.3} />)}
      {/* stem to apex */}
      {waist.map((w, i) => <ILine key={`s${i}`} a={w} b={apex} stroke={ORANGE} strokeWidth={1.3} opacity={0.9} />)}
      {/* cross-arm */}
      <ILine a={[x - 0.95, y, armY]} b={[x + 0.95, y, armY]} stroke={ORANGE} strokeWidth={1.7} />
      {/* insulator hangs */}
      {[-0.95, 0, 0.95].map(dx => (
        <g key={dx}>
          <ILine a={[x + dx, y, armY]} b={[x + dx, y, armY + 0.18]} stroke={ORANGE} strokeWidth={1.2} />
          <circle
            cx={iso(x + dx, y, armY + 0.18)[0].toFixed(1) as any}
            cy={iso(x + dx, y, armY + 0.18)[1].toFixed(1) as any}
            r={3.5} fill={ORANGE}
          />
        </g>
      ))}
    </g>
  )
}

function Pill({ at, dy, label, value }: { at: [number, number, number]; dy: number; label: string; value: string }) {
  const [px, py] = iso(...at)
  const wLabel = label.length * 6.4
  const wValue = value.length * 6.8
  const w = 26 + wLabel + wValue + 10
  return (
    <g transform={`translate(${(px - w / 2).toFixed(1)},${(py + dy).toFixed(1)})`}>
      <rect width={w} height={28} rx={14} fill="#111827" />
      <circle cx={13} cy={14} r={3} fill={ORANGE} />
      <text x={23} y={18.5} fontFamily="Inter,system-ui,sans-serif" fontSize={12} fontWeight={600} fill="white">{label}</text>
      <text x={23 + wLabel + 8} y={18.5} fontFamily="Inter,system-ui,sans-serif" fontSize={12} fontWeight={700} fill={ORANGE}>{value}</text>
    </g>
  )
}

// ---- ground grid ----
function Ground() {
  const lines = []
  for (let i = 0; i <= 13; i++) {
    lines.push(<ILine key={`gx${i}`} a={[i, 0]} b={[i, 13]} stroke="black" strokeOpacity={0.06} />)
    lines.push(<ILine key={`gy${i}`} a={[0, i]} b={[13, i]} stroke="black" strokeOpacity={0.06} />)
  }
  return <>{lines}</>
}

// ---- spine + branches ----
const spine: [number, number][] = [
  iso(2.5, 7.5, 1.05),      // panel field junction
  iso(5.85, 7.2, 1.4),      // above inverters junction
  iso(7.45, 5.5, 1.2),      // pre-meter transition
  iso(8.175, 4.675, 1.05),  // ACDB top
  iso(9.275, 3.575, 1.05),  // LT top
  iso(10.375, 2.475, 1.05), // HT top
  iso(11.5, 1.5, 3.42),     // pylon apex
]
const spineD = spine.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
const junction = spine[1]
const inverterTops: [number, number][] = [
  iso(5.85, 5.9, 1.0), iso(5.85, 7.0, 1.0), iso(5.85, 8.1, 1.0),
]

function LossTag({ a, b, txt, dy = 14 }: { a: [number, number]; b: [number, number]; txt: string; dy?: number }) {
  return (
    <text x={((a[0] + b[0]) / 2).toFixed(1)} y={((a[1] + b[1]) / 2 + dy).toFixed(1)}
      textAnchor="middle" fontFamily="Inter,system-ui,sans-serif" fontSize={10.5} fontWeight={600}
      fill="black" fillOpacity={0.5}>{txt}</text>
  )
}

// ============================================================
// Page
// ============================================================
export default function EnergyFlowPage() {
  return (
    <div className="min-h-screen text-black px-0 sm:px-8 py-8" style={{ background: INK }}>
      <style>{`
        @keyframes flowDash { to { stroke-dashoffset: -36; } }
        .flow-spine { animation: flowDash 1.3s linear infinite; }
        .flow-branch { animation: flowDash 1.8s linear infinite; }
        @keyframes nodePulse { 0%,100% { opacity: .25 } 50% { opacity: .6 } }
        .node-halo { animation: nodePulse 1.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .flow-spine, .flow-branch, .node-halo { animation: none; }
        }
      `}</style>

      <header className="max-w-6xl mx-auto">
        <div className="flex items-stretch gap-3">
          <span className="w-1 rounded-full shrink-0 self-stretch" style={{ background: ORANGE }} />
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] font-semibold text-black/45">Single line diagram</p>
            <h1 className="text-[26px] font-semibold tracking-tight mt-1">Energy Flow</h1>
            <p className="text-[13px] text-black/55 mt-1">Live generation path — array to grid, with stage losses</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-8">
        <div className="overflow-x-auto overflow-y-hidden -mx-4 px-4 sm:mx-0 sm:px-0">
          <svg viewBox="0 0 1150 620" className="w-full min-w-[900px]" role="img"
            aria-label="Energy flow from solar array through inverters and meters to the grid">
            <defs>
              <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" />
              </filter>
              <filter id="pathGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>

            {/* ground plane */}
            <polygon points={ptStr([[-1, -1, 0], [14, -1, 0], [14, 14, 0], [-1, 14, 0]])} fill={GROUND} />
            <Ground />

            {/* solar field patch */}
            <polygon
              points={ptStr([[0.4, 5.4, 0.01], [4.4, 5.4, 0.01], [4.4, 9.4, 0.01], [0.4, 9.4, 0.01]])}
              fill={OLIVE} fillOpacity={0.1} stroke={OLIVE} strokeOpacity={0.55} strokeWidth={1.2}
            />

            {/* panels 3×3 */}
            {[0, 1, 2].map(r => [0, 1, 2].map(c => (
              <Panel key={`${r}-${c}`} x={0.7 + c * 1.2} y={5.7 + r * 1.2} />
            )))}

            {/* inverters — vertical stack (like a row of cabinets side by side in depth) */}
            <Inverter x={5.4} y={5.6} />
            <Inverter x={5.4} y={6.7} />
            <Inverter x={5.4} y={7.8} />

            {/* meters stepping toward pylon */}
            <MeterCabinet x={7.8} y={4.3} accent={OLIVE} />
            <MeterCabinet x={8.9} y={3.2} accent={OLIVE} />
            <MeterCabinet x={10.0} y={2.1} accent={OLIVE} />

            {/* pylon */}
            <Pylon x={11.5} y={1.5} half={0.55} h={3.4} />

            {/* inverter branch feeds into main spine junction */}
            {inverterTops.map((a, i) => (
              <path key={i}
                d={`M${a[0].toFixed(1)},${a[1].toFixed(1)} L${junction[0].toFixed(1)},${junction[1].toFixed(1)}`}
                fill="none" stroke={ORANGE} strokeWidth={1.2} strokeDasharray="4 6" opacity={0.5}
                className="flow-branch" />
            ))}

            {/* main flow spine — glow + static + animated dash */}
            <path d={spineD} fill="none" stroke={ORANGE} strokeWidth={9} opacity={0.18} filter="url(#pathGlow)" />
            <path d={spineD} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={2} />
            <path d={spineD} fill="none" stroke={ORANGE} strokeWidth={2.2} strokeDasharray="10 12" className="flow-spine" />

            {/* spine node glows */}
            {spine.map((p, i) => (
              <g key={i}>
                <circle cx={p[0].toFixed(1) as any} cy={p[1].toFixed(1) as any} r={9} fill={ORANGE} className="node-halo" />
                <circle cx={p[0].toFixed(1) as any} cy={p[1].toFixed(1) as any} r={4} fill={ORANGE_HI} />
              </g>
            ))}

            {/* per-segment losses */}
            <LossTag a={spine[0]} b={spine[1]} txt="−1.73%" dy={16} />
            <LossTag a={spine[2]} b={spine[3]} txt="−0.22%" dy={14} />
            <LossTag a={spine[3]} b={spine[4]} txt="−0.28%" dy={14} />
            <LossTag a={spine[4]} b={spine[5]} txt="−0.74%" dy={14} />
            <LossTag a={spine[5]} b={spine[6]} txt="export" dy={16} />

            {/* pills */}
            <Pill at={[2.5, 7.5, 1.5]} dy={-24} label="Solar Array" value={V.dc} />
            <Pill at={[5.85, 7.2, 1.85]} dy={-24} label="Inverters ×3" value={V.ac} />
            <Pill at={[8.175, 4.675, 1.4]} dy={-24} label="ACDB" value={V.acdb} />
            <Pill at={[9.275, 3.575, 0]} dy={30} label="LT" value={V.lt} />
            <Pill at={[10.375, 2.475, 1.4]} dy={-24} label="HT" value={V.ht} />
            <Pill at={[11.5, 1.5, 3.9]} dy={-24} label="Grid" value={V.ht} />
          </svg>
        </div>

        {/* summary strip */}
        <div className="mt-8 pt-5 border-t border-black/10 grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
          {[
            { label: 'DC at array', value: V.dc, unit: '', color: ORANGE },
            { label: 'Grid export', value: V.ht, unit: '', color: '#000' },
            { label: 'Total losses', value: `${V.totalLossKw} kW`, unit: `· ${V.totalLossPct}%`, color: '#b91c1c' },
            { label: 'Energy today', value: V.energyToday, unit: 'kWh', color: OLIVE },
          ].map((s) => (
            <div key={s.label} className="flex items-stretch gap-2.5">
              <span className="w-[3px] rounded-full self-stretch shrink-0" style={{ background: s.color }} />
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-black/45">{s.label}</p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-[19px] leading-none font-semibold tabular-nums">{s.value}</span>
                  {s.unit && <span className="text-[12px] font-medium text-black/50">{s.unit}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
