import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw,
  FileText,
  MessageCircle,
  Download,
  Share2,
  Plus,
  CloudOff,
  CheckCircle2,
  Clock,
  Search,
  Calendar,
  ShoppingBag,
  Truck,
  Banknote,
  QrCode,
  CreditCard,
  Split,
  Wallet,
  ShieldCheck,
  AlertTriangle,
  Printer,
  X,
} from 'lucide-react'
import {
  supabase,
  obtenerIdsPreventasEnCustodiaActiva,
  enriquecerVentasConCustodiaRuta,
  registrarCobroPreventistaEnCliente,
} from '../lib/supabase'
import { offlineDb, useOfflineSync } from '../lib/offlineDb'
import {
  generarYCompartirPDF,
  generarUrlWhatsAppPedido,
  generarPDFRendicionPreventista,
} from '../utils/pdfGenerator'
import { useRole } from '../context/RoleContext'
import PaginationBar from '../components/PaginationBar'

const TAMANO_PAGINA_PEDIDOS = 16

export default function MisPedidosPage() {
  const navigate = useNavigate()
  const { rolActual, usuarioActual, isOnline } = useRole()
  const { pendientesCount, sincronizando, sincronizarAhora } = useOfflineSync()

  const [pedidosRemotos, setPedidosRemotos] = useState([])
  const [pedidosRutaActiva, setPedidosRutaActiva] = useState([])
  const [pedidosOffline, setPedidosOffline] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mensajeSync, setMensajeSync] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Filtros + Etapa de Ruta
  // 'RUTA_HOY' muestra los pedidos de hoy MÁS cualquier pedido de días anteriores que siga pendiente en camión o por rendir al dueño
  const [filtroFecha, setFiltroFecha] = useState('RUTA_HOY') // 'RUTA_HOY' | 'TODOS'
  const [filtroEtapa, setFiltroEtapa] = useState('TODOS') // 'TODOS' | 'pendiente_alistar' | 'entregado_preventista' | 'cobrado_preventista' | 'rendido_dueno'
  const [busqueda, setBusqueda] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalServidor, setTotalServidor] = useState(0)

  // Modal: Entregar al Cliente y Cobrar (Etapa 2 -> Etapa 3)
  const [pedidoCobrar, setPedidoCobrar] = useState(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [inputEfectivo, setInputEfectivo] = useState('')
  const [inputQr, setInputQr] = useState('')
  const [guardandoCobro, setGuardandoCobro] = useState(false)
  const [errorCobro, setErrorCobro] = useState('')

  const selectColumnasPedido = `
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
    clientes (id, nombre, telefono, direccion),
    perfiles:vendedor_id (id, nombre, rol),
    venta_detalles (
      id,
      producto_id,
      tipo_venta,
      cantidad,
      unidades_totales_descontar,
      precio_aplicado,
      subtotal,
      nota_surtido,
      productos (id, nombre, marca, sabor, unidades_por_paquete)
    )
  `

  const cargarPedidos = useCallback(async () => {
    setCargando(true)
    setErrorMsg('')
    try {
      // 1. Cola local en Dexie
      const pendientesLocal = await offlineDb.pedidos_pendientes.toArray()
      setPedidosOffline(pendientesLocal)

      if (navigator.onLine) {
        const esPrevAutenticado =
          rolActual === 'preventista' &&
          usuarioActual?.id &&
          !String(usuarioActual.id).startsWith('local-')

        // 2. Cargar siempre los pedidos en custodia activa (`entregado_preventista` y `cobrado_preventista`)
        //    para que los pedidos hechos ayer y entregados hoy aparezcan siempre al frente.
        const { todosActivosIds } = await obtenerIdsPreventasEnCustodiaActiva(
          true
        )

        let queryActivos = Promise.resolve({ data: [], error: null })
        if (todosActivosIds.length > 0) {
          let qAct = supabase
            .from('ventas')
            .select(selectColumnasPedido)
            .in('id', todosActivosIds.slice(0, 120))
          if (esPrevAutenticado) {
            qAct = qAct.eq('vendedor_id', usuarioActual.id)
          }
          queryActivos = qAct
        }

        // También incluir pedidos `pendiente_entrega` de días previos cuando está en RUTA_HOY
        let queryPendientesPrevios = Promise.resolve({ data: [], error: null })
        if (filtroFecha === 'RUTA_HOY') {
          let qPend = supabase
            .from('ventas')
            .select(selectColumnasPedido)
            .eq('tipo', 'preventa')
            .eq('estado', 'pendiente_entrega')
            .order('fecha_pedido', { ascending: false })
            .limit(50)
          if (esPrevAutenticado) {
            qPend = qPend.eq('vendedor_id', usuarioActual.id)
          }
          queryPendientesPrevios = qPend
        }

        // 3. Consulta principal paginada en servidor
        const desde = (paginaActual - 1) * TAMANO_PAGINA_PEDIDOS
        const hasta = desde + TAMANO_PAGINA_PEDIDOS - 1

        let query = supabase
          .from('ventas')
          .select(selectColumnasPedido, { count: 'exact' })
          .in('tipo', ['preventa', 'cotizacion'])
          .order('fecha_pedido', { ascending: false })

        if (filtroFecha === 'RUTA_HOY') {
          const inicioHoy = new Date()
          inicioHoy.setHours(0, 0, 0, 0)
          query = query.gte('fecha_pedido', inicioHoy.toISOString())
        }

        if (esPrevAutenticado) {
          query = query.eq('vendedor_id', usuarioActual.id)
        }

        const qLimpia = busqueda.trim()
        if (!qLimpia && filtroEtapa === 'TODOS') {
          query = query.range(desde, hasta)
        } else {
          query = query.limit(80)
        }

        const [resMain, resAct, resPend] = await Promise.all([
          query,
          queryActivos,
          queryPendientesPrevios,
        ])

        const activosEnriquecidos = await enriquecerVentasConCustodiaRuta(
          [...(resAct.data || []), ...(resPend.data || [])],
          false
        )
        const principalesEnriquecidos = await enriquecerVentasConCustodiaRuta(
          resMain.data || [],
          false
        )

        // Deduplicar activos en ruta
        const mapaRuta = new Map()
        activosEnriquecidos.forEach((v) => {
          if (v?.id && !mapaRuta.has(v.id)) {
            mapaRuta.set(v.id, v)
          }
        })
        setPedidosRutaActiva(Array.from(mapaRuta.values()))

        if (!resMain.error) {
          setPedidosRemotos(principalesEnriquecidos)
          setTotalServidor(
            typeof resMain.count === 'number'
              ? resMain.count
              : principalesEnriquecidos.length
          )
        }
      }
    } catch (err) {
      console.warn('Error cargando mis pedidos:', err)
      setErrorMsg('No se pudieron actualizar algunos pedidos.')
    } finally {
      setCargando(false)
    }
  }, [
    rolActual,
    usuarioActual?.id,
    paginaActual,
    filtroFecha,
    filtroEtapa,
    busqueda,
    selectColumnasPedido,
  ])

  useEffect(() => {
    cargarPedidos()
  }, [cargarPedidos, pendientesCount])

  const handleSincronizarManual = async () => {
    const res = await sincronizarAhora()
    await cargarPedidos()
    if (res?.sincronizados > 0) {
      setMensajeSync(
        `¡${res.sincronizados} pedido(s) sincronizados con éxito en Supabase!`
      )
      setTimeout(() => setMensajeSync(''), 4500)
    }
  }

  // Resumen en tiempo real de lo que el Preventista tiene en camión y dinero en mano para el Dueño
  const arqueoPreventista = useMemo(() => {
    const mapaUnicos = new Map()
    ;[...pedidosRutaActiva, ...pedidosRemotos].forEach((p) => {
      if (p?.id && !mapaUnicos.has(p.id)) {
        mapaUnicos.set(p.id, p)
      }
    })

    const enCamion = []
    const porRendir = []
    let pendienteTiendaCount = 0

    mapaUnicos.forEach((p) => {
      if (p.etapa_ruta === 'pendiente_alistar') {
        pendienteTiendaCount += 1
      } else if (p.etapa_ruta === 'entregado_preventista') {
        enCamion.push(p)
      } else if (p.etapa_ruta === 'cobrado_preventista') {
        porRendir.push(p)
      }
    })

    const enCamionBs = enCamion.reduce(
      (acc, p) => acc + (Number(p.total) || 0),
      0
    )
    const efectivoPorEntregarDueno = porRendir.reduce(
      (acc, p) => acc + (Number(p.monto_efectivo) || 0),
      0
    )
    const qrCobradoRuta = porRendir.reduce(
      (acc, p) => acc + (Number(p.monto_qr) || 0),
      0
    )
    const creditoDejadoRuta = porRendir.reduce(
      (acc, p) => acc + (Number(p.saldo_credito) || 0),
      0
    )

    return {
      pendienteTiendaCount,
      enCamion,
      enCamionCount: enCamion.length,
      enCamionBs,
      porRendir,
      porRendirCount: porRendir.length,
      efectivoPorEntregarDueno,
      qrCobradoRuta,
      totalPorRendirDueno: efectivoPorEntregarDueno + qrCobradoRuta,
      creditoDejadoRuta,
    }
  }, [pedidosRutaActiva, pedidosRemotos])

  // Unificar pedidos offline (Dexie) + ruta activa + remotos sin duplicar
  const listaUnificada = useMemo(() => {
    const mapeadosOffline = pedidosOffline.map((item) => ({
      id: `dexie-${item.local_id}`,
      codigo_local: item.codigo_local,
      tipo: item.cabecera?.tipo || 'preventa',
      estado: item.cabecera?.estado || 'pendiente_entrega',
      etapa_ruta:
        item.cabecera?.tipo === 'cotizacion'
          ? 'cotizacion'
          : 'pendiente_alistar',
      total: item.cabecera?.total || 0,
      fecha_pedido: item.cabecera?.fecha_pedido || item.fecha_creacion,
      clientes: item.cliente_snapshot || { nombre: 'Cliente en Ruta' },
      perfiles: { nombre: item.vendedor_nombre || usuarioActual?.nombre },
      venta_detalles: item.detalles || [],
      esOffline: true,
    }))

    const codigosVistos = new Set(mapeadosOffline.map((o) => o.codigo_local))
    const idsVistos = new Set()
    const combinadosRemotos = []

    const agregarSiNuevo = (item) => {
      if (!item) return
      if (item.id && idsVistos.has(item.id)) return
      if (item.codigo_local && codigosVistos.has(item.codigo_local)) return
      if (item.id) idsVistos.add(item.id)
      if (item.codigo_local) codigosVistos.add(item.codigo_local)
      combinadosRemotos.push(item)
    }

    if (filtroFecha === 'RUTA_HOY' || filtroEtapa !== 'TODOS') {
      pedidosRutaActiva.forEach(agregarSiNuevo)
    }
    pedidosRemotos.forEach(agregarSiNuevo)

    // Ordenar poniendo primero los pedidos que requieren acción del preventista (En Camión -> Por Rendir -> Pendientes -> Liquidados)
    const pesoEtapa = {
      entregado_preventista: 1,
      cobrado_preventista: 2,
      pendiente_alistar: 3,
      rendido_dueno: 4,
      cotizacion: 5,
    }

    combinadosRemotos.sort((a, b) => {
      if (filtroFecha === 'RUTA_HOY') {
        const pa = pesoEtapa[a.etapa_ruta] || 9
        const pb = pesoEtapa[b.etapa_ruta] || 9
        if (pa !== pb) return pa - pb
      }
      return (
        new Date(b.fecha_entrega || b.fecha_pedido || 0).getTime() -
        new Date(a.fecha_entrega || a.fecha_pedido || 0).getTime()
      )
    })

    return [...mapeadosOffline, ...combinadosRemotos]
  }, [
    pedidosOffline,
    pedidosRutaActiva,
    pedidosRemotos,
    usuarioActual?.nombre,
    filtroFecha,
    filtroEtapa,
  ])

  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()

    return listaUnificada.filter((ped) => {
      if (filtroEtapa !== 'TODOS' && ped.etapa_ruta !== filtroEtapa) {
        return false
      }
      if (!q) return true
      const coincideCodigo = ped.codigo_local?.toLowerCase().includes(q)
      const coincideCliente = ped.clientes?.nombre?.toLowerCase().includes(q)
      return coincideCodigo || coincideCliente
    })
  }, [listaUnificada, filtroEtapa, busqueda])

  // ================= MODAL: ENTREGAR AL CLIENTE Y COBRAR =================
  const abrirModalCobroCliente = (ped) => {
    setPedidoCobrar(ped)
    setMetodoPago('efectivo')
    setInputEfectivo(String(Number(ped.total) || 0))
    setInputQr('0')
    setErrorCobro('')
  }

  const seleccionarMetodoPago = (metodo) => {
    setMetodoPago(metodo)
    const totalPed = Number(pedidoCobrar?.total) || 0
    if (metodo === 'efectivo') {
      setInputEfectivo(String(totalPed))
      setInputQr('0')
    } else if (metodo === 'qr') {
      setInputEfectivo('0')
      setInputQr(String(totalPed))
    } else if (metodo === 'credito') {
      setInputEfectivo('0')
      setInputQr('0')
    } else if (metodo === 'mixto') {
      const mitad = Math.floor(totalPed / 2)
      setInputEfectivo(String(mitad))
      setInputQr(String(Number((totalPed - mitad).toFixed(2))))
    }
  }

  const totalCobrar = Number(pedidoCobrar?.total) || 0
  const efecNum = Math.max(0, parseFloat(inputEfectivo) || 0)
  const qrNum = Math.max(0, parseFloat(inputQr) || 0)
  const sumaPagada = Number((efecNum + qrNum).toFixed(2))
  const creditoCalc = Math.max(0, Number((totalCobrar - sumaPagada).toFixed(2)))
  const excedeTotal = sumaPagada > totalCobrar + 0.01

  const confirmarCobroAlCliente = async (e) => {
    e.preventDefault()
    if (!pedidoCobrar) return
    if (excedeTotal) {
      setErrorCobro('El monto cobrado no puede superar el total del pedido.')
      return
    }

    setGuardandoCobro(true)
    setErrorCobro('')
    try {
      const actualizado = await registrarCobroPreventistaEnCliente({
        pedido: pedidoCobrar,
        montoEfectivo: efecNum,
        montoQr: qrNum,
        saldoCredito: creditoCalc,
        usuarioCobrador: usuarioActual || {
          id: pedidoCobrar.vendedor_id,
          nombre: pedidoCobrar.perfiles?.nombre || 'Preventista',
        },
      })

      const clienteRef = pedidoCobrar.clientes
      const detallesRef = pedidoCobrar.venta_detalles
      const vendedorNom =
        pedidoCobrar.perfiles?.nombre || usuarioActual?.nombre || 'Preventista'

      setPedidoCobrar(null)
      setMensajeSync(
        `¡Pedido entregado y cobrado en ${
          clienteRef?.nombre || 'tienda'
        }! Recuerda entregar ${formatearBs(efecNum)} en efectivo al Dueño.`
      )
      await cargarPedidos()

      await generarYCompartirPDF(
        actualizado,
        clienteRef,
        detallesRef,
        vendedorNom,
        true
      )

      setTimeout(() => setMensajeSync(''), 6000)
    } catch (err) {
      setErrorCobro(err.message || 'No se pudo guardar el cobro del pedido.')
    } finally {
      setGuardandoCobro(false)
    }
  }

  const formatearBs = (n) => {
    const val = Number(n) || 0
    return `Bs ${val.toLocaleString('es-BO', {
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`
  }

  const formatearFechaHora = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.toLocaleDateString('es-BO', {
      day: '2-digit',
      month: 'short',
    })} · ${d.toLocaleTimeString('es-BO', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }

  return (
    <div className="space-y-5 pb-14">
      {/* ================= CABECERA MINIMALISTA ================= */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Mis Pedidos y Cobros
            </h1>
            <span className="text-xs font-medium text-slate-400 tabular-nums">
              {pedidosFiltrados.length} en vista
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={cargarPedidos}
              title="Actualizar listado"
              className="h-9 px-3 rounded-xl bg-white dark:bg-[#161922] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
              <span>Actualizar</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/preventa')}
              className="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Plus size={15} className="stroke-[2.5]" />
              <span>Nueva Preventa</span>
            </button>
          </div>
        </div>

        {/* ================= ARQUEO DE RUTA EN VIVO (CARGA EN CAMIÓN + DINERO PARA EL DUEÑO) ================= */}
        {(arqueoPreventista.enCamionCount > 0 ||
          arqueoPreventista.porRendirCount > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Tarjeta 1: Mercadería recibida de Tienda lista para entregar y cobrar */}
            <div
              onClick={() =>
                setFiltroEtapa((prev) =>
                  prev === 'entregado_preventista'
                    ? 'TODOS'
                    : 'entregado_preventista'
                )
              }
              className={`rounded-2xl p-4 border transition cursor-pointer ${
                filtroEtapa === 'entregado_preventista'
                  ? 'bg-sky-50 dark:bg-sky-500/15 border-sky-500'
                  : 'bg-white dark:bg-[#161922] border-sky-200 dark:border-sky-500/30 hover:border-sky-400'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sky-700 dark:text-sky-400 inline-flex items-center gap-1.5">
                  <Truck size={15} />
                  <span>2. En mi Camión (Por Entregar y Cobrar)</span>
                </span>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 tabular-nums">
                  {arqueoPreventista.enCamionCount}{' '}
                  {arqueoPreventista.enCamionCount === 1 ? 'tienda' : 'tiendas'}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2 tabular-nums">
                <div className="text-xl font-black text-slate-900 dark:text-white">
                  {formatearBs(arqueoPreventista.enCamionBs)}
                </div>
                <span className="text-[11px] text-slate-400">
                  Toca &ldquo;Entregar y Cobrar&rdquo; en cada tienda
                </span>
              </div>
            </div>

            {/* Tarjeta 2: Dinero ya cobrado pendiente de entregar al Dueño */}
            <div
              onClick={() =>
                setFiltroEtapa((prev) =>
                  prev === 'cobrado_preventista'
                    ? 'TODOS'
                    : 'cobrado_preventista'
                )
              }
              className={`rounded-2xl p-4 border transition cursor-pointer ${
                filtroEtapa === 'cobrado_preventista'
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-500'
                  : 'bg-white dark:bg-[#161922] border-emerald-300/80 dark:border-emerald-500/30 hover:border-emerald-400'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
                  <Wallet size={15} />
                  <span>3. Dinero Cobrado · Entregar al Dueño</span>
                </span>
                {arqueoPreventista.porRendirCount > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      generarPDFRendicionPreventista({
                        preventistaNombre:
                          usuarioActual?.nombre || 'Preventista',
                        pedidos: arqueoPreventista.porRendir,
                        yaRendido: false,
                      })
                    }}
                    className="h-6.5 px-2 rounded-md bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Printer size={11} />
                    <span>Hoja PDF</span>
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 tabular-nums">
                <div className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                  Efectivo: {formatearBs(arqueoPreventista.efectivoPorEntregarDueno)}
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-300">
                  + QR: {formatearBs(arqueoPreventista.qrCobradoRuta)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Cola Offline Dexie */}
        {pedidosOffline.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-amber-950 dark:text-amber-200">
              <CloudOff size={16} className="text-amber-600 shrink-0" />
              <span>
                <strong>
                  {pedidosOffline.length} pedido(s) en cola local (Offline):
                </strong>{' '}
                {isOnline
                  ? 'Pulsa Sincronizar Ahora para subirlos a Tienda Central.'
                  : 'Se subirán automáticamente al recuperar señal.'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSincronizarManual}
              disabled={!isOnline || sincronizando}
              className="h-8 px-3 rounded-lg bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={sincronizando ? 'animate-spin' : ''}
              />
              <span>
                {sincronizando ? 'Sincronizando...' : 'Sincronizar Ahora'}
              </span>
            </button>
          </div>
        )}

        {mensajeSync && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/12 border border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>{mensajeSync}</span>
            </span>
            <button
              type="button"
              onClick={() => setMensajeSync('')}
              className="cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Buscador + Filtros de Etapa Limpios */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search
              size={15}
              className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPaginaActual(1)
              }}
              placeholder="Buscar tienda o folio..."
              className="w-full h-9 pl-9 pr-4 rounded-xl bg-white dark:bg-[#161922] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Ruta Activa vs Historial */}
            <div className="inline-flex items-center bg-slate-200/70 dark:bg-white/[0.06] p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setFiltroFecha('RUTA_HOY')
                  setPaginaActual(1)
                }}
                className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filtroFecha === 'RUTA_HOY'
                    ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Calendar size={13} />
                <span>Ruta Activa / Hoy</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFiltroFecha('TODOS')
                  setPaginaActual(1)
                }}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition cursor-pointer ${
                  filtroFecha === 'TODOS'
                    ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Historial Completo
              </button>
            </div>

            {/* Filtro de las 4 etapas */}
            <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-white/[0.06] p-0.5 rounded-xl overflow-x-auto max-w-full no-scrollbar">
              {[
                { id: 'TODOS', label: 'Todos' },
                { id: 'pendiente_alistar', label: '1. Pendientes' },
                { id: 'entregado_preventista', label: '2. Por Cobrar' },
                { id: 'cobrado_preventista', label: '3. Rendir Dueño' },
                { id: 'rendido_dueno', label: '4. Liquidados' },
              ].map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => {
                    setFiltroEtapa(op.id)
                    setPaginaActual(1)
                  }}
                  className={`h-8 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    filtroEtapa === op.id
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ================= LISTADO DE PEDIDOS ================= */}
      {cargando ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200 dark:border-white/[0.07] p-5 h-56 animate-pulse"
            />
          ))}
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] p-10 text-center space-y-2.5">
          <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-white/[0.06] text-slate-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="text-sm font-bold text-slate-800 dark:text-white">
            No hay pedidos en esta etapa
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Cambia a <strong>&ldquo;Historial Completo&rdquo;</strong> o pulsa{' '}
            <strong>&ldquo;Todos&rdquo;</strong> para ver pedidos anteriores.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pedidosFiltrados.map((ped) => {
            const etapa = ped.etapa_ruta || 'pendiente_alistar'
            const esCotizacion = etapa === 'cotizacion'
            const clienteObj = ped.clientes || { nombre: 'Tienda / Cliente' }
            const detalles = ped.venta_detalles || []
            const vendedorNombre =
              ped.perfiles?.nombre || usuarioActual?.nombre || 'Preventista'
            const custodia = ped.info_custodia || {}

            const urlWa = generarUrlWhatsAppPedido(
              ped,
              clienteObj,
              detalles,
              vendedorNombre
            )

            return (
              <div
                key={ped.id || ped.codigo_local}
                className={`bg-white dark:bg-[#161922] rounded-2xl border shadow-2xs transition flex flex-col justify-between overflow-hidden ${
                  etapa === 'entregado_preventista'
                    ? 'border-sky-400/70 dark:border-sky-500/40'
                    : etapa === 'cobrado_preventista'
                    ? 'border-emerald-400/70 dark:border-emerald-500/40'
                    : 'border-slate-200/80 dark:border-white/[0.08]'
                }`}
              >
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Cabecera: Folio + Etapa clara */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white/[0.08] text-amber-400">
                        {ped.codigo_local || 'SIN-FOLIO'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {formatearFechaHora(ped.fecha_pedido)}
                      </span>
                    </div>

                    <div>
                      {ped.esOffline ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-500/40 text-[11px] font-extrabold">
                          <CloudOff className="w-3 h-3" />
                          Cola Offline
                        </span>
                      ) : esCotizacion ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 text-[11px] font-bold">
                          <FileText className="w-3 h-3" />
                          Cotización
                        </span>
                      ) : etapa === 'pendiente_alistar' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                          <Clock className="w-3 h-3" />
                          1. Pedido Pendiente en Tienda
                        </span>
                      ) : etapa === 'entregado_preventista' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/30 text-[11px] font-extrabold">
                          <Truck className="w-3 h-3" />
                          2. Entregado a Preventista · Cobrar
                        </span>
                      ) : etapa === 'cobrado_preventista' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-extrabold">
                          <Wallet className="w-3 h-3" />
                          3. Cobrado · Entregar al Dueño
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-[11px] font-bold">
                          <ShieldCheck className="w-3 h-3 text-emerald-500" />
                          4. Dinero Entregado al Dueño
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Tienda / Cliente */}
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {clienteObj.nombre}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {clienteObj.direccion || 'Sin referencia'} ·{' '}
                      {vendedorNombre}
                    </p>
                  </div>

                  {/* Ítems del Pedido */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.06] space-y-1.5 max-h-36 overflow-y-auto tabular-nums">
                    {detalles.map((d, i) => {
                      const prodNombre =
                        d.producto_nombre || d.productos?.nombre || 'Bebida'
                      const unidPaq =
                        d.unidades_por_paquete ||
                        d.productos?.unidades_por_paquete ||
                        6
                      const esBono =
                        d.tipo_venta === 'bono_promocion' ||
                        d.tipo_venta === 'bono_regalo'
                      return (
                        <div
                          key={d.id || i}
                          className={`flex items-center justify-between text-xs ${
                            esBono
                              ? 'text-amber-700 dark:text-amber-400 font-semibold'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className="truncate pr-2">
                            <strong>{d.cantidad}x</strong> {prodNombre} (
                            {d.tipo_venta === 'paquete'
                              ? `Paq. x${unidPaq}`
                              : d.tipo_venta === 'paquete_surtido'
                              ? d.nota_surtido || 'Paq. Surtido'
                              : d.tipo_venta === 'bono_promocion'
                              ? 'Bonif. Gratis'
                              : d.tipo_venta === 'bono_regalo'
                              ? 'Bono Regalo'
                              : 'Bot. Suelta'}
                            )
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white shrink-0">
                            {esBono ? 'Gratis' : formatearBs(d.subtotal)}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Detalle de Custodia / Cobro según Etapa */}
                  {etapa === 'entregado_preventista' && (
                    <div className="px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200/80 dark:border-sky-500/25 text-xs text-sky-900 dark:text-sky-200 flex items-center justify-between gap-2">
                      <span>
                        Carga recibida de{' '}
                        <strong>
                          {custodia.despachado_por_nombre || 'Tienda Central'}
                        </strong>
                      </span>
                      <span className="font-bold">Listo para entregar</span>
                    </div>
                  )}

                  {(etapa === 'cobrado_preventista' ||
                    etapa === 'rendido_dueno') && (
                    <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.07] text-[11px] tabular-nums space-y-0.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700 dark:text-slate-200">
                        <span>
                          Efectivo:{' '}
                          <strong>{formatearBs(ped.monto_efectivo)}</strong> ·
                          QR: <strong>{formatearBs(ped.monto_qr)}</strong>
                        </span>
                        {Number(ped.saldo_credito) > 0 && (
                          <span className="font-bold text-amber-600 dark:text-amber-400">
                            Crédito: {formatearBs(ped.saldo_credito)}
                          </span>
                        )}
                      </div>
                      {etapa === 'cobrado_preventista' ? (
                        <div className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          Entregar {formatearBs(ped.monto_efectivo)} en efectivo
                          al Dueño
                        </div>
                      ) : (
                        custodia.fecha_rendicion && (
                          <div className="text-slate-400">
                            Rendido a{' '}
                            {custodia.recibido_por_nombre || 'Dueño'} (
                            {formatearFechaHora(custodia.fecha_rendicion)})
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Pie de Tarjeta: Total + Botón Principal según Etapa */}
                <div className="px-4 sm:px-5 py-3 bg-slate-50/90 dark:bg-white/[0.02] border-t border-slate-200/80 dark:border-white/[0.07] flex flex-wrap items-center justify-between gap-2">
                  <div className="tabular-nums">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Total Pedido
                    </span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white">
                      {formatearBs(ped.total)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        generarYCompartirPDF(
                          ped,
                          clienteObj,
                          detalles,
                          vendedorNombre,
                          true
                        )
                      }
                      className="h-9 px-3 rounded-xl bg-slate-200/80 dark:bg-white/[0.08] hover:bg-slate-300/70 dark:hover:bg-white/[0.14] text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <Share2 className="w-3 h-3 hidden sm:inline" />
                      <span>PDF</span>
                    </button>

                    <a
                      href={urlWa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-800 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 transition no-underline"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>

                    {/* CTA Principal Paso 3: Entregar al Cliente y Cobrar */}
                    {!ped.esOffline && etapa === 'entregado_preventista' && (
                      <button
                        type="button"
                        onClick={() => abrirModalCobroCliente(ped)}
                        className="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      >
                        <Banknote className="w-4 h-4 stroke-[2.4]" />
                        <span>Entregar y Cobrar</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!cargando &&
        !busqueda.trim() &&
        filtroEtapa === 'TODOS' &&
        totalServidor > TAMANO_PAGINA_PEDIDOS && (
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07]">
            <PaginationBar
              paginaActual={paginaActual}
              totalRegistros={totalServidor}
              tamanoPagina={TAMANO_PAGINA_PEDIDOS}
              onCambiarPagina={setPaginaActual}
              cargando={cargando}
              etiquetaItem="pedidos"
            />
          </div>
        )}

      {/* ================= MODAL: ENTREGAR AL CLIENTE Y COBRAR (PASO 3) ================= */}
      {pedidoCobrar && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Entregar al Cliente y Cobrar
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pedidoCobrar.clientes?.nombre} · {pedidoCobrar.codigo_local}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold text-slate-900 dark:text-amber-400 tabular-nums">
                  {formatearBs(totalCobrar)}
                </span>
                <button
                  type="button"
                  onClick={() => setPedidoCobrar(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={confirmarCobroAlCliente} className="p-5 space-y-4">
              {errorCobro && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorCobro}</span>
                </div>
              )}

              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'efectivo', label: 'Efectivo', Icon: Banknote },
                  { id: 'qr', label: 'QR', Icon: QrCode },
                  { id: 'mixto', label: 'Mixto', Icon: Split },
                  { id: 'credito', label: 'Crédito', Icon: CreditCard },
                ].map(({ id, label, Icon }) => {
                  const activo = metodoPago === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => seleccionarMetodoPago(id)}
                      className={`py-2.5 px-1.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                        activo
                          ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold shadow-2xs'
                          : 'bg-slate-50 dark:bg-[#11141B] text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-white/[0.08]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 tabular-nums">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Efectivo recibido
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                      Bs
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inputEfectivo}
                      onChange={(e) => setInputEfectivo(e.target.value)}
                      className="w-full h-10 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Cobrado por QR
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                      Bs
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={inputQr}
                      onChange={(e) => setInputQr(e.target.value)}
                      className="w-full h-10 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {(excedeTotal || creditoCalc > 0) && (
                <div
                  className={`px-3.5 py-2 rounded-xl border flex items-center justify-between text-xs tabular-nums ${
                    excedeTotal
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-amber-50 dark:bg-amber-500/15 border-amber-200/80 dark:border-amber-500/30 text-amber-900 dark:text-amber-300'
                  }`}
                >
                  {excedeTotal ? (
                    <span className="font-semibold">
                      Supera el total ({formatearBs(totalCobrar)})
                    </span>
                  ) : (
                    <>
                      <span>Queda a crédito en tienda:</span>
                      <span className="font-extrabold">
                        {formatearBs(creditoCalc)}
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-500/10 border border-emerald-200/80 dark:border-emerald-500/25 text-xs text-emerald-900 dark:text-emerald-300 flex items-center justify-between tabular-nums">
                <span>Efectivo a entregar luego al Dueño:</span>
                <strong className="text-sm">{formatearBs(efecNum)}</strong>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPedidoCobrar(null)}
                  className="h-9.5 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCobro || excedeTotal}
                  className="h-9.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {guardandoCobro ? 'Guardando...' : 'Confirmar Entrega y Cobro'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
