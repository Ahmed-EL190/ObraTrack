export default function StatCard({ label, value, sub, tone = 'ink' }) {
  const toneMap = {
    ink: 'text-ink-800',
    gold: 'text-gold-500',
    clay: 'text-clay-500',
    moss: 'text-moss-500'
  }
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`num mt-2 text-xl sm:text-2xl font-semibold break-words ${toneMap[tone]}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
    </div>
  )
}