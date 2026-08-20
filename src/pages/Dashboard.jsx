import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { Collections, listAll, getSettings } from '../lib/db.js'
import { computeObraSummary } from '../lib/calc.js'
import { formatKz, formatPercent } from '../lib/format.js'
import PageHeader from '../components/PageHeader.jsx'
import StatCard from '../components/StatCard.jsx'
import { Card } from '../components/ui.jsx'

export default function Dashboard() {
  const [clients, setClients] = useState([])
  const [obras, setObras] = useState([])
  const [payments, setPayments] = useState([])
  const [settings, setSettings] = useState({ defaultRetentionRate: 6.5 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [c, o, p, s] = await Promise.all([
        listAll(Collections.CLIENTS),
        listAll(Collections.OBRAS),
        listAll(Collections.PAYMENTS),
        getSettings()
      ])
      setClients(c)
      setObras(o)
      setPayments(p)
      setSettings(s)
      setLoading(false)
    }
    load()
  }, [])

  const summaries = useMemo(() => {
    return obras.map((obra) => {
      const obraPayments = payments.filter((p) => p.obraId === obra.id)
      const s = computeObraSummary(obra, obraPayments, settings.defaultRetentionRate)
      return { obra, ...s }
    })
  }, [obras, payments, settings])

  const totals = useMemo(() => {
    return summaries.reduce(
      (acc, s) => {
        acc.value += s.obraTotal
        acc.paid += s.totalPaid
        acc.outstanding += s.remaining
        acc.retention += s.totalRetention
        return acc
      },
      { value: 0, paid: 0, outstanding: 0, retention: 0 }
    )
  }, [summaries])

  const activeCount = obras.filter((o) => o.status === 'Ativa' || o.status === 'Active').length
  const completedCount = summaries.filter((s) => s.status === 'Pago').length

  const paidVsOutstanding = [
    { name: 'Pago', value: Math.round(totals.paid) },
    { name: 'Em Aberto', value: Math.round(totals.outstanding) }
  ]
  const PIE_COLORS = ['#3f7a56', '#b4552f']

  const byMonth = useMemo(() => {
    const map = {}
    payments.forEach((p) => {
      if (!p.paymentDate) return
      const key = new Date(p.paymentDate).toLocaleDateString('pt-AO', { month: 'short', year: '2-digit' })
      map[key] = (map[key] || 0) + Number(p.paymentAmount || 0)
    })
    return Object.entries(map).map(([month, total]) => ({ month, total: Math.round(total) }))
  }, [payments])

  const byClient = useMemo(() => {
    const map = {}
    summaries.forEach((s) => {
      const client = clients.find((c) => c.id === s.obra.clientId)
      const name = client?.clientName || 'Sem Cliente'
      map[name] = (map[name] || 0) + s.remaining
    })
    return Object.entries(map)
      .map(([name, outstanding]) => ({ name, outstanding: Math.round(outstanding) }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 8)
  }, [summaries, clients])

  if (loading) return <div className="text-ink-400">A carregar painel…</div>

  return (
    <div>
      <PageHeader eyebrow="Visão Geral" title="Painel Financeiro" subtitle="Resumo de clientes, obras e pagamentos em Kwanzas (Kz)" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total de Clientes" value={clients.length} />
        <StatCard label="Total de Obras" value={obras.length} sub={`${activeCount} ativas · ${completedCount} pagas`} />
        <StatCard label="Valor Total das Obras" value={formatKz(totals.value)} />
        <StatCard label="Total Recebido" value={formatKz(totals.paid)} tone="moss" />
        <StatCard label="Total em Aberto" value={formatKz(totals.outstanding)} tone="clay" />
        <StatCard label="Retenção Acumulada" value={formatKz(totals.retention)} tone="gold" />
        <StatCard
          label="Progresso Geral de Pagamento"
          value={totals.value > 0 ? formatPercent((totals.paid / totals.value) * 100) : '0%'}
        />
        <StatCard label="Obras Concluídas (Pagas)" value={completedCount} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card className="p-5">
          <h3 className="font-display text-sm font-semibold text-ink-700 mb-4">Pago vs. Em Aberto</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={paidVsOutstanding} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                {paidVsOutstanding.map((entry, i) => (
                  <Cell key={entry.name} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatKz(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-display text-sm font-semibold text-ink-700 mb-4">Pagamentos por Mês</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6eaef" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
              <Tooltip formatter={(v) => formatKz(v)} />
              <Bar dataKey="total" fill="#cf9a34" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-display text-sm font-semibold text-ink-700 mb-4">Em Aberto por Cliente</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byClient} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6eaef" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatKz(v)} />
              <Bar dataKey="outstanding" fill="#b4552f" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-display text-sm font-semibold text-ink-700 mb-4">Progresso de Pagamento por Obra</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summaries.map((s) => ({ name: s.obra.obraName, pct: s.paidPercent }))} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6eaef" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="pct" fill="#42506a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  )
}
