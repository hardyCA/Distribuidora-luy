import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react'
import { ROLES_INFO, MENU_BY_ROLE } from '../config/navigation'
import {
  supabase,
  iniciarSesionConCredenciales,
  cerrarSesionSupabase,
  listarPerfilesSupabase,
  crearUsuarioConCredencialesSupabase,
  extraerUsuarioCortoDeAuth,
} from '../lib/supabase'

const RoleContext = createContext(null)

const STORAGE_AUTH_ACCOUNT_KEY = 'bebidas_sesion_usuario_v1'
const STORAGE_ROLE_KEY = 'bebidas_rol_activo'
const STORAGE_PROFILE_KEY = 'bebidas_perfil_activo'
const STORAGE_THEME_KEY = 'theme'

export function RoleProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem(STORAGE_THEME_KEY)
      if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme
    } catch {
      // ignore
    }
    return 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  // Cuenta real autenticada mediante usuario y contraseña
  const [cuentaAutenticada, setCuentaAutenticada] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_AUTH_ACCOUNT_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.id && parsed?.rol) return parsed
      }
    } catch {
      // ignore
    }
    return null
  })

  const [verificandoSesion, setVerificandoSesion] = useState(true)

  const [rolActual, setRolActual] = useState(() => {
    try {
      const rawAuth = localStorage.getItem(STORAGE_AUTH_ACCOUNT_KEY)
      if (rawAuth) {
        const parsedAuth = JSON.parse(rawAuth)
        if (parsedAuth?.rol && parsedAuth.rol !== 'admin') {
          return parsedAuth.rol
        }
        const savedRole = localStorage.getItem(STORAGE_ROLE_KEY)
        if (savedRole && ROLES_INFO[savedRole]) return savedRole
        if (parsedAuth?.rol) return parsedAuth.rol
      }
    } catch {
      // ignore
    }
    return 'admin'
  })

  const [usuarioActual, setUsuarioActual] = useState(() => {
    try {
      const rawAuth = localStorage.getItem(STORAGE_AUTH_ACCOUNT_KEY)
      if (rawAuth) {
        const parsedAuth = JSON.parse(rawAuth)
        if (parsedAuth?.rol !== 'admin') return parsedAuth
        const savedProf = localStorage.getItem(STORAGE_PROFILE_KEY)
        if (savedProf) {
          const parsedProf = JSON.parse(savedProf)
          if (parsedProf?.id) return parsedProf
        }
        return parsedAuth
      }
    } catch {
      // ignore
    }
    return null
  })

  const [perfilesLista, setPerfilesLista] = useState([])
  const [cargandoPerfil, setCargandoPerfil] = useState(false)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const sincronizarListaPerfiles = useCallback(async (esAdminFlag = false) => {
    try {
      const todos = await listarPerfilesSupabase(esAdminFlag)
      if (todos.length > 0) {
        setPerfilesLista(todos)
      }
      return todos
    } catch {
      return []
    }
  }, [])

  // Verificar sesión activa de Supabase Auth al cargar la app (respetando modo Offline)
  useEffect(() => {
    let cancelado = false

    const restaurarSesion = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!cancelado) setVerificandoSesion(false)
        return
      }

      try {
        const { data } = await supabase.auth.getSession()
        const sessionUser = data?.session?.user

        if (sessionUser) {
          const { data: perfilDb } = await supabase
            .from('perfiles')
            .select('*')
            .eq('id', sessionUser.id)
            .maybeSingle()

          if (perfilDb && perfilDb.activo === false) {
            await cerrarSesionSupabase()
            if (!cancelado) {
              setCuentaAutenticada(null)
              setUsuarioActual(null)
              localStorage.removeItem(STORAGE_AUTH_ACCOUNT_KEY)
            }
          } else if (perfilDb && !cancelado) {
            const perfilCompleto = {
              ...perfilDb,
              usuario_login:
                perfilDb.usuario_login || extraerUsuarioCortoDeAuth(sessionUser),
            }
            setCuentaAutenticada(perfilCompleto)
            localStorage.setItem(
              STORAGE_AUTH_ACCOUNT_KEY,
              JSON.stringify(perfilCompleto)
            )
            if (perfilCompleto.rol !== 'admin') {
              setRolActual(perfilCompleto.rol)
              setUsuarioActual(perfilCompleto)
              localStorage.setItem(STORAGE_ROLE_KEY, perfilCompleto.rol)
              localStorage.setItem(
                STORAGE_PROFILE_KEY,
                JSON.stringify(perfilCompleto)
              )
            } else {
              setUsuarioActual((prev) => prev || perfilCompleto)
            }
            await sincronizarListaPerfiles(perfilCompleto.rol === 'admin')
          }
        }
      } catch (err) {
        console.warn('No se pudo verificar sesión remota:', err)
      } finally {
        if (!cancelado) setVerificandoSesion(false)
      }
    }

    restaurarSesion()
    return () => {
      cancelado = true
    }
  }, [sincronizarListaPerfiles])

  const iniciarSesion = async (usuarioInput, passwordInput) => {
    setCargandoPerfil(true)
    try {
      const { perfil } = await iniciarSesionConCredenciales(
        usuarioInput,
        passwordInput
      )
      setCuentaAutenticada(perfil)
      setRolActual(perfil.rol)
      setUsuarioActual(perfil)

      localStorage.setItem(STORAGE_AUTH_ACCOUNT_KEY, JSON.stringify(perfil))
      localStorage.setItem(STORAGE_ROLE_KEY, perfil.rol)
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(perfil))

      await sincronizarListaPerfiles(perfil.rol === 'admin')
      return perfil
    } finally {
      setCargandoPerfil(false)
    }
  }

  const cerrarSesion = async () => {
    await cerrarSesionSupabase()
    setCuentaAutenticada(null)
    setUsuarioActual(null)
    setRolActual('admin')
    try {
      localStorage.removeItem(STORAGE_AUTH_ACCOUNT_KEY)
      localStorage.removeItem(STORAGE_ROLE_KEY)
      localStorage.removeItem(STORAGE_PROFILE_KEY)
    } catch {
      // ignore
    }
  }

  const esCuentaAdmin = cuentaAutenticada?.rol === 'admin'

  // Solo el Dueño/Admin autenticado puede alternar vista de rol para supervisión
  const cambiarRol = (nuevoRol, perfilEspecifico = null) => {
    if (!esCuentaAdmin) return
    if (!ROLES_INFO[nuevoRol]) return

    setRolActual(nuevoRol)
    localStorage.setItem(STORAGE_ROLE_KEY, nuevoRol)

    if (nuevoRol === 'admin' && !perfilEspecifico && cuentaAutenticada) {
      setUsuarioActual(cuentaAutenticada)
      localStorage.setItem(
        STORAGE_PROFILE_KEY,
        JSON.stringify(cuentaAutenticada)
      )
      return
    }

    const elegido =
      perfilEspecifico ||
      perfilesLista.find((p) => p.rol === nuevoRol && p.activo !== false)

    if (elegido) {
      setUsuarioActual(elegido)
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(elegido))
    } else {
      const info = ROLES_INFO[nuevoRol]
      const fallback = {
        id: cuentaAutenticada?.id || `local-${nuevoRol}`,
        nombre: info.defaultName,
        rol: nuevoRol,
        activo: true,
      }
      setUsuarioActual(fallback)
      localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(fallback))
    }
  }

  const registrarNuevoPersonal = async ({
    nombre,
    rol = 'preventista',
    usuarioLogin,
    password,
  }) => {
    const nuevo = await crearUsuarioConCredencialesSupabase({
      nombre,
      rol,
      usuarioLogin,
      password,
    })
    await sincronizarListaPerfiles(esCuentaAdmin)
    return nuevo
  }

  const rolEfectivo = esCuentaAdmin
    ? rolActual
    : cuentaAutenticada?.rol || 'preventista'
  const menuActivo = MENU_BY_ROLE[rolEfectivo] || MENU_BY_ROLE.preventista
  const infoRol = ROLES_INFO[rolEfectivo] || ROLES_INFO.preventista

  return (
    <RoleContext.Provider
      value={{
        autenticado: Boolean(cuentaAutenticada),
        verificandoSesion,
        cuentaAutenticada,
        esCuentaAdmin,
        rolActual: rolEfectivo,
        infoRol,
        usuarioActual: usuarioActual || cuentaAutenticada,
        menuActivo,
        perfilesLista,
        cargandoPerfil,
        isOnline,
        theme,
        setTheme,
        toggleTheme,
        iniciarSesion,
        cerrarSesion,
        cambiarRol,
        registrarNuevoPersonal,
        recargarPerfiles: () => sincronizarListaPerfiles(esCuentaAdmin),
      }}
    >
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const context = useContext(RoleContext)
  if (!context) {
    throw new Error('useRole debe usarse dentro de un RoleProvider')
  }
  return context
}
