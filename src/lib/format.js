export function formatKz(value) {
  const n = Number(value) || 0
  return (
    new Intl.NumberFormat('pt-AO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n) + ' Kz'
  )
}

export function formatNumber(value) {
  const n = Number(value) || 0
  return new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(n)
}

export function formatPercent(value) {
  const n = Number(value) || 0
  return `${new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 2 }).format(n)}%`
}

export function formatDate(value) {
  if (!value) return '—'
  const d = value?.toDate ? value.toDate() : new Date(value)
  if (isNaN(d)) return '—'
  return new Intl.DateTimeFormat('pt-AO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
