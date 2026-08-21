import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  HardHat,
  FileText,
  Wallet,
  BarChart3,
  UploadCloud,
  Settings as SettingsIcon,
  LogOut,
  Building2,
  Menu,
  X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

const NAV = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/obras', label: 'Obras', icon: HardHat },
  { to: '/proformas', label: 'Proformas', icon: FileText },
  { to: '/pagamentos', label: 'Pagamentos', icon: Wallet },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/importar', label: 'Importar Excel', icon: UploadCloud },
  { to: '/definicoes', label: 'Definições', icon: SettingsIcon }
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function NavItems({ onNavigate }) {
    return (
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-ink-800 text-gold-300'
                  : 'text-ink-300 hover:bg-ink-800/60 hover:text-white'
              }`
            }
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
    )
  }

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-ink-900 text-ink-100">
        <div className="flex items-center gap-2.5 px-6 py-6 border-b border-ink-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold-400 text-ink-900">
            <Building2 size={18} strokeWidth={2.5} />
          </div>
          <div>
            <p className="font-display font-semibold text-[15px] leading-none text-white">Khaled Sham</p>
            <p className="text-[11px] text-ink-400 mt-1 tracking-wide uppercase">Angola · KZ</p>
          </div>
        </div>

        <NavItems />

        <div className="border-t border-ink-800 px-4 py-4">
          <p className="truncate text-xs text-ink-400 mb-2">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-300 hover:bg-ink-800 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            Terminar sessão
          </button>
        </div>
      </aside>

      {/* Sidebar - Mobile (drawer) */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex w-72 max-w-[80%] flex-col bg-ink-900 text-ink-100">
            <div className="flex items-center justify-between gap-2.5 px-4 py-4 border-b border-ink-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gold-400 text-ink-900">
                  <Building2 size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <p className="font-display font-semibold text-[15px] leading-none text-white">Khaled Sham</p>
                  <p className="text-[11px] text-ink-400 mt-1 tracking-wide uppercase">Angola · KZ</p>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-ink-300 p-1">
                <X size={22} />
              </button>
            </div>

            <NavItems onNavigate={() => setMobileOpen(false)} />

            <div className="border-t border-ink-800 px-4 py-4">
              <p className="truncate text-xs text-ink-400 mb-2">{user?.email}</p>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-300 hover:bg-ink-800 hover:text-white transition-colors"
              >
                <LogOut size={16} />
                Terminar sessão
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
          <button onClick={() => setMobileOpen(true)} className="text-ink-700 p-1 -ml-1">
            <Menu size={22} />
          </button>
          <span className="font-display font-semibold text-ink-800">ObraTrack</span>
          <button onClick={handleLogout} className="text-sm text-ink-400">
            Sair
          </button>
        </header>
        <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}