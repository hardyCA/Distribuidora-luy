import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env?.VITE_SUPABASE_URL ||
  'https://hazikzqkxiucwegfwetg.supabase.co'

const supabaseAnonKey =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhemlrenFreGl1Y3dlZ2Z3ZXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNDE1NjcsImV4cCI6MjEwOTYxNzU2N30.O2uyjj1gAnUucvBoF6VxC9UFR-v2QpBozJ4bL2pOEjQ'

const supabaseServiceKey =
  import.meta.env?.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhemlrenFreGl1Y3dlZ2Z3ZXRnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDA0MTU2NywiZXhwIjoyMTA5NjE3NTY3fQ.tNWm5YAJYopIuYQy7hH0ZW-k_DfWFm_4msI8BIehRxg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export const SQL_MIGRACION_COSTOS = `-- Ejecutar en Supabase SQL Editor para columnas nativas de costos por compra y usuarios:
ALTER TABLE productos ADD COLUMN IF NOT EXISTS costo_paquete NUMERIC(12,2) DEFAULT 0;
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS costo_paquete NUMERIC(12,2);
ALTER TABLE movimientos_stock ADD COLUMN IF NOT EXISTS costo_total NUMERIC(12,2);
ALTER TABLE venta_detalles ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12,4);
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS usuario_login TEXT;`

const COSTOS_STORAGE_PATH = 'config/costos_productos.json'
const COSTOS_LOCAL_KEY = 'bevflow_costos_productos_v1'

/**
 * Convierte un nombre o usuario en un identificador limpio (ej. "Marco Rojas" -> "marco.rojas")
 */
export function limpiarIdentificadorUsuario(valor = '') {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._@-]/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '')
}

/**
 * Extrae el nombre de usuario corto legible a partir de un objeto auth user
 */
export function extraerUsuarioCortoDeAuth(authUser) {
  if (!authUser) return ''
  if (authUser.user_metadata?.usuario_login) {
    return authUser.user_metadata.usuario_login
  }
  const email = String(authUser.email || '')
  if (email.endsWith('@distribuidora.local') || email.endsWith('@bevflow.local')) {
    return email.split('@')[0]
  }
  return email
}

/**
 * Asegura que exista al menos el usuario administrador inicial para que el dueño siempre pueda entrar.
 */
export async function asegurarAdminInicialSupabase() {
  try {
    const { data: existentes } = await supabase
      .from('perfiles')
      .select('*')
      .eq('rol', 'admin')
      .limit(1)

    if (existentes && existentes.length > 0) {
      return existentes[0]
    }
    const { perfil } = await obtenerOCrearPerfilPorRol('admin', 'Carlos Mendoza (Dueño)')
    return perfil
  } catch {
    return null
  }
}

/**
 * Inicia sesión con usuario corto (ej. "admin", "marco") o correo electrónico + contraseña.
 */
export async function iniciarSesionConCredenciales(usuarioInput, passwordInput) {
  const limpio = limpiarIdentificadorUsuario(usuarioInput)
  const password = String(passwordInput || '')

  if (!limpio || !password) {
    throw new Error('Ingresa tu usuario y contraseña.')
  }

  await asegurarAdminInicialSupabase()

  // Resolver el email real asociado al usuario corto o correo
  let emailCandidato = limpio.includes('@')
    ? limpio
    : `${limpio}@distribuidora.local`

  try {
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 500,
    })
    const usuariosAuth = listData?.users || []

    const coincidenciaExacta = usuariosAuth.find((u) => {
      const emailU = String(u.email || '').toLowerCase()
      const loginMeta = String(u.user_metadata?.usuario_login || '').toLowerCase()
      const prefijoEmail = emailU.split('@')[0]
      return (
        emailU === limpio ||
        loginMeta === limpio ||
        prefijoEmail === limpio
      )
    })

    if (coincidenciaExacta?.email) {
      emailCandidato = coincidenciaExacta.email
    }
  } catch {
    // Si falla listUsers, probamos directamente con emailCandidato
  }

  const { data: signInData, error: signInErr } =
    await supabase.auth.signInWithPassword({
      email: emailCandidato,
      password,
    })

  if (signInErr || !signInData?.user) {
    throw new Error('Usuario o contraseña incorrectos.')
  }

  const authUser = signInData.user

  // Buscar o sincronizar su fila en `perfiles`
  let { data: perfil } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle()

  if (!perfil) {
    const rolMeta = authUser.user_metadata?.rol || 'preventista'
    const nombreMeta =
      authUser.user_metadata?.nombre || extraerUsuarioCortoDeAuth(authUser)
    const { data: creado } = await supabaseAdmin
      .from('perfiles')
      .upsert(
        {
          id: authUser.id,
          nombre: nombreMeta,
          rol: rolMeta,
          activo: true,
        },
        { onConflict: 'id' }
      )
      .select()
      .single()
    perfil = creado
  }

  if (perfil && perfil.activo === false) {
    await supabase.auth.signOut()
    throw new Error('Tu cuenta está desactivada. Consulta con el administrador.')
  }

  return {
    user: authUser,
    perfil: {
      ...perfil,
      usuario_login:
        perfil?.usuario_login || extraerUsuarioCortoDeAuth(authUser),
    },
  }
}

export async function cerrarSesionSupabase() {
  try {
    await supabase.auth.signOut()
  } catch {
    // ignore
  }
}

/**
 * Carga o crea automáticamente un usuario base en la tabla `perfiles` de Supabase
 * para el rol especificado (resuelve automáticamente la FK con auth.users si aplica).
 */
export async function obtenerOCrearPerfilPorRol(rol, nombrePorDefecto) {
  try {
    const { data: existentes, error: selectErr } = await supabase
      .from('perfiles')
      .select('*')
      .eq('rol', rol)
      .order('creado_en', { ascending: true })
      .limit(1)

    if (!selectErr && existentes && existentes.length > 0) {
      return { perfil: existentes[0], origen: 'supabase' }
    }

    const emailBase = `${rol}@distribuidora.local`
    let userId = crypto.randomUUID()

    const { data: createdAuth, error: authErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: emailBase,
        password: 'Distribuidora2025!',
        email_confirm: true,
        user_metadata: {
          nombre: nombrePorDefecto,
          rol,
          usuario_login: rol,
          clave_referencia: 'Distribuidora2025!',
        },
      })

    if (!authErr && createdAuth?.user?.id) {
      userId = createdAuth.user.id
    } else {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
      const found = listData?.users?.find((u) => u.email === emailBase)
      if (found?.id) {
        userId = found.id
      }
    }

    const { data: upserted, error: upsertErr } = await supabaseAdmin
      .from('perfiles')
      .upsert(
        {
          id: userId,
          nombre: nombrePorDefecto,
          rol: rol,
          activo: true,
        },
        { onConflict: 'id' }
      )
      .select()
      .single()

    if (!upsertErr && upserted) {
      return { perfil: upserted, origen: 'supabase' }
    }
  } catch (err) {
    console.warn('Modo offline o sin conexión a Supabase para perfiles:', err)
  }

  return {
    perfil: {
      id: `local-${rol}`,
      nombre: nombrePorDefecto,
      rol,
      activo: true,
    },
    origen: 'local',
  }
}

/**
 * Lista todos los perfiles registrados en Supabase enriquecidos con su usuario de acceso y clave de referencia
 */
export async function listarPerfilesSupabase(incluirCredencialesAdmin = false) {
  try {
    const { data: perfiles, error } = await supabase
      .from('perfiles')
      .select('*')
      .order('creado_en', { ascending: true })
    if (error) throw error

    const listaBase = perfiles || []
    if (!incluirCredencialesAdmin) return listaBase

    try {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 500,
      })
      const mapaAuth = {}
      ;(listData?.users || []).forEach((u) => {
        mapaAuth[u.id] = u
      })

      return listaBase.map((p) => {
        const uAuth = mapaAuth[p.id]
        const usuarioCorto =
          p.usuario_login || extraerUsuarioCortoDeAuth(uAuth) || ''
        const claveRef =
          uAuth?.user_metadata?.clave_referencia ||
          (uAuth?.email?.endsWith('@distribuidora.local') &&
          !uAuth?.user_metadata?.clave_cambiada
            ? 'Distribuidora2025!'
            : '')
        return {
          ...p,
          usuario_login: usuarioCorto,
          email_auth: uAuth?.email || '',
          clave_referencia: claveRef,
        }
      })
    } catch {
      return listaBase
    }
  } catch {
    return []
  }
}

/**
 * Crea un nuevo Preventista / Usuario con su propio usuario y contraseña de acceso
 */
export async function crearUsuarioConCredencialesSupabase({
  nombre,
  rol = 'preventista',
  usuarioLogin,
  password,
}) {
  const nombreLimpio = String(nombre || '').trim()
  if (!nombreLimpio) {
    throw new Error('El nombre del preventista o personal es obligatorio.')
  }

  const loginBase = limpiarIdentificadorUsuario(usuarioLogin || nombreLimpio)
  if (!loginBase) {
    throw new Error('Ingresa un usuario válido (ej. marco o luis.torrez).')
  }

  const clave = String(password || '').trim()
  if (clave.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.')
  }

  const email = loginBase.includes('@')
    ? loginBase
    : `${loginBase}@distribuidora.local`
  const usuarioCorto = loginBase.includes('@')
    ? loginBase.split('@')[0]
    : loginBase

  // Verificar que el usuario no esté ocupado
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  })
  const duplicado = (listData?.users || []).find((u) => {
    const emailU = String(u.email || '').toLowerCase()
    const metaLogin = String(u.user_metadata?.usuario_login || '').toLowerCase()
    return (
      emailU === email.toLowerCase() ||
      metaLogin === usuarioCorto.toLowerCase() ||
      emailU.split('@')[0] === usuarioCorto.toLowerCase()
    )
  })

  if (duplicado) {
    throw new Error(
      `El usuario "${usuarioCorto}" ya está en uso. Elige otro (ej. ${usuarioCorto}2).`
    )
  }

  const { data: createdAuth, error: authErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password: clave,
      email_confirm: true,
      user_metadata: {
        nombre: nombreLimpio,
        rol,
        usuario_login: usuarioCorto,
        clave_referencia: clave,
        clave_cambiada: true,
      },
    })

  if (authErr) throw authErr

  const userId = createdAuth.user.id

  // Intentar guardar usuario_login en perfiles si la columna existe; si no, guardar campos estándar
  let perfilGuardado = null
  const { data: pConLogin, error: errConLogin } = await supabaseAdmin
    .from('perfiles')
    .upsert(
      {
        id: userId,
        nombre: nombreLimpio,
        rol,
        activo: true,
        usuario_login: usuarioCorto,
      },
      { onConflict: 'id' }
    )
    .select()
    .single()

  if (!errConLogin && pConLogin) {
    perfilGuardado = pConLogin
  } else {
    const { data: pSimple, error: errSimple } = await supabaseAdmin
      .from('perfiles')
      .upsert(
        {
          id: userId,
          nombre: nombreLimpio,
          rol,
          activo: true,
        },
        { onConflict: 'id' }
      )
      .select()
      .single()
    if (errSimple) throw errSimple
    perfilGuardado = pSimple
  }

  return {
    ...perfilGuardado,
    usuario_login: usuarioCorto,
    clave_referencia: clave,
  }
}

/**
 * Actualiza datos, usuario de acceso o contraseña de un miembro del personal
 */
export async function actualizarCredencialesPersonalSupabase({
  id,
  nombre,
  rol,
  activo = true,
  usuarioLogin,
  nuevaPassword,
}) {
  const nombreLimpio = String(nombre || '').trim()
  if (!id || !nombreLimpio) {
    throw new Error('Datos de usuario incompletos.')
  }

  // Obtener metadata previa de auth.users
  const { data: userResp } = await supabaseAdmin.auth.admin.getUserById(id)
  const prevAuth = userResp?.user
  const prevMeta = prevAuth?.user_metadata || {}

  const updateAuthPayload = {
    user_metadata: {
      ...prevMeta,
      nombre: nombreLimpio,
      rol,
    },
  }

  let usuarioCortoFinal =
    prevMeta.usuario_login || extraerUsuarioCortoDeAuth(prevAuth)

  if (usuarioLogin && limpiarIdentificadorUsuario(usuarioLogin)) {
    const limpio = limpiarIdentificadorUsuario(usuarioLogin)
    const nuevoCorto = limpio.includes('@') ? limpio.split('@')[0] : limpio
    const nuevoEmail = limpio.includes('@')
      ? limpio
      : `${limpio}@distribuidora.local`

    if (nuevoCorto !== usuarioCortoFinal) {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 500,
      })
      const ocupado = (listData?.users || []).find(
        (u) =>
          u.id !== id &&
          (String(u.email || '').toLowerCase() === nuevoEmail.toLowerCase() ||
            String(u.user_metadata?.usuario_login || '').toLowerCase() ===
              nuevoCorto.toLowerCase())
      )
      if (ocupado) {
        throw new Error(`El usuario "${nuevoCorto}" ya pertenece a otra cuenta.`)
      }
      updateAuthPayload.email = nuevoEmail
      updateAuthPayload.email_confirm = true
      updateAuthPayload.user_metadata.usuario_login = nuevoCorto
      usuarioCortoFinal = nuevoCorto
    }
  }

  if (nuevaPassword && String(nuevaPassword).trim().length > 0) {
    const clave = String(nuevaPassword).trim()
    if (clave.length < 6) {
      throw new Error('La nueva contraseña debe tener al menos 6 caracteres.')
    }
    updateAuthPayload.password = clave
    updateAuthPayload.user_metadata.clave_referencia = clave
    updateAuthPayload.user_metadata.clave_cambiada = true
  }

  if (prevAuth) {
    const { error: authUpdErr } =
      await supabaseAdmin.auth.admin.updateUserById(id, updateAuthPayload)
    if (authUpdErr) throw authUpdErr
  }

  // Actualizar tabla `perfiles`
  const { error: errConLogin } = await supabaseAdmin
    .from('perfiles')
    .update({
      nombre: nombreLimpio,
      rol,
      activo: Boolean(activo),
      usuario_login: usuarioCortoFinal,
    })
    .eq('id', id)

  if (errConLogin) {
    const { error: errBase } = await supabaseAdmin
      .from('perfiles')
      .update({
        nombre: nombreLimpio,
        rol,
        activo: Boolean(activo),
      })
      .eq('id', id)
    if (errBase) throw errBase
  }

  return true
}

/**
 * Compatibilidad con creación rápida
 */
export async function crearPerfilPersonalSupabase(
  nombre,
  rol,
  usuarioLogin = '',
  password = ''
) {
  const sugerido =
    limpiarIdentificadorUsuario(usuarioLogin || nombre) ||
    `${rol}.${Date.now().toString().slice(-4)}`
  const claveFinal =
    password && String(password).trim().length >= 6
      ? String(password).trim()
      : '123456'
  return crearUsuarioConCredencialesSupabase({
    nombre,
    rol,
    usuarioLogin: sugerido,
    password: claveFinal,
  })
}

/**
 * ================= RESPALDO EN NUBE DE COSTOS DE PRODUCTOS =================
 * Si la tabla `productos` ya tiene la columna `costo_paquete`, se usa directamente.
 * Mientras tanto, sincroniza de forma transparente en Supabase Storage (`productos/config/costos_productos.json`)
 * para que los costos y reportes de ganancias funcionen al 100% sin fallar jamás.
 */
function leerCostosLocal() {
  try {
    const raw = localStorage.getItem(COSTOS_LOCAL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function escribirCostosLocal(mapa) {
  try {
    localStorage.setItem(COSTOS_LOCAL_KEY, JSON.stringify(mapa || {}))
  } catch {
    // ignore
  }
}

// Caché en memoria (5 min) + deduplicación de peticiones concurrentes
let _cacheCostosMemoria = null
let _cacheCostosTimestamp = 0
let _promesaCostosEnCurso = null
const CACHE_COSTOS_TTL_MS = 5 * 60 * 1000

export async function obtenerMapaCostosRespaldo(forzarRecarga = false) {
  const ahora = Date.now()
  if (
    !forzarRecarga &&
    _cacheCostosMemoria &&
    ahora - _cacheCostosTimestamp < CACHE_COSTOS_TTL_MS
  ) {
    return _cacheCostosMemoria
  }

  if (!forzarRecarga && _promesaCostosEnCurso) {
    return _promesaCostosEnCurso
  }

  _promesaCostosEnCurso = (async () => {
    const local = leerCostosLocal()
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      _cacheCostosMemoria = local
      _cacheCostosTimestamp = Date.now()
      return local
    }

    try {
      // 1) Verificar primero con .list() (siempre responde 200 OK y evita el 400 Bad Request en consola cuando aún no hay compras)
      const { data: listaArchivos, error: errList } = await supabaseAdmin.storage
        .from('productos')
        .list('config', { limit: 10, search: 'costos_productos.json' })

      const existeArchivo =
        !errList &&
        Array.isArray(listaArchivos) &&
        listaArchivos.some((f) => f.name === 'costos_productos.json')

      if (existeArchivo) {
        const { data, error } = await supabaseAdmin.storage
          .from('productos')
          .download(COSTOS_STORAGE_PATH)
        if (!error && data) {
          const txt = await data.text()
          const remoto = JSON.parse(txt || '{}')
          const combinado = { ...local, ...remoto }
          escribirCostosLocal(combinado)
          _cacheCostosMemoria = combinado
          _cacheCostosTimestamp = Date.now()
          return combinado
        }
      }
    } catch {
      // ignore offline / bucket vacío
    }

    _cacheCostosMemoria = local
    _cacheCostosTimestamp = Date.now()
    return local
  })()

  try {
    return await _promesaCostosEnCurso
  } finally {
    _promesaCostosEnCurso = null
  }
}

export async function guardarCostoProductoRespaldo(
  productoId,
  costoPaquete,
  movimientoExtra = null
) {
  const actual = await obtenerMapaCostosRespaldo()
  const nuevoMapa = { ...actual }

  if (productoId) {
    nuevoMapa[productoId] = Math.max(0, Number(costoPaquete) || 0)
  }

  if (movimientoExtra?.movimientoId) {
    nuevoMapa._movimientos = {
      ...(actual._movimientos || {}),
      [movimientoExtra.movimientoId]: {
        costo_paquete: Number(movimientoExtra.costo_paquete) || 0,
        costo_total: Number(movimientoExtra.costo_total) || 0,
      },
    }
  }

  escribirCostosLocal(nuevoMapa)
  _cacheCostosMemoria = nuevoMapa
  _cacheCostosTimestamp = Date.now()

  try {
    const blob = new Blob([JSON.stringify(nuevoMapa)], {
      type: 'application/json',
    })
    await supabaseAdmin.storage
      .from('productos')
      .upload(COSTOS_STORAGE_PATH, blob, {
        contentType: 'application/json',
        upsert: true,
      })
  } catch {
    // ignore offline
  }
}

/**
 * Registra el costo de una compra de mercadería (`compra_almacen`) y actualiza el Costo Promedio Ponderado
 * del producto tanto en las tablas nativas como en el respaldo sincronizado.
 */
export async function registrarCostoCompraAlmacen({
  productoId,
  stockPrevioUnidades = 0,
  costoPaquetePrevio = 0,
  unidadesPorPaquete = 6,
  botellasCompradas = 0,
  costoPaqueteCompra = 0,
  costoTotalCompra = 0,
}) {
  const unidPaq = Math.max(1, Number(unidadesPorPaquete) || 6)
  const stockPrevio = Math.max(0, Number(stockPrevioUnidades) || 0)
  const botNuevas = Math.max(0, Number(botellasCompradas) || 0)
  const cPaqCompra = Math.max(0, Number(costoPaqueteCompra) || 0)
  const cTotalCompra =
    Number(costoTotalCompra) > 0
      ? Number(costoTotalCompra)
      : botNuevas * (cPaqCompra / unidPaq)

  // Costo Promedio Ponderado: combina el inventario existente con la nueva compra
  const costoUnitPrevio = (Number(costoPaquetePrevio) || 0) / unidPaq
  let nuevoCostoUnitario = cPaqCompra / unidPaq

  if (stockPrevio > 0 && costoUnitPrevio > 0 && botNuevas > 0) {
    nuevoCostoUnitario =
      (stockPrevio * costoUnitPrevio + cTotalCompra) / (stockPrevio + botNuevas)
  } else if (botNuevas > 0 && cTotalCompra > 0) {
    nuevoCostoUnitario = cTotalCompra / botNuevas
  }

  const nuevoCostoPaquete = Number((nuevoCostoUnitario * unidPaq).toFixed(2))

  // 1. Buscar el movimiento recién insertado por el RPC `registrar_movimiento_almacen`
  let ultimoMovId = null
  try {
    const { data: ultMov } = await supabase
      .from('movimientos_stock')
      .select('id')
      .eq('producto_id', productoId)
      .eq('tipo', 'compra_almacen')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ultMov?.id) {
      ultimoMovId = ultMov.id
      // Intentar guardar en columnas nativas de movimientos_stock si existen
      await supabaseAdmin
        .from('movimientos_stock')
        .update({
          costo_paquete: Number(cPaqCompra.toFixed(2)),
          costo_total: Number(cTotalCompra.toFixed(2)),
        })
        .eq('id', ultimoMovId)
    }
  } catch {
    // ignore si las columnas aún no existen
  }

  // 2. Intentar actualizar costo_paquete nativo en `productos`
  try {
    await supabaseAdmin
      .from('productos')
      .update({ costo_paquete: nuevoCostoPaquete })
      .eq('id', productoId)
  } catch {
    // ignore si aún no existe la columna
  }

  // 3. Guardar siempre en el respaldo en nube
  await guardarCostoProductoRespaldo(
    productoId,
    nuevoCostoPaquete,
    ultimoMovId
      ? {
          movimientoId: ultimoMovId,
          costo_paquete: Number(cPaqCompra.toFixed(2)),
          costo_total: Number(cTotalCompra.toFixed(2)),
        }
      : null
  )

  return {
    nuevoCostoPaquete,
    costoTotalCompra: Number(cTotalCompra.toFixed(2)),
  }
}

export async function enriquecerMovimientosConCosto(listaMovimientos = []) {
  if (!Array.isArray(listaMovimientos) || listaMovimientos.length === 0) {
    return []
  }
  const mapaRespaldo = await obtenerMapaCostosRespaldo()
  const mapaMovs = mapaRespaldo._movimientos || {}

  return listaMovimientos.map((m) => {
    const resp = mapaMovs[m.id]
    const cPaq =
      Number(m.costo_paquete) > 0
        ? Number(m.costo_paquete)
        : Number(resp?.costo_paquete) || 0
    const cTot =
      Number(m.costo_total) > 0
        ? Number(m.costo_total)
        : Number(resp?.costo_total) || 0
    return {
      ...m,
      costo_paquete: cPaq,
      costo_total: cTot,
    }
  })
}

export async function enriquecerProductosConCosto(listaProductos = []) {
  if (!Array.isArray(listaProductos) || listaProductos.length === 0) {
    return []
  }
  const mapaRespaldo = await obtenerMapaCostosRespaldo()
  return listaProductos.map((p) => {
    const tieneColumnaNativa =
      p.costo_paquete !== undefined && p.costo_paquete !== null
    const costoNativo = Number(p.costo_paquete) || 0
    const costoRespaldo = Number(mapaRespaldo[p.id]) || 0
    const costoFinal =
      tieneColumnaNativa && costoNativo > 0 ? costoNativo : costoRespaldo
    return {
      ...p,
      costo_paquete: costoFinal,
    }
  })
}

/**
 * Comprime y redimensiona automáticamente cualquier foto de producto a WebP ligero (~25-45 KB)
 * preservando transparencia (canal alfa) para cuidar al máximo los 5 GB de Egress del Plan Gratuito.
 */
async function comprimirImagenLigeraWebP(
  fileOrBlob,
  maxAncho = 560,
  maxAlto = 680,
  calidad = 0.82
) {
  if (typeof document === 'undefined' || !fileOrBlob) return fileOrBlob

  return new Promise((resolve) => {
    const urlTemporal = URL.createObjectURL(fileOrBlob)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(urlTemporal)
      try {
        let ancho = img.naturalWidth || img.width
        let alto = img.naturalHeight || img.height

        if (ancho > maxAncho || alto > maxAlto) {
          const ratio = Math.min(maxAncho / ancho, maxAlto / alto)
          ancho = Math.max(1, Math.round(ancho * ratio))
          alto = Math.max(1, Math.round(alto * ratio))
        }

        const canvas = document.createElement('canvas')
        canvas.width = ancho
        canvas.height = alto
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, ancho, alto)
        ctx.drawImage(img, 0, 0, ancho, alto)

        canvas.toBlob(
          (webpBlob) => {
            if (webpBlob && webpBlob.size > 0) {
              // Usar el WebP si pesa menos que el original (casi siempre 90-97% más liviano)
              if (webpBlob.size < fileOrBlob.size || fileOrBlob.size > 80000) {
                resolve(webpBlob)
                return
              }
            }
            resolve(fileOrBlob)
          },
          'image/webp',
          calidad
        )
      } catch {
        resolve(fileOrBlob)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(urlTemporal)
      resolve(fileOrBlob)
    }

    img.src = urlTemporal
  })
}

/**
 * Sube la imagen de un producto al bucket público `productos` optimizada en WebP
 * y con caché HTTP de 1 año (`31536000` seg) para no consumir Egress repetido en celulares.
 */
export async function subirImagenProductoSupabase(
  fileOrBlob,
  nombreBase = 'botella'
) {
  const archivoOptimizado = await comprimirImagenLigeraWebP(fileOrBlob)

  const ext =
    archivoOptimizado.type === 'image/webp'
      ? 'webp'
      : archivoOptimizado.type === 'image/jpeg'
      ? 'jpg'
      : 'png'

  const slug = String(nombreBase || 'producto')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const filePath = `catalogo/${slug || 'bebida'}-${Date.now()}.${ext}`
  const opcionesUpload = {
    contentType: archivoOptimizado.type || 'image/webp',
    cacheControl: '31536000',
    upsert: true,
  }

  let uploadError = null
  const { error: anonErr } = await supabase.storage
    .from('productos')
    .upload(filePath, archivoOptimizado, opcionesUpload)

  if (anonErr) {
    const { error: adminErr } = await supabaseAdmin.storage
      .from('productos')
      .upload(filePath, archivoOptimizado, opcionesUpload)
    uploadError = adminErr
  }

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('productos').getPublicUrl(filePath)
  return data.publicUrl
}

/**
 * Consulta ventas entregadas filtrando directamente en PostgreSQL por rango de fechas
 * y paginando en bloques de 500 (`.range()`) para:
 *  1) Ahorrar ~90% de Egress al consultar Día o Mes.
 *  2) Superar sin recortes el límite de 1,000 filas de Supabase al consultar todo un Año.
 */
export async function consultarVentasEntregadasPorPeriodo({
  desdeIso,
  hastaIso,
  vendedorId = 'TODOS',
} = {}) {
  const BLOQUE = 500
  let offset = 0
  const acumulado = []

  // Margen de 10 días hacia atrás sobre `fecha_pedido` por si una preventa se pidió a fin de mes
  // y se entregó los primeros días del mes siguiente (`fecha_entrega`).
  let desdePedidoIso = null
  if (desdeIso) {
    const d = new Date(`${desdeIso}T00:00:00`)
    d.setDate(d.getDate() - 10)
    desdePedidoIso = d.toISOString()
  }
  const hastaPedidoIso = hastaIso
    ? new Date(`${hastaIso}T23:59:59.999`).toISOString()
    : null

  while (true) {
    let query = supabase
      .from('ventas')
      .select(
        `
        id,
        codigo_local,
        cliente_id,
        vendedor_id,
        tipo,
        estado,
        total,
        monto_efectivo,
        monto_qr,
        saldo_credito,
        fecha_pedido,
        fecha_entrega,
        clientes (id, nombre),
        perfiles:vendedor_id (id, nombre, rol),
        venta_detalles (
          id,
          producto_id,
          tipo_venta,
          cantidad,
          unidades_totales_descontar,
          precio_aplicado,
          costo_unitario,
          subtotal
        )
      `
      )
      .eq('estado', 'entregado')
      .order('fecha_pedido', { ascending: false })
      .range(offset, offset + BLOQUE - 1)

    if (desdePedidoIso) {
      query = query.gte('fecha_pedido', desdePedidoIso)
    }
    if (hastaPedidoIso) {
      query = query.lte('fecha_pedido', hastaPedidoIso)
    }
    if (vendedorId && vendedorId !== 'TODOS') {
      query = query.eq('vendedor_id', vendedorId)
    }

    const { data, error } = await query
    if (error) {
      // Si la columna `costo_unitario` aún no fue creada en `venta_detalles`, reintentar sin ella
      if (String(error.message || '').includes('costo_unitario')) {
        let fallbackQuery = supabase
          .from('ventas')
          .select(
            `
            id,
            codigo_local,
            cliente_id,
            vendedor_id,
            tipo,
            estado,
            total,
            monto_efectivo,
            monto_qr,
            saldo_credito,
            fecha_pedido,
            fecha_entrega,
            clientes (id, nombre),
            perfiles:vendedor_id (id, nombre, rol),
            venta_detalles (
              id,
              producto_id,
              tipo_venta,
              cantidad,
              unidades_totales_descontar,
              precio_aplicado,
              subtotal
            )
          `
          )
          .eq('estado', 'entregado')
          .order('fecha_pedido', { ascending: false })
          .range(offset, offset + BLOQUE - 1)

        if (desdePedidoIso) fallbackQuery = fallbackQuery.gte('fecha_pedido', desdePedidoIso)
        if (hastaPedidoIso) fallbackQuery = fallbackQuery.lte('fecha_pedido', hastaPedidoIso)
        if (vendedorId && vendedorId !== 'TODOS') {
          fallbackQuery = fallbackQuery.eq('vendedor_id', vendedorId)
        }

        const resFb = await fallbackQuery
        if (resFb.error) throw resFb.error
        const loteFb = resFb.data || []
        acumulado.push(...loteFb)
        if (loteFb.length < BLOQUE) break
        offset += BLOQUE
        continue
      }
      throw error
    }

    const lote = data || []
    acumulado.push(...lote)
    if (lote.length < BLOQUE) break
    offset += BLOQUE
  }

  return enriquecerVentasConCustodiaRuta(acumulado, true)
}

/**
 * ============================================================================
 * CADENA DE CUSTODIA DE PREVENTA EN 4 ETAPAS + RENDICIÓN DE DINERO AL DUEÑO
 * ============================================================================
 *  1. `pendiente_alistar`     -> Preventista creó el pedido (Pendiente en Tienda)
 *  2. `entregado_preventista` -> Encargado de Tienda entregó la carga al Preventista (Stock descontado)
 *  3. `cobrado_preventista`   -> Preventista entregó al Cliente y cobró (Dinero en manos del Preventista)
 *  4. `rendido_dueno`         -> Preventista entregó el dinero al Dueño / Liquidado final
 *
 * Sincroniza entre dispositivos vía Supabase Storage (`productos/config/custodia_preventas.json`)
 * usando `.list()` previo para cero errores `400 Bad Request`, caché con deduplicación
 * y limpieza automática (>90 días) para mantenerse siempre dentro del Plan Gratuito.
 */
const CUSTODIA_STORAGE_PATH = 'config/custodia_preventas.json'
const CUSTODIA_LOCAL_KEY = 'distribuidora_custodia_preventas_v1'

let _cacheCustodiaMemoria = null
let _cacheCustodiaTimestamp = 0
let _promesaCustodiaEnCurso = null
const CACHE_CUSTODIA_TTL_MS = 20 * 1000

function leerCustodiaLocal() {
  try {
    const raw = localStorage.getItem(CUSTODIA_LOCAL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function escribirCustodiaLocal(mapa) {
  try {
    localStorage.setItem(CUSTODIA_LOCAL_KEY, JSON.stringify(mapa || {}))
  } catch {
    // ignore storage quota
  }
}

function podarCustodiaAntigua(mapa = {}) {
  const hace90DiasMs = Date.now() - 90 * 24 * 60 * 60 * 1000
  const limpio = {}
  Object.entries(mapa || {}).forEach(([ventaId, info]) => {
    if (!info || typeof info !== 'object') return
    if (info.etapa_ruta === 'rendido_dueno') {
      const refIso =
        info.fecha_rendicion || info.fecha_cobro || info.fecha_despacho
      const ts = refIso ? new Date(refIso).getTime() : Date.now()
      if (!Number.isNaN(ts) && ts < hace90DiasMs) {
        return
      }
    }
    limpio[ventaId] = info
  })
  return limpio
}

export async function obtenerMapaCustodiaRespaldo(forzarRecarga = false) {
  const ahora = Date.now()
  if (
    !forzarRecarga &&
    _cacheCustodiaMemoria &&
    ahora - _cacheCustodiaTimestamp < CACHE_CUSTODIA_TTL_MS
  ) {
    return _cacheCustodiaMemoria
  }

  if (!forzarRecarga && _promesaCustodiaEnCurso) {
    return _promesaCustodiaEnCurso
  }

  _promesaCustodiaEnCurso = (async () => {
    const local = leerCustodiaLocal()
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      _cacheCustodiaMemoria = local
      _cacheCustodiaTimestamp = Date.now()
      return local
    }

    try {
      // Verificar primero con .list() (200 OK siempre) para evitar cualquier 400 en consola si aún no existe
      const { data: listaArchivos, error: errList } = await supabaseAdmin.storage
        .from('productos')
        .list('config', { limit: 15, search: 'custodia_preventas.json' })

      const existeArchivo =
        !errList &&
        Array.isArray(listaArchivos) &&
        listaArchivos.some((f) => f.name === 'custodia_preventas.json')

      if (existeArchivo) {
        const { data, error } = await supabaseAdmin.storage
          .from('productos')
          .download(CUSTODIA_STORAGE_PATH)
        if (!error && data) {
          const txt = await data.text()
          const remoto = JSON.parse(txt || '{}')
          const combinado = podarCustodiaAntigua({ ...local, ...remoto })
          escribirCustodiaLocal(combinado)
          _cacheCustodiaMemoria = combinado
          _cacheCustodiaTimestamp = Date.now()
          return combinado
        }
      }
    } catch {
      // ignore offline / bucket vacío
    }

    _cacheCustodiaMemoria = local
    _cacheCustodiaTimestamp = Date.now()
    return local
  })()

  try {
    return await _promesaCustodiaEnCurso
  } finally {
    _promesaCustodiaEnCurso = null
  }
}

async function guardarMapaCustodiaRespaldo(nuevoMapa) {
  const limpio = podarCustodiaAntigua(nuevoMapa)
  escribirCustodiaLocal(limpio)
  _cacheCustodiaMemoria = limpio
  _cacheCustodiaTimestamp = Date.now()

  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const blob = new Blob([JSON.stringify(limpio)], {
        type: 'application/json',
      })
      await supabaseAdmin.storage
        .from('productos')
        .upload(CUSTODIA_STORAGE_PATH, blob, {
          upsert: true,
          contentType: 'application/json',
          cacheControl: '0',
        })
    } catch {
      // Si falla red temporalmente, queda respaldado en localStorage
    }
  }

  return limpio
}

/**
 * Determina la etapa exacta de custodia para cualquier venta/preventa.
 * Las preventas antiguas ya entregadas sin registro en `custodia_preventas.json`
 * se consideran automáticamente `rendido_dueno` (100% retrocompatible).
 */
export function resolverEtapaCustodiaVenta(venta, mapaCustodia = {}) {
  if (!venta) return 'pendiente_alistar'
  if (venta.tipo === 'cotizacion' || venta.estado === 'cotizacion') {
    return 'cotizacion'
  }
  if (venta.estado === 'pendiente_entrega') {
    return 'pendiente_alistar'
  }
  if (venta.tipo === 'venta_directa') {
    return 'rendido_dueno'
  }
  const info = mapaCustodia?.[venta.id]
  if (info?.etapa_ruta) {
    return info.etapa_ruta
  }
  return 'rendido_dueno'
}

export async function enriquecerVentasConCustodiaRuta(
  listaVentas = [],
  forzarRecarga = false
) {
  if (!Array.isArray(listaVentas) || listaVentas.length === 0) return []
  const mapa = await obtenerMapaCustodiaRespaldo(forzarRecarga)

  return listaVentas.map((v) => {
    const info = mapa?.[v.id] || null
    const etapa = resolverEtapaCustodiaVenta(v, mapa)
    return {
      ...v,
      etapa_ruta: etapa,
      info_custodia: info,
    }
  })
}

/**
 * Devuelve los IDs de preventas que están activas en tránsito:
 *  - `entregado_preventista` (en camión del preventista por entregar/cobrar)
 *  - `cobrado_preventista` (cobradas al cliente, pendientes de entregar el dinero al Dueño)
 */
export async function obtenerIdsPreventasEnCustodiaActiva(
  forzarRecarga = false
) {
  const mapa = await obtenerMapaCustodiaRespaldo(forzarRecarga)
  const enCamionIds = []
  const porRendirIds = []

  Object.entries(mapa || {}).forEach(([ventaId, info]) => {
    if (info?.etapa_ruta === 'entregado_preventista') {
      enCamionIds.push(ventaId)
    } else if (info?.etapa_ruta === 'cobrado_preventista') {
      porRendirIds.push(ventaId)
    }
  })

  return {
    mapa,
    enCamionIds,
    porRendirIds,
    todosActivosIds: [...enCamionIds, ...porRendirIds],
  }
}

/**
 * PASO 2 DEL FLUJO:
 * El Encargado de Tienda Central (o Admin) entrega físicamente el/los pedidos al Preventista.
 * - Descuenta atómicamente el stock de Tienda Central (`confirmar_entrega_y_descontar_stock` con montos en 0).
 * - Registra la custodia en `entregado_preventista` con fecha/hora y nombre del encargado.
 */
export async function despacharPedidosAPreventista({
  pedidos = [],
  usuarioDespachador = null,
}) {
  const pendientesReales = (pedidos || []).filter(
    (p) => p && p.id && p.estado === 'pendiente_entrega'
  )
  if (pendientesReales.length === 0) {
    throw new Error('No hay pedidos pendientes para entregar al preventista.')
  }

  const mapaActual = await obtenerMapaCustodiaRespaldo(true)
  const nuevoMapa = { ...mapaActual }
  const despachadosIds = []
  let errorDetenido = null

  const despachadorNombre =
    usuarioDespachador?.nombre || 'Encargado Tienda Central'
  const despachadorId = usuarioDespachador?.id || null

  for (const ped of pendientesReales) {
    const { error } = await supabase.rpc('confirmar_entrega_y_descontar_stock', {
      p_venta_id: ped.id,
      p_monto_efectivo: 0,
      p_monto_qr: 0,
      p_saldo_credito: 0,
    })

    if (error) {
      const clienteNom = ped.clientes?.nombre || ped.codigo_local || 'Pedido'
      errorDetenido = new Error(
        `No se pudo despachar "${clienteNom}": ${
          error.message ||
          'Stock insuficiente en Tienda Central. Traspasa primero desde Depósito.'
        }`
      )
      break
    }

    const ahoraIso = new Date().toISOString()
    nuevoMapa[ped.id] = {
      ...(nuevoMapa[ped.id] || {}),
      etapa_ruta: 'entregado_preventista',
      fecha_despacho: ahoraIso,
      despachado_por_id: despachadorId,
      despachado_por_nombre: despachadorNombre,
      vendedor_id: ped.vendedor_id || null,
      vendedor_nombre: ped.perfiles?.nombre || null,
    }
    despachadosIds.push(ped.id)
  }

  if (despachadosIds.length > 0) {
    await guardarMapaCustodiaRespaldo(nuevoMapa)
  }

  if (errorDetenido) {
    errorDetenido.despachadosParciales = despachadosIds.length
    throw errorDetenido
  }

  return {
    despachadosCount: despachadosIds.length,
    despachadosIds,
  }
}

/**
 * PASO 3 DEL FLUJO:
 * El Preventista entrega el pedido en la tienda del Cliente y registra el cobro
 * (Efectivo, QR, Mixto o Crédito).
 * - Actualiza `ventas` (`monto_efectivo`, `monto_qr`, `saldo_credito`, `fecha_entrega`)
 *   para que los créditos pasen de inmediato al módulo de Créditos.
 * - Si el pedido aún estaba en `pendiente_entrega` (caso entrega directa desde Despacho),
 *   ejecuta primero la deducción de stock y luego deja el dinero en `cobrado_preventista`
 *   pendiente de rendir al Dueño.
 */
export async function registrarCobroPreventistaEnCliente({
  pedido,
  montoEfectivo = 0,
  montoQr = 0,
  saldoCredito = 0,
  usuarioCobrador = null,
}) {
  if (!pedido?.id) {
    throw new Error('Pedido inválido para registrar cobro.')
  }

  const efec = Math.max(0, Number(Number(montoEfectivo || 0).toFixed(2)))
  const qr = Math.max(0, Number(Number(montoQr || 0).toFixed(2)))
  const cred = Math.max(0, Number(Number(saldoCredito || 0).toFixed(2)))
  const ahoraIso = new Date().toISOString()

  if (pedido.estado === 'pendiente_entrega') {
    const { error: rpcErr } = await supabase.rpc(
      'confirmar_entrega_y_descontar_stock',
      {
        p_venta_id: pedido.id,
        p_monto_efectivo: efec,
        p_monto_qr: qr,
        p_saldo_credito: cred,
      }
    )
    if (rpcErr) {
      throw new Error(
        rpcErr.message ||
          'Stock insuficiente en Tienda Central. El encargado debe despachar primero la carga.'
      )
    }
  } else {
    let { error: updErr } = await supabaseAdmin
      .from('ventas')
      .update({
        monto_efectivo: efec,
        monto_qr: qr,
        saldo_credito: cred,
        fecha_entrega: ahoraIso,
      })
      .eq('id', pedido.id)

    if (updErr) {
      const resFallback = await supabase
        .from('ventas')
        .update({
          monto_efectivo: efec,
          monto_qr: qr,
          saldo_credito: cred,
          fecha_entrega: ahoraIso,
        })
        .eq('id', pedido.id)
      updErr = resFallback.error
    }

    if (updErr) {
      throw new Error(
        updErr.message || 'No se pudo guardar el cobro del pedido en el servidor.'
      )
    }
  }

  const mapaActual = await obtenerMapaCustodiaRespaldo(true)
  const previo = mapaActual[pedido.id] || {}
  const cobradorNombre =
    usuarioCobrador?.nombre || pedido.perfiles?.nombre || 'Preventista'

  const infoActualizada = {
    ...previo,
    etapa_ruta: 'cobrado_preventista',
    fecha_despacho: previo.fecha_despacho || ahoraIso,
    despachado_por_nombre:
      previo.despachado_por_nombre || 'Tienda Central',
    fecha_cobro: ahoraIso,
    cobrado_por_id: usuarioCobrador?.id || null,
    cobrado_por_nombre: cobradorNombre,
    monto_efectivo: efec,
    monto_qr: qr,
    saldo_credito: cred,
  }

  const nuevoMapa = {
    ...mapaActual,
    [pedido.id]: infoActualizada,
  }
  await guardarMapaCustodiaRespaldo(nuevoMapa)

  return {
    ...pedido,
    estado: 'entregado',
    monto_efectivo: efec,
    monto_qr: qr,
    saldo_credito: cred,
    fecha_entrega: ahoraIso,
    etapa_ruta: 'cobrado_preventista',
    info_custodia: infoActualizada,
  }
}

/**
 * PASO 4 DEL FLUJO:
 * El Preventista entrega el dinero recaudado al Dueño (`admin`), quien confirma la recepción.
 * - Marca todos los pedidos seleccionados como `rendido_dueno` con fecha, receptor y nota opcional.
 */
export async function confirmarRendicionDineroAlDueno({
  pedidoIds = [],
  usuarioAdmin = null,
  observacion = '',
}) {
  const idsValidos = Array.from(new Set((pedidoIds || []).filter(Boolean)))
  if (idsValidos.length === 0) {
    throw new Error('Selecciona al menos un pedido cobrado para recibir el dinero.')
  }

  const mapaActual = await obtenerMapaCustodiaRespaldo(true)
  const nuevoMapa = { ...mapaActual }
  const ahoraIso = new Date().toISOString()
  const adminNombre = usuarioAdmin?.nombre || 'Dueño / Administrador'
  const notaLimpia = String(observacion || '').trim()

  idsValidos.forEach((id) => {
    const previo = nuevoMapa[id] || {}
    nuevoMapa[id] = {
      ...previo,
      etapa_ruta: 'rendido_dueno',
      fecha_rendicion: ahoraIso,
      recibido_por_id: usuarioAdmin?.id || null,
      recibido_por_nombre: adminNombre,
      observacion: notaLimpia || previo.observacion || '',
    }
  })

  await guardarMapaCustodiaRespaldo(nuevoMapa)

  return {
    rendidosCount: idsValidos.length,
    fecha_rendicion: ahoraIso,
    recibido_por_nombre: adminNombre,
  }
}

/**
 * Consulta ultra-ligera (< 2 KB) para mostrar en el Dashboard del Dueño
 * cuánto dinero cobrado tienen los preventistas pendiente de entregarle y cuántos pedidos siguen en ruta.
 */
export async function consultarResumenCustodiaActiva() {
  const { mapa, enCamionIds, porRendirIds, todosActivosIds } =
    await obtenerIdsPreventasEnCustodiaActiva(true)

  if (todosActivosIds.length === 0) {
    return {
      enCamionCount: 0,
      enCamionTotalBs: 0,
      porRendirCount: 0,
      porRendirEfectivoBs: 0,
      porRendirQrBs: 0,
      porRendirTotalRecaudadoBs: 0,
      porRendirCreditoBs: 0,
      porPreventista: [],
    }
  }

  const { data, error } = await supabase
    .from('ventas')
    .select(
      `
      id,
      codigo_local,
      vendedor_id,
      estado,
      total,
      monto_efectivo,
      monto_qr,
      saldo_credito,
      fecha_pedido,
      fecha_entrega,
      clientes (id, nombre),
      perfiles:vendedor_id (id, nombre)
    `
    )
    .in('id', todosActivosIds.slice(0, 150))

  if (error || !data) {
    return {
      enCamionCount: enCamionIds.length,
      enCamionTotalBs: 0,
      porRendirCount: porRendirIds.length,
      porRendirEfectivoBs: 0,
      porRendirQrBs: 0,
      porRendirTotalRecaudadoBs: 0,
      porRendirCreditoBs: 0,
      porPreventista: [],
    }
  }

  let enCamionCount = 0
  let enCamionTotalBs = 0
  let porRendirCount = 0
  let porRendirEfectivoBs = 0
  let porRendirQrBs = 0
  let porRendirCreditoBs = 0
  const agrupadoPrev = {}

  data.forEach((v) => {
    const etapa = resolverEtapaCustodiaVenta(v, mapa)
    const vendId = v.vendedor_id || 'sin_asignar'
    const vendNombre =
      v.perfiles?.nombre ||
      mapa?.[v.id]?.cobrado_por_nombre ||
      mapa?.[v.id]?.vendedor_nombre ||
      'Preventista'

    if (etapa === 'entregado_preventista') {
      enCamionCount += 1
      enCamionTotalBs += Number(v.total) || 0
    } else if (etapa === 'cobrado_preventista') {
      const ef = Number(v.monto_efectivo) || 0
      const qr = Number(v.monto_qr) || 0
      const cr = Number(v.saldo_credito) || 0
      porRendirCount += 1
      porRendirEfectivoBs += ef
      porRendirQrBs += qr
      porRendirCreditoBs += cr

      if (!agrupadoPrev[vendId]) {
        agrupadoPrev[vendId] = {
          vendedorId: vendId,
          nombre: vendNombre,
          pedidosCount: 0,
          efectivoBs: 0,
          qrBs: 0,
          creditoBs: 0,
          totalRecaudadoBs: 0,
        }
      }
      agrupadoPrev[vendId].pedidosCount += 1
      agrupadoPrev[vendId].efectivoBs += ef
      agrupadoPrev[vendId].qrBs += qr
      agrupadoPrev[vendId].creditoBs += cr
      agrupadoPrev[vendId].totalRecaudadoBs += ef + qr
    }
  })

  return {
    enCamionCount,
    enCamionTotalBs,
    porRendirCount,
    porRendirEfectivoBs,
    porRendirQrBs,
    porRendirTotalRecaudadoBs: porRendirEfectivoBs + porRendirQrBs,
    porRendirCreditoBs,
    porPreventista: Object.values(agrupadoPrev).sort(
      (a, b) => b.totalRecaudadoBs - a.totalRecaudadoBs
    ),
  }
}
