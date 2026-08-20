import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Clients from './pages/Clients.jsx'
import ClientDetail from './pages/ClientDetail.jsx'
import Obras from './pages/Obras.jsx'
import ObraDetail from './pages/ObraDetail.jsx'
import Proformas from './pages/Proformas.jsx'
import ProformaForm from './pages/ProformaForm.jsx'
import Payments from './pages/Payments.jsx'
import PaymentForm from './pages/PaymentForm.jsx'
import Reports from './pages/Reports.jsx'
import ImportExcel from './pages/ImportExcel.jsx'
import Settings from './pages/Settings.jsx'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-50 text-ink-400 font-body">
        A carregar…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="clientes/:id" element={<ClientDetail />} />
        <Route path="obras" element={<Obras />} />
        <Route path="obras/:id" element={<ObraDetail />} />
        <Route path="proformas" element={<Proformas />} />
        <Route path="proformas/novo" element={<ProformaForm />} />
        <Route path="proformas/:id" element={<ProformaForm />} />
        <Route path="pagamentos" element={<Payments />} />
        <Route path="pagamentos/novo" element={<PaymentForm />} />
        <Route path="relatorios" element={<Reports />} />
        <Route path="importar" element={<ImportExcel />} />
        <Route path="definicoes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
