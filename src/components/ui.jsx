export function Button({ as: As = 'button', variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-ink-900 text-white hover:bg-ink-800',
    gold: 'bg-gold-400 text-ink-900 hover:bg-gold-300',
    ghost: 'text-ink-500 hover:bg-ink-100',
    danger: 'bg-clay-500 text-white hover:bg-clay-500/90',
    outline: 'border border-ink-200 text-ink-700 hover:bg-ink-50'
  }
  return <As className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function Badge({ tone = 'ink', children }) {
  const tones = {
    ink: 'bg-ink-100 text-ink-600',
    gold: 'bg-gold-100 text-gold-700',
    clay: 'bg-clay-500/10 text-clay-500',
    moss: 'bg-moss-500/10 text-moss-500'
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Card({ className = '', children }) {
  return <div className={`rounded-lg border border-ink-100 bg-white shadow-panel ${className}`}>{children}</div>
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  )
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-ink-300 focus:border-gold-400 ${props.className || ''}`}
    />
  )
}

export function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-gold-400 ${props.className || ''}`}
    >
      {children}
    </select>
  )
}

export function TextArea(props) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-ink-300 focus:border-gold-400 ${props.className || ''}`}
    />
  )
}

export function statusTone(status) {
  const map = {
    Pago: 'moss',
    'Parcialmente Pago': 'gold',
    'Não Iniciado': 'ink',
    Active: 'moss',
    Ativa: 'moss',
    Completed: 'moss',
    Concluída: 'moss',
    Planning: 'gold',
    Planeamento: 'gold',
    Suspended: 'clay',
    Suspensa: 'clay',
    Cancelled: 'clay',
    Cancelada: 'clay',
    Active_client: 'moss'
  }
  return map[status] || 'ink'
}
