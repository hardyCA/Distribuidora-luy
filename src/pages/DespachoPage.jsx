import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Truck,
  Gift,
  CheckCircle2,
  Search,
  Calendar,
  MessageCircle,
  Download,
  X,
  RefreshCw,
  AlertTriangle,
  Banknote,
  QrCode,
  CreditCard,
  Split,
  Trash2,
  MapPin,
  Phone,
  Plus,
  Minus,
  Printer,
  Check,
  ArrowRightLeft,
  PackageCheck,
  Wallet,
  Clock,
  ShieldCheck,
  ArrowLeft,
  ChevronRight,
  Store,
} from 'lucide-react'
import {
  supabase,
  obtenerOCrearPerfilPorRol,
  obtenerIdsPreventasEnCustodiaActiva,
  enriquecerVentasConCustodiaRuta,
  despacharPedidosAPreventista,
  registrarCobroPreventistaEnCliente,
  confirmarRendicionDineroAlDueno,
  cancelarPedidoPreventa,
} from '../lib/supabase'
import { useRole } from '../context/RoleContext'
import { formatearStock } from '../utils/stock'
import BottleVisual from '../components/BottleVisual'
import {
  generarYCompartirPDF,
  generarUrlWhatsAppPedido,
  generarPDFHojaCargaCamion,
  generarPDFRendicionPreventista,
} from '../utils/pdfGenerator'
import PaginationBar from '../components/PaginationBar'

const TAMANO_PAGINA_TIENDAS = 16

const ETAPAS_DESPACHO = [
  {
    id: 'pendiente_alistar',
    corto: '1. Por Cargar',
    badgeClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'entregado_preventista',
    corto: '2. En Ruta',
    badgeClass: 'text-sky-600 dark:text-sky-400',
  },
  {
    id: 'cobrado_preventista',
    corto: '3. Rendir al Dueño',
    badgeClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'rendido_dueno',
    corto: '4. Finalizados',
    badgeClass: 'text-slate-400 dark:text-slate-400',
  },
]

export default function DespachoPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { rolActual, esCuentaAdmin, infoRol, usuarioActual } = useRole()
  const esAdmin = rolActual === 'admin' || esCuentaAdmin
  const puedeTraspasar = rolActual === 'admin' || rolActual === 'almacen' || esCuentaAdmin

  const [pedidos, setPedidos] = useState([])
  const [productos, setProductos] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [stockCentralMap, setStockCentralMap] = useState({})
  const [stockDepositoMap, setStockDepositoMap] = useState({})
  const [cargando, setCargando] = useState(true)
  const [traspasandoProdId, setTraspasandoProdId] = useState(null)
  const [despachandoId, setDespachandoId] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')

  // Filtros + Etapa de Custodia (1..4)
  const etapaUrl = searchParams.get('etapa')
  const [etapaFiltro, setEtapaFiltro] = useState(() =>
    ETAPAS_DESPACHO.some((e) => e.id === etapaUrl)
      ? etapaUrl
      : 'pendiente_alistar'
  )
  const [preventistaSel, setPreventistaSel] = useState(null) // null = Nivel 1 (Tabla de Preventistas) | id = Preventista activo | 'TODOS'
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [paginaTiendas, setPaginaTiendas] = useState(1)

  useEffect(() => {
    if (etapaUrl && ETAPAS_DESPACHO.some((e) => e.id === etapaUrl)) {
      setEtapaFiltro(etapaUrl)
      setPreventistaSel(null)
    }
  }, [etapaUrl])

  const cambiarEtapa = (nuevaEtapa) => {
    setEtapaFiltro(nuevaEtapa)
    setPreventistaSel(null)
    if (searchParams.has('etapa')) {
      setSearchParams({}, { replace: true })
    }
  }

  // Checklist visual en memoria para marcar bebidas ya separadas en tienda
  const [itemsAlistadosCheck, setItemsAlistadosCheck] = useState({})

  // Modal Confirmar Despacho Masivo al Preventista (Etapa 1 -> Etapa 2)
  const [modalDespachoCamion, setModalDespachoCamion] = useState(null)

  // Modal Agregar Bono (Solo Admin en Etapa 1)
  const [pedidoBonoActivo, setPedidoBonoActivo] = useState(null)
  const [busquedaBonoProd, setBusquedaBonoProd] = useState('')
  const [bonoProductoId, setBonoProductoId] = useState('')
  const [bonoFormato, setBonoFormato] = useState('paquete')
  const [bonoCantidad, setBonoCantidad] = useState(1)
  const [guardandoBono, setGuardandoBono] = useState(false)
  const [errorBono, setErrorBono] = useState('')

  // Modal Registrar Cobro al Cliente (Etapa 2 -> Etapa 3)
  const [pedidoLiquidar, setPedidoLiquidar] = useState(null)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [inputEfectivo, setInputEfectivo] = useState('')
  const [inputQr, setInputQr] = useState('')
  const [confirmandoEntrega, setConfirmandoEntrega] = useState(false)
  const [errorLiquidacion, setErrorLiquidacion] = useState('')

  // Modal Confirmar Recepción de Dinero por el Dueño (Etapa 3 -> Etapa 4)
  const [modalRendicionDueno, setModalRendicionDueno] = useState(null)
  const [notaRendicion, setNotaRendicion] = useState('')
  const [guardandoRendicion, setGuardandoRendicion] = useState(false)

  // Modal Confirmar Cancelación de Pedido
  const [pedidoCancelarModal, setPedidoCancelarModal] = useState(null)
  const [cancelandoPedido, setCancelandoPedido] = useState(false)

  const cargarDespacho = useCallback(async () => {
    setCargando(true)
    setErrorMsg('')
    try {
      const selectColumnasDespacho = `
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
          venta_id,
          producto_id,
          tipo_venta,
          cantidad,
          unidades_totales_descontar,
          precio_aplicado,
          subtotal,
          nota_surtido,
          productos (id, nombre, marca, sabor, unidades_por_paquete, imagen_url)
        )
      `

      // 0) Consultar primero IDs que siguen en tránsito (`entregado_preventista` o `cobrado_preventista`)
      //    para que jamás se oculten aunque hayan sido pedidos en días anteriores.
      const { todosActivosIds } = await obtenerIdsPreventasEnCustodiaActiva(true)

      // 1) TODOS los pedidos pendientes de alistar en Tienda
      const queryPendientes = supabase
        .from('ventas')
        .select(selectColumnasDespacho)
        .eq('tipo', 'preventa')
        .eq('estado', 'pendiente_entrega')
        .order('fecha_pedido', { ascending: false })

      // 2) Entregados recientes o de la fecha elegida (ahorro de Egress para Plan Gratuito)
      let queryEntregadas = supabase
        .from('ventas')
        .select(selectColumnasDespacho)
        .eq('tipo', 'preventa')
        .eq('estado', 'entregado')
        .order('fecha_pedido', { ascending: false })

      if (fechaFiltro) {
        queryEntregadas = queryEntregadas
          .gte('fecha_pedido', `${fechaFiltro}T00:00:00`)
          .lte('fecha_pedido', `${fechaFiltro}T23:59:59.999`)
      } else {
        queryEntregadas = queryEntregadas.range(0, 59)
      }

      // 3) Si hay preventas en custodia activa fuera de las últimas 60, traerlas puntualmente
      const queryCustodiaActiva =
        todosActivosIds.length > 0
          ? supabase
              .from('ventas')
              .select(selectColumnasDespacho)
              .in('id', todosActivosIds.slice(0, 150))
          : Promise.resolve({ data: [], error: null })

      const [
        resPend,
        resEnt,
        resActivos,
        resProds,
        resPerfiles,
        resUbic,
        resInv,
      ] = await Promise.all([
        queryPendientes,
        queryEntregadas,
        queryCustodiaActiva,
        supabase
          .from('productos')
          .select('*')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
        supabase
          .from('perfiles')
          .select('id, nombre, rol, activo')
          .order('nombre', { ascending: true }),
        supabase.from('ubicaciones').select('*'),
        supabase.from('inventario').select('*'),
      ])

      if (resPend.error) throw resPend.error
      if (resEnt.error) throw resEnt.error
      if (resProds.error) throw resProds.error

      // Unificar sin duplicados y enriquecer con etapa exacta (1..4)
      const mapaUnicos = new Map()
      ;[
        ...(resPend.data || []),
        ...(resActivos.data || []),
        ...(resEnt.data || []),
      ].forEach((v) => {
        if (v?.id && !mapaUnicos.has(v.id)) {
          mapaUnicos.set(v.id, v)
        }
      })

      const listaOrdenada = Array.from(mapaUnicos.values()).sort(
        (a, b) =>
          new Date(b.fecha_entrega || b.fecha_pedido || 0).getTime() -
          new Date(a.fecha_entrega || a.fecha_pedido || 0).getTime()
      )
      const listaEnriquecida = await enriquecerVentasConCustodiaRuta(
        listaOrdenada,
        false
      )

      const listaProds = resProds.data || []
      setPedidos(listaEnriquecida)
      setProductos(listaProds)
      setPerfiles(resPerfiles.data || [])

      if (listaProds.length > 0 && !bonoProductoId) {
        setBonoProductoId(listaProds[0].id)
      }

      const centralId = resUbic.data?.find((u) => u.tipo === 'central')?.id
      const almacenId = resUbic.data?.find((u) => u.tipo === 'almacen')?.id
      const mapaCen = {}
      const mapaDep = {}
      ;(resInv.data || []).forEach((item) => {
        if (item.ubicacion_id === centralId) {
          mapaCen[item.producto_id] = Number(item.stock_unidades) || 0
        } else if (item.ubicacion_id === almacenId) {
          mapaDep[item.producto_id] = Number(item.stock_unidades) || 0
        }
      })
      setStockCentralMap(mapaCen)
      setStockDepositoMap(mapaDep)
    } catch (err) {
      console.error('Error cargando despacho:', err)
      setErrorMsg(err.message || 'No se pudo cargar despacho.')
    } finally {
      setCargando(false)
    }
  }, [bonoProductoId, fechaFiltro])

  useEffect(() => {
    setPaginaTiendas(1)
  }, [preventistaSel, etapaFiltro, fechaFiltro, busquedaCliente])

  useEffect(() => {
    cargarDespacho()
  }, [cargarDespacho])

  const mapaProductosPorId = useMemo(() => {
    const m = {}
    productos.forEach((p) => {
      m[p.id] = p
    })
    return m
  }, [productos])

  const formatearCantidadesCorto = useCallback(
    (totalBotellas = 0, unidadesPorPaq = 6) => {
      const { paquetes, sueltas, deficit } = formatearStock(
        totalBotellas,
        unidadesPorPaq
      )
      if (deficit > 0) return `-${deficit} Bot`
      if (paquetes === 0 && sueltas === 0) return '0 Bot'
      if (sueltas === 0) return `${paquetes} Paq`
      if (paquetes === 0) return `${sueltas} Bot`
      return `${paquetes} Paq + ${sueltas} Bot`
    },
    []
  )

  const formatearBs = (n) => {
    const val = Number(n) || 0
    return `Bs ${val.toLocaleString('es-BO', {
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`
  }

  const formatearFechaCorta = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.toLocaleDateString('es-BO', {
      day: '2-digit',
      month: 'short',
    })} ${d.toLocaleTimeString('es-BO', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }

  const agruparLineasTienda = useCallback((detalles = []) => {
    const regularesMap = {}
    const especiales = []

    detalles.forEach((d) => {
      const esRegular = d.tipo_venta === 'paquete' || d.tipo_venta === 'unidad'
      if (!esRegular) {
        especiales.push(d)
        return
      }

      const pid = d.producto_id
      if (!regularesMap[pid]) {
        regularesMap[pid] = {
          id: d.id,
          producto_id: pid,
          productos: d.productos,
          esAgrupadoRegular: true,
          paquetes: 0,
          sueltas: 0,
          subtotal: 0,
        }
      }
      if (d.tipo_venta === 'paquete') {
        regularesMap[pid].paquetes += Number(d.cantidad) || 0
      } else {
        regularesMap[pid].sueltas += Number(d.cantidad) || 0
      }
      regularesMap[pid].subtotal += Number(d.subtotal) || 0
    })

    return [...Object.values(regularesMap), ...especiales]
  }, [])

  const coincideFechaFiltro = useCallback(
    (ped) => {
      if (!fechaFiltro) return true
      // Nota: para etapas activas en tránsito sin filtro explícito siempre se ven;
      // si el usuario puso una fecha, comparamos contra fecha_pedido o fecha_entrega.
      const fPed = ped.fecha_pedido
        ? new Date(ped.fecha_pedido).toISOString().slice(0, 10)
        : ''
      const fEnt = ped.fecha_entrega
        ? new Date(ped.fecha_entrega).toISOString().slice(0, 10)
        : ''
      return fPed === fechaFiltro || fEnt === fechaFiltro
    },
    [fechaFiltro]
  )

  // Contadores de las 4 etapas
  const contadoresEtapas = useMemo(() => {
    const c = {
      pendiente_alistar: 0,
      entregado_preventista: 0,
      cobrado_preventista: 0,
      rendido_dueno: 0,
    }
    pedidos.forEach((ped) => {
      if (!coincideFechaFiltro(ped)) return
      const et = ped.etapa_ruta || 'pendiente_alistar'
      if (c[et] !== undefined) c[et] += 1
    })
    return c
  }, [pedidos, coincideFechaFiltro])

  // Agrupación de Camiones / Preventistas para la etapa activa
  const listaCamiones = useMemo(() => {
    const mapa = {}
    const q = busquedaCliente.trim().toLowerCase()

    pedidos.forEach((ped) => {
      const et = ped.etapa_ruta || 'pendiente_alistar'
      if (et !== etapaFiltro) return
      if (!coincideFechaFiltro(ped)) return

      if (q) {
        const okTienda = ped.clientes?.nombre?.toLowerCase().includes(q)
        const okDir = ped.clientes?.direccion?.toLowerCase().includes(q)
        const okFolio = ped.codigo_local?.toLowerCase().includes(q)
        const okPrev = ped.perfiles?.nombre?.toLowerCase().includes(q)
        if (!okTienda && !okDir && !okFolio && !okPrev) return
      }

      const vendId = ped.vendedor_id || 'SIN_ASIGNAR'
      const nombreVend =
        ped.perfiles?.nombre ||
        perfiles.find((p) => p.id === vendId)?.nombre ||
        'Sin Preventista'

      if (!mapa[vendId]) {
        mapa[vendId] = {
          id: vendId,
          nombre: nombreVend,
          pedidos: [],
          totalBs: 0,
          efectivoBs: 0,
          qrBs: 0,
          creditoBs: 0,
          paquetesaprox: 0,
          sueltasaprox: 0,
        }
      }
      mapa[vendId].pedidos.push(ped)
      mapa[vendId].totalBs += Number(ped.total) || 0
      mapa[vendId].efectivoBs += Number(ped.monto_efectivo) || 0
      mapa[vendId].qrBs += Number(ped.monto_qr) || 0
      mapa[vendId].creditoBs += Number(ped.saldo_credito) || 0

      ;(ped.venta_detalles || []).forEach((det) => {
        const cant = Number(det.cantidad) || 0
        if (
          det.tipo_venta === 'paquete' ||
          det.tipo_venta === 'bono_promocion'
        ) {
          mapa[vendId].paquetesaprox += cant
        } else if (det.tipo_venta === 'paquete_surtido') {
          const uPaq = Math.max(
            1,
            Number(det.productos?.unidades_por_paquete) || 6
          )
          const bot = Number(det.unidades_totales_descontar) || cant
          mapa[vendId].paquetesaprox += Math.floor(bot / uPaq)
          mapa[vendId].sueltasaprox += bot % uPaq
        } else {
          mapa[vendId].sueltasaprox +=
            Number(det.unidades_totales_descontar) || cant
        }
      })
    })

    return Object.values(mapa)
      .map((cam) => {
        let resumenCarga = ''
        if (cam.paquetesaprox > 0 && cam.sueltasaprox > 0) {
          resumenCarga = `${cam.paquetesaprox} Paq + ${cam.sueltasaprox} Bot`
        } else if (cam.paquetesaprox > 0) {
          resumenCarga = `${cam.paquetesaprox} Paq`
        } else if (cam.sueltasaprox > 0) {
          resumenCarga = `${cam.sueltasaprox} Bot`
        } else {
          resumenCarga = '—'
        }
        return { ...cam, resumenCarga }
      })
      .sort(
        (a, b) =>
          b.pedidos.length - a.pedidos.length ||
          a.nombre.localeCompare(b.nombre, 'es')
      )
  }, [pedidos, etapaFiltro, coincideFechaFiltro, busquedaCliente, perfiles])

  // Si el preventista abierto ya despachó/rindió todos sus pedidos en esta etapa, volver limpio a la tabla de preventistas
  useEffect(() => {
    if (
      preventistaSel &&
      preventistaSel !== 'TODOS' &&
      !listaCamiones.some((c) => c.id === preventistaSel)
    ) {
      setPreventistaSel(null)
    }
  }, [listaCamiones, preventistaSel])

  const mostrarTablaPreventistas =
    preventistaSel === null && !busquedaCliente.trim()

  const camionActivo = useMemo(() => {
    if (listaCamiones.length === 0) return null
    if (
      preventistaSel === 'TODOS' ||
      (preventistaSel === null && busquedaCliente.trim())
    ) {
      return {
        id: 'TODOS',
        nombre: busquedaCliente.trim()
          ? `Resultados para "${busquedaCliente.trim()}"`
          : 'Todos los Preventistas',
        pedidos: listaCamiones.flatMap((c) => c.pedidos),
        totalBs: listaCamiones.reduce((acc, c) => acc + c.totalBs, 0),
        efectivoBs: listaCamiones.reduce((acc, c) => acc + c.efectivoBs, 0),
        qrBs: listaCamiones.reduce((acc, c) => acc + c.qrBs, 0),
        creditoBs: listaCamiones.reduce((acc, c) => acc + c.creditoBs, 0),
      }
    }
    if (!preventistaSel) return null
    return listaCamiones.find((c) => c.id === preventistaSel) || null
  }, [listaCamiones, preventistaSel, busquedaCliente])

  // Consolidado de carga física solo en Etapa 1 (`pendiente_alistar`)
  const cargaCamionActivo = useMemo(() => {
    if (!camionActivo || etapaFiltro !== 'pendiente_alistar') return []

    const acumulador = {}

    camionActivo.pedidos.forEach((ped) => {
      ;(ped.venta_detalles || []).forEach((det) => {
        const prodId = det.producto_id
        const prodCat = mapaProductosPorId[prodId] || det.productos || {}
        const unidPorPaq = Number(prodCat.unidades_por_paquete) || 6
        const botellasLinea =
          Number(det.unidades_totales_descontar) ||
          (det.tipo_venta === 'paquete' || det.tipo_venta === 'bono_promocion'
            ? Number(det.cantidad) * unidPorPaq
            : Number(det.cantidad))

        if (!acumulador[prodId]) {
          acumulador[prodId] = {
            producto_id: prodId,
            nombre: prodCat.nombre || 'Bebida',
            sabor: prodCat.sabor?.trim() || '',
            marca: prodCat.marca || '',
            imagen_url: prodCat.imagen_url || det.productos?.imagen_url || '',
            unidades_por_paquete: unidPorPaq,
            total_botellas: 0,
            botellas_bono: 0,
          }
        }

        acumulador[prodId].total_botellas += botellasLinea
        if (
          det.tipo_venta === 'bono_regalo' ||
          det.tipo_venta === 'bono_promocion'
        ) {
          acumulador[prodId].botellas_bono += botellasLinea
        }
      })
    })

    return Object.values(acumulador)
      .map((item) => {
        const stockCentral = stockCentralMap[item.producto_id] || 0
        const stockDeposito = stockDepositoMap[item.producto_id] || 0
        const faltanteEnCentral = Math.max(
          0,
          item.total_botellas - stockCentral
        )
        const alcanzaConDeposito =
          faltanteEnCentral > 0 && stockDeposito >= faltanteEnCentral
        const faltanteTotalEmpresa = Math.max(
          0,
          item.total_botellas - (stockCentral + stockDeposito)
        )

        const nombreConSabor =
          item.sabor &&
          !item.nombre.toLowerCase().includes(item.sabor.toLowerCase())
            ? `${item.nombre} · ${item.sabor}`
            : item.nombre

        return {
          ...item,
          nombreCompleto: nombreConSabor,
          cantidadTexto: formatearCantidadesCorto(
            item.total_botellas,
            item.unidades_por_paquete
          ),
          stockCentral,
          stockCentralTexto:
            stockCentral > 0
              ? formatearCantidadesCorto(
                  stockCentral,
                  item.unidades_por_paquete
                )
              : 'Sin stock',
          stockDeposito,
          stockDepositoTexto:
            stockDeposito > 0
              ? formatearCantidadesCorto(
                  stockDeposito,
                  item.unidades_por_paquete
                )
              : 'Sin stock',
          faltanteEnCentral,
          faltanteEnCentralTexto: formatearCantidadesCorto(
            faltanteEnCentral,
            item.unidades_por_paquete
          ),
          alcanzaConDeposito,
          faltanteTotalEmpresa,
          faltanteTotalTexto: formatearCantidadesCorto(
            faltanteTotalEmpresa,
            item.unidades_por_paquete
          ),
        }
      })
      .sort((a, b) => b.total_botellas - a.total_botellas)
  }, [
    camionActivo,
    etapaFiltro,
    mapaProductosPorId,
    stockCentralMap,
    stockDepositoMap,
    formatearCantidadesCorto,
  ])

  const hayFaltanteEnCentralCamion = useMemo(
    () => cargaCamionActivo.some((it) => it.faltanteEnCentral > 0),
    [cargaCamionActivo]
  )

  const toggleChecklistAlistado = (productoId) => {
    if (!camionActivo) return
    const key = `${camionActivo.id}_${productoId}`
    setItemsAlistadosCheck((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Traspaso rápido Depósito -> Central
  const traspasarFaltanteDesdeDeposito = async (e, item) => {
    e.stopPropagation()
    if (!puedeTraspasar || item.faltanteEnCentral <= 0) return

    const { paquetes, sueltas } = formatearStock(
      item.faltanteEnCentral,
      item.unidades_por_paquete
    )

    setTraspasandoProdId(item.producto_id)
    setErrorMsg('')
    try {
      let validUserId = usuarioActual?.id
      if (!validUserId || String(validUserId).startsWith('local-')) {
        const { perfil } = await obtenerOCrearPerfilPorRol(
          rolActual,
          infoRol?.defaultName || 'Admin'
        )
        validUserId = perfil?.id
      }

      const { error } = await supabase.rpc('registrar_movimiento_almacen', {
        p_tipo: 'traspaso_a_central',
        p_producto_id: item.producto_id,
        p_usuario_id: validUserId,
        p_paquetes: paquetes,
        p_sueltas: sueltas,
      })

      if (error) throw error

      setMensajeExito(
        `Traspaso listo: ${item.faltanteEnCentralTexto} de ${item.nombre} pasados de Depósito a Central.`
      )
      await cargarDespacho()
      setTimeout(() => setMensajeExito(''), 4500)
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo realizar el traspaso rápido.')
    } finally {
      setTraspasandoProdId(null)
    }
  }

  // ================= PASO 2: ENTREGAR PEDIDO(S) AL PREVENTISTA =================
  const ejecutarEntregaAPreventista = async (
    listaPedidosAEntregar,
    etiquetaDestino
  ) => {
    if (!listaPedidosAEntregar || listaPedidosAEntregar.length === 0) return
    const marcaId =
      listaPedidosAEntregar.length === 1 ? listaPedidosAEntregar[0].id : 'CAMION'
    setDespachandoId(marcaId)
    setErrorMsg('')
    try {
      const res = await despacharPedidosAPreventista({
        pedidos: listaPedidosAEntregar,
        usuarioDespachador: usuarioActual || {
          nombre: infoRol?.defaultName || 'Encargado Tienda Central',
        },
      })
      setModalDespachoCamion(null)
      setMensajeExito(
        `Entregado a Preventista: ${res.despachadosCount} pedido(s) para ${etiquetaDestino}. El stock ya se descontó de Tienda Central y ahora el preventista puede entregar y cobrar al cliente.`
      )
      await cargarDespacho()
      setTimeout(() => setMensajeExito(''), 5500)
    } catch (err) {
      await cargarDespacho()
      setErrorMsg(
        err.message ||
          'No se pudo entregar la carga al preventista. Verifica el stock en Tienda Central.'
      )
    } finally {
      setDespachandoId(null)
    }
  }

  // ================= BONOS GRATIS (ETAPA 1 - SOLO ADMIN) =================
  const productosFiltradosBono = useMemo(() => {
    const q = busquedaBonoProd.trim().toLowerCase()
    if (!q) return productos
    return productos.filter(
      (p) =>
        p.nombre?.toLowerCase().includes(q) ||
        p.marca?.toLowerCase().includes(q) ||
        p.sabor?.toLowerCase().includes(q)
    )
  }, [productos, busquedaBonoProd])

  const abrirModalBono = (pedido) => {
    if (!esAdmin || pedido.estado !== 'pendiente_entrega') return
    setPedidoBonoActivo(pedido)
    setBusquedaBonoProd('')
    if (productos.length > 0) setBonoProductoId(productos[0].id)
    setBonoFormato('paquete')
    setBonoCantidad(1)
    setErrorBono('')
  }

  const guardarBonoEnPedido = async (e) => {
    e.preventDefault()
    if (!esAdmin || !pedidoBonoActivo) return

    const prodObj = productos.find((p) => p.id === bonoProductoId)
    if (!prodObj) return

    const cant = Math.max(1, parseInt(bonoCantidad, 10) || 1)
    const unidPorPaq = Number(prodObj.unidades_por_paquete) || 6
    const unidadesDescontar =
      bonoFormato === 'paquete' ? cant * unidPorPaq : cant

    setGuardandoBono(true)
    setErrorBono('')

    try {
      const { error } = await supabase.from('venta_detalles').insert([
        {
          venta_id: pedidoBonoActivo.id,
          producto_id: prodObj.id,
          tipo_venta: 'bono_regalo',
          cantidad: cant,
          unidades_totales_descontar: unidadesDescontar,
          precio_aplicado: 0,
          subtotal: 0,
        },
      ])

      if (error) throw error

      setMensajeExito(
        `Bono agregado en ${
          pedidoBonoActivo.clientes?.nombre || 'tienda'
        }: +${cant} ${bonoFormato === 'paquete' ? 'Paq' : 'Bot'} de ${
          prodObj.nombre
        }`
      )
      setPedidoBonoActivo(null)
      await cargarDespacho()
      setTimeout(() => setMensajeExito(''), 4000)
    } catch (err) {
      setErrorBono(err.message || 'No se pudo agregar el bono.')
    } finally {
      setGuardandoBono(false)
    }
  }

  const eliminarBonoDePedido = async (detalleId) => {
    if (!esAdmin) return
    try {
      await supabase.from('venta_detalles').delete().eq('id', detalleId)
      await cargarDespacho()
    } catch (err) {
      console.error('Error eliminando bono:', err)
    }
  }

  // ================= PASO 3 (FALLBACK EN DESPACHO): REGISTRAR COBRO AL CLIENTE =================
  const abrirModalLiquidacion = (pedido) => {
    setPedidoLiquidar(pedido)
    setMetodoPago('efectivo')
    setInputEfectivo(String(Number(pedido.total) || 0))
    setInputQr('0')
    setErrorLiquidacion('')
  }

  const seleccionarMetodoPago = (metodo) => {
    setMetodoPago(metodo)
    const totalPedido = Number(pedidoLiquidar?.total) || 0
    if (metodo === 'efectivo') {
      setInputEfectivo(String(totalPedido))
      setInputQr('0')
    } else if (metodo === 'qr') {
      setInputEfectivo('0')
      setInputQr(String(totalPedido))
    } else if (metodo === 'credito') {
      setInputEfectivo('0')
      setInputQr('0')
    } else if (metodo === 'mixto') {
      const mitad = Math.floor(totalPedido / 2)
      setInputEfectivo(String(mitad))
      setInputQr(String(Number((totalPedido - mitad).toFixed(2))))
    }
  }

  const totalLiquidar = Number(pedidoLiquidar?.total) || 0
  const montoEfectivoNum = Math.max(0, parseFloat(inputEfectivo) || 0)
  const montoQrNum = Math.max(0, parseFloat(inputQr) || 0)
  const sumaPagada = Number((montoEfectivoNum + montoQrNum).toFixed(2))
  const saldoCreditoCalculado = Math.max(
    0,
    Number((totalLiquidar - sumaPagada).toFixed(2))
  )
  const excedeTotal = sumaPagada > totalLiquidar + 0.01

  const confirmarCobroClienteDesdeDespacho = async (e) => {
    e.preventDefault()
    if (!pedidoLiquidar) return
    if (excedeTotal) {
      setErrorLiquidacion('El monto ingresado supera el total del pedido.')
      return
    }

    setConfirmandoEntrega(true)
    setErrorLiquidacion('')

    try {
      const ventaActualizada = await registrarCobroPreventistaEnCliente({
        pedido: pedidoLiquidar,
        montoEfectivo: montoEfectivoNum,
        montoQr: montoQrNum,
        saldoCredito: saldoCreditoCalculado,
        usuarioCobrador: {
          id: pedidoLiquidar.vendedor_id || usuarioActual?.id,
          nombre:
            pedidoLiquidar.perfiles?.nombre ||
            usuarioActual?.nombre ||
            'Preventista',
        },
      })

      setMensajeExito(
        `Cobro al cliente registrado: ${
          pedidoLiquidar.clientes?.nombre || pedidoLiquidar.codigo_local
        }. Ahora figura en "3. Rendir al Dueño".`
      )
      setPedidoLiquidar(null)
      await cargarDespacho()

      await generarYCompartirPDF(
        ventaActualizada,
        pedidoLiquidar.clientes,
        pedidoLiquidar.venta_detalles,
        pedidoLiquidar.perfiles?.nombre || 'Preventista',
        false
      )

      setTimeout(() => setMensajeExito(''), 5000)
    } catch (err) {
      setErrorLiquidacion(err.message || 'No se pudo registrar el cobro.')
    } finally {
      setConfirmandoEntrega(false)
    }
  }

  // ================= PASO 4: CONFIRMAR RECEPCIÓN DE DINERO POR EL DUEÑO =================
  const abrirModalRecepcionDueno = (pedidosARecibir, nombrePreventista) => {
    if (!esAdmin || !pedidosARecibir?.length) return
    const efec = pedidosARecibir.reduce(
      (acc, p) => acc + (Number(p.monto_efectivo) || 0),
      0
    )
    const qr = pedidosARecibir.reduce(
      (acc, p) => acc + (Number(p.monto_qr) || 0),
      0
    )
    const cred = pedidosARecibir.reduce(
      (acc, p) => acc + (Number(p.saldo_credito) || 0),
      0
    )
    setNotaRendicion('')
    setModalRendicionDueno({
      pedidos: pedidosARecibir,
      nombrePreventista,
      efectivoBs: efec,
      qrBs: qr,
      creditoBs: cred,
      totalRecaudadoBs: efec + qr,
    })
  }

  const confirmarRecepcionDineroDueno = async (e) => {
    e.preventDefault()
    if (!esAdmin || !modalRendicionDueno) return
    setGuardandoRendicion(true)
    setErrorMsg('')
    try {
      await confirmarRendicionDineroAlDueno({
        pedidoIds: modalRendicionDueno.pedidos.map((p) => p.id),
        usuarioAdmin: usuarioActual || { nombre: 'Dueño / Admin' },
        observacion: notaRendicion,
      })

      setMensajeExito(
        `Dinero recibido por el Dueño: ${formatearBs(
          modalRendicionDueno.efectivoBs
        )} en efectivo${
          modalRendicionDueno.qrBs > 0
            ? ` + ${formatearBs(modalRendicionDueno.qrBs)} en QR`
            : ''
        } de ${modalRendicionDueno.nombrePreventista} (${
          modalRendicionDueno.pedidos.length
        } pedido(s) liquidados).`
      )
      setModalRendicionDueno(null)
      await cargarDespacho()
      setTimeout(() => setMensajeExito(''), 6000)
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo confirmar la recepción del dinero.')
    } finally {
      setGuardandoRendicion(false)
    }
  }

  // ================= CANCELAR PEDIDO DE CLIENTE =================
  const ejecutarCancelacionPedido = async () => {
    if (!pedidoCancelarModal) return
    setCancelandoPedido(true)
    setErrorMsg('')
    try {
      const clienteNom =
        pedidoCancelarModal.clientes?.nombre ||
        pedidoCancelarModal.codigo_local ||
        'Cliente'
      const res = await cancelarPedidoPreventa({
        pedido: pedidoCancelarModal,
      })

      setPedidoCancelarModal(null)
      setMensajeExito(
        res.stockDevuelto
          ? `Pedido de ${clienteNom} cancelado. Las bebidas se devolvieron automáticamente al stock de Tienda Central.`
          : `Pedido de ${clienteNom} cancelado y quitado de la lista.`
      )
      await cargarDespacho()
      setTimeout(() => setMensajeExito(''), 5500)
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cancelar el pedido.')
    } finally {
      setCancelandoPedido(false)
    }
  }

  const itemsMarcadosListos = camionActivo
    ? cargaCamionActivo.filter(
        (it) => itemsAlistadosCheck[`${camionActivo.id}_${it.producto_id}`]
      ).length
    : 0

  return (
    <div className="space-y-5 pb-14">
      {/* ================= 1. CABECERA Y SELECTOR DE LAS 4 ETAPAS ================= */}
      <div className="space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Despacho y Rendición
            </h1>

            {/* Barra de las 4 Etapas Exactas del Pedido */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/75 dark:bg-white/[0.06] overflow-x-auto max-w-full no-scrollbar">
              {ETAPAS_DESPACHO.map((et) => {
                const activo = etapaFiltro === et.id
                const cant = contadoresEtapas[et.id] || 0
                return (
                  <button
                    key={et.id}
                    type="button"
                    onClick={() => cambiarEtapa(et.id)}
                    className={`h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer shrink-0 ${
                      activo
                        ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white shadow-2xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span>{et.corto}</span>
                    <span
                      className={`text-[11px] font-extrabold tabular-nums px-1.5 py-0.5 rounded-md ${
                        activo
                          ? 'bg-slate-100 dark:bg-white/10 ' + et.badgeClass
                          : et.badgeClass
                      }`}
                    >
                      {cant}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search
                size={14}
                className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                placeholder="Buscar tienda, folio o preventista..."
                className="w-full h-8.5 pl-8.5 pr-7 rounded-lg bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-white/25 transition"
              />
              {busquedaCliente && (
                <button
                  type="button"
                  onClick={() => setBusquedaCliente('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center h-8.5 bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] rounded-lg px-2.5">
              <Calendar size={13} className="text-slate-400 mr-1.5 shrink-0" />
              <input
                type="date"
                value={fechaFiltro}
                onChange={(e) => setFechaFiltro(e.target.value)}
                className="bg-transparent border-0 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              />
              {fechaFiltro && (
                <button
                  type="button"
                  onClick={() => setFechaFiltro('')}
                  className="text-slate-400 hover:text-slate-600 ml-1 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={cargarDespacho}
              title="Actualizar pedidos"
              className="h-8.5 w-8.5 rounded-lg bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
            >
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {mensajeExito && (
        <div className="bg-emerald-50 dark:bg-emerald-500/12 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <CheckCircle2
              size={15}
              className="text-emerald-600 dark:text-emerald-400 shrink-0"
            />
            <span>{mensajeExito}</span>
          </span>
          <button
            type="button"
            onClick={() => setMensajeExito('')}
            className="text-emerald-700 dark:text-emerald-300 cursor-pointer shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 dark:bg-red-500/12 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{errorMsg}</span>
          </span>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-red-600 dark:text-red-300 cursor-pointer shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ================= 2. CONTENIDO CERO RUIDO VISUAL: NIVEL 1 (TABLA DE PREVENTISTAS) -> NIVEL 2 (TABLAS DEL PREVENTISTA) ================= */}
      {cargando ? (
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] p-6 space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-slate-100 dark:bg-white/[0.04] rounded-xl h-12 animate-pulse"
            />
          ))}
        </div>
      ) : listaCamiones.length === 0 ? (
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] py-14 px-6 text-center space-y-2">
          <Truck className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {etapaFiltro === 'pendiente_alistar' &&
              'No hay pedidos pendientes de cargar en Tienda'}
            {etapaFiltro === 'entregado_preventista' &&
              'No hay pedidos en manos de preventistas pendientes de cobrar'}
            {etapaFiltro === 'cobrado_preventista' &&
              'No hay dinero pendiente de rendir al Dueño'}
            {etapaFiltro === 'rendido_dueno' &&
              'No se encontraron pedidos finalizados para este filtro'}
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {etapaFiltro === 'pendiente_alistar' &&
              'Cuando un preventista registre un pedido aparecerá su nombre en la tabla para entrar y despacharle.'}
            {etapaFiltro === 'entregado_preventista' &&
              'Aquí aparecen los preventistas cuya carga ya salió de tienda rumbo al cliente.'}
            {etapaFiltro === 'cobrado_preventista' &&
              'Aquí aparecen los preventistas con cobros listos para entregar el dinero al Dueño.'}
            {etapaFiltro === 'rendido_dueno' &&
              'Historial de entregas cuyo dinero ya fue recibido por el Dueño.'}
          </p>
        </div>
      ) : mostrarTablaPreventistas ? (
        /* ================= NIVEL 1: TARJETAS LIMPIAS Y RESPONSIVAS DE PREVENTISTAS ================= */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Selecciona un preventista ({listaCamiones.length})
            </span>

            {listaCamiones.length > 1 && (
              <button
                type="button"
                onClick={() => setPreventistaSel('TODOS')}
                className="text-xs font-semibold text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition cursor-pointer"
              >
                Ver todos los clientes juntos →
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {listaCamiones.map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => setPreventistaSel(cam.id)}
                className="group text-left rounded-2xl bg-white dark:bg-[#161922] border border-slate-200/85 dark:border-white/[0.08] hover:border-amber-500/60 dark:hover:border-amber-500/50 shadow-2xs hover:shadow-md p-4 sm:p-5 flex flex-col justify-between gap-3.5 transition cursor-pointer"
              >
                {/* Cabecera del Card: Iniciales + Nombre + Cantidad de clientes */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-extrabold text-xs flex items-center justify-center shrink-0">
                      {cam.nombre.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm sm:text-[15px] font-extrabold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors leading-snug break-words">
                        {cam.nombre}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Preventista en ruta
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.07] text-slate-800 dark:text-slate-200 font-bold text-[11px] shrink-0 tabular-nums">
                    {cam.pedidos.length}{' '}
                    {cam.pedidos.length === 1 ? 'cliente' : 'clientes'}
                  </span>
                </div>

                {/* Recuadro de Métricas: Carga / Efectivo + Monto Total */}
                <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50/90 dark:bg-[#11141B] border border-slate-200/70 dark:border-white/[0.06] tabular-nums">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {etapaFiltro === 'cobrado_preventista'
                        ? 'Efectivo / QR'
                        : 'Carga Total'}
                    </div>
                    <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                      {etapaFiltro === 'cobrado_preventista' ? (
                        <span>
                          Efec:{' '}
                          <strong className="text-amber-600 dark:text-amber-400">
                            {formatearBs(cam.efectivoBs)}
                          </strong>
                        </span>
                      ) : (
                        cam.resumenCarga
                      )}
                    </div>
                    {etapaFiltro === 'cobrado_preventista' && (
                      <div className="text-[10px] text-slate-400">
                        QR: {formatearBs(cam.qrBs)}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {etapaFiltro === 'cobrado_preventista'
                        ? 'Total a Rendir'
                        : 'Monto Total'}
                    </div>
                    <div
                      className={`text-sm sm:text-base font-black mt-0.5 ${
                        etapaFiltro === 'cobrado_preventista'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {etapaFiltro === 'cobrado_preventista'
                        ? formatearBs(cam.efectivoBs + cam.qrBs)
                        : formatearBs(cam.totalBs)}
                    </div>
                  </div>
                </div>

                {/* Botón inferior claro */}
                <div className="w-full h-9 px-3.5 rounded-xl bg-amber-500 group-hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center justify-between transition">
                  <span>Ver pedidos ({cam.pedidos.length})</span>
                  <ChevronRight size={15} className="stroke-[2.5]" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : camionActivo ? (
        /* ================= NIVEL 2: DENTRO DEL PREVENTISTA (BARRA VOLVER + SECCIONES RESPONSIVAS) ================= */
        <div className="space-y-4">
          {/* Barra Superior Limpia y Responsiva con Botón `← Preventistas` + Acciones Globales */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:px-4 rounded-2xl bg-white dark:bg-[#161922] border border-slate-200/85 dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setPreventistaSel(null)
                  setBusquedaCliente('')
                }}
                className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.13] text-slate-800 dark:text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <ArrowLeft size={15} className="text-amber-500 stroke-[2.5]" />
                <span>Preventistas</span>
              </button>

              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                  {camionActivo.nombre}
                </h2>
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {camionActivo.pedidos.length}{' '}
                  {camionActivo.pedidos.length === 1 ? 'cliente' : 'clientes'} · Total{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {formatearBs(camionActivo.totalBs)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
              {/* Acciones Etapa 1: Hoja de Carga + Entregar Toda la Carga */}
              {etapaFiltro === 'pendiente_alistar' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      generarPDFHojaCargaCamion({
                        preventistaNombre: camionActivo.nombre,
                        itemsCarga: cargaCamionActivo.map((it) => ({
                          ...it,
                          nombre: it.nombreCompleto,
                        })),
                        pedidosTienda: camionActivo.pedidos,
                        totalBs: camionActivo.totalBs,
                      })
                    }
                    className="h-9 px-3 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200/70 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer flex-1 sm:flex-initial"
                  >
                    <Printer size={14} className="text-amber-500" />
                    <span>Hoja PDF</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      despachandoId !== null || hayFaltanteEnCentralCamion
                    }
                    title={
                      hayFaltanteEnCentralCamion
                        ? 'Primero traspasa el stock faltante a Tienda Central'
                        : 'Entregar toda la carga al preventista'
                    }
                    onClick={() =>
                      setModalDespachoCamion({
                        nombre: camionActivo.nombre,
                        pedidos: camionActivo.pedidos,
                        totalBs: camionActivo.totalBs,
                      })
                    }
                    className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed flex-1 sm:flex-initial"
                  >
                    <PackageCheck size={15} className="stroke-[2.4]" />
                    <span>
                      Entregar Todo ({camionActivo.pedidos.length})
                    </span>
                  </button>
                </>
              )}

              {/* Acciones Etapa 3: Rendición al Dueño */}
              {etapaFiltro === 'cobrado_preventista' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      generarPDFRendicionPreventista({
                        preventistaNombre: camionActivo.nombre,
                        pedidos: camionActivo.pedidos,
                        recibidoPor: usuarioActual?.nombre || 'Dueño / Admin',
                        yaRendido: false,
                      })
                    }
                    className="h-9 px-3 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200/70 dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer flex-1 sm:flex-initial"
                  >
                    <Printer size={14} className="text-amber-500" />
                    <span>Hoja PDF</span>
                  </button>

                  {esAdmin && (
                    <button
                      type="button"
                      onClick={() =>
                        abrirModalRecepcionDueno(
                          camionActivo.pedidos,
                          camionActivo.nombre
                        )
                      }
                      className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer flex-1 sm:flex-initial"
                    >
                      <ShieldCheck size={15} />
                      <span>
                        Recibir Todo (
                        {formatearBs(
                          camionActivo.efectivoBs + camionActivo.qrBs
                        )}
                        )
                      </span>
                    </button>
                  )}
                </>
              )}

              {/* Acciones Etapa 4: Acta PDF */}
              {etapaFiltro === 'rendido_dueno' && (
                <button
                  type="button"
                  onClick={() =>
                    generarPDFRendicionPreventista({
                      preventistaNombre: camionActivo.nombre,
                      pedidos: camionActivo.pedidos,
                      recibidoPor:
                        camionActivo.pedidos[0]?.info_custodia
                          ?.recibido_por_nombre || 'Dueño / Admin',
                      yaRendido: true,
                    })
                  }
                  className="h-9 px-3.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200/70 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer w-full sm:w-auto"
                >
                  <Printer size={14} className="text-emerald-500" />
                  <span>Acta PDF</span>
                </button>
              )}
            </div>
          </div>

          {/* Barra resumen compacta de arqueo en Etapa 3 */}
          {etapaFiltro === 'cobrado_preventista' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 tabular-nums">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Efectivo en Mano
                </div>
                <div className="text-base sm:text-lg font-black text-slate-900 dark:text-amber-400 mt-0.5">
                  {formatearBs(camionActivo.efectivoBs)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.07]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Cobrado QR
                </div>
                <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {formatearBs(camionActivo.qrBs)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Total a Entregar al Dueño
                </div>
                <div className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {formatearBs(camionActivo.efectivoBs + camionActivo.qrBs)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.07]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Crédito en Tiendas
                </div>
                <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {formatearBs(camionActivo.creditoBs)}
                </div>
              </div>
            </div>
          )}

          {/* ================= SECCIÓN 1 (SOLO ETAPA 1): CARGA A SEPARAR RESPONSIVA CON STOCK ALMACÉN + STOCK CENTRAL ================= */}
          {etapaFiltro === 'pendiente_alistar' &&
            cargaCamionActivo.length > 0 && (
              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    1. Bebidas a separar en almacén/tienda ({itemsMarcadosListos}/
                    {cargaCamionActivo.length} listas)
                  </h3>
                  {hayFaltanteEnCentralCamion && (
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                      Traspasa los faltantes marcados abajo antes de entregar todo
                    </span>
                  )}
                </div>

                <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/85 dark:border-white/[0.08] overflow-hidden">
                  {/* VISTA ESCRITORIO / TABLET (md+): Tabla completa con Stock Almacén y Stock Central */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200/80 dark:border-white/[0.08] text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70 dark:bg-[#11141B]/70">
                          <th className="py-2.5 pl-4 pr-2 w-10 text-center">✓</th>
                          <th className="py-2.5 px-3">Bebida</th>
                          <th className="py-2.5 px-3">Cantidad a Cargar</th>
                          <th className="py-2.5 px-3">Stock en Almacén</th>
                          <th className="py-2.5 px-3">Stock en Central</th>
                          <th className="py-2.5 pl-3 pr-4 text-right">Estado</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs lg:text-sm tabular-nums">
                        {cargaCamionActivo.map((item) => {
                          const keyCheck = `${camionActivo.id}_${item.producto_id}`
                          const listo = Boolean(itemsAlistadosCheck[keyCheck])
                          const sinStockTotal = item.faltanteTotalEmpresa > 0
                          const requiereTraspaso =
                            !sinStockTotal && item.alcanzaConDeposito

                          return (
                            <tr
                              key={item.producto_id}
                              onClick={() =>
                                toggleChecklistAlistado(item.producto_id)
                              }
                              className={`transition cursor-pointer select-none ${
                                listo
                                  ? 'bg-emerald-500/[0.07]'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'
                              }`}
                            >
                              <td className="py-2.5 pl-4 pr-2 text-center">
                                <span
                                  className={`w-5 h-5 rounded-md inline-flex items-center justify-center transition ${
                                    listo
                                      ? 'bg-emerald-500 text-white'
                                      : 'border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-white/[0.04] text-transparent'
                                  }`}
                                >
                                  <Check size={12} className="stroke-[3]" />
                                </span>
                              </td>

                              <td className="py-2.5 px-3">
                                <div
                                  className={`font-bold ${
                                    listo
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {item.nombreCompleto}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {item.marca} · Pack x{item.unidades_por_paquete}
                                  {item.botellas_bono > 0 && (
                                    <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1.5">
                                      (+
                                      {formatearCantidadesCorto(
                                        item.botellas_bono,
                                        item.unidades_por_paquete
                                      )}{' '}
                                      gratis)
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 font-black text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                {item.cantidadTexto}
                              </td>

                              <td
                                className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                                  item.stockDeposito > 0
                                    ? 'text-sky-600 dark:text-sky-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {item.stockDepositoTexto}
                              </td>

                              <td
                                className={`py-2.5 px-3 font-semibold whitespace-nowrap ${
                                  item.stockCentral >= item.total_botellas
                                    ? 'text-slate-700 dark:text-slate-200'
                                    : item.stockCentral > 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {item.stockCentralTexto}
                              </td>

                              <td className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">
                                {requiereTraspaso ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hidden lg:inline">
                                      Faltan {item.faltanteEnCentralTexto}
                                    </span>
                                    {puedeTraspasar ? (
                                      <button
                                        type="button"
                                        disabled={
                                          traspasandoProdId === item.producto_id
                                        }
                                        onClick={(e) =>
                                          traspasarFaltanteDesdeDeposito(e, item)
                                        }
                                        className="h-7 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                      >
                                        <ArrowRightLeft size={11} />
                                        <span>
                                          {traspasandoProdId === item.producto_id
                                            ? 'Pasando...'
                                            : `Traspasar ${item.faltanteEnCentralTexto}`}
                                        </span>
                                      </button>
                                    ) : (
                                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                        Pedir traspaso
                                      </span>
                                    )}
                                  </div>
                                ) : sinStockTotal ? (
                                  <span className="text-[11px] font-bold text-red-500 dark:text-red-400">
                                    Faltan {item.faltanteTotalTexto}
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                    Disponible
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* VISTA MÓVIL (< md): Tarjetas compactas apiladas 100% legibles sin scroll horizontal */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-white/[0.06] tabular-nums">
                    {cargaCamionActivo.map((item) => {
                      const keyCheck = `${camionActivo.id}_${item.producto_id}`
                      const listo = Boolean(itemsAlistadosCheck[keyCheck])
                      const sinStockTotal = item.faltanteTotalEmpresa > 0
                      const requiereTraspaso =
                        !sinStockTotal && item.alcanzaConDeposito

                      return (
                        <div
                          key={item.producto_id}
                          onClick={() =>
                            toggleChecklistAlistado(item.producto_id)
                          }
                          className={`p-3.5 space-y-2.5 transition cursor-pointer select-none ${
                            listo ? 'bg-emerald-500/[0.07]' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span
                                className={`w-5 h-5 mt-0.5 rounded-md inline-flex items-center justify-center shrink-0 transition ${
                                  listo
                                    ? 'bg-emerald-500 text-white'
                                    : 'border border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-white/[0.04] text-transparent'
                                }`}
                              >
                                <Check size={12} className="stroke-[3]" />
                              </span>
                              <div className="min-w-0">
                                <div
                                  className={`text-xs font-bold leading-snug ${
                                    listo
                                      ? 'line-through text-slate-400'
                                      : 'text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {item.nombreCompleto}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {item.marca} · Pack x{item.unidades_por_paquete}
                                  {item.botellas_bono > 0 && (
                                    <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1">
                                      (+
                                      {formatearCantidadesCorto(
                                        item.botellas_bono,
                                        item.unidades_por_paquete
                                      )}{' '}
                                      gratis)
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {requiereTraspaso ? (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-extrabold">
                                  Faltan {item.faltanteEnCentralTexto}
                                </span>
                              ) : sinStockTotal ? (
                                <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-500 dark:text-red-400 text-[10px] font-extrabold">
                                  Faltan {item.faltanteTotalTexto}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold">
                                  Disponible
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 3 columnas móviles: A Cargar | Stock Almacén | Stock Central */}
                          <div className="grid grid-cols-3 gap-1.5 p-2.5 rounded-xl bg-slate-50/90 dark:bg-[#11141B] border border-slate-200/70 dark:border-white/[0.06] text-[11px]">
                            <div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                A Cargar
                              </div>
                              <div className="font-black text-amber-600 dark:text-amber-400 mt-0.5">
                                {item.cantidadTexto}
                              </div>
                            </div>

                            <div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Almacén
                              </div>
                              <div
                                className={`font-bold mt-0.5 ${
                                  item.stockDeposito > 0
                                    ? 'text-sky-600 dark:text-sky-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {item.stockDepositoTexto}
                              </div>
                            </div>

                            <div>
                              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                Central
                              </div>
                              <div
                                className={`font-bold mt-0.5 ${
                                  item.stockCentral >= item.total_botellas
                                    ? 'text-slate-800 dark:text-slate-200'
                                    : item.stockCentral > 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {item.stockCentralTexto}
                              </div>
                            </div>
                          </div>

                          {requiereTraspaso && puedeTraspasar && (
                            <button
                              type="button"
                              disabled={
                                traspasandoProdId === item.producto_id
                              }
                              onClick={(e) =>
                                traspasarFaltanteDesdeDeposito(e, item)
                              }
                              className="w-full h-8 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <ArrowRightLeft size={12} />
                              <span>
                                {traspasandoProdId === item.producto_id
                                  ? 'Pasando a Central...'
                                  : `Traspasar ${item.faltanteEnCentralTexto} de Almacén a Central`}
                              </span>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}

          {/* ================= SECCIÓN 2: TARJETAS LIMPIAS Y BONITAS POR CADA PEDIDO DE CLIENTE ================= */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {etapaFiltro === 'pendiente_alistar'
                  ? `2. Pedidos por cliente de ${camionActivo.nombre} (${camionActivo.pedidos.length})`
                  : `Pedidos por cliente (${camionActivo.pedidos.length})`}
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {camionActivo.pedidos
                .slice(
                  (paginaTiendas - 1) * TAMANO_PAGINA_TIENDAS,
                  paginaTiendas * TAMANO_PAGINA_TIENDAS
                )
                .map((ped) => {
                  const etapa = ped.etapa_ruta || 'pendiente_alistar'
                  const clienteObj = ped.clientes || { nombre: 'Cliente' }
                  const preventistaNombre =
                    ped.perfiles?.nombre || 'Preventista'
                  const detallesOriginales = ped.venta_detalles || []
                  const lineasAgrupadas =
                    agruparLineasTienda(detallesOriginales)
                  const custodia = ped.info_custodia || {}
                  const puedeCancelar =
                    etapa !== 'rendido_dueno' || esAdmin

                  return (
                    <article
                      key={ped.id}
                      className="rounded-2xl bg-white dark:bg-[#161922] border border-slate-200/85 dark:border-white/[0.08] hover:border-amber-500/35 dark:hover:border-white/[0.15] shadow-2xs p-4 flex flex-col justify-between gap-3.5 transition"
                    >
                      <div className="space-y-3">
                        {/* Cabecera de la tarjeta: Cliente + Total */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-amber-500/12 border border-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                              <Store size={16} />
                            </div>

                            <div className="min-w-0">
                              <h4 className="text-sm sm:text-[15px] font-extrabold text-slate-900 dark:text-white leading-snug truncate">
                                {clienteObj.nombre}
                              </h4>

                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {clienteObj.direccion && (
                                  <span className="inline-flex items-center gap-1 truncate max-w-[220px]">
                                    <MapPin
                                      size={11}
                                      className="text-slate-400 shrink-0"
                                    />
                                    <span className="truncate">
                                      {clienteObj.direccion}
                                    </span>
                                  </span>
                                )}

                                {clienteObj.telefono && (
                                  <span className="inline-flex items-center gap-1 tabular-nums">
                                    <Phone
                                      size={10}
                                      className="text-slate-400 shrink-0"
                                    />
                                    <span>{clienteObj.telefono}</span>
                                  </span>
                                )}

                                {ped.fecha_pedido && (
                                  <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                                    {formatearFechaCorta(ped.fecha_pedido)}
                                  </span>
                                )}
                              </div>

                              {camionActivo.id === 'TODOS' && (
                                <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                  Preventista: {preventistaNombre}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0 tabular-nums">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Total
                            </div>
                            <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 leading-tight">
                              {formatearBs(ped.total)}
                            </div>

                            {(etapa === 'cobrado_preventista' ||
                              etapa === 'rendido_dueno') && (
                              <div className="text-[10px] text-slate-400 mt-0.5 space-y-0.5">
                                <div>
                                  Efec: {formatearBs(ped.monto_efectivo)} · QR:{' '}
                                  {formatearBs(ped.monto_qr)}
                                </div>
                                {Number(ped.saldo_credito) > 0 && (
                                  <div className="text-amber-600 dark:text-amber-400 font-bold">
                                    Créd: {formatearBs(ped.saldo_credito)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Cuerpo de la tarjeta: Lista ordenada de bebidas pedidas */}
                        <div className="rounded-xl bg-slate-50/90 dark:bg-[#11141B] border border-slate-200/75 dark:border-white/[0.06] px-3.5 py-2 divide-y divide-slate-200/60 dark:divide-white/[0.05] tabular-nums">
                          {lineasAgrupadas.map((linea) => {
                            const prodCat =
                              mapaProductosPorId[linea.producto_id] ||
                              linea.productos ||
                              {}
                            const esBonoManual =
                              linea.tipo_venta === 'bono_regalo'
                            const esBonoPromo =
                              linea.tipo_venta === 'bono_promocion'
                            const esBono = esBonoManual || esBonoPromo
                            const esSurtido =
                              linea.tipo_venta === 'paquete_surtido'

                            let etiquetaCantidad = ''
                            if (linea.esAgrupadoRegular) {
                              if (linea.paquetes > 0 && linea.sueltas > 0) {
                                etiquetaCantidad = `${linea.paquetes} Paq + ${linea.sueltas} Bot`
                              } else if (linea.paquetes > 0) {
                                etiquetaCantidad = `${linea.paquetes} Paq`
                              } else {
                                etiquetaCantidad = `${linea.sueltas} Bot`
                              }
                            } else if (esSurtido) {
                              etiquetaCantidad = `${
                                linea.unidades_totales_descontar ||
                                linea.cantidad
                              } Bot surt.`
                            } else if (esBonoPromo) {
                              etiquetaCantidad = `+${linea.cantidad} Paq Gratis`
                            } else if (esBonoManual) {
                              etiquetaCantidad = `+${linea.unidades_totales_descontar} Bot Bono`
                            } else {
                              etiquetaCantidad = `${linea.cantidad} Bot`
                            }

                            return (
                              <div
                                key={linea.id}
                                className="py-1.5 first:pt-0.5 last:pb-0.5 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                    {prodCat.nombre || 'Bebida'}
                                    {prodCat.sabor ? ` (${prodCat.sabor})` : ''}
                                  </div>
                                  {linea.nota_surtido && (
                                    <div className="text-[10px] text-slate-400 truncate">
                                      {linea.nota_surtido}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span
                                    className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] ${
                                      esBono
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    }`}
                                  >
                                    {etiquetaCantidad}
                                  </span>

                                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 min-w-[56px] text-right">
                                    {esBono
                                      ? 'Gratis'
                                      : formatearBs(linea.subtotal)}
                                  </span>

                                  {esBonoManual &&
                                    esAdmin &&
                                    etapa === 'pendiente_alistar' && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          eliminarBonoDePedido(linea.id)
                                        }
                                        title="Quitar bono"
                                        className="text-slate-400 hover:text-red-500 cursor-pointer"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Pie de la tarjeta: Cancelar pedido + Utilidades + Acción principal */}
                      <div className="pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {puedeCancelar && (
                            <button
                              type="button"
                              onClick={() => setPedidoCancelarModal(ped)}
                              title="Cancelar este pedido"
                              className="h-8.5 px-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <Trash2 size={13} />
                              <span>Cancelar</span>
                            </button>
                          )}

                          <button
                            type="button"
                            title="Descargar PDF"
                            onClick={() =>
                              generarYCompartirPDF(
                                ped,
                                clienteObj,
                                detallesOriginales,
                                preventistaNombre,
                                false
                              )
                            }
                            className="h-8.5 w-8.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] text-slate-600 dark:text-slate-300 inline-flex items-center justify-center transition cursor-pointer"
                          >
                            <Download size={14} />
                          </button>

                          <a
                            href={generarUrlWhatsAppPedido(
                              ped,
                              clienteObj,
                              detallesOriginales,
                              preventistaNombre
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Enviar por WhatsApp"
                            className="h-8.5 w-8.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-emerald-500/15 text-slate-600 dark:text-slate-300 hover:text-emerald-500 inline-flex items-center justify-center transition no-underline"
                          >
                            <MessageCircle size={14} />
                          </a>
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto">
                          {etapa === 'pendiente_alistar' && esAdmin && (
                            <button
                              type="button"
                              onClick={() => abrirModalBono(ped)}
                              title="Agregar bono gratis"
                              className="h-8.5 px-2.5 rounded-xl bg-amber-500/12 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <Gift size={13} />
                              <span>Bono</span>
                            </button>
                          )}

                          {etapa === 'pendiente_alistar' && (
                            <button
                              type="button"
                              disabled={despachandoId !== null}
                              onClick={() =>
                                ejecutarEntregaAPreventista(
                                  [ped],
                                  preventistaNombre
                                )
                              }
                              className="h-8.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                            >
                              <PackageCheck
                                size={14}
                                className="stroke-[2.5]"
                              />
                              <span>
                                {despachandoId === ped.id
                                  ? 'Entregando...'
                                  : 'Entregar'}
                              </span>
                            </button>
                          )}

                          {etapa === 'entregado_preventista' && (
                            <button
                              type="button"
                              onClick={() => abrirModalLiquidacion(ped)}
                              className="h-8.5 px-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                            >
                              <Banknote size={14} />
                              <span>Cobrar</span>
                            </button>
                          )}

                          {etapa === 'cobrado_preventista' && esAdmin && (
                            <button
                              type="button"
                              onClick={() =>
                                abrirModalRecepcionDueno(
                                  [ped],
                                  preventistaNombre
                                )
                              }
                              className="h-8.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                            >
                              <ShieldCheck size={14} />
                              <span>Recibir</span>
                            </button>
                          )}

                          {etapa === 'rendido_dueno' && (
                            <span
                              title={
                                custodia.fecha_rendicion
                                  ? `Recibido ${formatearFechaCorta(
                                      custodia.fecha_rendicion
                                    )}`
                                  : 'Liquidado'
                              }
                              className="h-8.5 px-3 rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-xs font-bold inline-flex items-center gap-1"
                            >
                              <Check size={13} className="stroke-[2.5]" />
                              <span>Rendido</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
            </div>

            {camionActivo.pedidos.length > TAMANO_PAGINA_TIENDAS && (
              <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/85 dark:border-white/[0.08] overflow-hidden">
                <PaginationBar
                  paginaActual={paginaTiendas}
                  totalRegistros={camionActivo.pedidos.length}
                  tamanoPagina={TAMANO_PAGINA_TIENDAS}
                  onCambiarPagina={setPaginaTiendas}
                  etiquetaItem="pedidos de clientes"
                />
              </div>
            )}
          </section>
        </div>
      ) : null}

      {/* ================= MODAL 0: CONFIRMAR ENTREGA DE CARGA AL PREVENTISTA ================= */}
      {modalDespachoCamion && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Entregar Carga al Preventista
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {modalDespachoCamion.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalDespachoCamion(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 space-y-1 text-xs text-slate-800 dark:text-slate-200">
                <div className="flex items-center justify-between">
                  <span>Pedidos a entregar:</span>
                  <strong>{modalDespachoCamion.pedidos.length} tiendas</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Valor total en mercadería:</span>
                  <strong className="text-amber-700 dark:text-amber-400">
                    {formatearBs(modalDespachoCamion.totalBs)}
                  </strong>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Al confirmar, el stock se descontará de{' '}
                <strong>Tienda Central</strong> y los pedidos pasarán al celular
                del preventista como{' '}
                <strong>&ldquo;2. En Ruta (Por Cobrar al Cliente)&rdquo;</strong>.
              </p>

              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalDespachoCamion(null)}
                  className="h-9.5 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={despachandoId !== null}
                  onClick={() =>
                    ejecutarEntregaAPreventista(
                      modalDespachoCamion.pedidos,
                      modalDespachoCamion.nombre
                    )
                  }
                  className="h-9.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  <PackageCheck className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {despachandoId !== null
                      ? 'Despachando...'
                      : 'Confirmar Entrega a Preventista'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 1: AGREGAR BONO (ETAPA 1) ================= */}
      {esAdmin && pedidoBonoActivo && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Agregar Bono Gratis
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pedidoBonoActivo.clientes?.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPedidoBonoActivo(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={guardarBonoEnPedido} className="p-5 space-y-4">
              {errorBono && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {errorBono}
                </div>
              )}

              <div className="space-y-2">
                <div className="relative">
                  <Search
                    size={13}
                    className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={busquedaBonoProd}
                    onChange={(e) => setBusquedaBonoProd(e.target.value)}
                    placeholder="Buscar bebida o sabor..."
                    className="w-full h-8.5 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200/80 dark:border-white/[0.08]">
                  {productosFiltradosBono.map((p) => {
                    const seleccionado = bonoProductoId === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setBonoProductoId(p.id)}
                        className={`w-full px-3 py-2 flex items-center justify-between gap-2.5 text-left transition cursor-pointer ${
                          seleccionado
                            ? 'bg-amber-50 dark:bg-amber-500/15'
                            : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-10 rounded-lg bg-[#F6F5F2] flex items-center justify-center shrink-0">
                            <BottleVisual
                              imagenUrl={p.imagen_url}
                              nombre={p.nombre}
                              alturaClass="h-8"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {p.nombre}
                              {p.sabor ? ` · ${p.sabor}` : ''}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {p.marca} · Pack x{p.unidades_por_paquete}
                            </div>
                          </div>
                        </div>

                        {seleccionado && (
                          <Check
                            size={15}
                            className="text-amber-600 dark:text-amber-400 shrink-0 stroke-[2.5]"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Formato
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#11141B] border border-slate-200/60 dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => setBonoFormato('paquete')}
                      className={`py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        bonoFormato === 'paquete'
                          ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Paquetes
                    </button>
                    <button
                      type="button"
                      onClick={() => setBonoFormato('unidad')}
                      className={`py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        bonoFormato === 'unidad'
                          ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Botellas
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Cantidad
                  </label>
                  <div className="flex items-center justify-between h-9.5 px-2 rounded-xl bg-slate-50 dark:bg-[#11141B] border border-slate-200 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() =>
                        setBonoCantidad((prev) =>
                          Math.max(1, (parseInt(prev, 10) || 1) - 1)
                        )
                      }
                      className="w-7 h-7 rounded-lg bg-white dark:bg-white/10 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      required
                      value={bonoCantidad}
                      onChange={(e) => setBonoCantidad(e.target.value)}
                      className="w-12 text-center bg-transparent text-sm font-extrabold text-slate-900 dark:text-white tabular-nums focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setBonoCantidad(
                          (prev) => (parseInt(prev, 10) || 0) + 1
                        )
                      }
                      className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={13} className="stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 tabular-nums">
                  Sin cargo (Bs 0)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPedidoBonoActivo(null)}
                    className="h-9 px-3.5 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoBono}
                    className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Gift size={13} />
                    <span>{guardandoBono ? 'Guardando...' : 'Agregar'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: COBRAR AL CLIENTE (ETAPA 2 -> ETAPA 3) ================= */}
      {pedidoLiquidar && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Registrar Entrega y Cobro al Cliente
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pedidoLiquidar.clientes?.nombre}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-extrabold text-slate-900 dark:text-amber-400 tabular-nums">
                  {formatearBs(totalLiquidar)}
                </span>
                <button
                  type="button"
                  onClick={() => setPedidoLiquidar(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form
              onSubmit={confirmarCobroClienteDesdeDespacho}
              className="p-5 space-y-4"
            >
              {errorLiquidacion && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorLiquidacion}</span>
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
                          : 'bg-slate-50 dark:bg-[#11141B] text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-white/[0.08] hover:bg-slate-100 dark:hover:bg-white/[0.06]'
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
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Efectivo cobrado
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
                  <label className="block text-xs font-medium text-slate-500 mb-1">
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

              {(excedeTotal || saldoCreditoCalculado > 0) && (
                <div
                  className={`px-3.5 py-2 rounded-xl border flex items-center justify-between text-xs tabular-nums ${
                    excedeTotal
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-amber-50 border-amber-200/80 text-amber-900'
                  }`}
                >
                  {excedeTotal ? (
                    <span className="font-semibold">
                      El monto supera el total ({formatearBs(totalLiquidar)})
                    </span>
                  ) : (
                    <>
                      <span>Queda a crédito en cliente:</span>
                      <span className="font-extrabold">
                        {formatearBs(saldoCreditoCalculado)}
                      </span>
                    </>
                  )}
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                El monto cobrado quedará pendiente de entregar al Dueño en la
                pestaña <strong>3. Rendir al Dueño</strong>.
              </p>

              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPedidoLiquidar(null)}
                  className="h-9.5 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={confirmandoEntrega || excedeTotal}
                  className="h-9.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {confirmandoEntrega ? 'Guardando...' : 'Guardar Cobro'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 3: CONFIRMAR RECEPCIÓN DE DINERO POR EL DUEÑO (ETAPA 3 -> ETAPA 4) ================= */}
      {esAdmin && modalRendicionDueno && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Recibir Dinero del Preventista
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {modalRendicionDueno.nombrePreventista} ·{' '}
                  {modalRendicionDueno.pedidos.length} pedido(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalRendicionDueno(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={confirmarRecepcionDineroDueno}
              className="p-5 space-y-4"
            >
              <div className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 space-y-2 tabular-nums">
                <div className="flex items-center justify-between text-xs text-amber-900 dark:text-amber-300 font-semibold">
                  <span>Efectivo físico a recibir en mano:</span>
                  <span className="text-lg font-black text-slate-900 dark:text-amber-400">
                    {formatearBs(modalRendicionDueno.efectivoBs)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                  <span>Pagos por QR verificados en cuenta:</span>
                  <span className="font-bold">
                    {formatearBs(modalRendicionDueno.qrBs)}
                  </span>
                </div>
                {modalRendicionDueno.creditoBs > 0 && (
                  <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 pt-1 border-t border-amber-200/70 dark:border-white/10">
                    <span>Saldos a crédito registrados en tiendas:</span>
                    <span className="font-bold">
                      {formatearBs(modalRendicionDueno.creditoBs)}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Observación opcional
                </label>
                <input
                  type="text"
                  value={notaRendicion}
                  onChange={(e) => setNotaRendicion(e.target.value)}
                  placeholder="Ej. Efectivo completo recibido conforme..."
                  className="w-full h-9.5 px-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalRendicionDueno(null)}
                  className="h-9.5 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoRendicion}
                  className="h-9.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {guardandoRendicion
                      ? 'Confirmando...'
                      : 'Recibí Conforme el Dinero'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL 4: CONFIRMAR CANCELACIÓN DE PEDIDO ================= */}
      {pedidoCancelarModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Cancelar Pedido
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {pedidoCancelarModal.clientes?.nombre || 'Cliente'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPedidoCancelarModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 space-y-1 text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                <div className="flex items-center justify-between">
                  <span>Cliente:</span>
                  <strong>
                    {pedidoCancelarModal.clientes?.nombre || 'Cliente'}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Monto del pedido:</span>
                  <strong className="text-red-600 dark:text-red-400">
                    {formatearBs(pedidoCancelarModal.total)}
                  </strong>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {pedidoCancelarModal.estado === 'entregado' ? (
                  <>
                    Este pedido ya había descontado mercadería. Al cancelarlo,{' '}
                    <strong>
                      todas sus bebidas se devolverán automáticamente al stock de
                      Tienda Central
                    </strong>{' '}
                    y el pedido quedará eliminado.
                  </>
                ) : (
                  <>
                    Este pedido aún no fue despachado. Se eliminará de la lista
                    de pedidos pendientes sin afectar el inventario.
                  </>
                )}
              </p>

              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={cancelandoPedido}
                  onClick={() => setPedidoCancelarModal(null)}
                  className="h-9.5 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="button"
                  disabled={cancelandoPedido}
                  onClick={ejecutarCancelacionPedido}
                  className="h-9.5 px-5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>
                    {cancelandoPedido ? 'Cancelando...' : 'Sí, Cancelar Pedido'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
