import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, Plus } from 'lucide-react'
import {
  Collections,
  getOne,
  getPaymentsByObra,
  getProformasByObra,
  getSettings,
  removeOne,
  updateOne
} from '../lib/db.js'
import { computeObraSummary, computeProformaBalances } from '../lib/calc.js'
import { formatKz, formatPercent, formatDate } from '../lib/format.js'
import { exportObraStatementPDF } from '../lib/pdf.js'
import PageHeader from '../components/PageHeader.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { Badge, Button, Card, Field, Input, Select, TextArea } from '../components/ui.jsx'

export default function ObraDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [obra, setObra] = useState(null)
  const [client, setClient] = useState(null)
  const [payments, setPayments] = useState([])
  const [proformas, setProformas] = useState([])
  const [settings, setSettings] = useState({ defaultRetentionRate: 6.5 })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)

  useEffect(() => {
    async function load() {
      const o = await getOne(Collections.OBRAS, id)
      const [p, pf, s, c] = await Promise.all([
        getPaymentsByObra(id),
        getProformasByObra(id),
        getSettings(),
        o?.clientId ? getOne(Collections.CLIENTS, o.clientId) : null
      ])
      setObra(o)
      setForm(o)
      setPayments(p)
      setProformas(pf)
      setSettings(s)
      setClient(c)
      setLoading(false)
    }
    load()
  }, [id])

  const summary = useMemo(() => {
    if (!obra) return null
    return computeObraSummary(obra, payments, settings.defaultRetentionRate)
  }, [obra, payments, settings])

  // Estado de pagamento de cada Proforma individualmente — mostra se a
  // Proforma nº 1, 2, 3... já está paga, parcialmente paga ou nada foi
  // alocado a ela ainda, mesmo quando um único pagamento cobre várias.
  const proformaBalances = useMemo(() => computeProformaBalances(proformas, payments), [proformas, payments])

  async function saveEdit(e) {
    e.preventDefault()
    await updateOne(Collections.OBRAS, id, form)
    setObra(form)
    setEditing(false)
  }

  async function handleDelete() {
    if (!confirm('Eliminar esta obra? Todos os pagamentos associados devem ser removidos primeiro.')) return
    if (payments.length > 0) {
      alert('Não é possível eliminar: existem pagamentos associados a esta obra.')
      return
    }
    await removeOne(Collections.OBRAS, id)
    navigate('/obras')
  }

  if (loading || !obra || !summary) return <div className="text-ink-400">A carregar…</div>

  const effectiveRate = obra.retentionRate ?? settings.defaultRetentionRate

  return (
    <div>
      <button onClick={() => navigate('/obras')} className="mb-4 flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft size={15} /> Voltar às Obras
      </button>

      <PageHeader
        eyebrow={client?.clientName || 'Obra'}
        title={obra.obraName}
        subtitle={[obra.location, obra.contractNumber].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button variant="outline" onClick={() => exportObraStatementPDF(obra, client, summary)}>
              <FileDown size={16} /> Extrato PDF
            </Button>
            <Button variant="gold" onClick={() => navigate(`/pagamentos/novo?obraId=${id}&clientId=${obra.clientId}`)}>
              <Plus size={16} /> Novo Pagamento
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Total Material</p>
          <p className="num mt-1 text-lg font-semibold">{formatKz(obra.totalMaterial)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Total Mão de Obra</p>
          <p className="num mt-1 text-lg font-semibold">{formatKz(obra.totalMaoDeObra)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">IVA ({obra.ivaRate}%)</p>
          <p className="num mt-1 text-lg font-semibold">{formatKz(obra.ivaAmount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Total Geral</p>
          <p className="num mt-1 text-lg font-semibold text-ink-900">{formatKz(summary.obraTotal)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Total Pago</p>
          <p className="num mt-1 text-lg font-semibold text-moss-500">{formatKz(summary.totalPaid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Restante</p>
          <p className="num mt-1 text-lg font-semibold text-clay-500">{formatKz(summary.remaining)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Retenção Total (Taxa {formatPercent(effectiveRate)})</p>
          <p className="num mt-1 text-lg font-semibold text-gold-600">{formatKz(summary.totalRetention)}</p>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Progresso Pagamento</p>
            <p className="num mt-1 text-lg font-semibold">{formatPercent(summary.paidPercent)}</p>
          </div>
          <ProgressRing percent={summary.paidPercent} size={48} strokeWidth={5} />
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Badge tone={summary.status === 'Pago' ? 'moss' : summary.status === 'Não Iniciado' ? 'ink' : 'gold'}>{summary.status}</Badge>
        <Badge tone="ink">Progresso Físico: {formatPercent(obra.physicalProgress || 0)}</Badge>
        <Badge tone="ink">{summary.paymentCount} pagamento(s)</Badge>
      </div>

      <h2 className="font-display text-base font-semibold text-ink-800 mb-3">Histórico de Pagamentos</h2>
      <Card className="overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium text-right">Pagamento</th>
                <th className="px-4 py-3 font-medium">Proforma(s)</th>
                <th className="px-4 py-3 font-medium">%</th>
                <th className="px-4 py-3 font-medium">% Acumulada</th>
                <th className="px-4 py-3 font-medium text-right">Mão de Obra</th>
                <th className="px-4 py-3 font-medium text-right">Retenção</th>
                <th className="px-4 py-3 font-medium text-right">Restante</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r, i) => (
                <tr key={r.id || i} className="border-b border-ink-50 last:border-0">
                  <td className="px-4 py-3 num">{formatDate(r.paymentDate)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(r.paymentAmount)}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {Array.isArray(r.allocations) && r.allocations.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {r.allocations.map((a, idx) => (
                          <span key={idx} className="num">
                            {a.proformaNumber || '—'}: {formatKz(a.amount)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-300">Geral (sem proforma)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 num">{formatPercent(r.paymentPercent)}</td>
                  <td className="px-4 py-3 num">{formatPercent(r.cumulativePercent)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(r.maoDeObraPortion)}</td>
                  <td className="px-4 py-3 num text-right text-gold-600">{formatKz(r.retentionAmount)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(r.remainingAfter)}</td>
                </tr>
              ))}
              {summary.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-ink-400">
                    Sem pagamentos registados para esta obra.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="font-display text-base font-semibold text-ink-800 mb-3">Proformas</h2>
      <Card className="overflow-hidden mb-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium text-right">Total Geral</th>
                <th className="px-4 py-3 font-medium text-right">Pago</th>
                <th className="px-4 py-3 font-medium text-right">Restante</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {proformaBalances.rows.map((pf) => (
                <tr
                  key={pf.id}
                  onClick={() => navigate(`/proformas/${pf.id}`)}
                  className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-gold-50/40"
                >
                  <td className="px-4 py-3 num text-ink-800">{pf.proformaNumber}</td>
                  <td className="px-4 py-3 num">{formatDate(pf.date)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(pf.total)}</td>
                  <td className="px-4 py-3 num text-right text-moss-500">{formatKz(pf.paidAmount)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(pf.remaining)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={pf.status === 'Pago' ? 'moss' : pf.status === 'Parcialmente Pago' ? 'gold' : 'ink'}>
                      {pf.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {proformaBalances.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                    Sem proformas associadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {proformaBalances.unallocated > 0.01 && (
        <p className="mb-8 text-xs text-ink-400">
          <span className="num text-ink-600">{formatKz(proformaBalances.unallocated)}</span> em pagamentos registados
          não foram atribuídos a nenhuma Proforma específica (contam apenas para o total geral da Obra acima).
        </p>
      )}
      {proformaBalances.unallocated <= 0.01 && <div className="mb-8" />}

      <div className="flex justify-end">
        <Button variant="danger" onClick={handleDelete}>
          Eliminar Obra
        </Button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
          <Card className="w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Editar Obra</h2>
            <form onSubmit={saveEdit} className="space-y-4">
              <Field label="Nome da Obra">
                <Input required value={form.obraName} onChange={(e) => setForm({ ...form, obraName: e.target.value })} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Localização">
                  <Input value={form.location || ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </Field>
                <Field label="Nº Contrato">
                  <Input value={form.contractNumber || ''} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Taxa de Retenção (%)" hint="Vazio = usar definição global">
                  <Input
                    type="number"
                    step="0.01"
                    value={form.retentionRate ?? ''}
                    onChange={(e) => setForm({ ...form, retentionRate: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </Field>
                <Field label="Progresso Físico (%)">
                  <Input type="number" value={form.physicalProgress || 0} onChange={(e) => setForm({ ...form, physicalProgress: Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="Estado">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="Planeamento">Planeamento</option>
                  <option value="Ativa">Ativa</option>
                  <option value="Suspensa">Suspensa</option>
                  <option value="Concluída">Concluída</option>
                  <option value="Cancelada">Cancelada</option>
                </Select>
              </Field>
              <Field label="Notas">
                <TextArea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="gold">
                  Guardar Alterações
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}