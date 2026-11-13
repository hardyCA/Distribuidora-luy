import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { RoleProvider, useRole } from './context/RoleContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProductosPage from './pages/ProductosPage'
import AlmacenPage from './pages/AlmacenPage'
import ClientesPage from './pages/ClientesPage'
import PreventaPage from './pages/PreventaPage'
import MisPedidosPage from './pages/MisPedidosPage'
import DespachoPage from './pages/DespachoPage'
import CajaCentralPage from './pages/CajaCentralPage'
import CreditosPage from './pages/CreditosPage'

function ProtectedAppRoutes() {
  const { autenticado, verificandoSesion, infoRol, menuActivo, esCuentaAdmin } =
    useRole()
  const location = useLocation()

  if (verificandoSesion && !autenticado) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B0D11] flex items-center justify-center">
        <div className="text-xs font-medium text-slate-400">
          Verificando sesión...
        </div>
      </div>
    )
  }

  if (!autenticado) {
    return <LoginPage />
  }

  const rutasPermitidas = (menuActivo || []).map((m) => m.path)
  const rutaDestinoDefecto = infoRol.defaultRoute || rutasPermitidas[0] || '/'

  // Si no es cuenta admin e intenta abrir por URL un módulo fuera de su rol, redirigir a su módulo
  if (
    !esCuentaAdmin &&
    location.pathname !== '/' &&
    rutasPermitidas.length > 0 &&
    !rutasPermitidas.includes(location.pathname)
  ) {
    return <Navigate to={rutaDestinoDefecto} replace />
  }

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={rutaDestinoDefecto} replace />}
        />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/productos" element={<ProductosPage />} />
        <Route path="/almacen" element={<AlmacenPage />} />
        <Route path="/preventa" element={<PreventaPage />} />
        <Route path="/mis-pedidos" element={<MisPedidosPage />} />
        <Route path="/despacho" element={<DespachoPage />} />
        <Route path="/caja-central" element={<CajaCentralPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/creditos" element={<CreditosPage />} />
        <Route
          path="*"
          element={<Navigate to={rutaDestinoDefecto} replace />}
        />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <RoleProvider>
        <ProtectedAppRoutes />
      </RoleProvider>
    </BrowserRouter>
  )
}
