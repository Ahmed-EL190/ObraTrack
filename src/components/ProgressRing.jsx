export default function ProgressRing({ percent = 0, size = 56, strokeWidth = 6, label }) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference

  const color = clamped >= 100 ? '#3f7a56' : clamped >= 50 ? '#cf9a34' : '#b4552f'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#e6eaef" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span className="num absolute text-[11px] font-semibold text-ink-700">
        {label ?? `${clamped.toFixed(0)}%`}
      </span>
    </div>
  )
}
