import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { Button, Field, Input } from '../components/ui.jsx'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError('Credenciais inválidas. Verifique o email e a palavra-passe.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-gold-400 text-ink-900">
            <Building2 size={22} strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-xl font-semibold text-white">Khaled Sham</h1>
          <p className="mt-1 text-sm text-ink-400">Gestão de Pagamentos e Retenção</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-ink-800 bg-ink-900 p-6">
          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contabilidade@empresa.co.ao"
              className="bg-ink-800 border-ink-700 text-white placeholder:text-ink-500"
            />
          </Field>
          <Field label="Palavra-passe">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-ink-800 border-ink-700 text-white placeholder:text-ink-500"
            />
          </Field>
          {error && <p className="text-sm text-clay-500">{error}</p>}
          <Button type="submit" variant="gold" className="w-full justify-center" disabled={loading}>
            {loading ? 'A entrar…' : 'Entrar'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-ink-500">
          Acesso restrito à contabilidade e gestão da empresa.
        </p>
      </div>
    </div>
  )
}
