import Dexie from 'dexie'
import { useState, useEffect, useCallback } from 'react'
import {
  supabase,
  enriquecerProductosConCosto,
  enriquecerMarcasConLogo,
} from './supabase'

/**
 * Base de datos local IndexedDB con Dexie.js para operación 100% Offline en ruta
 */
export const offlineDb = new Dexie('DistribuidoraOfflineDB')

offlineDb.version(1).stores({
  productos_cache: 'id, nombre, marca, activo',
  clientes_cache: 'id, nombre, telefono, direccion',
  pedidos_pendientes: '++local_id, &codigo_local, sincronizado, fecha_creacion',
})

offlineDb.version(2).stores({
  productos_cache: 'id, nombre, marca, activo',
  clientes_cache: 'id, nombre, telefono, direccion',
  marcas_cache: 'id, nombre, activo',
  pedidos_pendientes: '++local_id, &codigo_local, sincronizado, fecha_creacion',
})

offlineDb.version(3).stores({
  productos_cache:
    'id, nombre, marca, sabor, permite_surtido, grupo_surtido, tipo_beneficio_mayor, activo',
  clientes_cache: 'id, nombre, telefono, direccion',
  marcas_cache: 'id, nombre, activo',
  pedidos_pendientes: '++local_id, &codigo_local, sincronizado, fecha_creacion',
})

/**
 * Sincroniza el catálogo de productos (con su stock de referencia en Tienda Central),
 * la lista de marcas y la lista de clientes desde Supabase hacia Dexie cuando hay señal de internet.
 */
export async function actualizarCacheLocalDesdeSupabase() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, motivo: 'offline' }
  }

  try {
    const [resProd, resUbic, resInv, resCli, resMarcas] = await Promise.all([
      supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true }),
      supabase.from('ubicaciones').select('*'),
      supabase.from('inventario').select('*'),
      supabase
        .from('clientes')
        .select('*')
        .order('nombre', { ascending: true }),
      supabase
        .from('marcas')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true }),
    ])

    if (!resProd.error && resProd.data) {
      const centralId = resUbic.data?.find((u) => u.tipo === 'central')?.id
      const almacenId = resUbic.data?.find((u) => u.tipo === 'almacen')?.id

      const mapaStock = {}
      ;(resInv.data || []).forEach((item) => {
        if (!mapaStock[item.producto_id]) {
          mapaStock[item.producto_id] = { central: 0, almacen: 0 }
        }
        if (item.ubicacion_id === centralId) {
          mapaStock[item.producto_id].central = Number(item.stock_unidades) || 0
        } else if (item.ubicacion_id === almacenId) {
          mapaStock[item.producto_id].almacen = Number(item.stock_unidades) || 0
        }
      })

      const prodsConCosto = await enriquecerProductosConCosto(resProd.data)

      const productosConStock = prodsConCosto.map((p) => ({
        ...p,
        costo_paquete: Number(p.costo_paquete) || 0,
        sabor: p.sabor || null,
        permite_surtido: Boolean(p.permite_surtido),
        grupo_surtido: p.grupo_surtido || null,
        tipo_beneficio_mayor: p.tipo_beneficio_mayor || 'precio_mayor',
        bonif_compra_paquetes: Number(p.bonif_compra_paquetes) || 0,
        bonif_regalo_paquetes: Number(p.bonif_regalo_paquetes) || 0,
        stock_central_ref: mapaStock[p.id]?.central || 0,
        stock_almacen_ref: mapaStock[p.id]?.almacen || 0,
        actualizado_en: new Date().toISOString(),
      }))

      await offlineDb.productos_cache.clear()
      await offlineDb.productos_cache.bulkPut(productosConStock)
    }

    if (!resCli.error && resCli.data) {
      await offlineDb.clientes_cache.clear()
      await offlineDb.clientes_cache.bulkPut(resCli.data)
    }

    if (!resMarcas.error && resMarcas.data) {
      const marcasConLogo = await enriquecerMarcasConLogo(resMarcas.data)
      await offlineDb.marcas_cache.clear()
      await offlineDb.marcas_cache.bulkPut(marcasConLogo)
    }

    return { ok: true }
  } catch (err) {
    console.warn('No se pudo actualizar el caché local Dexie:', err)
    return { ok: false, error: err }
  }
}

/**
 * Obtiene marcas activas (desde Supabase si está en línea, o desde marcas_cache si está offline)
 */
export async function obtenerMarcasHibrido() {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('marcas')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true })
      if (!error && data) {
        const marcasConLogo = await enriquecerMarcasConLogo(data)
        await offlineDb.marcas_cache.clear()
        await offlineDb.marcas_cache.bulkPut(marcasConLogo)
        return { marcas: marcasConLogo, origen: 'supabase' }
      }
    } catch {
      // Fallback a Dexie
    }
  }
  const cache = await offlineDb.marcas_cache.toArray()
  return { marcas: cache, origen: 'dexie' }
}

/**
 * Obtiene productos (desde Supabase si está en línea, o desde productos_cache si está offline)
 */
export async function obtenerProductosHibrido() {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    const sync = await actualizarCacheLocalDesdeSupabase()
    if (sync.ok) {
      const cache = await offlineDb.productos_cache.toArray()
      return { productos: cache, origen: 'supabase' }
    }
  }
  const cache = await offlineDb.productos_cache.toArray()
  return { productos: cache, origen: 'dexie' }
}

/**
 * Obtiene clientes (desde Supabase si está en línea, o desde clientes_cache si está offline)
 */
export async function obtenerClientesHibrido() {
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nombre', { ascending: true })
      if (!error && data) {
        await offlineDb.clientes_cache.clear()
        await offlineDb.clientes_cache.bulkPut(data)
        return { clientes: data, origen: 'supabase' }
      }
    } catch {
      // Fallback a Dexie
    }
  }
  const cache = await offlineDb.clientes_cache.toArray()
  return { clientes: cache, origen: 'dexie' }
}

/**
 * Guarda un pedido o cotización:
 * - Si hay internet, intenta guardarlo directo en Supabase (`ventas` y `venta_detalles`).
 * - Si no hay internet o falla la conexión, lo guarda en `pedidos_pendientes` de Dexie.
 * NOTA REGLA DE NEGOCIO: NO descuenta stock en el Día 1.
 */
export async function registrarPedidoPreventaOCotizacion({
  codigo_local,
  cabecera,
  detalles,
  clienteObj,
  vendedorNombre,
}) {
  // Intentar primero en Supabase si hay conexión
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const resultadoRemoto = await subirPedidoIndividualASupabase({
        codigo_local,
        cabecera,
        detalles,
      })

      if (resultadoRemoto.ok) {
        return {
          ok: true,
          modo: 'online',
          venta: resultadoRemoto.venta,
        }
      }
    } catch (err) {
      console.warn('Fallo envío directo a Supabase, guardando en cola Offline Dexie:', err)
    }
  }

  // Guardar en Dexie `pedidos_pendientes` cuando está Offline
  const registroOffline = {
    codigo_local,
    cabecera: {
      ...cabecera,
      codigo_local,
      fecha_pedido: cabecera.fecha_pedido || new Date().toISOString(),
    },
    detalles,
    cliente_snapshot: clienteObj || null,
    vendedor_nombre: vendedorNombre || 'Preventista',
    sincronizado: 0,
    fecha_creacion: new Date().toISOString(),
  }

  await offlineDb.pedidos_pendientes.put(registroOffline)

  return {
    ok: true,
    modo: 'offline',
    venta: {
      id: `offline-${codigo_local}`,
      ...registroOffline.cabecera,
    },
  }
}

/**
 * Sube un único pedido a las tablas `ventas` y `venta_detalles` verificando `codigo_local`
 * para evitar cualquier duplicidad.
 */
async function subirPedidoIndividualASupabase({ codigo_local, cabecera, detalles }) {
  // 1. Verificar si ya existe por `codigo_local`
  const { data: existente } = await supabase
    .from('ventas')
    .select('*')
    .eq('codigo_local', codigo_local)
    .maybeSingle()

  if (existente) {
    return { ok: true, venta: existente, yaExistia: true }
  }

  // 2. Insertar cabecera en `ventas`
  const payloadVenta = {
    codigo_local,
    tipo: cabecera.tipo,
    estado: cabecera.estado,
    cliente_id: cabecera.cliente_id,
    vendedor_id: cabecera.vendedor_id,
    total: Number(cabecera.total) || 0,
    monto_efectivo: Number(cabecera.monto_efectivo) || 0,
    monto_qr: Number(cabecera.monto_qr) || 0,
    saldo_credito: Number(cabecera.saldo_credito) || 0,
    fecha_pedido: cabecera.fecha_pedido || new Date().toISOString(),
  }

  const { data: nuevaVenta, error: ventaErr } = await supabase
    .from('ventas')
    .insert([payloadVenta])
    .select()
    .single()

  if (ventaErr) throw ventaErr

  // 3. Insertar filas en `venta_detalles` (guardando snapshot de costo_unitario si existe la columna)
  const filasBase = detalles.map((d) => ({
    venta_id: nuevaVenta.id,
    producto_id: d.producto_id,
    tipo_venta: d.tipo_venta,
    cantidad: Number(d.cantidad) || 0,
    unidades_totales_descontar: Number(d.unidades_totales_descontar) || 0,
    precio_aplicado: Number(d.precio_aplicado) || 0,
    subtotal: Number(d.subtotal) || 0,
    nota_surtido: d.nota_surtido || null,
  }))

  const tieneAlgunCosto = detalles.some((d) => Number(d.costo_unitario) > 0)
  if (tieneAlgunCosto) {
    const filasConCosto = detalles.map((d, idx) => ({
      ...filasBase[idx],
      costo_unitario:
        Number(d.costo_unitario) > 0 ? Number(d.costo_unitario) : null,
    }))
    const { error: detCostoErr } = await supabase
      .from('venta_detalles')
      .insert(filasConCosto)
    if (!detCostoErr) {
      return { ok: true, venta: nuevaVenta }
    }
  }

  const { error: detErr } = await supabase
    .from('venta_detalles')
    .insert(filasBase)

  if (detErr) throw detErr

  return { ok: true, venta: nuevaVenta }
}

/**
 * Sincroniza todos los `pedidos_pendientes` almacenados en Dexie hacia Supabase
 * y limpia los pedidos ya subidos de la cola local.
 */
export async function sincronizarPedidosPendientes() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { sincronizados: 0, pendientes: await offlineDb.pedidos_pendientes.count() }
  }

  const pendientes = await offlineDb.pedidos_pendientes
    .where('sincronizado')
    .equals(0)
    .toArray()

  let contadorExito = 0

  for (const item of pendientes) {
    try {
      const res = await subirPedidoIndividualASupabase({
        codigo_local: item.codigo_local,
        cabecera: item.cabecera,
        detalles: item.detalles,
      })
      if (res.ok) {
        await offlineDb.pedidos_pendientes.delete(item.local_id)
        contadorExito++
      }
    } catch (err) {
      console.error(`Error sincronizando pedido ${item.codigo_local}:`, err)
    }
  }

  const restantes = await offlineDb.pedidos_pendientes.count()
  return { sincronizados: contadorExito, pendientes: restantes }
}

/**
 * Hook React para gestionar la sincronización automática de caché y cola de pedidos
 * cuando el celular recupera la señal (`online`).
 */
export function useOfflineSync() {
  const [pendientesCount, setPendientesCount] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState(null)

  const actualizarConteo = useCallback(async () => {
    try {
      const c = await offlineDb.pedidos_pendientes.count()
      setPendientesCount(c)
    } catch {
      setPendientesCount(0)
    }
  }, [])

  const ejecutarSincronizacionCompleta = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await actualizarConteo()
      return { sincronizados: 0 }
    }

    setSincronizando(true)
    try {
      await actualizarCacheLocalDesdeSupabase()
      const res = await sincronizarPedidosPendientes()
      await actualizarConteo()
      setUltimaSync(new Date())
      return res
    } finally {
      setSincronizando(false)
    }
  }, [actualizarConteo])

  useEffect(() => {
    actualizarConteo()
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      ejecutarSincronizacionCompleta()
    }

    const handleOnline = () => {
      ejecutarSincronizacionCompleta()
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [actualizarConteo, ejecutarSincronizacionCompleta])

  return {
    pendientesCount,
    sincronizando,
    ultimaSync,
    sincronizarAhora: ejecutarSincronizacionCompleta,
    refrescarCola: actualizarConteo,
  }
}
