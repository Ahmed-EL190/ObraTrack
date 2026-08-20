import { useEffect, useState } from 'react'
import { getSettings, saveSettings } from '../lib/db.js'
import PageHeader from '../components/PageHeader.jsx'
import { Button, Card, Field, Input } from '../components/ui.jsx'

export default function Settings() {
  const [settings, setSettings] = useState({ id: null, defaultRetentionRate: 6.5, defaultIvaRate: 14 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s)
      setLoading(false)
    })
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const id = await saveSettings(settings.id, {
        defaultRetentionRate: Number(settings.defaultRetentionRate),
        defaultIvaRate: Number(settings.defaultIvaRate)
      })
      setSettings({ ...settings, id })
      setSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-ink-400">A carregar…</div>

  return (
    <div>
      <PageHeader eyebrow="Sistema" title="Definições" subtitle="Taxas globais aplicadas por omissão. Podem ser ajustadas por Obra." />

      <Card className="p-6 max-w-lg">
        <form onSubmit={handleSave} className="space-y-5">
          <Field label="Taxa de Retenção Padrão (%)" hint="Aplicada a novas Obras que não definam uma taxa própria.">
            <Input
              type="number"
              step="0.01"
              value={settings.defaultRetentionRate}
              onChange={(e) => setSettings({ ...settings, defaultRetentionRate: e.target.value })}
            />
          </Field>
          <Field label="Taxa de IVA Padrão (%)">
            <Input
              type="number"
              step="0.01"
              value={settings.defaultIvaRate}
              onChange={(e) => setSettings({ ...settings, defaultIvaRate: e.target.value })}
            />
          </Field>
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" variant="gold" disabled={saving}>
              {saving ? 'A guardar…' : 'Guardar Definições'}
            </Button>
            {savedAt && <span className="text-xs text-moss-500">Guardado.</span>}
          </div>
        </form>
      </Card>

      <p className="mt-4 max-w-lg text-xs text-ink-400">
        Nota: alterar estas taxas não recalcula pagamentos já registados — cada pagamento guarda a taxa de retenção usada no
        momento em que foi criado, para preservar o histórico correto.
      </p>
    </div>
  )
}
