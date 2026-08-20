import { useEffect, useMemo, useState } from 'react'
import { FileDown, Sheet } from 'lucide-react'
import { Collections, listAll, getSettings } from '../lib/db.js'
import { computeObraSummary } from '../lib/calc.js'
import { formatKz, formatPercent, formatDate } from '../lib/format.js'
import { exportOutstandingReportPDF, exportRetentionReportPDF } from '../lib/pdf.js'
import { exportRowsToExcel } from '../lib/excel.js'
import PageHeader from '../components/PageHeader.jsx'
import { Button, Card } from '../components/ui.jsx'

export default function Reports() {
  const [tab, setTab] = useState('retencao')
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

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

  const obraSummaries = useMemo(() => {
    return obras.map((obra) => {
      const obraPayments = payments.filter((p) => p.obraId === obra.id)
      return { obra, ...computeObraSummary(obra, obraPayments, settings.defaultRetentionRate) }
    })
  }, [obras, payments, settings])

  const retentionRows = useMemo(() => {
    const rows = []
    obraSummaries.forEach(({ obra, rows: obraRows }) => {
      const client = clientMap[obra.clientId]
      obraRows.forEach((r) =>
        rows.push({
          clientName: client?.clientName || '—',
          obraName: obra.obraName,
          proformaNumber: obra.proformaNumber,
          paymentDate: r.paymentDate,
          paymentAmount: r.paymentAmount,
          paymentPercent: r.paymentPercent,
          maoDeObraPortion: r.maoDeObraPortion,
          retentionRate: r.retentionRate ?? obra.retentionRate ?? settings.defaultRetentionRate,
          retentionAmount: r.retentionAmount
        })
      )
    })
    return rows.sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate))
  }, [obraSummaries, clientMap, settings])

  const totalRetention = retentionRows.reduce((sum, r) => sum + r.retentionAmount, 0)

  const outstandingRows = useMemo(() => {
    return obraSummaries
      .map(({ obra, obraTotal, totalPaid, remaining, paidPercent }) => ({
        clientName: clientMap[obra.clientId]?.clientName || '—',
        obraName: obra.obraName,
        proformaNumber: obra.proformaNumber,
        obraTotal,
        totalPaid,
        remaining,
        paidPercent
      }))
      .filter((r) => r.remaining > 0.01)
      .sort((a, b) => b.remaining - a.remaining)
  }, [obraSummaries, clientMap])

  if (loading) return <div className="text-ink-400">A carregar…</div>

  return (
    <div>
      <PageHeader eyebrow="Análise" title="Relatórios" subtitle="Retenção e valores em aberto" />

      <div className="mb-5 flex gap-2 border-b border-ink-100">
        {[
          { key: 'retencao', label: 'Retenção' },
          { key: 'aberto', label: 'Em Aberto' }
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-gold-400 text-ink-900' : 'border-transparent text-ink-400 hover:text-ink-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'retencao' && (
        <>
          <div className="mb-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => exportRowsToExcel(retentionRows, 'relatorio-retencao.xlsx', 'Retenção')}>
              <Sheet size={16} /> Excel
            </Button>
            <Button variant="outline" onClick={() => exportRetentionReportPDF(retentionRows, totalRetention)}>
              <FileDown size={16} /> PDF
            </Button>
          </div>
          <Card className="overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Obra</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium text-right">Pagamento</th>
                  <th className="px-4 py-3 font-medium">%</th>
                  <th className="px-4 py-3 font-medium text-right">M. Obra Pgto</th>
                  <th className="px-4 py-3 font-medium">Taxa</th>
                  <th className="px-4 py-3 font-medium text-right">Retenção</th>
                </tr>
              </thead>
              <tbody>
                {retentionRows.map((r, i) => (
                  <tr key={i} className="border-b border-ink-50 last:border-0">
                    <td className="px-4 py-3 text-ink-700">{r.clientName}</td>
                    <td className="px-4 py-3 text-ink-500">{r.obraName}</td>
                    <td className="px-4 py-3 num">{formatDate(r.paymentDate)}</td>
                    <td className="px-4 py-3 num text-right">{formatKz(r.paymentAmount)}</td>
                    <td className="px-4 py-3 num">{formatPercent(r.paymentPercent)}</td>
                    <td className="px-4 py-3 num text-right">{formatKz(r.maoDeObraPortion)}</td>
                    <td className="px-4 py-3 num">{formatPercent(r.retentionRate)}</td>
                    <td className="px-4 py-3 num text-right text-gold-600 font-medium">{formatKz(r.retentionAmount)}</td>
                  </tr>
                ))}
                {retentionRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-ink-400">
                      Sem dados de retenção.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          <p className="text-right num text-sm font-semibold text-ink-800">
            Retenção Total: <span className="text-gold-600">{formatKz(totalRetention)}</span>
          </p>
        </>
      )}

      {tab === 'aberto' && (
        <>
          <div className="mb-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => exportRowsToExcel(outstandingRows, 'relatorio-em-aberto.xlsx', 'Em Aberto')}>
              <Sheet size={16} /> Excel
            </Button>
            <Button variant="outline" onClick={() => exportOutstandingReportPDF(outstandingRows)}>
              <FileDown size={16} /> PDF
            </Button>
          </div>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Obra</th>
                  <th className="px-4 py-3 font-medium text-right">Total Obra</th>
                  <th className="px-4 py-3 font-medium text-right">Total Pago</th>
                  <th className="px-4 py-3 font-medium text-right">Restante</th>
                  <th className="px-4 py-3 font-medium">Pago %</th>
                </tr>
              </thead>
              <tbody>
                {outstandingRows.map((r, i) => (
                  <tr key={i} className="border-b border-ink-50 last:border-0">
                    <td className="px-4 py-3 text-ink-700">{r.clientName}</td>
                    <td className="px-4 py-3 text-ink-500">{r.obraName}</td>
                    <td className="px-4 py-3 num text-right">{formatKz(r.obraTotal)}</td>
                    <td className="px-4 py-3 num text-right">{formatKz(r.totalPaid)}</td>
                    <td className="px-4 py-3 num text-right text-clay-500 font-medium">{formatKz(r.remaining)}</td>
                    <td className="px-4 py-3 num">{formatPercent(r.paidPercent)}</td>
                  </tr>
                ))}
                {outstandingRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ink-400">
                      Não há valores em aberto — tudo pago!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
