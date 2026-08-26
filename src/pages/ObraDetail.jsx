import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, Plus, UploadCloud, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  Collections,
  createOne,
  getOne,
  getPaymentsByObra,
  getProformasByObra,
  getSettings,
  removeOne,
  updateOne
} from '../lib/db.js'
import { computeObraSummary, calculateProformaTotals, round2 } from '../lib/calc.js'
import { formatKz, formatPercent, formatDate, todayISO } from '../lib/format.js'
import { exportObraStatementPDF } from '../lib/pdf.js'
import { readWorkbook } from '../lib/excel.js'
import { parseProformaExcel } from '../lib/proformaImport.js'
import PageHeader from '../components/PageHeader.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import { Badge, Button, Card, Field, Input, Select, TextArea } from '../components/ui.jsx'

/** Mesmo cálculo usado no formulário de Proforma individual: separa itens de "Mão
 *  de Obra" dos de "Material" pela Secção, e usa o valor manual de Mão de Obra
 *  quando o ficheiro o traz como valor fixo no resumo. */
function buildProformaTotals(parsed, defaultIvaRate) {
  const items = parsed.items.map((it) => ({
    ...it,
    amount: round2((Number(it.quantity) || 0) * (Number(it.rate) || 0))
  }))
  const itemsMaoDeObra = items
    .filter((it) => /mão de obra|mao de obra/i.test(it.section || ''))
    .reduce((sum, it) => sum + it.amount, 0)
  const itemsMaterial = items
    .filter((it) => !/mão de obra|mao de obra/i.test(it.section || ''))
    .reduce((sum, it) => sum + it.amount, 0)

  const totalMaterial = parsed.totalMaterial != null ? parsed.totalMaterial : itemsMaterial
  const totalMaoDeObra = parsed.totalMaoDeObra != null ? parsed.totalMaoDeObra : itemsMaoDeObra
  const ivaRate = parsed.ivaRate != null ? parsed.ivaRate : defaultIvaRate

  const totals = calculateProformaTotals({ totalMaterial, totalMaoDeObra, ivaRate })
  return { items, totalMaterial: round2(totalMaterial), totalMaoDeObra: round2(totalMaoDeObra), ivaRate, totals }
}

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
  const [importingProformas, setImportingProformas] = useState(false)
  const [importResult, setImportResult] = useState(null) // { done, warnings }

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

  async function handleImportProformas(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setImportingProformas(true)
    setImportResult(null)
    const warnings = []
    let done = 0
    try {
      for (const file of files) {
        try {
          const workbook = await readWorkbook(file)
          const parsed = parseProformaExcel(workbook)

          if (!parsed.proformaNumber) {
            warnings.push(`${file.name}: número da Proforma não identificado — ficheiro ignorado.`)
            continue
          }

          const { items, totalMaterial, totalMaoDeObra, ivaRate, totals } = buildProformaTotals(
            parsed,
            settings.defaultIvaRate ?? 14
          )

          const payload = {
            proformaNumber: parsed.proformaNumber,
            date: parsed.date || todayISO(),
            clientId: obra.clientId,
            clientName: client?.clientName || parsed.clientName || '',
            nif: client?.nif || parsed.nif || '',
            obraId: id,
            obraName: obra.obraName,
            location: parsed.location || obra.location || '',
            paymentTerms: parsed.paymentTerms || '',
            ivaRate,
            maoDeObraMode: parsed.totalMaoDeObra != null ? 'manual' : 'items',
            manualMaoDeObra: parsed.totalMaoDeObra != null ? parsed.totalMaoDeObra : '',
            totalMaterial,
            totalMaoDeObra,
            ivaAmount: totals.ivaAmount,
            totalGeral: totals.totalGeral
          }

          const proformaId = await createOne(Collections.PROFORMAS, payload)

          await Promise.all(
            items
              .filter((it) => it.description)
              .map((it) =>
                createOne(Collections.PROFORMA_ITEMS, {
                  proformaId,
                  section: it.section,
                  itemNo: it.itemNo,
                  description: it.description,
                  unit: it.unit,
                  quantity: Number(it.quantity) || 0,
                  rate: Number(it.rate) || 0,
                  amount: it.amount
                })
              )
          )

          done += 1
        } catch (err) {
          console.error('Erro ao importar', file.name, err)
          warnings.push(`${file.name}: não foi possível ler este ficheiro (.xlsx inválido ou modelo diferente).`)
        }
      }

      const refreshed = await getProformasByObra(id)
      setProformas(refreshed)
      setImportResult({ done, warnings })
    } finally {
      setImportingProformas(false)
      e.target.value = ''
    }
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
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-md border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
                <UploadCloud size={16} /> {importingProformas ? 'A importar…' : 'Importar Proformas'}
              </span>
              <input
                type="file"
                accept=".xlsx,.xls"
                multiple
                className="hidden"
                onChange={handleImportProformas}
                disabled={importingProformas}
              />
            </label>
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
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium text-right">Pagamento</th>
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
                  <td className="px-4 py-3 num">{formatPercent(r.paymentPercent)}</td>
                  <td className="px-4 py-3 num">{formatPercent(r.cumulativePercent)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(r.maoDeObraPortion)}</td>
                  <td className="px-4 py-3 num text-right text-gold-600">{formatKz(r.retentionAmount)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(r.remainingAfter)}</td>
                </tr>
              ))}
              {summary.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-400">
                    Sem pagamentos registados para esta obra.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="font-display text-base font-semibold text-ink-800 mb-3">Proformas</h2>
      {importResult && (
        <div className="mb-3 space-y-2">
          {importResult.done > 0 && (
            <div className="flex items-start gap-2 rounded-md bg-moss-50 p-3 text-sm text-moss-600">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {importResult.done} proforma(s) importada(s) com sucesso.
            </div>
          )}
          {importResult.warnings.length > 0 && (
            <div className="rounded-md bg-clay-50 p-3 text-sm text-clay-600">
              {importResult.warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      <Card className="overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium text-right">Total Geral</th>
              </tr>
            </thead>
            <tbody>
              {proformas.map((pf) => (
                <tr
                  key={pf.id}
                  onClick={() => navigate(`/proformas/${pf.id}`)}
                  className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-gold-50/40"
                >
                  <td className="px-4 py-3 num text-ink-800">{pf.proformaNumber}</td>
                  <td className="px-4 py-3 num">{formatDate(pf.date)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(pf.totalGeral)}</td>
                </tr>
              ))}
              {proformas.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-ink-400">
                    Sem proformas associadas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

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