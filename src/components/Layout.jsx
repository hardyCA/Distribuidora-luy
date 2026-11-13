import React, { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown,
  Beer,
  X,
  Check,
  LayoutGrid,
  Sun,
  Moon,
  Users,
  LogOut,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useRole } from '../context/RoleContext'
import { ROLES_INFO, MENU_BY_ROLE } from '../config/navigation'
import { limpiarIdentificadorUsuario } from '../lib/supabase'

export default function Layout({ children }) {
  const {
    rolActual,
    esCuentaAdmin,
    infoRol,
    usuarioActual,
    menuActivo,
    perfilesLista,
    cargandoPerfil,
    isOnline,
    theme,
    toggleTheme,
    cambiarRol,
    cerrarSesion,
    registrarNuevoPersonal,
  } = useRole()

  const location = useLocation()
  const navigate = useNavigate()

  const [modalPersonalOpen, setModalPersonalOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  // Campos para crear Preventista / Personal con usuario y contraseña desde el modal rápido
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoRol, setNuevoRol] = useState('preventista')
  const [nuevoUsuarioLogin, setNuevoUsuarioLogin] = useState('')
  const [nuevoPassword, setNuevoPassword] = useState('')
  const [verClaveNueva, setVerClaveNueva] = useState(false)
  const [guardandoPersonal, setGuardandoPersonal] = useState(false)
  const [errorPersonal, setErrorPersonal] = useState('')
  const [exitoPersonal, setExitoPersonal] = useState('')

  const handleSelectRole = (e) => {
    if (!esCuentaAdmin) return
    const nextRole = e.target.value
    cambiarRol(nextRole)
    const allowedRoutes = MENU_BY_ROLE[nextRole]?.map((item) => item.path) || []
    if (!allowedRoutes.includes(location.pathname)) {
      navigate(ROLES_INFO[nextRole]?.defaultRoute || '/')
    }
  }

  const handleNombreChange = (val) => {
    setNuevoNombre(val)
    const base = val.split('(')[0].trim().split(/\s+/).slice(0, 2).join('.')
    setNuevoUsuarioLogin(limpiarIdentificadorUsuario(base))
  }

  const handleCrearPersonal = async (e) => {
    e.preventDefault()
    if (!nuevoNombre.trim()) return
    setGuardandoPersonal(true)
    setErrorPersonal('')
    setExitoPersonal('')
    try {
      const creado = await registrarNuevoPersonal({
        nombre: nuevoNombre.trim(),
        rol: nuevoRol,
        usuarioLogin: nuevoUsuarioLogin.trim(),
        password: nuevoPassword,
      })
      setExitoPersonal(
        `Listo: usuario "${creado.usuario_login}" creado con su contraseña.`
      )
      setNuevoNombre('')
      setNuevoUsuarioLogin('')
      setNuevoPassword('')
    } catch (err) {
      setErrorPersonal(err.message || 'No se pudo registrar el usuario.')
    } finally {
      setGuardandoPersonal(false)
    }
  }

  const handleCerrarSesion = async () => {
    setMobileMoreOpen(false)
    setModalPersonalOpen(false)
    await cerrarSesion()
  }

  const mostrarBotonMasMovil = menuActivo.length > 4
  const itemsBarraInferior = mostrarBotonMasMovil
    ? menuActivo.slice(0, 4)
    : menuActivo

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0D11] text-slate-900 dark:text-slate-100 flex flex-col md:flex-row transition-colors duration-150">
      {/* ================= SIDEBAR DESKTOP / LAPTOP (md:flex) ================= */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-white dark:bg-[#11141B] border-r border-slate-200/80 dark:border-white/[0.07] z-30 select-none">
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-amber-500 flex items-center justify-center text-amber-400 dark:text-slate-950">
              <Beer size={16} />
            </div>
            <span className="font-semibold tracking-tight text-slate-900 dark:text-white text-sm">
              BevFlow
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
              PRO
            </span>
          </div>
        </div>

        {/* Navegación limpia filtrada por Rol */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {menuActivo.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `group flex items-center justify-between px-3 py-2 rounded-r-lg text-xs sm:text-[13px] transition-all duration-150 ${
                    isActive
                      ? 'bg-slate-100 dark:bg-white/[0.06] text-slate-900 dark:text-white font-medium border-l-2 border-amber-500'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-slate-200 border-l-2 border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        size={16}
                        className={`shrink-0 transition-colors ${
                          isActive
                            ? 'text-amber-500'
                            : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.readOnlyStock && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded text-slate-400 dark:text-slate-500 font-normal shrink-0">
                        Lectura
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Pie del Sidebar */}
        <div className="p-2.5 border-t border-slate-200/80 dark:border-white/[0.07] space-y-1">
          {esCuentaAdmin && (
            <button
              type="button"
              onClick={() => {
                setErrorPersonal('')
                setExitoPersonal('')
                setModalPersonalOpen(true)
              }}
              className="w-full px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/[0.05] text-xs font-medium flex items-center gap-2 transition cursor-pointer"
            >
              <Users size={15} className="text-slate-400" />
              <span>Preventistas y Accesos</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCerrarSesion}
            className="w-full px-3 py-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/[0.06] text-xs font-medium flex items-center gap-2 transition cursor-pointer"
          >
            <LogOut size={15} />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ================= CONTENEDOR PRINCIPAL ================= */}
      <div className="flex-1 flex flex-col md:pl-60 min-h-screen pb-20 md:pb-0">
        {/* BARRA SUPERIOR */}
        <header className="sticky top-0 z-20 h-12 bg-white/85 dark:bg-[#11141B]/85 backdrop-blur-md border-b border-slate-200/80 dark:border-white/[0.07] px-3 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="md:hidden w-7 h-7 rounded-lg bg-slate-900 dark:bg-amber-500 flex items-center justify-center text-amber-400 dark:text-slate-950 shrink-0">
              <Beer size={15} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 truncate">
              <span className="font-medium text-slate-600 dark:text-slate-400">
                BevFlow
              </span>
              <span>/</span>
              <span className="truncate">{infoRol.shortLabel}</span>
            </div>
          </div>

          {/* Controles superiores derechos */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              title={
                theme === 'dark'
                  ? 'Cambiar a Modo Claro'
                  : 'Cambiar a Modo Oscuro'
              }
              className="h-8 w-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center justify-center transition cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun size={15} className="text-amber-400" />
              ) : (
                <Moon size={15} />
              )}
            </button>

            {esCuentaAdmin && (
              <>
                <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-0.5" />
                <div className="relative flex items-center">
                  <select
                    aria-label="Vista de rol (solo Admin)"
                    value={rolActual}
                    onChange={handleSelectRole}
                    className="h-8 pl-2.5 pr-6 rounded-lg bg-transparent hover:bg-slate-100 dark:hover:bg-white/[0.06] border-0 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer appearance-none transition"
                  >
                    <option value="admin">Vista: Admin</option>
                    <option value="central">Vista: Caja Central</option>
                    <option value="preventista">Vista: Preventista</option>
                    <option value="almacen">Vista: Almacén</option>
                  </select>
                  <ChevronDown
                    size={13}
                    className="text-slate-400 pointer-events-none -ml-5 mr-1.5"
                  />
                </div>
              </>
            )}

            <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-0.5 hidden sm:block" />

            <button
              type="button"
              onClick={() => {
                if (esCuentaAdmin) {
                  setErrorPersonal('')
                  setExitoPersonal('')
                  setModalPersonalOpen(true)
                }
              }}
              title={
                isOnline
                  ? `${usuarioActual?.nombre || 'Usuario'} — En línea`
                  : `${usuarioActual?.nombre || 'Usuario'} — Modo sin señal (Offline)`
              }
              className={`h-8 px-2 rounded-lg flex items-center gap-2 transition ${
                esCuentaAdmin
                  ? 'hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer'
                  : 'cursor-default'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'
                }`}
              />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate max-w-[130px] hidden sm:inline">
                {cargandoPerfil ? 'Cargando...' : usuarioActual?.nombre}
              </span>
            </button>

            <button
              type="button"
              onClick={handleCerrarSesion}
              title="Cerrar sesión"
              className="md:hidden h-8 w-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition cursor-pointer"
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* CONTENIDO DE LA RUTA ACTIVA */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* ================= BARRA INFERIOR MÓVIL (md:hidden) ================= */}
      <nav
        aria-label="Navegación móvil inferior"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-[#11141B]/95 backdrop-blur-md border-t border-slate-200/90 dark:border-white/[0.07]"
      >
        <div
          className="grid gap-1 px-2 py-1.5"
          style={{
            gridTemplateColumns: `repeat(${
              mostrarBotonMasMovil
                ? itemsBarraInferior.length + 1
                : itemsBarraInferior.length
            }, minmax(0, 1fr))`,
          }}
        >
          {itemsBarraInferior.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileMoreOpen(false)}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all active:scale-95 ${
                    isActive
                      ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={18}
                      className={`mb-0.5 ${isActive ? 'text-amber-500' : ''}`}
                    />
                    <span className="text-[10px] leading-tight text-center truncate w-full px-0.5">
                      {item.shortLabel || item.label}
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}

          {mostrarBotonMasMovil && (
            <button
              type="button"
              onClick={() => setMobileMoreOpen((prev) => !prev)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg transition-all active:scale-95 cursor-pointer ${
                mobileMoreOpen
                  ? 'bg-slate-100 dark:bg-white/[0.08] text-amber-500 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LayoutGrid size={18} className="mb-0.5" />
              <span className="text-[10px] leading-tight">
                Más ({menuActivo.length - 4})
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* Drawer inferior móvil */}
      {mobileMoreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex items-end">
          <div className="w-full bg-white dark:bg-[#161922] rounded-t-2xl border-t border-slate-200 dark:border-white/10 p-4 pb-24 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2.5">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Módulos ({infoRol.shortLabel})
              </span>
              <div className="flex items-center gap-2">
                {esCuentaAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMoreOpen(false)
                      setModalPersonalOpen(true)
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Users size={14} />
                    <span>Accesos</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobileMoreOpen(false)}
                  className="p-1 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {menuActivo.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 p-2.5 rounded-lg border text-xs font-medium transition ${
                        isActive
                          ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white border-amber-500/50'
                          : 'bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-white/10'
                      }`
                    }
                  >
                    <Icon size={15} className="shrink-0 text-amber-500" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL RÁPIDO DE PREVENTISTAS Y ACCESOS (SOLO ADMIN) ================= */}
      {esCuentaAdmin && modalPersonalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Preventistas y Accesos
                </h3>
                <p className="text-xs text-slate-400">
                  Crea cuentas con usuario y contraseña o supervisa sus vistas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalPersonalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Formulario limpio para crear Preventista con contraseña */}
              <form
                onSubmit={handleCrearPersonal}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] space-y-3"
              >
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Crear nuevo Preventista / Usuario
                </div>

                {errorPersonal && (
                  <div className="text-xs text-red-600 dark:text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl p-2.5">
                    {errorPersonal}
                  </div>
                )}

                {exitoPersonal && (
                  <div className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-2.5 font-medium">
                    {exitoPersonal}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Nombre (ej. Luis Torrez - Ruta Sur)"
                    value={nuevoNombre}
                    onChange={(e) => handleNombreChange(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-white dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                  <select
                    value={nuevoRol}
                    onChange={(e) => setNuevoRol(e.target.value)}
                    className="h-9 px-3 rounded-xl bg-white dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white font-medium focus:outline-none focus:border-amber-500"
                  >
                    <option value="preventista">Preventista (Calle)</option>
                    <option value="central">Cajero Central</option>
                    <option value="almacen">Encargado Almacén</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Usuario de acceso (ej. luis)"
                    value={nuevoUsuarioLogin}
                    onChange={(e) =>
                      setNuevoUsuarioLogin(
                        limpiarIdentificadorUsuario(e.target.value)
                      )
                    }
                    className="h-9 px-3 rounded-xl bg-white dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    required
                  />
                  <div className="relative">
                    <input
                      type={verClaveNueva ? 'text' : 'password'}
                      placeholder="Contraseña (mín. 6 caract.)"
                      value={nuevoPassword}
                      onChange={(e) => setNuevoPassword(e.target.value)}
                      minLength={6}
                      className="w-full h-9 pl-3 pr-8 rounded-xl bg-white dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setVerClaveNueva((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {verClaveNueva ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={guardandoPersonal}
                  className="w-full h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {guardandoPersonal
                    ? 'Creando cuenta...'
                    : 'Crear Cuenta con Contraseña'}
                </button>
              </form>

              {/* Lista de perfiles existentes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Cuentas registradas ({perfilesLista.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setModalPersonalOpen(false)
                      navigate('/dashboard')
                    }}
                    className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    Gestionar contraseñas →
                  </button>
                </div>

                <div className="space-y-1.5">
                  {perfilesLista.map((p) => {
                    const rInfo = ROLES_INFO[p.rol] || ROLES_INFO.preventista
                    const activo = usuarioActual?.id === p.id
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          cambiarRol(p.rol, p)
                          setModalPersonalOpen(false)
                          const allowedRoutes =
                            MENU_BY_ROLE[p.rol]?.map((item) => item.path) || []
                          if (!allowedRoutes.includes(location.pathname)) {
                            navigate(rInfo.defaultRoute)
                          }
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer ${
                          activo
                            ? 'bg-amber-500/10 border-amber-500/40'
                            : 'bg-slate-50/70 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06] border-slate-200/80 dark:border-white/[0.07]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white/10 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                            {p.nombre?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {p.nombre}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {rInfo.shortLabel}
                              {p.usuario_login
                                ? ` · usuario: ${p.usuario_login}`
                                : ''}
                            </div>
                          </div>
                        </div>
                        {activo && (
                          <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                            <Check size={12} className="stroke-[3]" />
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
