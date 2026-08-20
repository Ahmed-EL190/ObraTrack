import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, Plus } from 'lucide-react'
import {
  Collections,
  getObrasByClient,
  getPaymentsByClient,
  getProformasByObra,
  getOne,
  updateOne,
  removeOne
} from '../lib/db.js'
import { computeClientSummary, computeObraSummary } from '../lib/calc.js'
import { formatKz, formatPercent, formatDate } from '../lib/format.js'
import { exportClientStatementPDF } from '../lib/pdf.js'
import PageHeader from '../components/PageHeader.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { Badge, Button, Card, Field, Input, Select, TextArea } from '../components/ui.jsx'
import { getSettings } from '../lib/db.js'

export default function ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [obras, setObras] = useState([])
  const [payments, setPayments] = useState([])
  const [settings, setSettings] = useState({ defaultRetentionRate: 6.5 })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)

  useEffect(() => {
    async function load() {
      const [c, o, p, s] = await Promise.all([
        getOne(Collections.CLIENTS, id),
        getObrasByClient(id),
        getPaymentsByClient(id),
        getSettings()
      ])
      setClient(c)
      setForm(c)
      setObras(o)
      setPayments(p)
      setSettings(s)
      setLoading(false)
    }
    load()
  }, [id])

  const obraSummaries = useMemo(() => {
    return obras.map((obra) => {
      const obraPayments = payments.filter((p) => p.obraId === obra.id)
      return { obra, ...computeObraSummary(obra, obraPayments, settings.defaultRetentionRate) }
    })
  }, [obras, payments, settings])

  const clientSummary = useMemo(() => computeClientSummary(obraSummaries), [obraSummaries])

  const statementRows = useMemo(() => {
    const rows = []
    obraSummaries.forEach(({ obra, rows: obraRows }) => {
      obraRows.forEach((r) =>
        rows.push({
          obraName: obra.obraName,
          proformaNumber: obra.proformaNumber,
          obraTotal: obra.totalGeral ?? obra.contractValue,
          ...r
        })
      )
    })
    return rows.sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate))
  }, [obraSummaries])

  async function saveEdit(e) {
    e.preventDefault()
    await updateOne(Collections.CLIENTS, id, form)
    setClient(form)
    setEditing(false)
  }

  async function handleDelete() {
    if (!confirm('Eliminar este cliente? Esta ação não pode ser desfeita.')) return
    await removeOne(Collections.CLIENTS, id)
    navigate('/clientes')
  }

  if (loading || !client) return <div className="text-ink-400">A carregar…</div>

  return (
    <div>
      <button onClick={() => navigate('/clientes')} className="mb-4 flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft size={15} /> Voltar aos Clientes
      </button>

      <PageHeader
        eyebrow={client.nif ? `NIF ${client.nif}` : 'Cliente'}
        title={client.clientName}
        subtitle={client.phone || client.email || ''}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button variant="outline" onClick={() => exportClientStatementPDF(client, statementRows, clientSummary)}>
              <FileDown size={16} /> Extrato PDF
            </Button>
            <Button variant="gold" onClick={() => navigate(`/pagamentos/novo?clientId=${id}`)}>
              <Plus size={16} /> Novo Pagamento
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Total Obras</p>
          <p className="num mt-1 text-xl font-semibold">{clientSummary.totalObras}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Valor Contratado</p>
          <p className="num mt-1 text-xl font-semibold">{formatKz(clientSummary.totalContractValue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Total Pago</p>
          <p className="num mt-1 text-xl font-semibold text-moss-500">{formatKz(clientSummary.totalPaid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-ink-400">Total em Aberto</p>
          <p className="num mt-1 text-xl font-semibold text-clay-500">{formatKz(clientSummary.totalOutstanding)}</p>
        </Card>
        <Card className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Progresso Geral</p>
            <p className="num mt-1 text-xl font-semibold">
              {clientSummary.totalContractValue > 0
                ? formatPercent((clientSummary.totalPaid / clientSummary.totalContractValue) * 100)
                : '0%'}
            </p>
          </div>
          <ProgressRing
            percent={clientSummary.totalContractValue > 0 ? (clientSummary.totalPaid / clientSummary.totalContractValue) * 100 : 0}
          />
        </Card>
      </div>

      <Card className="p-4 mb-6">
        <p className="text-xs uppercase tracking-wide text-ink-400">Retenção Total Acumulada</p>
        <p className="num mt-1 text-lg font-semibold text-gold-600">{formatKz(clientSummary.totalRetention)}</p>
      </Card>

      <h2 className="font-display text-base font-semibold text-ink-800 mb-3">Obras</h2>
      <Card className="overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3 font-medium">Obra</th>
              <th className="px-4 py-3 font-medium">Proforma</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium text-right">Pago</th>
              <th className="px-4 py-3 font-medium text-right">Restante</th>
              <th className="px-4 py-3 font-medium">%</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {obraSummaries.map(({ obra, ...s }) => (
              <tr
                key={obra.id}
                onClick={() => navigate(`/obras/${obra.id}`)}
                className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-gold-50/40"
              >
                <td className="px-4 py-3 font-medium text-ink-800">{obra.obraName}</td>
                <td className="px-4 py-3 num text-ink-500">{obra.proformaNumber || '—'}</td>
                <td className="px-4 py-3 num text-right">{formatKz(s.obraTotal)}</td>
                <td className="px-4 py-3 num text-right text-moss-500">{formatKz(s.totalPaid)}</td>
                <td className="px-4 py-3 num text-right text-clay-500">{formatKz(s.remaining)}</td>
                <td className="px-4 py-3 num">{formatPercent(s.paidPercent)}</td>
                <td className="px-4 py-3">
                  <Badge tone={s.status === 'Pago' ? 'moss' : s.status === 'Não Iniciado' ? 'ink' : 'gold'}>{s.status}</Badge>
                </td>
              </tr>
            ))}
            {obraSummaries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-400">
                  Este cliente ainda não tem obras.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <h2 className="font-display text-base font-semibold text-ink-800 mb-3">Extrato de Pagamentos</h2>
      <Card className="overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3 font-medium">Obra</th>
              <th className="px-4 py-3 font-medium">Proforma</th>
              <th className="px-4 py-3 font-medium text-right">Total Obra</th>
              <th className="px-4 py-3 font-medium text-right">Pagamento</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium text-right">Total Pago</th>
              <th className="px-4 py-3 font-medium text-right">Restante</th>
              <th className="px-4 py-3 font-medium">Pago %</th>
            </tr>
          </thead>
          <tbody>
            {statementRows.map((r, i) => (
              <tr key={i} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3 text-ink-700">{r.obraName}</td>
                <td className="px-4 py-3 num text-ink-500">{r.proformaNumber || '—'}</td>
                <td className="px-4 py-3 num text-right">{formatKz(r.obraTotal)}</td>
                <td className="px-4 py-3 num text-right">{formatKz(r.paymentAmount)}</td>
                <td className="px-4 py-3 num">{formatDate(r.paymentDate)}</td>
                <td className="px-4 py-3 num text-right">{formatKz(r.totalPaidAfter)}</td>
                <td className="px-4 py-3 num text-right">{formatKz(r.remainingAfter)}</td>
                <td className="px-4 py-3 num">{formatPercent(r.cumulativePercent)}</td>
              </tr>
            ))}
            {statementRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-400">
                  Sem pagamentos registados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="flex justify-end">
        <Button variant="danger" onClick={handleDelete}>
          Eliminar Cliente
        </Button>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
          <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-display text-lg font-semibold text-ink-900 mb-4">Editar Cliente</h2>
            <form onSubmit={saveEdit} className="space-y-4">
              <Field label="Nome do Cliente">
                <Input required value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="NIF">
                  <Input value={form.nif || ''} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
                </Field>
                <Field label="Telefone">
                  <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
              </div>
              <Field label="Email">
                <Input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Endereço">
                <Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <Field label="Estado">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
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
