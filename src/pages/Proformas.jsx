import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Collections, subscribeAll } from '../lib/db.js'
import { formatKz, formatDate } from '../lib/format.js'
import PageHeader from '../components/PageHeader.jsx'
import { Button, Card } from '../components/ui.jsx'

export default function Proformas() {
  const [proformas, setProformas] = useState([])
  const navigate = useNavigate()

  useEffect(() => subscribeAll(Collections.PROFORMAS, setProformas), [])

  return (
    <div>
      <PageHeader
        eyebrow="Documentos"
        title="Proformas"
        subtitle={`${proformas.length} proforma(s) registadas`}
        actions={
          <Button variant="gold" onClick={() => navigate('/proformas/novo')}>
            <Plus size={16} /> Nova Proforma
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Número</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Obra</th>
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
                  <td className="px-4 py-3 num font-medium text-ink-800">{pf.proformaNumber}</td>
                  <td className="px-4 py-3 text-ink-600">{pf.clientName}</td>
                  <td className="px-4 py-3 text-ink-600">{pf.obraName}</td>
                  <td className="px-4 py-3 num">{formatDate(pf.date)}</td>
                  <td className="px-4 py-3 num text-right">{formatKz(pf.totalGeral)}</td>
                </tr>
              ))}
              {proformas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-400">
                    Nenhuma proforma criada ainda.
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