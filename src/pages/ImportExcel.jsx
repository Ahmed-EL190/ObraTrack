import { useState } from 'react'
import { UploadCloud, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react'
import { readWorkbook, sheetToRows, mapRows, IMPORT_TARGET_FIELDS, detectDuplicates } from '../lib/excel.js'
import { Collections, batchCreate, listAll, updateOne } from '../lib/db.js'
import PageHeader from '../components/PageHeader.jsx'
import { Badge, Button, Card, Field, Select } from '../components/ui.jsx'

const STEPS = ['Carregar', 'Folha', 'Mapear Colunas', 'Pré-visualizar', 'Confirmar']

export default function ImportExcel() {
  const [step, setStep] = useState(0)
  const [workbook, setWorkbook] = useState(null)
  const [sheetName, setSheetName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [previewRows, setPreviewRows] = useState([])
  const [rowActions, setRowActions] = useState({}) // index -> 'import' | 'skip' | 'update'
  const [targetCollection, setTargetCollection] = useState(Collections.PAYMENTS)
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(0)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const wb = await readWorkbook(file)
    setWorkbook(wb)
    setSheetName(wb.SheetNames[0])
    setStep(1)
  }

  function proceedToMapping() {
    const { headers: h, rows } = sheetToRows(workbook, sheetName)
    setHeaders(h)
    setRawRows(rows)
    setMapping({})
    setStep(2)
  }

  async function proceedToPreview() {
    const mapped = mapRows(headers, rawRows, mapping)
    const existing = await listAll(targetCollection).catch(() => [])
    const withDupes = detectDuplicates(mapped, existing)
    setPreviewRows(withDupes)
    const actions = {}
    withDupes.forEach((r, i) => {
      actions[i] = r.isDuplicate ? 'skip' : 'import'
    })
    setRowActions(actions)
    setStep(3)
  }

  async function confirmImport() {
    setImporting(true)
    setDone(0)
    try {
      // "Importar" -> cria um registo novo.
      // "Atualizar" -> atualiza o registo existente (existingId, vindo de detectDuplicates)
      //                em vez de criar um duplicado.
      // Se "Atualizar" for escolhido numa linha que afinal não tem duplicado correspondente,
      // cai para criação, para nunca perder a linha.
      const toCreate = []
      const toUpdate = []

      previewRows.forEach((r, i) => {
        const action = rowActions[i]
        if (action !== 'import' && action !== 'update') return
        const { isDuplicate, existingId, ...rest } = r
        if (action === 'update' && existingId) {
          toUpdate.push({ id: existingId, data: rest })
        } else {
          toCreate.push(rest)
        }
      })

      if (toCreate.length) await batchCreate(targetCollection, toCreate)
      if (toUpdate.length) {
        await Promise.all(toUpdate.map(({ id, data }) => updateOne(targetCollection, id, data)))
      }

      setDone(toCreate.length + toUpdate.length)
      setStep(4)
    } finally {
      setImporting(false)
    }
  }

  function reset() {
    setStep(0)
    setWorkbook(null)
    setSheetName('')
    setHeaders([])
    setRawRows([])
    setMapping({})
    setPreviewRows([])
    setRowActions({})
    setDone(0)
  }

  return (
    <div>
      <PageHeader eyebrow="Dados" title="Importar Excel" subtitle="Importe dados históricos de Clientes, Obras, Proformas ou Pagamentos" />

      <div className="mb-6 flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
                i <= step ? 'bg-gold-400 text-ink-900' : 'bg-ink-100 text-ink-400'
              }`}
            >
              {i + 1}
            </span>
            <span className={i <= step ? 'text-ink-700 font-medium' : 'text-ink-400'}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 text-ink-300">—</span>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <UploadCloud size={32} className="text-ink-300" />
          <p className="text-sm text-ink-600">Carregue um ficheiro .xlsx ou .xls com os dados históricos.</p>
          <label className="cursor-pointer">
            <span className="inline-flex items-center rounded-md bg-gold-400 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-gold-300">
              Escolher Ficheiro
            </span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </label>
        </Card>
      )}

      {step === 1 && workbook && (
        <Card className="p-6 max-w-lg">
          <div className="space-y-4">
            <Field label="Folha (Sheet)">
              <Select value={sheetName} onChange={(e) => setSheetName(e.target.value)}>
                {workbook.SheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Que tipo de dados está a importar?">
              <Select value={targetCollection} onChange={(e) => setTargetCollection(e.target.value)}>
                <option value={Collections.CLIENTS}>Clientes</option>
                <option value={Collections.OBRAS}>Obras</option>
                <option value={Collections.PROFORMAS}>Proformas</option>
                <option value={Collections.PAYMENTS}>Pagamentos</option>
              </Select>
            </Field>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={reset}>
                <ArrowLeft size={15} /> Recomeçar
              </Button>
              <Button variant="gold" onClick={proceedToMapping}>
                Continuar <ArrowRight size={15} />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-ink-500">
            Associe cada coluna do seu Excel ao campo correspondente do sistema. Deixe em branco os campos que não se aplicam.
          </p>
          <div className="grid md:grid-cols-2 gap-4 max-h-[420px] overflow-y-auto pr-2">
            {IMPORT_TARGET_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Select value={mapping[f.key] || ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                  <option value="">— Não mapear —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <div className="flex justify-between pt-6">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={15} /> Voltar
            </Button>
            <Button variant="gold" onClick={proceedToPreview}>
              Pré-visualizar <ArrowRight size={15} />
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6">
          <p className="mb-4 text-sm text-ink-500">
            {previewRows.length} linha(s) encontradas. Linhas assinaladas como possível duplicado estão marcadas para "Ignorar" por
            omissão — pode alterar antes de confirmar.
          </p>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-400">
                  {Object.keys(mapping)
                    .filter((k) => mapping[k])
                    .map((k) => (
                      <th key={k} className="py-2 pr-3 font-medium">
                        {IMPORT_TARGET_FIELDS.find((f) => f.key === k)?.label || k}
                      </th>
                    ))}
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-ink-50 last:border-0">
                    {Object.keys(mapping)
                      .filter((k) => mapping[k])
                      .map((k) => (
                        <td key={k} className="py-1.5 pr-3 text-ink-700 whitespace-nowrap">
                          {String(r[k] ?? '')}
                        </td>
                      ))}
                    <td className="py-1.5 pr-3">
                      {r.isDuplicate ? (
                        <Badge tone="clay">
                          <AlertTriangle size={12} className="mr-1 -mt-0.5 inline" /> Possível duplicado
                        </Badge>
                      ) : (
                        <Badge tone="moss">Novo</Badge>
                      )}
                    </td>
                    <td className="py-1.5">
                      <Select
                        value={rowActions[i]}
                        onChange={(e) => setRowActions({ ...rowActions, [i]: e.target.value })}
                        className="text-xs py-1"
                      >
                        <option value="import">Importar</option>
                        <option value="skip">Ignorar</option>
                        <option value="update">Atualizar</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between pt-6">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft size={15} /> Voltar
            </Button>
            <Button variant="gold" onClick={confirmImport} disabled={importing}>
              {importing ? 'A importar…' : 'Confirmar Importação'}
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <CheckCircle2 size={32} className="text-moss-500" />
          <p className="text-sm text-ink-700 font-medium">{done} registo(s) importado(s) com sucesso.</p>
          <Button variant="gold" onClick={reset}>
            Importar Outro Ficheiro
          </Button>
        </Card>
      )}
    </div>
  )
}