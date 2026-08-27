export default function StatCard({ label, value, sub, tone = 'ink', icon: Icon }) {
  const toneMap = {
    ink: { text: 'text-ink-800', chip: 'bg-ink-100 text-ink-600', bar: 'bg-ink-400' },
    gold: { text: 'text-gold-500', chip: 'bg-gold-100 text-gold-700', bar: 'bg-gold-400' },
    clay: { text: 'text-clay-500', chip: 'bg-clay-500/10 text-clay-500', bar: 'bg-clay-500' },
    moss: { text: 'text-moss-500', chip: 'bg-moss-500/10 text-moss-500', bar: 'bg-moss-500' }
  }
  const t = toneMap[tone] || toneMap.ink

  return (
    <div className="ledger-card relative overflow-hidden rounded-lg border border-ink-100 bg-white p-5 shadow-panel">
      {/* Barra de destaque no topo — a cor identifica o tipo de valor (dívida,
          recebido, retenção…) mesmo antes de ler o número. */}
      <span className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
        {Icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${t.chip}`}>
            <Icon size={15} strokeWidth={2} />
          </span>
        )}
      </div>

      <p className={`num mt-3 text-xl sm:text-2xl font-semibold break-words ${t.text}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
    </div>
  )
}