import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, UploadCloud, AlertTriangle } from 'lucide-react'
import { Collections, createOne, subscribeAll, getSettings } from '../lib/db.js'
import { computeObraSummary, calculateProformaTotals } from '../lib/calc.js'
import { formatKz, formatPercent, todayISO } from '../lib/format.js'
import { readWorkbook } from '../lib/excel.js'
import { parseProformaExcel } from '../lib/proformaImport.js'
import PageHeader from '../components/PageHeader.jsx'
import { Badge, Button, Card, Field, Input, Select, TextArea } from '../components/ui.jsx'

const EMPTY = {
  obraCode: '',
  obraName: '',
  clientId: '',
  location: '',
  contractNumber: '',
  totalMaterial: '',
  totalMaoDeObra: '',
  ivaRate: '14',
  retentionRate: '',
  physicalProgress: '0',
  status: 'Planeamento',
  startDate: todayISO(),
  expectedEndDate: '',
  notes: ''
}

export default function Obras() {
  const [obras, setObras] = useState([])
  const [clients, setClients] = useState([])
  const [payments, setPayments] = useState([])
  const [settings, setSettings] = useState({ defaultRetentionRate: 6.5 })
  const [filterClient, setFilterClient] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importWarnings, setImportWarnings] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    const u1 = subscribeAll(Collections.OBRAS, setObras)
    const u2 = subscribeAll(Collections.CLIENTS, setClients)
    const u3 = subscribeAll(Collections.PAYMENTS, setPayments)
    getSettings().then(setSettings)
    return () => {
      u1(); u2(); u3()
    }
  }, [])

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

  function normalizeName(v) {
    return String(v || '').trim().toLowerCase()
  }

  function openForm() {
    setForm(EMPTY)
    setImportError('')
    setImportWarnings([])
    setShowForm(true)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImportWarnings([])
    setImporting(true)
    try {
      const workbook = await readWorkbook(file)
      const parsed = parseProformaExcel(workbook)

      const matchedClient = clients.find((c) => normalizeName(c.clientName) === normalizeName(parsed.clientName))

      const warnings = []
      if (parsed.clientName && !matchedClient) {
        warnings.push(`Cliente "${parsed.clientName}" não foi encontrado — crie-o primeiro ou selecione manualmente.`)
      }
      if (!parsed.items.length && parsed.totalMaterial == null) {
        warnings.push('Não foi possível identificar os totais desta Proforma. Confira o modelo.')
      }

      // Quando a Proforma discrimina itens mas não indica "Total Material" no resumo,
      // usamos a soma dos itens como aproximação.
      const itemsTotal = parsed.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0)
      const totalMaterial = parsed.totalMaterial != null ? parsed.totalMaterial : itemsTotal

      setForm((f) => ({
        ...f,
        obraName: parsed.obraName || f.obraName,
        clientId: matchedClient?.id || f.clientId,
        location: parsed.location || f.location,
        contractNumber: parsed.proformaNumber || f.contractNumber,
        totalMaterial: totalMaterial != null ? String(totalMaterial) : f.totalMaterial,
        totalMaoDeObra: parsed.totalMaoDeObra != null ? String(parsed.totalMaoDeObra) : f.totalMaoDeObra,
        ivaRate: parsed.ivaRate != null ? String(parsed.ivaRate) : f.ivaRate,
        startDate: parsed.date || f.startDate,
        notes: parsed.paymentTerms ? `Condições de pagamento: ${parsed.paymentTerms}` : f.notes
      }))

      setImportWarnings(warnings)
    } catch (err) {
      setImportError('Não foi possível ler este ficheiro. Confirme que é um .xlsx no modelo habitual da Proforma.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const rows = useMemo(() => {
    return obras
      .filter((o) => !filterClient || o.clientId === filterClient)
      .filter((o) => !filterStatus || o.status === filterStatus)
      .map((obra) => {
        const obraPayments = payments.filter((p) => p.obraId === obra.id)
        const s = computeObraSummary(obra, obraPayments, settings.defaultRetentionRate)
        return { obra, ...s }
      })
  }, [obras, payments, filterClient, filterStatus, settings])

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const totals = calculateProformaTotals({
        totalMaterial: form.totalMaterial,
        totalMaoDeObra: form.totalMaoDeObra,
        ivaRate: form.ivaRate
      })
      const id = await createOne(Collections.OBRAS, {
        ...form,
        totalMaterial: Number(form.totalMaterial) || 0,
        totalMaoDeObra: Number(form.totalMaoDeObra) || 0,
        ivaRate: Number(form.ivaRate) || 0,
        ivaAmount: totals.ivaAmount,
        contractValue: totals.totalGeral,
        totalGeral: totals.totalGeral,
        retentionRate: form.retentionRate === '' ? null : Number(form.retentionRate),
        physicalProgress: Number(form.physicalProgress) || 0
      })
      setShowForm(false)
      setForm(EMPTY)
      navigate(`/obras/${id}`)
    } finally {
      setSaving(false)
    }
  }

  const preview = calculateProformaTotals({
    totalMaterial: form.totalMaterial,
    totalMaoDeObra: form.totalMaoDeObra,
    ivaRate: form.ivaRate
  })

  return (
    <div>
      <PageHeader
        eyebrow="Projetos"
        title="Obras"
        subtitle={`${obras.length} obra(s) registadas`}
        actions={
          <Button variant="gold" onClick={openForm}>
            <Plus size={16} /> Nova Obra
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="max-w-[220px]">
          <option value="">Todos os Clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.clientName}
            </option>
          ))}
        </Select>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os Estados</option>
          <option value="Planeamento">Planeamento</option>
          <option value="Ativa">Ativa</option>
          <option value="Suspensa">Suspensa</option>
          <option value="Concluída">Concluída</option>
          <option value="Cancelada">Cancelada</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Obra</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Pago</th>
                <th className="px-4 py-3 font-medium">%</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ obra, ...s }) => (
                <tr
                  key={obra.id}
                  onClick={() => navigate(`/obras/${obra.id}`)}
                  className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-gold-50/40"
                >
                  <td className="px-4 py-3 font-medium text-ink-800">{obra.obraName}</td>
                  <td className="px-4 py-3 text-ink-500">{clientMap[obra.clientId]?.clientName || '—'}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(s.obraTotal)}</td>
                  <td className="px-4 py-3 num text-right text-moss-500">{formatKz(s.totalPaid)}</td>
                  <td className="px-4 py-3 num">{formatPercent(s.paidPercent)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={obra.status === 'Concluída' ? 'moss' : obra.status === 'Suspensa' || obra.status === 'Cancelada' ? 'clay' : 'gold'}>
                      {obra.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-400">
                    Nenhuma obra encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
          <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink-900">Nova Obra</h2>
              <button onClick={() => setShowForm(false)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <div className="mb-4 rounded-md border border-dashed border-ink-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink-700">Importar de Excel</h3>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Carregue o ficheiro .xlsx da Proforma (modelo Khaled Sham) para preencher a Obra automaticamente.
                  </p>
                </div>
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-2 rounded-md bg-gold-400 px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-gold-300">
                    <UploadCloud size={14} /> {importing ? 'A ler…' : 'Escolher Ficheiro'}
                  </span>
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} disabled={importing} />
                </label>
              </div>
              {importError && <p className="mt-3 text-sm text-clay-500">{importError}</p>}
              {importWarnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-clay-500">
                  {importWarnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Cliente *">
                  <Select required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                    <option value="">Selecionar…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.clientName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Código da Obra">
                  <Input value={form.obraCode} onChange={(e) => setForm({ ...form, obraCode: e.target.value })} />
                </Field>
              </div>
              <Field label="Nome da Obra *">
                <Input required value={form.obraName} onChange={(e) => setForm({ ...form, obraName: e.target.value })} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Localização">
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </Field>
                <Field label="Nº do Contrato">
                  <Input value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Total Material (Kz)">
                  <Input type="number" step="0.01" value={form.totalMaterial} onChange={(e) => setForm({ ...form, totalMaterial: e.target.value })} />
                </Field>
                <Field label="Total Mão de Obra (Kz)">
                  <Input type="number" step="0.01" value={form.totalMaoDeObra} onChange={(e) => setForm({ ...form, totalMaoDeObra: e.target.value })} />
                </Field>
                <Field label="Taxa de IVA (%)">
                  <Input type="number" step="0.01" value={form.ivaRate} onChange={(e) => setForm({ ...form, ivaRate: e.target.value })} />
                </Field>
              </div>

              <div className="rounded-md bg-ink-50 p-3 text-sm num flex flex-wrap gap-x-6 gap-y-1 text-ink-600">
                <span>Subtotal: <strong>{formatKz(preview.subtotal)}</strong></span>
                <span>IVA: <strong>{formatKz(preview.ivaAmount)}</strong></span>
                <span>Total Geral: <strong className="text-ink-900">{formatKz(preview.totalGeral)}</strong></span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Taxa de Retenção (%)" hint="Deixe em branco para usar a definição global">
                  <Input type="number" step="0.01" value={form.retentionRate} onChange={(e) => setForm({ ...form, retentionRate: e.target.value })} />
                </Field>
                <Field label="Progresso Físico (%)">
                  <Input type="number" step="1" value={form.physicalProgress} onChange={(e) => setForm({ ...form, physicalProgress: e.target.value })} />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Estado">
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="Planeamento">Planeamento</option>
                    <option value="Ativa">Ativa</option>
                    <option value="Suspensa">Suspensa</option>
                    <option value="Concluída">Concluída</option>
                    <option value="Cancelada">Cancelada</option>
                  </Select>
                </Field>
                <Field label="Data de Início">
                  <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </Field>
                <Field label="Data Prevista de Fim">
                  <Input type="date" value={form.expectedEndDate} onChange={(e) => setForm({ ...form, expectedEndDate: e.target.value })} />
                </Field>
              </div>

              <Field label="Notas">
                <TextArea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="gold" disabled={saving}>
                  {saving ? 'A guardar…' : 'Guardar Obra'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}