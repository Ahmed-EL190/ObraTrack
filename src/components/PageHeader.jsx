export default function PageHeader({ eyebrow, title, subtitle, actions, icon: Icon }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-900 text-gold-400">
              <Icon size={18} strokeWidth={2} />
            </span>
          )}
          <div>
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-wider text-gold-500 mb-1">{eyebrow}</p>
            )}
            <h1 className="font-display text-2xl font-semibold text-ink-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {/* Régua de referência: um pequeno traço dourado (o "zero" da régua) que
          se esbate num cinzento neutro — a mesma linguagem de desenho técnico
          do resto da interface, aplicada a cada cabeçalho de página. */}
      <div className="mt-5 h-px w-full bg-gradient-to-r from-gold-400/80 via-ink-100 to-ink-100" />
    </div>
  )
}