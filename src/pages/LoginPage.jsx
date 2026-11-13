import React, { useState } from 'react'
import { Beer, Eye, EyeOff, Lock, User, Sun, Moon, AlertCircle } from 'lucide-react'
import { useRole } from '../context/RoleContext'

export default function LoginPage() {
  const { iniciarSesion, theme, toggleTheme } = useRole()

  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!usuario.trim() || !password) {
      setErrorMsg('Ingresa tu usuario y contraseña.')
      return
    }

    setCargando(true)
    setErrorMsg('')
    try {
      await iniciarSesion(usuario.trim(), password)
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo iniciar sesión.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0D11] text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 transition-colors">
      {/* Botón superior derecho de tema Claro / Oscuro */}
      <div className="flex justify-end max-w-6xl w-full mx-auto pt-2">
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
          className="w-9 h-9 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center justify-center transition cursor-pointer"
        >
          {theme === 'dark' ? (
            <Sun size={16} className="text-amber-400" />
          ) : (
            <Moon size={16} />
          )}
        </button>
      </div>

      {/* Tarjeta central minimalista */}
      <div className="w-full max-w-sm mx-auto my-auto">
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/[0.08] shadow-sm p-6 sm:p-7 space-y-6">
          {/* Identidad */}
          <div className="text-center space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 flex items-center justify-center mx-auto shadow-xs">
              <Beer size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                BevFlow
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Ingresa con tu usuario y contraseña
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-300 font-medium flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Usuario
              </label>
              <div className="relative">
                <User
                  size={15}
                  className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  placeholder="Ej. admin o marco"
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value)
                    setErrorMsg('')
                  }}
                  className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  type={verClave ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setErrorMsg('')
                  }}
                  className="w-full h-10 pl-10 pr-10 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {verClave ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {cargando ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>

      <div className="text-center text-[11px] text-slate-400 pb-2">
        Sistema de Distribución y Preventa
      </div>
    </div>
  )
}
