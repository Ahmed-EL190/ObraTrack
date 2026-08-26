import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, UploadCloud, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Collections, createOne, listAll, subscribeAll } from '../lib/db.js'
import { readWorkbook } from '../lib/excel.js'
import { parseProformaExcel } from '../lib/proformaImport.js'
import { calculateProformaTotals, round2 } from '../lib/calc.js'
import { formatKz, todayISO } from '../lib/format.js'
import PageHeader from '../components/PageHeader.jsx'
import { Badge, Button, Card, Select } from '../components/ui.jsx'

function normalizeName(v) {
  return String(v || '').trim().toLowerCase()
}

/** Faz o mesmo cálculo de totais que o formulário de Proforma individual: separa
 *  itens de "Mão de Obra" dos de "Material" pela Secção, e usa o valor manual de
 *  Mão de Obra quando o ficheiro o traz como valor fixo no resumo. */
function buildTotals(parsed, defaultIvaRate) {
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

export default function BulkProformaImport() {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [obras, setObras] = useState([])
  const [existingNumbers, setExistingNumbers] = useState(new Set())
  const [settings, setSettings] = useState({ defaultIvaRate: 14 })
  const [rows, setRows] = useState([]) // { fileName, parsed, clientId, obraId, status, reason, action }
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const [step, setStep] = useState(0) // 0=upload, 1=review, 2=done

  useEffect(() => {
    const u1 = subscribeAll(Collections.CLIENTS, setClients)
    const u2 = subscribeAll(Collections.OBRAS, setObras)
    listAll(Collections.PROFORMAS)
      .then((pf) => setExistingNumbers(new Set(pf.map((p) => normalizeName(p.proformaNumber)))))
      .catch(() => {})
    return () => {
      u1(); u2()
    }
  }, [])

  function evaluateRow(fileName, parsed) {
    const matchedClient = clients.find((c) => normalizeName(c.clientName) === normalizeName(parsed.clientName))
    const matchedObra = matchedClient
      ? obras.find((o) => o.clientId === matchedClient.id && normalizeName(o.obraName) === normalizeName(parsed.obraName))
      : null
    const isDuplicate = parsed.proformaNumber && existingNumbers.has(normalizeName(parsed.proformaNumber))

    let status = 'pronto'
    let reason = ''
    if (!parsed.proformaNumber) {
      status = 'erro'
      reason = 'Número da Proforma não identificado no ficheiro.'
    } else if (!matchedClient) {
      status = 'erro'
      reason = `Cliente "${parsed.clientName || '—'}" não encontrado.`
    } else if (!matchedObra) {
      status = 'erro'
      reason = `Obra "${parsed.obraName || '—'}" não encontrada para este cliente.`
    } else if (isDuplicate) {
      status = 'duplicado'
      reason = 'Já existe uma Proforma com este número.'
    }

    return {
      fileName,
      parsed,
      clientId: matchedClient?.id || '',
      clientName: matchedClient?.clientName || parsed.clientName,
      obraId: matchedObra?.id || '',
      obraName: matchedObra?.obraName || parsed.obraName,
      status,
      reason,
      action: status === 'pronto' ? 'import' : 'skip'
    }
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setReading(true)
    try {
      const parsedRows = []
      for (const file of files) {
        try {
          const workbook = await readWorkbook(file)
          const parsed = parseProformaExcel(workbook)
          parsedRows.push(evaluateRow(file.name, parsed))
        } catch (err) {
          parsedRows.push({
            fileName: file.name,
            parsed: null,
            clientId: '',
            obraId: '',
            status: 'erro',
            reason: 'Não foi possível ler este ficheiro (.xlsx inválido ou modelo diferente).',
            action: 'skip'
          })
        }
      }
      setRows(parsedRows)
      setStep(1)
    } finally {
      setReading(false)
      e.target.value = ''
    }
  }

  function setRowAction(i, action) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, action } : r)))
  }

  function setRowClient(i, clientId) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r
        const client = clients.find((c) => c.id === clientId)
        return { ...r, clientId, clientName: client?.clientName || r.clientName, obraId: '', obraName: '' }
      })
    )
  }

  function setRowObra(i, obraId) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r
        const obra = obras.find((o) => o.id === obraId)
        return { ...r, obraId, obraName: obra?.obraName || r.obraName }
      })
    )
  }

  async function confirmImport() {
    setImporting(true)
    setDoneCount(0)
    try {
      let done = 0
      for (const row of rows) {
        if (row.action !== 'import') continue
        if (!row.clientId || !row.obraId || !row.parsed) continue

        const client = clients.find((c) => c.id === row.clientId)
        const { items, totalMaterial, totalMaoDeObra, ivaRate, totals } = buildTotals(row.parsed, settings.defaultIvaRate)

        const payload = {
          proformaNumber: row.parsed.proformaNumber,
          date: row.parsed.date || todayISO(),
          clientId: row.clientId,
          clientName: row.clientName || client?.clientName || '',
          nif: client?.nif || row.parsed.nif || '',
          obraId: row.obraId,
          obraName: row.obraName,
          location: row.parsed.location || '',
          paymentTerms: row.parsed.paymentTerms || '',
          ivaRate,
          maoDeObraMode: row.parsed.totalMaoDeObra != null ? 'manual' : 'items',
          manualMaoDeObra: row.parsed.totalMaoDeObra != null ? row.parsed.totalMaoDeObra : '',
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
        setDoneCount(done)
      }
      setStep(2)
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setRows([])
    setStep(0)
    setDoneCount(0)
  }

  const importCount = rows.filter((r) => r.action === 'import').length

  return (
    <div>
      <button onClick={() => navigate('/proformas')} className="mb-4 flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-700">
        <ArrowLeft size={15} /> Voltar às Proformas
      </button>

      <PageHeader
        eyebrow="Documentos"
        title="Importar Várias Proformas"
        subtitle="Carregue vários ficheiros .xlsx (modelo Khaled Sham) de uma só vez"
      />

      {step === 0 && (
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <UploadCloud size={32} className="text-ink-300" />
          <p className="text-sm text-ink-600">Selecione todos os ficheiros .xlsx das Proformas que quer importar.</p>
          <label className="cursor-pointer">
            <span className="inline-flex items-center gap-2 rounded-md bg-gold-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-gold-300">
              <UploadCloud size={16} /> {reading ? 'A ler ficheiros…' : 'Escolher Ficheiros'}
            </span>
            <input type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleFiles} disabled={reading} />
          </label>
          <p className="text-xs text-ink-400">
            Clientes e Obras têm de já existir no sistema com o mesmo nome do ficheiro para serem associados automaticamente.
          </p>
        </Card>
      )}

      {step === 1 && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-ink-500">
            {rows.length} ficheiro(s) lido(s) — {importCount} marcado(s) para importar. Reveja e corrija Cliente/Obra onde necessário
            antes de confirmar.
          </p>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="py-2 pr-3 font-medium">Ficheiro</th>
                  <th className="py-2 pr-3 font-medium">Nº Proforma</th>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Obra</th>
                  <th className="py-2 pr-3 font-medium text-right">Total Geral</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const totals = r.parsed ? buildTotals(r.parsed, settings.defaultIvaRate).totals : null
                  const obrasForRowClient = obras.filter((o) => o.clientId === r.clientId)
                  return (
                    <tr key={i} className="border-b border-ink-50 last:border-0 align-top">
                      <td className="py-2 pr-3 text-ink-500 max-w-[160px] truncate" title={r.fileName}>
                        {r.fileName}
                      </td>
                      <td className="py-2 pr-3 num text-ink-700 whitespace-nowrap">{r.parsed?.proformaNumber || '—'}</td>
                      <td className="py-2 pr-3 min-w-[160px]">
                        {r.status === 'erro' && !r.clientId ? (
                          <Select value={r.clientId} onChange={(e) => setRowClient(i, e.target.value)} className="text-xs py-1">
                            <option value="">Selecionar cliente…</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.clientName}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-ink-700">{r.clientName || '—'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 min-w-[160px]">
                        {r.clientId && !r.obraId ? (
                          <Select value={r.obraId} onChange={(e) => setRowObra(i, e.target.value)} className="text-xs py-1">
                            <option value="">Selecionar obra…</option>
                            {obrasForRowClient.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.obraName}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-ink-700">{r.obraName || '—'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 num text-right whitespace-nowrap">{totals ? formatKz(totals.totalGeral) : '—'}</td>
                      <td className="py-2 pr-3">
                        {r.status === 'pronto' && (
                          <Badge tone="moss">
                            <CheckCircle2 size={12} className="mr-1 -mt-0.5 inline" /> Pronto
                          </Badge>
                        )}
                        {r.status === 'duplicado' && (
                          <Badge tone="clay">
                            <AlertTriangle size={12} className="mr-1 -mt-0.5 inline" /> Duplicado
                          </Badge>
                        )}
                        {r.status === 'erro' && (
                          <Badge tone="clay">
                            <XCircle size={12} className="mr-1 -mt-0.5 inline" /> {r.reason}
                          </Badge>
                        )}
                        {r.clientId && r.obraId && r.status !== 'pronto' && r.status !== 'duplicado' && (
                          <p className="mt-1 text-[11px] text-moss-500">Associado — pode marcar para importar.</p>
                        )}
                      </td>
                      <td className="py-2">
                        <Select
                          value={r.action}
                          onChange={(e) => setRowAction(i, e.target.value)}
                          className="text-xs py-1"
                          disabled={!r.clientId || !r.obraId || !r.parsed?.proformaNumber}
                        >
                          <option value="import">Importar</option>
                          <option value="skip">Ignorar</option>
                        </Select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between pt-6">
            <Button variant="ghost" onClick={reset}>
              <ArrowLeft size={15} /> Recomeçar
            </Button>
            <Button variant="gold" onClick={confirmImport} disabled={importing || importCount === 0}>
              {importing ? `A importar… (${doneCount}/${importCount})` : `Confirmar Importação (${importCount})`}
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <CheckCircle2 size={32} className="text-moss-500" />
          <p className="text-sm text-ink-700 font-medium">{doneCount} proforma(s) importada(s) com sucesso.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              Importar Mais Ficheiros
            </Button>
            <Button variant="gold" onClick={() => navigate('/proformas')}>
              Ver Proformas
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}