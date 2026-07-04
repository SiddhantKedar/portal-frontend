import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

// Animated solar panel construction element
function SolarPanel({ delay = 0, built = false }: { delay?: number; built?: boolean }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <div
      className="transition-all duration-700"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
    >
      <svg width="48" height="32" viewBox="0 0 48 32" fill="none">
        {/* Panel frame */}
        <rect x="1" y="1" width="46" height="30" rx="2" stroke={built ? '#D97706' : '#E5E5E5'} strokeWidth="1.5" fill={built ? '#FEF3C7' : '#FAFAFA'} />
        {/* Grid lines horizontal */}
        <line x1="1" y1="11" x2="47" y2="11" stroke={built ? '#D97706' : '#D4D4D4'} strokeWidth="0.75" />
        <line x1="1" y1="21" x2="47" y2="21" stroke={built ? '#D97706' : '#D4D4D4'} strokeWidth="0.75" />
        {/* Grid lines vertical */}
        <line x1="16" y1="1" x2="16" y2="31" stroke={built ? '#D97706' : '#D4D4D4'} strokeWidth="0.75" />
        <line x1="32" y1="1" x2="32" y2="31" stroke={built ? '#D97706' : '#D4D4D4'} strokeWidth="0.75" />
        {/* Shine dot */}
        {built && <circle cx="8" cy="6" r="2" fill="#F59E0B" opacity="0.6" />}
      </svg>
    </div>
  )
}

// Blinking cursor for "under construction" feel
function BlinkingCursor() {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const t = setInterval(() => setOn(o => !o), 530)
    return () => clearInterval(t)
  }, [])
  return (
    <span
      className="inline-block w-[2px] h-[1.1em] bg-amber-600 ml-1 align-middle transition-opacity duration-100"
      style={{ opacity: on ? 1 : 0 }}
    />
  )
}

export default function NotFoundPage() {
  const navigate = useNavigate()

  // Panel build sequence — first 6 built (amber), rest pending (gray)
  const panels = Array.from({ length: 12 }, (_, i) => ({
    built: i < 6,
    delay: i * 120,
  }))

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">

      {/* Logo mark */}
      <div className="flex items-center gap-2 mb-12">
        <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <span className="text-[15px] font-semibold text-black uppercase tracking-tight">Enerlynx</span>
      </div>

      {/* Solar panel array */}
      <div className="mb-10">
        <div className="grid grid-cols-6 gap-2 mb-1.5">
          {panels.slice(0, 6).map((p, i) => (
            <SolarPanel key={i} delay={p.delay} built={p.built} />
          ))}
        </div>
        <div className="grid grid-cols-6 gap-2">
          {panels.slice(6).map((p, i) => (
            <SolarPanel key={i + 6} delay={p.delay + 720} built={p.built} />
          ))}
        </div>
        {/* Construction bar */}
        <div className="mt-3 h-1 bg-[#F1F1F1] rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-600 rounded-full transition-all duration-[2s] ease-out"
            style={{ width: '50%' }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">Installation progress</span>
          <span className="text-[10px] font-medium text-amber-600">50%</span>
        </div>
      </div>

      {/* Heading */}
      <h1 className="text-[32px] font-bold text-black tracking-tight text-center leading-tight mb-2">
        Page under construction
        <BlinkingCursor />
      </h1>
      <p className="text-[14px] text-gray-400 text-center max-w-sm mb-8">
        This section is being wired up. Check back soon — we're commissioning fast.
      </p>

      {/* Status pills */}
      <div className="flex items-center gap-3 mb-10 flex-wrap justify-center">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full bg-amber-600/10 text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
          In development
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full bg-[#F1F1F1] text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          Not yet deployed
        </span>
      </div>

      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-[13px] font-medium text-black border border-[#E5E5E5] hover:border-amber-600 hover:text-amber-600 rounded-lg px-4 py-2.5 transition-colors"
      >
        <ArrowLeft size={14} />
        Go back
      </button>

    </div>
  )
}