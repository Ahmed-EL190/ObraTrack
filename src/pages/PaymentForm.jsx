import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import {
  Collections,
  createOne,
  getOne,
  getObrasByClient,
  getPaymentsByObra,
  getProformasByObra,
  getSettings,
  listAll
} from '../lib/db.js'
import { calculatePayment, computeObraSummary, computeProformaBalances, round2 } from '../lib/calc.js'
import { formatKz, formatPercent, todayISO } from '../lib/format.js'
import PageHeader from '../components/PageHeader.jsx'
import { Button, Card, Field, Input, Select, TextArea } from '../components/ui.jsx'

export default function PaymentForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [clients, setClients] = useState([])
  const [obras, setObras] = useState([])
  const [proformas, setProformas] = useState([])
  const [existingPayments, setExistingPayments] = useState([])
  const [settings, setSettings] = useState({ defaultRetentionRate: 6.5 })
  const [selectedObra, setSelectedObra] = useState(null)

  const [form, setForm] = useState({
    clientId: searchParams.get('clientId') || '',
    obraId: searchParams.get('obraId') || '',
    proformaId: '',
    paymentDate: todayISO(),
    paymentAmount: '',
    paymentReference: '',
    paymentMethod: 'Transferência Bancária',
    notes: '',
    allowOverpayment: false,
    retentionMode: 'proportional'
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Quanto deste pagamento vai para cada Proforma: { [proformaId]: 'valor em texto' }.
  // Fica vazio por omissão — o pagamento continua a aplicar-se ao total geral
  // da Obra, exatamente como antes, a menos que o utilizador escolha dividir.
  const [allocations, setAllocations] = useState({})

  useEffect(() => {
    listAll(Collections.CLIENTS).then(setClients)
    getSettings().then(setSettings)
  }, [])

  useEffect(() => {
    async function loadObras() {
      if (!form.clientId) {
        setObras([])
        return
      }
      const o = await getObrasByClient(form.clientId)
      setObras(o)
    }
    loadObras()
  }, [form.clientId])

  useEffect(() => {
    async function loadObraDetails() {
      if (!form.obraId) {
        setSelectedObra(null)
        setProformas([])
        setExistingPayments([])
        return
      }
      const [o, pf, pays] = await Promise.all([
        getOne(Collections.OBRAS, form.obraId),
        getProformasByObra(form.obraId),
        getPaymentsByObra(form.obraId)
      ])
      setSelectedObra(o)
      setProformas(pf)
      setExistingPayments(pays)
      setAllocations({})
    }
    loadObraDetails()
  }, [form.obraId])

  const currentSummary = useMemo(() => {
    if (!selectedObra) return null
    return computeObraSummary(selectedObra, existingPayments, settings.defaultRetentionRate)
  }, [selectedObra, existingPayments, settings])

  // Estado de cada Proforma ANTES deste novo pagamento (com base nos pagamentos
  // já registados) — usado para mostrar quanto falta em cada uma e para o
  // preenchimento automático.
  const proformaBalances = useMemo(() => computeProformaBalances(proformas, existingPayments), [proformas, existingPayments])

  const allocatedTotal = round2(Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0))
  const unallocatedAmount = round2((Number(form.paymentAmount) || 0) - allocatedTotal)

  function setAllocationFor(proformaId, value) {
    setAllocations((prev) => ({ ...prev, [proformaId]: value }))
  }

  // Preenche automaticamente por ordem: liquida a Proforma mais antiga em
  // falta primeiro, depois a seguinte, até o valor do pagamento acabar.
  // Se quiser outra combinação (ex.: só a nº 2 e a nº 3), o utilizador pode
  // sempre editar os valores manualmente a seguir.
  function autoDistribute() {
    let remaining = Number(form.paymentAmount) || 0
    const next = {}
    for (const pf of proformaBalances.rows) {
      if (remaining <= 0) break
      const owed = Math.max(0, pf.remaining)
      if (owed <= 0) continue
      const take = Math.min(owed, remaining)
      next[pf.id] = String(round2(take))
      remaining = round2(remaining - take)
    }
    setAllocations(next)
  }

  function clearAllocations() {
    setAllocations({})
  }

  const effectiveRate = selectedObra?.retentionRate ?? settings.defaultRetentionRate

  const preview = useMemo(() => {
    if (!selectedObra) return null
    return calculatePayment({
      obraTotal: selectedObra.totalGeral ?? selectedObra.contractValue,
      totalMaoDeObra: selectedObra.totalMaoDeObra,
      paymentAmount: form.paymentAmount,
      retentionRate: effectiveRate,
      retentionMode: form.retentionMode
    })
  }, [selectedObra, form.paymentAmount, effectiveRate, form.retentionMode])

  const newTotalPaid = (currentSummary?.totalPaid || 0) + (Number(form.paymentAmount) || 0)
  const obraTotalValue = currentSummary?.obraTotal || 0
  const newRemaining = obraTotalValue - newTotalPaid
  const overpaying = newRemaining < -0.01

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.clientId || !form.obraId) {
      setError('Selecione o Cliente e a Obra.')
      return
    }
    if (!form.paymentAmount || Number(form.paymentAmount) <= 0) {
      setError('O valor do pagamento deve ser positivo.')
      return
    }
    if (overpaying && !form.allowOverpayment) {
      setError('O pagamento excede o valor restante da Obra. Marque "Permitir pagamento superior ao restante" para continuar.')
      return
    }

    setSaving(true)
    try {
      const allocationList = Object.entries(allocations)
        .map(([proformaId, v]) => ({
          proformaId,
          proformaNumber: proformas.find((p) => p.id === proformaId)?.proformaNumber || '',
          amount: round2(Number(v) || 0)
        }))
        .filter((a) => a.amount > 0)

      await createOne(Collections.PAYMENTS, {
        clientId: form.clientId,
        obraId: form.obraId,
        allocations: allocationList,
        paymentDate: form.paymentDate,
        paymentAmount: Number(form.paymentAmount),
        paymentReference: form.paymentReference,
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        retentionRate: effectiveRate,
        retentionMode: form.retentionMode
      })
      navigate(`/obras/${form.obraId}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button onClick={() => navigate('/pagamentos')} className="mb-4 flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft size={15} /> Voltar aos Pagamentos
      </button>

      <PageHeader eyebrow="Financeiro" title="Registar Pagamento" subtitle="A percentagem e a retenção são calculadas automaticamente" />

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <Card className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4" id="payment-form">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cliente *">
                <Select
                  required
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value, obraId: '', proformaId: '' })}
                >
                  <option value="">Selecionar…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.clientName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Obra *">
                <Select
                  required
                  value={form.obraId}
                  onChange={(e) => setForm({ ...form, obraId: e.target.value, proformaId: '' })}
                  disabled={!form.clientId}
                >
                  <option value="">Selecionar…</option>
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.obraName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {proformas.length > 0 && (
              <Field
                label="Alocação por Proforma"
                hint="Opcional — indique quanto deste pagamento pertence a cada Proforma. Pode liquidar todas, algumas, ou só uma, com valores diferentes. O que não alocar aqui conta só para o total geral da Obra."
              >
                <div className="rounded-md border border-ink-200 divide-y divide-ink-100">
                  {proformaBalances.rows.map((pf) => (
                    <div key={pf.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                      <div className="min-w-[110px] flex-1">
                        <p className="num text-sm font-medium text-ink-800">{pf.proformaNumber}</p>
                        <p className="text-xs text-ink-400">
                          Falta {formatKz(pf.remaining)}{' '}
                          <span
                            className={
                              pf.status === 'Pago'
                                ? 'text-moss-500'
                                : pf.status === 'Parcialmente Pago'
                                ? 'text-gold-600'
                                : 'text-ink-400'
                            }
                          >
                            ({pf.status})
                          </span>
                        </p>
                      </div>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        className="w-32"
                        value={allocations[pf.id] || ''}
                        onChange={(e) => setAllocationFor(pf.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={autoDistribute} disabled={!form.paymentAmount}>
                      Preencher automaticamente
                    </Button>
                    <Button type="button" variant="ghost" onClick={clearAllocations}>
                      Limpar
                    </Button>
                  </div>
                  <p className="text-xs text-ink-400">
                    Alocado: <span className="num text-ink-700">{formatKz(allocatedTotal)}</span> · Não alocado:{' '}
                    <span className={`num ${unallocatedAmount < -0.01 ? 'text-clay-500' : 'text-ink-700'}`}>
                      {formatKz(unallocatedAmount)}
                    </span>
                  </p>
                </div>
                {unallocatedAmount < -0.01 && (
                  <p className="mt-1 text-xs text-clay-500">
                    <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />
                    Alocou mais do que o valor do pagamento.
                  </p>
                )}
              </Field>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Data do Pagamento *">
                <Input type="date" required value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
              </Field>
              <Field label="Valor do Pagamento (Kz) *">
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={form.paymentAmount}
                  onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Referência">
                <Input value={form.paymentReference} onChange={(e) => setForm({ ...form, paymentReference: e.target.value })} />
              </Field>
              <Field label="Método de Pagamento">
                <Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                  <option value="Transferência Bancária">Transferência Bancária</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Outro">Outro</option>
                </Select>
              </Field>
            </div>

            <Field
              label="Retenção deste Pagamento"
              hint="Controla como a retenção é calculada para este pagamento específico"
            >
              <Select
                value={form.retentionMode}
                onChange={(e) => setForm({ ...form, retentionMode: e.target.value })}
              >
                <option value="proportional">Proporcional a este pagamento (padrão)</option>
                <option value="none">Sem retenção neste pagamento (cliente liquida depois)</option>
                <option value="full">Liquidar a retenção total do contrato agora (pagamento final)</option>
              </Select>
              {form.retentionMode === 'none' && (
                <p className="mt-1 text-xs text-ink-400">
                  Este pagamento fica registado sem retenção. Não se esqueça de escolher "Liquidar a retenção total"
                  no pagamento em que o cliente efetivamente pagar a retenção acumulada.
                </p>
              )}
              {form.retentionMode === 'full' && (
                <p className="mt-1 text-xs text-ink-400">
                  Este pagamento vai contabilizar a retenção sobre TODA a Mão de Obra da Obra
                  ({formatKz((selectedObra?.totalMaoDeObra || 0) * (effectiveRate / 100))}), não apenas a fatia deste
                  pagamento. Use apenas uma vez por Obra, normalmente no pagamento final, para não contar a retenção
                  a dobrar.
                </p>
              )}
            </Field>

            <Field label="Notas">
              <TextArea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>

            {overpaying && (
              <label className="flex items-start gap-2 rounded-md bg-clay-500/10 p-3 text-sm text-clay-500">
                <input
                  type="checkbox"
                  checked={form.allowOverpayment}
                  onChange={(e) => setForm({ ...form, allowOverpayment: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <AlertTriangle size={14} className="inline mr-1 -mt-0.5" />
                  Este pagamento excede o valor restante da Obra. Permitir mesmo assim.
                </span>
              </label>
            )}

            {error && <p className="text-sm text-clay-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => navigate('/pagamentos')}>
                Cancelar
              </Button>
              <Button type="submit" variant="gold" disabled={saving}>
                {saving ? 'A guardar…' : 'Registar Pagamento'}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-5 h-fit sticky top-6">
          <h3 className="font-display text-sm font-semibold text-ink-700 mb-4">Resumo do Cálculo</h3>
          {!selectedObra ? (
            <p className="text-sm text-ink-400">Selecione uma Obra para ver o resumo.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <Row label="Total da Obra" value={formatKz(currentSummary.obraTotal)} />
              <Row label="Pago Anteriormente" value={formatKz(currentSummary.totalPaid)} />
              <Row label="Novo Pagamento" value={formatKz(form.paymentAmount || 0)} strong />
              <hr className="border-ink-100" />
              <Row label="Novo Total Pago" value={formatKz(newTotalPaid)} />
              <Row label="Restante" value={formatKz(newRemaining)} tone={newRemaining < 0 ? 'clay' : 'moss'} />
              <Row label="Percentagem do Pagamento" value={formatPercent(preview?.paymentPercent || 0)} />
              <Row
                label="Percentagem Acumulada"
                value={formatPercent(currentSummary.obraTotal > 0 ? (newTotalPaid / currentSummary.obraTotal) * 100 : 0)}
              />
              <hr className="border-ink-100" />
              <Row label="Mão de Obra Total" value={formatKz(selectedObra.totalMaoDeObra)} />
              <Row label="Mão de Obra deste Pagamento" value={formatKz(preview?.maoDeObraPortion || 0)} />
              <Row label={`Taxa de Retenção`} value={formatPercent(effectiveRate)} />
              <Row
                label={
                  form.retentionMode === 'none'
                    ? 'Retenção deste Pagamento (Nenhuma)'
                    : form.retentionMode === 'full'
                    ? 'Retenção deste Pagamento (Total do Contrato)'
                    : 'Retenção deste Pagamento'
                }
                value={formatKz(preview?.retentionAmount || 0)}
                tone="gold"
                strong
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, tone, strong }) {
  const toneClass = tone === 'clay' ? 'text-clay-500' : tone === 'moss' ? 'text-moss-500' : tone === 'gold' ? 'text-gold-600' : 'text-ink-800'
  return (
    <div className="flex justify-between items-center">
      <span className="text-ink-400">{label}</span>
      <span className={`num ${strong ? 'font-semibold' : ''} ${toneClass}`}>{value}</span>
    </div>
  )
}