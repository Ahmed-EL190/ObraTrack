import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileDown, Plus, Trash2 } from 'lucide-react'
import { Collections, listAll, subscribeAll, getOne, removeOne } from '../lib/db.js'
import { formatKz, formatDate, formatPercent } from '../lib/format.js'
import { exportPaymentReceiptPDF } from '../lib/pdf.js'
import { calculatePayment } from '../lib/calc.js'
import PageHeader from '../components/PageHeader.jsx'
import { Button, Card, Select } from '../components/ui.jsx'

export default function Payments() {
  const [payments, setPayments] = useState([])
  const [clients, setClients] = useState([])
  const [obras, setObras] = useState([])
  const [filterClient, setFilterClient] = useState('')
  const [filterObra, setFilterObra] = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const u1 = subscribeAll(Collections.PAYMENTS, setPayments, 'paymentDate')
    listAll(Collections.CLIENTS).then(setClients)
    listAll(Collections.OBRAS).then(setObras)
    return () => u1()
  }, [])

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const obraMap = useMemo(() => Object.fromEntries(obras.map((o) => [o.id, o])), [obras])

  const rows = payments
    .filter((p) => !filterClient || p.clientId === filterClient)
    .filter((p) => !filterObra || p.obraId === filterObra)
    .filter((p) => !filterMethod || p.paymentMethod === filterMethod)

  async function handleReceipt(p) {
    const [client, obra] = await Promise.all([getOne(Collections.CLIENTS, p.clientId), getOne(Collections.OBRAS, p.obraId)])
    const calc = calculatePayment({
      obraTotal: obra?.totalGeral ?? obra?.contractValue,
      totalMaoDeObra: obra?.totalMaoDeObra,
      paymentAmount: p.paymentAmount,
      retentionRate: p.retentionRate ?? obra?.retentionRate ?? 0,
      retentionMode: p.retentionMode || 'proportional'
    })
    exportPaymentReceiptPDF(p, client, obra, calc)
  }

  async function handleDelete(p) {
    if (!confirm('Eliminar este pagamento? Esta ação não pode ser desfeita.')) return
    await removeOne(Collections.PAYMENTS, p.id)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Financeiro"
        title="Pagamentos"
        subtitle={`${payments.length} pagamento(s) registados`}
        actions={
          <Button variant="gold" onClick={() => navigate('/pagamentos/novo')}>
            <Plus size={16} /> Novo Pagamento
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} className="max-w-[200px]">
          <option value="">Todos os Clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.clientName}
            </option>
          ))}
        </Select>
        <Select value={filterObra} onChange={(e) => setFilterObra(e.target.value)} className="max-w-[200px]">
          <option value="">Todas as Obras</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.obraName}
            </option>
          ))}
        </Select>
        <Select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className="max-w-[180px]">
          <option value="">Todos os Métodos</option>
          <option value="Transferência Bancária">Transferência Bancária</option>
          <option value="Dinheiro">Dinheiro</option>
          <option value="Cheque">Cheque</option>
          <option value="Outro">Outro</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Obra</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium">Referência</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-ink-50 last:border-0 hover:bg-gold-50/30">
                  <td className="px-4 py-3 num">{formatDate(p.paymentDate)}</td>
                  <td className="px-4 py-3 text-ink-700">{clientMap[p.clientId]?.clientName || '—'}</td>
                  <td className="px-4 py-3 text-ink-500">{obraMap[p.obraId]?.obraName || '—'}</td>
                  <td className="px-4 py-3 num text-right font-medium">{formatKz(p.paymentAmount)}</td>
                  <td className="px-4 py-3 text-ink-500">{p.paymentMethod}</td>
                  <td className="px-4 py-3 num text-ink-400">{p.paymentReference || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleReceipt(p)} className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-800">
                        <FileDown size={14} /> Recibo
                      </button>
                      <button onClick={() => handleDelete(p)} className="flex items-center gap-1 text-xs text-clay-500 hover:text-clay-500/80">
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-400">
                    Nenhum pagamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}