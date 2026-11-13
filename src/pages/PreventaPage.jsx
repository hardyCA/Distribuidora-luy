import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom'
import {
  ShoppingBag,
  Store,
  Search,
  Plus,
  Minus,
  CheckCircle2,
  Sparkles,
  FileText,
  MessageCircle,
  Share2,
  Download,
  WifiOff,
  RefreshCw,
  Trash2,
  X,
  MapPin,
  Lock,
  Layers,
  ChevronUp,
  ClipboardList,
  Crosshair,
  AlertCircle,
} from 'lucide-react'
import { supabase, obtenerOCrearPerfilPorRol } from '../lib/supabase'
import {
  offlineDb,
  obtenerProductosHibrido,
  obtenerClientesHibrido,
  obtenerMarcasHibrido,
  registrarPedidoPreventaOCotizacion,
  useOfflineSync,
} from '../lib/offlineDb'
import {
  generarYCompartirPDF,
  generarUrlWhatsAppPedido,
} from '../utils/pdfGenerator'
import { useRole } from '../context/RoleContext'
import BottleVisual from '../components/BottleVisual'
import ModalSurtidoSabores from '../components/ModalSurtidoSabores'
import {
  calcularResumenCarritoIntegral,
  obtenerGrupoSurtido,
  obtenerTipoBeneficio,
} from '../utils/surtidoHelper'

export default function PreventaPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { rolActual, infoRol, usuarioActual, isOnline } = useRole()
  const { pendientesCount, sincronizando, sincronizarAhora, refrescarCola } =
    useOfflineSync()

  const [productos, setProductos] = useState([])
  const [marcasTabla, setMarcasTabla] = useState([])
  const [clientes, setClientes] = useState([])
  const [cargandoDatos, setCargandoDatos] = useState(true)
  const [origenCatalogo, setOrigenCatalogo] = useState('supabase')

  // Cliente seleccionado
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [selectorClienteAbierto, setSelectorClienteAbierto] = useState(false)

  // Modal rápida "+ Nueva Tienda"
  const [modalNuevaTienda, setModalNuevaTienda] = useState(false)
  const [nuevaTiendaForm, setNuevaTiendaForm] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    latitud: null,
    longitud: null,
  })
  const [capturandoGpsTienda, setCapturandoGpsTienda] = useState(false)
  const [guardandoTienda, setGuardandoTienda] = useState(false)

  // Filtros del catálogo de bebidas + Selector global Paquetes / Botellas (por defecto Paquetes)
  const [busquedaProd, setBusquedaProd] = useState('')
  const [marcaFiltro, setMarcaFiltro] = useState('TODAS')
  const [modoUnidad, setModoUnidad] = useState('paquetes') // 'paquetes' | 'sueltas'

  // Estado del carrito: { [producto_id]: { paquetes: number, sueltas: number } }
  const [cantidadesPorProducto, setCantidadesPorProducto] = useState({})
  // Paquetes surtidos por grupo: { [grupo_surtido]: { paquetes: number, botellasPorProducto: { [prod_id]: number } } }
  const [paquetesSurtidos, setPaquetesSurtidos] = useState({})
  const [grupoSurtidoModal, setGrupoSurtidoModal] = useState(null)

  // Bottom sheet del carrito en móvil
  const [carritoMovilAbierto, setCarritoMovilAbierto] = useState(false)

  // Guardado de pedido y Modal de Éxito (PDF + WhatsApp)
  const [procesandoPedido, setProcesandoPedido] = useState(false)
  const [errorPedido, setErrorPedido] = useState('')
  const [pedidoCompletado, setPedidoCompletado] = useState(null)

  const cargarTodo = useCallback(async () => {
    setCargandoDatos(true)
    try {
      const [resProd, resCli, resMarcas] = await Promise.all([
        obtenerProductosHibrido(),
        obtenerClientesHibrido(),
        obtenerMarcasHibrido(),
      ])

      setProductos(resProd.productos || [])
      setMarcasTabla(resMarcas.marcas || [])
      setOrigenCatalogo(resProd.origen)
      const listaClientes = resCli.clientes || []
      setClientes(listaClientes)

      // Verificar si viene un cliente preseleccionado por state, URL o localStorage
      const clienteState = location.state?.clientePreseleccionado
      const clienteQueryId = searchParams.get('cliente_id')
      let preseleccionado = null

      if (clienteState?.id) {
        preseleccionado =
          listaClientes.find((c) => c.id === clienteState.id) || clienteState
      } else if (clienteQueryId) {
        preseleccionado = listaClientes.find((c) => c.id === clienteQueryId)
      } else {
        try {
          const guardado = localStorage.getItem('bebidas_cliente_preventa')
          if (guardado) {
            const parsed = JSON.parse(guardado)
            preseleccionado =
              listaClientes.find((c) => c.id === parsed.id) || parsed
          }
        } catch {
          // ignore
        }
      }

      if (preseleccionado) {
        setClienteSeleccionado(preseleccionado)
      } else if (listaClientes.length > 0 && !clienteSeleccionado) {
        setClienteSeleccionado(listaClientes[0])
      }
    } finally {
      setCargandoDatos(false)
    }
  }, [location.state, searchParams])

  useEffect(() => {
    cargarTodo()
  }, [cargarTodo])

  // Marcas disponibles para filtrar (alimentadas por la tabla `marcas` + productos activos)
  const marcasDisponibles = useMemo(() => {
    const s = new Set()
    marcasTabla.forEach((m) => {
      if (m.activo !== false && m.nombre?.trim()) s.add(m.nombre.trim())
    })
    productos.forEach((p) => {
      if (p.marca?.trim()) s.add(p.marca.trim())
    })
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'))
  }, [marcasTabla, productos])

  const productosFiltrados = useMemo(() => {
    const q = busquedaProd.trim().toLowerCase()
    return productos.filter((p) => {
      if (p.activo === false) return false
      if (marcaFiltro !== 'TODAS' && p.marca !== marcaFiltro) return false
      if (!q) return true
      return (
        p.nombre?.toLowerCase().includes(q) ||
        p.marca?.toLowerCase().includes(q) ||
        p.sabor?.toLowerCase().includes(q) ||
        p.grupo_surtido?.toLowerCase().includes(q)
      )
    })
  }, [productos, busquedaProd, marcaFiltro])

  // Grupos surtibles disponibles en la vista actual para acceso rápido
  const gruposSurtiblesEnVista = useMemo(() => {
    const s = new Set()
    productosFiltrados.forEach((p) => {
      const g = obtenerGrupoSurtido(p)
      if (g) s.add(g)
    })
    return Array.from(s)
  }, [productosFiltrados])

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase()
    if (!q) return clientes.slice(0, 30)
    return clientes.filter(
      (c) =>
        c.nombre?.toLowerCase().includes(q) ||
        c.telefono?.toLowerCase().includes(q) ||
        c.direccion?.toLowerCase().includes(q)
    )
  }, [clientes, busquedaCliente])

  // Actualizar cantidad de paquetes o botellas sueltas de un producto
  const actualizarCantidad = (productoId, campo, valorNuevo) => {
    const num = Math.max(0, parseInt(valorNuevo, 10) || 0)
    setCantidadesPorProducto((prev) => {
      const actual = prev[productoId] || { paquetes: 0, sueltas: 0 }
      const actualizado = { ...actual, [campo]: num }
      if (actualizado.paquetes <= 0 && actualizado.sueltas <= 0) {
        const copia = { ...prev }
        delete copia[productoId]
        return copia
      }
      return { ...prev, [productoId]: actualizado }
    })
  }

  const limpiarCarrito = () => {
    setCantidadesPorProducto({})
    setPaquetesSurtidos({})
    setErrorPedido('')
  }

  // Quitar una línea específica directamente desde el resumen del carrito
  const quitarLineaDelCarrito = (item) => {
    if (!item) return
    if (item.tipo_venta === 'paquete_surtido' && item.grupo_surtido) {
      eliminarSurtidoGrupo(item.grupo_surtido)
      return
    }
    if (item.tipo_venta === 'paquete') {
      actualizarCantidad(item.producto_id, 'paquetes', 0)
    } else if (item.tipo_venta === 'unidad') {
      actualizarCantidad(item.producto_id, 'sueltas', 0)
    }
  }

  const guardarSurtidoGrupo = (grupoKey, surtidoData) => {
    setPaquetesSurtidos((prev) => ({
      ...prev,
      [grupoKey]: surtidoData,
    }))
  }

  const eliminarSurtidoGrupo = (grupoKey) => {
    setPaquetesSurtidos((prev) => {
      const copia = { ...prev }
      delete copia[grupoKey]
      return copia
    })
  }

  /**
   * Cálculo automático de filas de `venta_detalles` (escala mayorista por grupo,
   * bonificación automática `bono_promocion` y paquetes surtidos por sabores `paquete_surtido`).
   */
  const resumenCarrito = useMemo(
    () =>
      calcularResumenCarritoIntegral({
        productos,
        cantidadesPorProducto,
        paquetesSurtidos,
      }),
    [productos, cantidadesPorProducto, paquetesSurtidos]
  )

  // Crear nueva tienda desde el mismo módulo de preventa
  const capturarGpsRapidoTienda = () => {
    if (!('geolocation' in navigator)) return
    setCapturandoGpsTienda(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNuevaTiendaForm((prev) => ({
          ...prev,
          latitud: Number(pos.coords.latitude.toFixed(6)),
          longitud: Number(pos.coords.longitude.toFixed(6)),
        }))
        setCapturandoGpsTienda(false)
      },
      () => {
        setCapturandoGpsTienda(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const guardarNuevaTiendaEnRuta = async (e) => {
    e.preventDefault()
    if (!nuevaTiendaForm.nombre.trim()) return
    setGuardandoTienda(true)
    try {
      let validUserId = usuarioActual?.id
      if (!validUserId || String(validUserId).startsWith('local-')) {
        const { perfil } = await obtenerOCrearPerfilPorRol(
          rolActual,
          infoRol.defaultName
        )
        validUserId = perfil?.id || null
      }

      const payload = {
        nombre: nuevaTiendaForm.nombre.trim(),
        telefono: nuevaTiendaForm.telefono.trim() || null,
        direccion: nuevaTiendaForm.direccion.trim() || null,
        latitud: nuevaTiendaForm.latitud,
        longitud: nuevaTiendaForm.longitud,
        creado_por: validUserId,
      }

      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('clientes')
          .insert([payload])
          .select()
          .single()
        if (!error && data) {
          await offlineDb.clientes_cache.put(data)
          setClientes((prev) => [data, ...prev])
          setClienteSeleccionado(data)
          setModalNuevaTienda(false)
          setNuevaTiendaForm({
            nombre: '',
            telefono: '',
            direccion: '',
            latitud: null,
            longitud: null,
          })
          return
        }
      }

      // Fallback si se crea sin conexión
      const clienteOffline = {
        id: crypto.randomUUID(),
        ...payload,
        fecha_registro: new Date().toISOString(),
      }
      await offlineDb.clientes_cache.put(clienteOffline)
      setClientes((prev) => [clienteOffline, ...prev])
      setClienteSeleccionado(clienteOffline)
      setModalNuevaTienda(false)
    } finally {
      setGuardandoTienda(false)
    }
  }

  /**
   * Guardar como Cotización ('cotizacion') o Confirmar Preventa ('preventa' / 'pendiente_entrega')
   * Regla estricta: NO descuenta stock en el Día 1.
   */
  const guardarOperacion = async (tipoOperacion) => {
    if (!clienteSeleccionado) {
      setErrorPedido('Selecciona primero una Tienda / Cliente.')
      return
    }
    if (resumenCarrito.detalles.length === 0) {
      setErrorPedido('Agrega al menos un paquete o botella al pedido.')
      return
    }

    setProcesandoPedido(true)
    setErrorPedido('')

    try {
      let validVendedorId = usuarioActual?.id
      if (
        navigator.onLine &&
        (!validVendedorId || String(validVendedorId).startsWith('local-'))
      ) {
        const { perfil } = await obtenerOCrearPerfilPorRol(
          rolActual,
          infoRol.defaultName
        )
        validVendedorId = perfil?.id || null
      }

      const esCotizacion = tipoOperacion === 'cotizacion'
      const prefijo = esCotizacion ? 'COT' : 'PREV'
      const codigoUnico = `${prefijo}-${Date.now().toString().slice(-6)}-${Math.floor(
        10 + Math.random() * 89
      )}`

      const cabecera = {
        tipo: esCotizacion ? 'cotizacion' : 'preventa',
        estado: esCotizacion ? 'cotizacion' : 'pendiente_entrega',
        cliente_id: clienteSeleccionado.id,
        vendedor_id: validVendedorId,
        total: resumenCarrito.totalBs,
        monto_efectivo: 0,
        monto_qr: 0,
        saldo_credito: 0,
        fecha_pedido: new Date().toISOString(),
      }

      const mapaProds = {}
      productos.forEach((p) => {
        mapaProds[p.id] = p
      })
      const detallesConCosto = resumenCarrito.detalles.map((d) => {
        const pRef = mapaProds[d.producto_id]
        const uPaq = Math.max(1, Number(pRef?.unidades_por_paquete) || 6)
        const cPaq = Number(pRef?.costo_paquete) || 0
        return {
          ...d,
          costo_unitario: cPaq > 0 ? Number((cPaq / uPaq).toFixed(4)) : null,
        }
      })

      const resultado = await registrarPedidoPreventaOCotizacion({
        codigo_local: codigoUnico,
        cabecera,
        detalles: detallesConCosto,
        clienteObj: clienteSeleccionado,
        vendedorNombre: usuarioActual?.nombre || infoRol.defaultName,
      })

      await refrescarCola()

      const datosCompletados = {
        venta: resultado.venta,
        modo: resultado.modo,
        cliente: clienteSeleccionado,
        detalles: resumenCarrito.detalles,
        vendedorNombre: usuarioActual?.nombre || infoRol.defaultName,
        esCotizacion,
      }

      setPedidoCompletado(datosCompletados)
      setCantidadesPorProducto({})
      setPaquetesSurtidos({})
      setCarritoMovilAbierto(false)

      // Si el usuario eligió "Guardar como Cotización y Enviar PDF", disparamos descarga de PDF de inmediato
      if (esCotizacion) {
        await generarYCompartirPDF(
          datosCompletados.venta,
          datosCompletados.cliente,
          datosCompletados.detalles,
          datosCompletados.vendedorNombre,
          false
        )
      }
    } catch (err) {
      console.error('Error al guardar operación:', err)
      setErrorPedido(err.message || 'No se pudo procesar el pedido.')
    } finally {
      setProcesandoPedido(false)
    }
  }

  const formatearBs = (n) => {
    const val = Number(n) || 0
    return `Bs ${val.toLocaleString('es-BO', {
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`
  }

  return (
    <div className="space-y-5 pb-28 lg:pb-10">
      {/* ================= CABECERA MINIMALISTA ESTILO LINEAR ================= */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Preventa
            </h1>
            <span className="text-sm font-normal text-slate-400">
              {productosFiltrados.length} productos
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pendientesCount > 0 && (
              <button
                type="button"
                onClick={sincronizarAhora}
                disabled={!isOnline || sincronizando}
                className="h-9 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={sincronizando ? 'animate-spin' : ''}
                />
                <span>
                  {sincronizando
                    ? 'Sincronizando...'
                    : `Sincronizar (${pendientesCount})`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/mis-pedidos')}
              className="h-9 px-3.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <ClipboardList size={16} className="text-amber-500" />
              <span>Mis Pedidos</span>
            </button>
          </div>
        </div>

        {(!isOnline || origenCatalogo === 'dexie') && (
          <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center gap-2 text-xs text-amber-900 dark:text-amber-300 font-medium">
            <WifiOff size={15} className="shrink-0" />
            <span>
              Modo Offline (Dexie.js): Los pedidos se guardan localmente y sincronizarán al recuperar señal.
            </span>
          </div>
        )}
      </div>

      {/* ================= LAYOUT PRINCIPAL: CATÁLOGO (IZQ) + CARRITO (DER) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMNA IZQUIERDA (8 cols): Selector de Cliente + Buscador/Marcas + Catálogo */}
        <div className="lg:col-span-8 space-y-4">
          {/* 1. BARRA DE CLIENTE COMPACTA Y DIRECTA (FÁCIL DE ENTENDER PARA CUALQUIER PERSONA) */}
          <div className="bg-white dark:bg-[#161922] rounded-xl border border-slate-200/80 dark:border-white/[0.06] p-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Store size={16} />
                </div>
                {clienteSeleccionado ? (
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        Cliente:
                      </span>
                      <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                        {clienteSeleccionado.nombre}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {clienteSeleccionado.direccion || 'Sin dirección registrada'}
                      {clienteSeleccionado.telefono
                        ? ` · Tel. ${clienteSeleccionado.telefono}`
                        : ''}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs sm:text-sm font-medium text-slate-500">
                    Selecciona un cliente para el pedido
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectorClienteAbierto((prev) => !prev)}
                  className="h-8 px-3 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium transition cursor-pointer"
                >
                  {selectorClienteAbierto ? 'Cerrar lista' : 'Cambiar cliente'}
                </button>

                <button
                  type="button"
                  onClick={() => setModalNuevaTienda(true)}
                  className="h-8 inline-flex items-center gap-1 px-3 rounded-lg bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 text-xs font-semibold transition cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Nuevo</span>
                </button>
              </div>
            </div>

            {/* Buscador desplegable de clientes */}
            {(selectorClienteAbierto || !clienteSeleccionado) && (
              <div className="mt-3 space-y-2 pt-3 border-t border-slate-100 dark:border-white/10">
                <div className="relative">
                  <Search size={15} className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={busquedaCliente}
                    onChange={(e) => setBusquedaCliente(e.target.value)}
                    placeholder="Buscar cliente por nombre, teléfono o dirección..."
                    className="w-full h-9 pl-9 pr-4 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-white/10 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1A1E29]">
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClienteSeleccionado(c)
                        setSelectorClienteAbierto(false)
                        try {
                          localStorage.setItem(
                            'bebidas_cliente_preventa',
                            JSON.stringify(c)
                          )
                        } catch {
                          // ignore
                        }
                      }}
                      className={`w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center justify-between gap-2 transition cursor-pointer ${
                        clienteSeleccionado?.id === c.id
                          ? 'bg-amber-50/70 dark:bg-amber-500/10'
                          : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {c.nombre}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {c.direccion || 'Sin dirección'}{' '}
                          {c.telefono ? `· ${c.telefono}` : ''}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 shrink-0">
                        Seleccionar →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. FILA LIMPIA DE BUSCADOR COMPACTO + PÍLDORAS DE MARCA (CERO RUIDO VISUAL) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative w-full sm:w-64 shrink-0">
              <Search
                size={15}
                className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={busquedaProd}
                onChange={(e) => setBusquedaProd(e.target.value)}
                placeholder="Buscar bebida o sabor..."
                className="w-full h-8.5 pl-8.5 pr-7 rounded-lg bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-400 dark:focus:border-white/25 transition"
              />
              {busquedaProd && (
                <button
                  type="button"
                  onClick={() => setBusquedaProd('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {marcasDisponibles.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMarcaFiltro('TODAS')}
                  className={`h-7.5 px-3 rounded-lg text-xs transition shrink-0 cursor-pointer ${
                    marcaFiltro === 'TODAS'
                      ? 'bg-slate-900 text-white dark:bg-white/15 dark:text-white font-medium'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  Todas
                </button>
                {marcasDisponibles.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarcaFiltro(m)}
                    className={`h-7.5 px-3 rounded-lg text-xs transition shrink-0 cursor-pointer ${
                      marcaFiltro === m
                        ? 'bg-slate-900 text-white dark:bg-white/15 dark:text-white font-medium'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fila limpia: Paquete Surtido (izq) + Selector global Paquetes / Botellas (der, por defecto Paquetes) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {gruposSurtiblesEnVista.map((grupo) => {
                const surtidoActual = paquetesSurtidos[grupo]
                const cantPaqSurt = Number(surtidoActual?.paquetes) || 0
                return (
                  <button
                    key={grupo}
                    type="button"
                    onClick={() => setGrupoSurtidoModal(grupo)}
                    className={`h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer ${
                      cantPaqSurt > 0
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-300 font-semibold'
                        : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10'
                    }`}
                  >
                    <Layers size={14} className="text-amber-500 shrink-0" />
                    <span>
                      Armar Paquete Surtido {grupo}
                      {cantPaqSurt > 0 ? ` (${cantPaqSurt} paq)` : ''}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Conmutador minimalista global: Paquetes (por defecto) | Botellas */}
            <div className="ml-auto inline-flex items-center p-0.5 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] shrink-0">
              <button
                type="button"
                onClick={() => setModoUnidad('paquetes')}
                className={`h-7.5 px-3 rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1.5 ${
                  modoUnidad === 'paquetes'
                    ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 font-semibold shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
                }`}
              >
                <span>Por Paquete</span>
              </button>
              <button
                type="button"
                onClick={() => setModoUnidad('sueltas')}
                className={`h-7.5 px-3 rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1.5 ${
                  modoUnidad === 'sueltas'
                    ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 font-semibold shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
                }`}
              >
                <span>Por Botella</span>
              </button>
            </div>
          </div>

          {/* 3. CATÁLOGO INTUITIVO Y LIMPIO (SIN CANTIDADES DE STOCK PARA EL PREVENTISTA) */}
          {cargandoDatos ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-[#F6F5F2] rounded-2xl p-4 h-56 animate-pulse"
                />
              ))}
            </div>
          ) : productosFiltrados.length === 0 ? (
            <div className="bg-[#F6F5F2] rounded-2xl p-8 text-center text-xs sm:text-sm text-stone-500">
              No se encontraron bebidas con ese filtro.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {productosFiltrados.map((prod) => {
                const unidPorPaq = Number(prod.unidades_por_paquete) || 6
                const minMayor = Number(prod.min_paquetes_mayor) || 5
                const tipoBeneficio = obtenerTipoBeneficio(prod)
                const esBonificacion = tipoBeneficio === 'bonificacion'
                const esFijo = tipoBeneficio === 'ninguno'
                const bonifCompra = Number(prod.bonif_compra_paquetes) || 5
                const bonifRegalo = Number(prod.bonif_regalo_paquetes) || 2
                const grupoSurtidoProd = obtenerGrupoSurtido(prod)

                const cantActual = cantidadesPorProducto[prod.id] || {
                  paquetes: 0,
                  sueltas: 0,
                }

                // Evaluar paquetes acumulados de la marca si es surtible
                const paquetesGrupoTotal = grupoSurtidoProd
                  ? resumenCarrito.paquetesPorGrupo[grupoSurtidoProd] ||
                    cantActual.paquetes
                  : cantActual.paquetes

                const aplicaMayorista =
                  tipoBeneficio === 'precio_mayor' &&
                  paquetesGrupoTotal >= minMayor
                const faltanParaMayorista = Math.max(
                  0,
                  minMayor - paquetesGrupoTotal
                )
                const precioPaqActivo = aplicaMayorista
                  ? Number(prod.precio_paquete_mayor)
                  : Number(prod.precio_paquete_menor)

                const paquetesGratisProd =
                  esBonificacion && bonifCompra > 0
                    ? Math.floor(cantActual.paquetes / bonifCompra) *
                      bonifRegalo
                    : 0
                const faltanParaBonif =
                  esBonificacion && bonifCompra > 0
                    ? bonifCompra - (cantActual.paquetes % bonifCompra)
                    : 0

                const subtotalProducto =
                  cantActual.paquetes * precioPaqActivo +
                  cantActual.sueltas * (Number(prod.precio_unidad) || 0)

                const botellasEnSurtido = grupoSurtidoProd
                  ? Number(
                      paquetesSurtidos[grupoSurtidoProd]?.botellasPorProducto?.[
                        prod.id
                      ]
                    ) || 0
                  : 0

                const tieneEnCarrito =
                  cantActual.paquetes > 0 ||
                  cantActual.sueltas > 0 ||
                  botellasEnSurtido > 0

                return (
                  <article
                    key={prod.id}
                    className={`group bg-[#F6F5F2] hover:bg-[#EFECE6] rounded-2xl p-4 sm:p-5 transition-all duration-150 flex flex-col justify-between ${
                      tieneEnCarrito
                        ? 'ring-2 ring-amber-500 bg-[#F3EFE8]'
                        : ''
                    }`}
                  >
                    {/* Bloque Superior: Imagen de Botella (32%) + Información y Precios (68%) */}
                    <div className="flex items-center gap-3.5">
                      <div className="w-[32%] shrink-0 flex items-center justify-center">
                        <BottleVisual
                          imagenUrl={prod.imagen_url}
                          nombre={prod.nombre}
                          alturaClass="h-36"
                        />
                      </div>

                      <div className="w-[68%] min-w-0">
                        {/* Línea 1: Marca • Pack xN + Subtotal activo si ya agregó */}
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500 truncate">
                            <span>{prod.marca || 'BEBIDA'}</span>
                            <span className="mx-1.5 text-stone-400">•</span>
                            <span className="text-stone-600 normal-case tracking-normal font-medium">
                              Pack x{unidPorPaq}
                            </span>
                          </div>

                          {tieneEnCarrito && subtotalProducto > 0 && (
                            <span className="text-xs font-extrabold text-amber-800 dark:text-amber-400 tabular-nums shrink-0">
                              {formatearBs(subtotalProducto)}
                            </span>
                          )}
                        </div>

                        {/* Línea 2: Nombre de la bebida + Sabor + Botón Surtir */}
                        <div className="mt-1 mb-3">
                          <h3 className="text-base sm:text-lg font-bold text-stone-900 leading-snug line-clamp-2">
                            {prod.nombre}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {prod.sabor && (
                              <span className="text-xs font-medium text-stone-600">
                                Sabor: <strong>{prod.sabor}</strong>
                              </span>
                            )}
                            {grupoSurtidoProd && (
                              <button
                                type="button"
                                onClick={() =>
                                  setGrupoSurtidoModal(grupoSurtidoProd)
                                }
                                className="text-[11px] font-bold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 underline decoration-amber-500/60 cursor-pointer"
                              >
                                <Layers className="w-3 h-3" />
                                <span>
                                  Surtir sabores
                                  {botellasEnSurtido > 0
                                    ? ` (${botellasEnSurtido} bot.)`
                                    : ''}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Línea 3: Precios claros (Botella | Paquete | Mayorista o Bonificación) */}
                        <div
                          className={`grid ${
                            esFijo ? 'grid-cols-2' : 'grid-cols-3'
                          } divide-x divide-stone-200/80 tabular-nums pt-1`}
                        >
                          <div className="pr-2">
                            <span className="block text-[10px] text-stone-400 uppercase">
                              Botella
                            </span>
                            <span className="block text-xs sm:text-sm font-semibold text-stone-700 mt-0.5">
                              {formatearBs(prod.precio_unidad)}
                            </span>
                          </div>

                          <div className="px-2">
                            <span className="block text-[10px] text-stone-400 uppercase">
                              Paquete
                            </span>
                            <span
                              className={`block text-xs sm:text-sm mt-0.5 ${
                                cantActual.paquetes > 0 && !aplicaMayorista
                                  ? 'font-extrabold text-stone-950 underline decoration-amber-500'
                                  : 'font-bold text-stone-900'
                              }`}
                            >
                              {formatearBs(prod.precio_paquete_menor)}
                            </span>
                          </div>

                          {!esFijo && (
                            <div className="pl-2">
                              {esBonificacion ? (
                                <>
                                  <span className="block text-[10px] text-amber-700 font-medium uppercase">
                                    Promo
                                  </span>
                                  <span className="block text-xs sm:text-sm font-extrabold text-amber-700 mt-0.5">
                                    {bonifCompra}+{bonifRegalo} Gratis
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="block text-[10px] text-amber-700 font-medium uppercase">
                                    Mayor (+{minMayor})
                                  </span>
                                  <span
                                    className={`block text-xs sm:text-sm font-extrabold mt-0.5 ${
                                      aplicaMayorista
                                        ? 'text-emerald-700'
                                        : 'text-amber-700'
                                    }`}
                                  >
                                    {formatearBs(prod.precio_paquete_mayor)}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Aviso inteligente SOLO cuando el usuario ya está agregando paquetes (Cero ruido cuando está en 0) */}
                    {(paquetesGrupoTotal > 0 || cantActual.paquetes > 0) && (
                      <div className="mt-2.5 text-[11px] flex items-center justify-between gap-2 px-1">
                        {esBonificacion ? (
                          paquetesGratisProd > 0 ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                              <Sparkles className="w-3 h-3" />+{paquetesGratisProd} Paq. Gratis incluido (Bs 0)
                            </span>
                          ) : (
                            <span className="font-medium text-amber-800">
                              Agrega {faltanParaBonif} paq. más para +{bonifRegalo} gratis
                            </span>
                          )
                        ) : !esFijo ? (
                          aplicaMayorista ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                              <Sparkles className="w-3 h-3" />
                              Precio Mayorista activo ({formatearBs(prod.precio_paquete_mayor)}/paq)
                            </span>
                          ) : (
                            <span className="font-medium text-amber-800">
                              Faltan {faltanParaMayorista} paq. para precio Mayorista
                            </span>
                          )
                        ) : null}
                      </div>
                    )}

                    {/* Control único amplio y cómodo según el modo activo (Paquetes por defecto o Botellas) */}
                    <div className="mt-3 pt-3 border-t border-stone-200/70 dark:border-white/[0.08]">
                      {modoUnidad === 'paquetes' ? (
                        <div className="flex items-center justify-between gap-3 bg-white dark:bg-[#11141B] border border-stone-200/70 dark:border-white/[0.08] rounded-xl px-3.5 py-2">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs sm:text-sm font-bold text-stone-800 dark:text-slate-100">
                                Paquetes
                              </span>
                              <span className="text-[11px] text-stone-400 dark:text-slate-400">
                                (x{unidPorPaq} bot.)
                              </span>
                            </div>
                            {cantActual.sueltas > 0 && (
                              <button
                                type="button"
                                onClick={() => setModoUnidad('sueltas')}
                                className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline mt-0.5 block cursor-pointer"
                              >
                                +{cantActual.sueltas} bot. suelta
                                {cantActual.sueltas === 1 ? '' : 's'} en pedido
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                actualizarCantidad(
                                  prod.id,
                                  'paquetes',
                                  cantActual.paquetes - 1
                                )
                              }
                              className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-white/[0.08] hover:bg-stone-200 dark:hover:bg-white/[0.15] flex items-center justify-center text-stone-700 dark:text-slate-200 active:scale-95 transition cursor-pointer"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={cantActual.paquetes || ''}
                              placeholder="0"
                              onChange={(e) =>
                                actualizarCantidad(
                                  prod.id,
                                  'paquetes',
                                  e.target.value
                                )
                              }
                              className="w-11 h-9 text-center bg-transparent text-sm sm:text-base font-extrabold text-stone-900 dark:text-white tabular-nums focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                actualizarCantidad(
                                  prod.id,
                                  'paquetes',
                                  cantActual.paquetes + 1
                                )
                              }
                              className="w-9 h-9 rounded-xl bg-stone-900 dark:bg-amber-500 hover:bg-stone-800 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center active:scale-95 transition cursor-pointer"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3 bg-white dark:bg-[#11141B] border border-stone-200/70 dark:border-white/[0.08] rounded-xl px-3.5 py-2">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs sm:text-sm font-bold text-stone-800 dark:text-slate-100">
                                Botellas sueltas
                              </span>
                              <span className="text-[11px] text-stone-400 dark:text-slate-400">
                                ({formatearBs(prod.precio_unidad)} c/u)
                              </span>
                            </div>
                            {cantActual.paquetes > 0 && (
                              <button
                                type="button"
                                onClick={() => setModoUnidad('paquetes')}
                                className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline mt-0.5 block cursor-pointer"
                              >
                                +{cantActual.paquetes} paq. en pedido
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                actualizarCantidad(
                                  prod.id,
                                  'sueltas',
                                  cantActual.sueltas - 1
                                )
                              }
                              className="w-9 h-9 rounded-xl bg-stone-100 dark:bg-white/[0.08] hover:bg-stone-200 dark:hover:bg-white/[0.15] flex items-center justify-center text-stone-700 dark:text-slate-200 active:scale-95 transition cursor-pointer"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={cantActual.sueltas || ''}
                              placeholder="0"
                              onChange={(e) =>
                                actualizarCantidad(
                                  prod.id,
                                  'sueltas',
                                  e.target.value
                                )
                              }
                              className="w-11 h-9 text-center bg-transparent text-sm sm:text-base font-extrabold text-stone-900 dark:text-white tabular-nums focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                actualizarCantidad(
                                  prod.id,
                                  'sueltas',
                                  cantActual.sueltas + 1
                                )
                              }
                              className="w-9 h-9 rounded-xl bg-stone-900 dark:bg-amber-500 hover:bg-stone-800 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center active:scale-95 transition cursor-pointer"
                            >
                              <Plus className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA (4 cols en Desktop): Panel Lateral Fijo del Carrito */}
        <div className="hidden lg:block lg:col-span-4 sticky top-20">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.06] shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 dark:bg-[#11141B] text-white flex items-center justify-between border-b dark:border-white/10">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold">
                  Tu Pedido ({resumenCarrito.cantidadLineas})
                </span>
              </div>
              {resumenCarrito.cantidadLineas > 0 && (
                <button
                  type="button"
                  onClick={limpiarCarrito}
                  className="text-[11px] text-slate-300 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vaciar</span>
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {errorPedido && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorPedido}</span>
                </div>
              )}

              {resumenCarrito.detalles.length === 0 ? (
                <div className="py-10 text-center space-y-2 text-slate-400">
                  <ShoppingBag className="w-8 h-8 mx-auto opacity-40" />
                  <p className="text-xs font-medium">
                    Toca el botón <strong>+</strong> en cualquier bebida para
                    armar el pedido del cliente.
                  </p>
                </div>
              ) : (
                <>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-white/10 pr-1">
                    {resumenCarrito.detalles.map((item) => {
                      const esBonificacion =
                        item.tipo_venta === 'bono_promocion'
                      const esSurtido = item.tipo_venta === 'paquete_surtido'

                      if (esBonificacion) {
                        return (
                          <div
                            key={item.id_linea}
                            className="py-2 pl-3 flex items-center justify-between gap-2 text-xs bg-amber-50/60 dark:bg-amber-500/10 rounded-lg my-0.5 pr-2"
                          >
                            <span className="font-semibold text-amber-800 dark:text-amber-300">
                              + {item.cantidad} Paq. Gratis ({item.producto_nombre})
                            </span>
                            <span className="font-extrabold text-amber-800 dark:text-amber-300 shrink-0">
                              Bs 0
                            </span>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={item.id_linea}
                          className="py-2.5 flex items-start justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                              <span className="truncate">
                                {item.producto_nombre}
                              </span>
                              {esSurtido && item.grupo_surtido && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGrupoSurtidoModal(item.grupo_surtido)
                                  }
                                  className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 hover:underline shrink-0 cursor-pointer"
                                >
                                  (Editar)
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1 mt-0.5">
                              <span>
                                {item.cantidad}{' '}
                                {item.tipo_venta === 'paquete'
                                  ? `Paq. (x${item.unidades_por_paquete})`
                                  : esSurtido
                                  ? `bot. surtidas`
                                  : 'Bot. suelta'}
                              </span>
                              <span>·</span>
                              <span>{formatearBs(item.precio_aplicado)} c/u</span>
                              {item.es_mayorista && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">
                                  Mayorista
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                              {formatearBs(item.subtotal)}
                            </span>
                            <button
                              type="button"
                              onClick={() => quitarLineaDelCarrito(item)}
                              title="Quitar del pedido"
                              className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Ahorro por escala mayorista */}
                  {resumenCarrito.ahorroMayoristaBs > 0 && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
                      <span>Ahorro Mayorista:</span>
                      <span>-{formatearBs(resumenCarrito.ahorroMayoristaBs)}</span>
                    </div>
                  )}

                  {/* Total General */}
                  <div className="p-4 rounded-xl bg-slate-900 dark:bg-[#11141B] border dark:border-white/10 text-white flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                        Total del Pedido
                      </div>
                      <div className="text-xs text-slate-300 mt-0.5">
                        {resumenCarrito.totalPaquetes} paq
                        {resumenCarrito.totalPaquetesGratis > 0
                          ? ` (+${resumenCarrito.totalPaquetesGratis} gratis)`
                          : ''}{' '}
                        + {resumenCarrito.totalBotellasSueltas} sueltas
                      </div>
                    </div>
                    <div className="text-xl font-extrabold text-amber-400 tabular-nums">
                      {formatearBs(resumenCarrito.totalBs)}
                    </div>
                  </div>

                  {/* Dos botones de acción final súper claros */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      disabled={procesandoPedido}
                      onClick={() => guardarOperacion('preventa')}
                      className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                      <span>
                        {procesandoPedido
                          ? 'Enviando Pedido...'
                          : 'Confirmar Pedido (Entrega Mañana)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={procesandoPedido}
                      onClick={() => guardarOperacion('cotizacion')}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                    >
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span>Guardar Cotización (PDF / WhatsApp)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= BARRA FLOTANTE Y BOTTOM SHEET EN MÓVIL (lg:hidden) ================= */}
      {resumenCarrito.cantidadLineas > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 px-3 pb-2">
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-xl border border-slate-700 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCarritoMovilAbierto(true)}
              className="flex items-center gap-2.5 text-left min-w-0"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs flex items-center justify-center shrink-0">
                {resumenCarrito.cantidadLineas}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-1">
                  <span>Ver Carrito</span>
                  <ChevronUp className="w-3.5 h-3.5" />
                </div>
                <div className="text-sm font-extrabold text-white truncate">
                  {formatearBs(resumenCarrito.totalBs)}
                </div>
              </div>
            </button>

            <button
              type="button"
              disabled={procesandoPedido}
              onClick={() => setCarritoMovilAbierto(true)}
              className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs shrink-0"
            >
              Finalizar Pedido →
            </button>
          </div>
        </div>
      )}

      {carritoMovilAbierto && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end">
          <div className="bg-white dark:bg-[#161922] w-full rounded-t-3xl border-t border-slate-200 dark:border-white/10 p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Tu Pedido ({resumenCarrito.cantidadLineas})
                </h3>
                <p className="text-xs text-slate-500">
                  Cliente: {clienteSeleccionado?.nombre || 'Sin seleccionar'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {resumenCarrito.cantidadLineas > 0 && (
                  <button
                    type="button"
                    onClick={limpiarCarrito}
                    className="text-xs text-slate-400 hover:text-red-500 px-2 py-1"
                  >
                    Vaciar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCarritoMovilAbierto(false)}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/10 max-h-60 overflow-y-auto">
              {resumenCarrito.detalles.map((item) => {
                if (item.tipo_venta === 'bono_promocion') {
                  return (
                    <div
                      key={item.id_linea}
                      className="py-2 pl-2 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300 font-semibold"
                    >
                      <span>
                        + {item.cantidad} Paq. Gratis ({item.producto_nombre})
                      </span>
                      <span className="font-extrabold">Bs 0</span>
                    </div>
                  )
                }

                return (
                  <div
                    key={item.id_linea}
                    className="py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {item.producto_nombre}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.cantidad}{' '}
                        {item.tipo_venta === 'paquete'
                          ? `Paq. x${item.unidades_por_paquete}`
                          : item.tipo_venta === 'paquete_surtido'
                          ? `bot. surtidas`
                          : 'Bot. suelta'}{' '}
                        · {formatearBs(item.precio_aplicado)} c/u
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
                        {formatearBs(item.subtotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() => quitarLineaDelCarrito(item)}
                        className="p-1 rounded-md text-slate-400 hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {resumenCarrito.ahorroMayoristaBs > 0 && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
                <span>Ahorro Mayorista:</span>
                <span>-{formatearBs(resumenCarrito.ahorroMayoristaBs)}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-900 dark:bg-[#11141B] text-white flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">TOTAL:</span>
              <span className="text-lg font-extrabold text-amber-400 tabular-nums">
                {formatearBs(resumenCarrito.totalBs)}
              </span>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                disabled={procesandoPedido}
                onClick={() => guardarOperacion('preventa')}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar Pedido (Entrega Mañana)</span>
              </button>

              <button
                type="button"
                disabled={procesandoPedido}
                onClick={() => guardarOperacion('cotizacion')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                <span>Guardar Cotización (PDF / WhatsApp)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE COMPROBANTE LISTO (PDF + WHATSAPP) ================= */}
      {pedidoCompletado && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-5 bg-slate-900 text-white text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
              </div>
              <h3 className="text-base font-extrabold">
                {pedidoCompletado.esCotizacion
                  ? '¡Cotización Generada!'
                  : '¡Preventa Registrada con Éxito!'}
              </h3>
              <p className="text-xs text-slate-300">
                Folio:{' '}
                <strong className="text-amber-400">
                  {pedidoCompletado.venta?.codigo_local}
                </strong>{' '}
                ·{' '}
                {pedidoCompletado.modo === 'online'
                  ? 'Sincronizado en Supabase'
                  : 'Guardado en Dexie (Cola Offline)'}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tienda / Cliente:</span>
                  <span className="font-bold text-slate-900">
                    {pedidoCompletado.cliente?.nombre}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Estado:</span>
                  <span className="font-bold text-amber-700">
                    {pedidoCompletado.esCotizacion
                      ? 'Cotización'
                      : 'Pendiente de Entrega (Día 2)'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/70 text-sm">
                  <span className="font-bold text-slate-800">Total:</span>
                  <span className="font-extrabold text-slate-900">
                    {formatearBs(pedidoCompletado.venta?.total)}
                  </span>
                </div>
              </div>

              {/* Las 2 opciones inmediatas solicitadas */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() =>
                    generarYCompartirPDF(
                      pedidoCompletado.venta,
                      pedidoCompletado.cliente,
                      pedidoCompletado.detalles,
                      pedidoCompletado.vendedorNombre,
                      true
                    )
                  }
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <Download className="w-4 h-4" />
                  <span>Descargar / Compartir Archivo PDF</span>
                </button>

                <a
                  href={generarUrlWhatsAppPedido(
                    pedidoCompletado.venta,
                    pedidoCompletado.cliente,
                    pedidoCompletado.detalles,
                    pedidoCompletado.vendedorNombre
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition no-underline"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Enviar Resumen por WhatsApp al Cliente</span>
                </a>
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPedidoCompletado(null)
                    navigate('/mis-pedidos')
                  }}
                  className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Ver Mis Pedidos del Día
                </button>
                <button
                  type="button"
                  onClick={() => setPedidoCompletado(null)}
                  className="flex-1 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 text-xs font-bold cursor-pointer"
                >
                  Nueva Preventa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL RÁPIDO "+ NUEVO CLIENTE" EN RUTA ================= */}
      {modalNuevaTienda && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold">
                  + Nuevo Cliente
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalNuevaTienda(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={guardarNuevaTiendaEnRuta} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre del Cliente *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Don Mario Quispe"
                  value={nuevaTiendaForm.nombre}
                  onChange={(e) =>
                    setNuevaTiendaForm({ ...nuevaTiendaForm, nombre: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="tel"
                    placeholder="70123456"
                    value={nuevaTiendaForm.telefono}
                    onChange={(e) =>
                      setNuevaTiendaForm({
                        ...nuevaTiendaForm,
                        telefono: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dirección / Ref.
                  </label>
                  <input
                    type="text"
                    placeholder="Av. Principal #10"
                    value={nuevaTiendaForm.direccion}
                    onChange={(e) =>
                      setNuevaTiendaForm({
                        ...nuevaTiendaForm,
                        direccion: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={capturarGpsRapidoTienda}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Crosshair
                  className={`w-4 h-4 text-amber-600 ${
                    capturandoGpsTienda ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {nuevaTiendaForm.latitud
                    ? `GPS Capturado (${nuevaTiendaForm.latitud}, ${nuevaTiendaForm.longitud})`
                    : '📍 Capturar Ubicación GPS Actual'}
                </span>
              </button>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalNuevaTienda(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoTienda}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-amber-400 text-xs font-bold cursor-pointer"
                >
                  {guardandoTienda ? 'Guardando...' : 'Guardar y Seleccionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL ARMAR PAQUETE SURTIDO POR SABORES ================= */}
      <ModalSurtidoSabores
        abierto={Boolean(grupoSurtidoModal)}
        onClose={() => setGrupoSurtidoModal(null)}
        grupoSurtido={grupoSurtidoModal}
        productos={productos}
        stockCentralMap={null}
        paquetesCerradosEnCarrito={
          grupoSurtidoModal
            ? productos
                .filter((p) => obtenerGrupoSurtido(p) === grupoSurtidoModal)
                .reduce(
                  (acc, p) =>
                    acc + (Number(cantidadesPorProducto[p.id]?.paquetes) || 0),
                  0
                )
            : 0
        }
        surtidoExistente={
          grupoSurtidoModal ? paquetesSurtidos[grupoSurtidoModal] : null
        }
        onGuardarSurtido={guardarSurtidoGrupo}
        onEliminarSurtido={eliminarSurtidoGrupo}
      />
    </div>
  )
}
