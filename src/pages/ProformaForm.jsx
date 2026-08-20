import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileDown, Plus, Trash2 } from 'lucide-react'
import {
  Collections,
  createOne,
  findWhere,
  getOne,
  getSettings,
  listAll,
  removeOne,
  updateOne
} from '../lib/db.js'
import { calculateProformaTotals, round2 } from '../lib/calc.js'
import { formatKz, todayISO } from '../lib/format.js'
import { exportProformaPDF } from '../lib/pdf.js'
import PageHeader from '../components/PageHeader.jsx'
import { Button, Card, Field, Input, Select } from '../components/ui.jsx'

function newItem() {
  return {
    _key: Math.random().toString(36).slice(2),
    section: '',
    itemNo: '',
    description: '',
    unit: '',
    quantity: '',
    rate: ''
  }
}

export default function ProformaForm() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()

  const [clients, setClients] = useState([])
  const [obras, setObras] = useState([])
  const [settings, setSettings] = useState({ defaultIvaRate: 14 })
  const [loading, setLoading] = useState(!isNew)

  const [header, setHeader] = useState({
    proformaNumber: '',
    date: todayISO(),
    clientId: '',
    clientName: '',
    nif: '',
    obraId: '',
    obraName: '',
    location: '',
    paymentTerms: '',
    ivaRate: '14'
  })
  const [items, setItems] = useState([newItem()])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const [c, o, s] = await Promise.all([listAll(Collections.CLIENTS), listAll(Collections.OBRAS), getSettings()])
      setClients(c)
      setObras(o)
      setSettings(s)
      setHeader((h) => ({ ...h, ivaRate: String(s.defaultIvaRate ?? 14) }))

      if (!isNew) {
        const pf = await getOne(Collections.PROFORMAS, id)
        if (pf) {
          setHeader({
            proformaNumber: pf.proformaNumber,
            date: pf.date,
            clientId: pf.clientId,
            clientName: pf.clientName,
            nif: pf.nif,
            obraId: pf.obraId,
            obraName: pf.obraName,
            location: pf.location,
            paymentTerms: pf.paymentTerms,
            ivaRate: String(pf.ivaRate)
          })
        }
        const its = await findWhere(Collections.PROFORMA_ITEMS, 'proformaId', '==', id)
        if (its.length) setItems(its.map((it) => ({ ...it, _key: it.id })))
        setLoading(false)
      }
    }
    load()
  }, [id, isNew])

  const obrasForClient = useMemo(() => obras.filter((o) => o.clientId === header.clientId), [obras, header.clientId])

  function updateItem(key, patch) {
    setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)))
  }
  function addItem() {
    setItems((prev) => [...prev, newItem()])
  }
  function removeItem(key) {
    setItems((prev) => prev.filter((it) => it._key !== key))
  }

  const computedItems = items.map((it) => ({
    ...it,
    amount: round2((Number(it.quantity) || 0) * (Number(it.rate) || 0))
  }))

  // Business rule from the source proforma structure: totals split Material vs Mão de Obra
  // by section — items are tagged either "Material" or "Mão de Obra" via the section field
  // containing that keyword, otherwise the accountant sets totals directly below.
  const totalMaterial = computedItems
    .filter((it) => !/mão de obra|mao de obra/i.test(it.section || ''))
    .reduce((sum, it) => sum + it.amount, 0)
  const totalMaoDeObra = computedItems
    .filter((it) => /mão de obra|mao de obra/i.test(it.section || ''))
    .reduce((sum, it) => sum + it.amount, 0)

  const totals = calculateProformaTotals({ totalMaterial, totalMaoDeObra, ivaRate: header.ivaRate })

  function handleClientChange(clientId) {
    const c = clients.find((x) => x.id === clientId)
    setHeader({ ...header, clientId, clientName: c?.clientName || '', nif: c?.nif || '', obraId: '', obraName: '' })
  }
  function handleObraChange(obraId) {
    const o = obras.find((x) => x.id === obraId)
    setHeader({ ...header, obraId, obraName: o?.obraName || '', location: o?.location || header.location })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...header,
        ivaRate: Number(header.ivaRate) || 0,
        totalMaterial: round2(totalMaterial),
        totalMaoDeObra: round2(totalMaoDeObra),
        ivaAmount: totals.ivaAmount,
        totalGeral: totals.totalGeral
      }

      let proformaId = id
      if (isNew) {
        proformaId = await createOne(Collections.PROFORMAS, payload)
      } else {
        await updateOne(Collections.PROFORMAS, id, payload)
        const existing = await findWhere(Collections.PROFORMA_ITEMS, 'proformaId', '==', id)
        await Promise.all(existing.map((it) => removeOne(Collections.PROFORMA_ITEMS, it.id)))
      }

      await Promise.all(
        computedItems
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

      navigate(`/proformas/${proformaId}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Eliminar esta proforma e os seus itens?')) return
    const existing = await findWhere(Collections.PROFORMA_ITEMS, 'proformaId', '==', id)
    await Promise.all(existing.map((it) => removeOne(Collections.PROFORMA_ITEMS, it.id)))
    await removeOne(Collections.PROFORMAS, id)
    navigate('/proformas')
  }

  if (loading) return <div className="text-ink-400">A carregar…</div>

  return (
    <div>
      <button onClick={() => navigate('/proformas')} className="mb-4 flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft size={15} /> Voltar às Proformas
      </button>

      <PageHeader
        eyebrow="Documento"
        title={isNew ? 'Nova Proforma' : `Proforma ${header.proformaNumber}`}
        actions={
          !isNew && (
            <>
              <Button
                variant="outline"
                onClick={() => exportProformaPDF({ ...header, ...totals, proformaNumber: header.proformaNumber }, computedItems)}
              >
                <FileDown size={16} /> Exportar PDF
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Eliminar
              </Button>
            </>
          )
        }
      />

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-5 grid md:grid-cols-3 gap-4">
          <Field label="Número da Proforma *">
            <Input required value={header.proformaNumber} onChange={(e) => setHeader({ ...header, proformaNumber: e.target.value })} placeholder="KSL26-038" />
          </Field>
          <Field label="Data">
            <Input type="date" value={header.date} onChange={(e) => setHeader({ ...header, date: e.target.value })} />
          </Field>
          <Field label="Taxa de IVA (%)">
            <Input type="number" step="0.01" value={header.ivaRate} onChange={(e) => setHeader({ ...header, ivaRate: e.target.value })} />
          </Field>
          <Field label="Cliente *">
            <Select required value={header.clientId} onChange={(e) => handleClientChange(e.target.value)}>
              <option value="">Selecionar…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="NIF">
            <Input value={header.nif} onChange={(e) => setHeader({ ...header, nif: e.target.value })} />
          </Field>
          <Field label="Obra *">
            <Select required value={header.obraId} onChange={(e) => handleObraChange(e.target.value)} disabled={!header.clientId}>
              <option value="">Selecionar…</option>
              {obrasForClient.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.obraName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Local">
            <Input value={header.location} onChange={(e) => setHeader({ ...header, location: e.target.value })} />
          </Field>
          <Field label="Condições de Pagamento" hint="ex: 70% Adjudicação, 30% Fim da Obra">
            <Input value={header.paymentTerms} onChange={(e) => setHeader({ ...header, paymentTerms: e.target.value })} />
          </Field>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-ink-700">Itens da Proforma</h3>
            <Button type="button" variant="outline" onClick={addItem}>
              <Plus size={15} /> Adicionar Item
            </Button>
          </div>
          <p className="mb-3 text-xs text-ink-400">
            Escreva "Mão de Obra" na Secção para que o item seja somado ao Total de Mão de Obra; caso contrário é somado ao Total de Material.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="py-2 pr-2 font-medium">Secção</th>
                  <th className="py-2 pr-2 font-medium">Item Nº</th>
                  <th className="py-2 pr-2 font-medium">Descrição</th>
                  <th className="py-2 pr-2 font-medium">Un.</th>
                  <th className="py-2 pr-2 font-medium">Qtd.</th>
                  <th className="py-2 pr-2 font-medium">Preço Unit.</th>
                  <th className="py-2 pr-2 font-medium text-right">Montante</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {computedItems.map((it) => (
                  <tr key={it._key} className="border-b border-ink-50 last:border-0">
                    <td className="py-1.5 pr-2">
                      <Input value={it.section} onChange={(e) => updateItem(it._key, { section: e.target.value })} placeholder="Trabalho de Bloco" />
                    </td>
                    <td className="py-1.5 pr-2 w-20">
                      <Input value={it.itemNo} onChange={(e) => updateItem(it._key, { itemNo: e.target.value })} placeholder="1.1" />
                    </td>
                    <td className="py-1.5 pr-2 min-w-[220px]">
                      <Input value={it.description} onChange={(e) => updateItem(it._key, { description: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2 w-20">
                      <Input value={it.unit} onChange={(e) => updateItem(it._key, { unit: e.target.value })} placeholder="m2" />
                    </td>
                    <td className="py-1.5 pr-2 w-24">
                      <Input type="number" step="0.01" value={it.quantity} onChange={(e) => updateItem(it._key, { quantity: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2 w-32">
                      <Input type="number" step="0.01" value={it.rate} onChange={(e) => updateItem(it._key, { rate: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2 text-right num whitespace-nowrap">{formatKz(it.amount)}</td>
                    <td className="py-1.5">
                      <button type="button" onClick={() => removeItem(it._key)} className="text-ink-300 hover:text-clay-500">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 num">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-400">Total Material</p>
              <p className="mt-1 text-lg font-semibold">{formatKz(totalMaterial)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-400">Total Mão de Obra</p>
              <p className="mt-1 text-lg font-semibold">{formatKz(totalMaoDeObra)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-400">IVA ({header.ivaRate}%)</p>
              <p className="mt-1 text-lg font-semibold">{formatKz(totals.ivaAmount)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-400">Total Geral</p>
              <p className="mt-1 text-lg font-semibold text-gold-600">{formatKz(totals.totalGeral)}</p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate('/proformas')}>
            Cancelar
          </Button>
          <Button type="submit" variant="gold" disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar Proforma'}
          </Button>
        </div>
      </form>
    </div>
  )
}
