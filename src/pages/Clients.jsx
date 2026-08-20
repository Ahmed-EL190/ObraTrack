import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { Collections, createOne, subscribeAll } from '../lib/db.js'
import PageHeader from '../components/PageHeader.jsx'
import { Badge, Button, Card, Field, Input, Select, TextArea } from '../components/ui.jsx'

const EMPTY = {
  clientName: '',
  nif: '',
  phone: '',
  email: '',
  address: '',
  contactPerson: '',
  notes: '',
  status: 'Ativo'
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => subscribeAll(Collections.CLIENTS, setClients), [])

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase()
    return c.clientName?.toLowerCase().includes(q) || c.nif?.toLowerCase().includes(q)
  })

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const id = await createOne(Collections.CLIENTS, form)
      setShowForm(false)
      setForm(EMPTY)
      navigate(`/clientes/${id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Carteira"
        title="Clientes"
        subtitle={`${clients.length} cliente(s) registados`}
        actions={
          <Button variant="gold" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Novo Cliente
          </Button>
        }
      />

      <div className="mb-4 relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
        <Input
          placeholder="Pesquisar por nome ou NIF…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-400">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">NIF</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className="cursor-pointer border-b border-ink-50 last:border-0 hover:bg-gold-50/40"
              >
                <td className="px-4 py-3 font-medium text-ink-800">{c.clientName}</td>
                <td className="px-4 py-3 num text-ink-500">{c.nif || '—'}</td>
                <td className="px-4 py-3 text-ink-500">{c.phone || c.email || '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone={c.status === 'Inativo' ? 'clay' : 'moss'}>{c.status}</Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-400">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/50 p-4">
          <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink-900">Novo Cliente</h2>
              <button onClick={() => setShowForm(false)} className="text-ink-400 hover:text-ink-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <Field label="Nome do Cliente *">
                <Input required value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="NIF">
                  <Input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
                </Field>
                <Field label="Telefone">
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
              </div>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Endereço">
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Pessoa de Contacto">
                  <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                </Field>
                <Field label="Estado">
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </Select>
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
                  {saving ? 'A guardar…' : 'Guardar Cliente'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
