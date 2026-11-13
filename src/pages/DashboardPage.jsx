import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  TrendingUp,
  Banknote,
  Trophy,
  Warehouse,
  FileDown,
  Users,
  Plus,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Power,
  X,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  KeyRound,
  ArrowUpRight,
  Wallet,
  Truck,
} from 'lucide-react'
import {
  supabase,
  enriquecerProductosConCosto,
  consultarVentasEntregadasPorPeriodo,
  consultarResumenCustodiaActiva,
  listarPerfilesSupabase,
  crearUsuarioConCredencialesSupabase,
  actualizarCredencialesPersonalSupabase,
  limpiarIdentificadorUsuario,
} from '../lib/supabase'
import { useRole } from '../context/RoleContext'
import { ROLES_INFO } from '../config/navigation'
import { exportarReporteDashboardPDF } from '../utils/pdfGenerator'
import BottleVisual from '../components/BottleVisual'
import PaginationBar from '../components/PaginationBar'

const MESES_NOMBRES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

function formatearCantidadesLimpio(unidadesTotales, unidadesPorPaquete = 6) {
  const total = Math.max(0, Math.floor(Number(unidadesTotales) || 0))
  const factor = Math.max(1, Math.floor(Number(unidadesPorPaquete) || 1))
  if (total === 0) return 'Sin stock'
  if (factor === 1) return `${total} Bot`
  const paq = Math.floor(total / factor)
  const bot = total % factor
  if (paq > 0 && bot > 0) return `${paq} Paq + ${bot} Bot`
  if (paq > 0) return `${paq} Paq`
  return `${bot} Bot`
}

function obtenerIsoLocal(dateObj) {
  const y = dateObj.getFullYear()
  const m = String(dateObj.getMonth() + 1).padStart(2, '0')
  const d = String(dateObj.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { rolActual, esCuentaAdmin, recargarPerfiles } = useRole()
  const esAdmin = rolActual === 'admin' || esCuentaAdmin

  // Pestaña activa: 'reportes' | 'personal'
  const [seccionActiva, setSeccionActiva] = useState('reportes')

  const [ventasEntregadas, setVentasEntregadas] = useState([])
  const [resumenCustodiaRuta, setResumenCustodiaRuta] = useState({
    enCamionCount: 0,
    enCamionTotalBs: 0,
    porRendirCount: 0,
    porRendirEfectivoBs: 0,
    porRendirQrBs: 0,
    porRendirTotalRecaudadoBs: 0,
    porRendirCreditoBs: 0,
    porPreventista: [],
  })
  const [productos, setProductos] = useState([])
  const [ubicaciones, setUbicaciones] = useState([])
  const [inventario, setInventario] = useState([])
  const [perfiles, setPerfiles] = useState([])
  const [cargando, setCargando] = useState(true)
  const [mensajeExito, setMensajeExito] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // ================= FILTROS DE TIEMPO (DÍA | MES | AÑO | RANGO) =================
  const ahoraRef = useMemo(() => new Date(), [])
  const hoyIso = useMemo(() => obtenerIsoLocal(new Date()), [])

  // 'DIA' | 'MES' | 'ANIO' | 'RANGO' (Por defecto inicia en 'DIA' = Hoy)
  const [tipoPeriodo, setTipoPeriodo] = useState('DIA')
  const [fechaDia, setFechaDia] = useState(hoyIso)
  const [mesSeleccionado, setMesSeleccionado] = useState(ahoraRef.getMonth())
  const [anioSeleccionado, setAnioSeleccionado] = useState(
    ahoraRef.getFullYear()
  )
  const [rangoDesde, setRangoDesde] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return obtenerIsoLocal(d)
  })
  const [rangoHasta, setRangoHasta] = useState(hoyIso)
  const [vendedorFiltro, setVendedorFiltro] = useState('TODOS')

  // ================= ESTADOS GESTIÓN DE PREVENTISTAS Y CONTRASEÑAS =================
  const [clavesVisibles, setClavesVisibles] = useState({})
  const [copiadoId, setCopiadoId] = useState(null)

  const [modalNuevoUsuario, setModalNuevoUsuario] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoRol, setNuevoRol] = useState('preventista')
  const [nuevoUsuarioLogin, setNuevoUsuarioLogin] = useState('')
  const [nuevoPassword, setNuevoPassword] = useState('')
  const [verClaveCrear, setVerClaveCrear] = useState(false)

  const [usuarioEditando, setUsuarioEditando] = useState(null)
  const [formEditarUsuario, setFormEditarUsuario] = useState({
    nombre: '',
    rol: 'preventista',
    usuarioLogin: '',
    nuevaPassword: '',
    activo: true,
  })
  const [verClaveEditar, setVerClaveEditar] = useState(false)
  const [guardandoUsuario, setGuardandoUsuario] = useState(false)

  // Paginación limpia en tablas extensas
  const [paginaDesglose, setPaginaDesglose] = useState(1)
  const [paginaBebidas, setPaginaBebidas] = useState(1)
  const TAMANO_DESGLOSE = 15
  const TAMANO_BEBIDAS = 12

  // Rango exacto ISO que se enviará a PostgreSQL para descargar SOLO las ventas del periodo
  const limitesServidorPeriodo = useMemo(() => {
    if (tipoPeriodo === 'DIA') {
      return { desdeIso: fechaDia, hastaIso: fechaDia }
    }
    if (tipoPeriodo === 'MES') {
      const mStr = String(mesSeleccionado + 1).padStart(2, '0')
      const ultimoDia = new Date(anioSeleccionado, mesSeleccionado + 1, 0).getDate()
      return {
        desdeIso: `${anioSeleccionado}-${mStr}-01`,
        hastaIso: `${anioSeleccionado}-${mStr}-${String(ultimoDia).padStart(2, '0')}`,
      }
    }
    if (tipoPeriodo === 'ANIO') {
      return {
        desdeIso: `${anioSeleccionado}-01-01`,
        hastaIso: `${anioSeleccionado}-12-31`,
      }
    }
    return {
      desdeIso: rangoDesde || null,
      hastaIso: rangoHasta || null,
    }
  }, [
    tipoPeriodo,
    fechaDia,
    mesSeleccionado,
    anioSeleccionado,
    rangoDesde,
    rangoHasta,
  ])

  const cargarBaseCatalogo = useCallback(async () => {
    const [resProds, resUbic, resInv, listaPerfiles] = await Promise.all([
      supabase
        .from('productos')
        .select('*')
        .order('nombre', { ascending: true }),
      supabase.from('ubicaciones').select('*'),
      supabase.from('inventario').select('*'),
      listarPerfilesSupabase(true),
    ])

    if (resProds.error) throw resProds.error

    const prodsConCosto = await enriquecerProductosConCosto(resProds.data || [])
    setProductos(prodsConCosto)
    setUbicaciones(resUbic.data || [])
    setInventario(resInv.data || [])
    setPerfiles(listaPerfiles || [])
  }, [])

  const cargarVentasPeriodoServidor = useCallback(async () => {
    setCargando(true)
    setErrorMsg('')
    try {
      const [ventasServidor, custodiaActiva] = await Promise.all([
        consultarVentasEntregadasPorPeriodo({
          desdeIso: limitesServidorPeriodo.desdeIso,
          hastaIso: limitesServidorPeriodo.hastaIso,
          vendedorId: vendedorFiltro,
        }),
        consultarResumenCustodiaActiva(),
      ])
      setVentasEntregadas(ventasServidor)
      setResumenCustodiaRuta(custodiaActiva)
      setPaginaDesglose(1)
      setPaginaBebidas(1)
    } catch (err) {
      console.error('Error cargando ventas del periodo en Dashboard:', err)
      setErrorMsg(
        err.message || 'No se pudieron cargar las ventas del periodo.'
      )
    } finally {
      setCargando(false)
    }
  }, [limitesServidorPeriodo, vendedorFiltro])

  const cargarTodoDashboard = useCallback(async () => {
    setCargando(true)
    setErrorMsg('')
    try {
      await Promise.all([
        cargarBaseCatalogo(),
        consultarVentasEntregadasPorPeriodo({
          desdeIso: limitesServidorPeriodo.desdeIso,
          hastaIso: limitesServidorPeriodo.hastaIso,
          vendedorId: vendedorFiltro,
        }).then((ventasServidor) => setVentasEntregadas(ventasServidor)),
        consultarResumenCustodiaActiva().then((custodiaActiva) =>
          setResumenCustodiaRuta(custodiaActiva)
        ),
      ])
    } catch (err) {
      console.error('Error cargando Dashboard:', err)
      setErrorMsg(
        err.message || 'No se pudieron cargar las métricas del Dashboard.'
      )
    } finally {
      setCargando(false)
    }
  }, [cargarBaseCatalogo, limitesServidorPeriodo, vendedorFiltro])

  // Cargar catálogo/stock una sola vez al entrar
  useEffect(() => {
    cargarBaseCatalogo().catch((err) =>
      console.error('Error cargando base catálogo Dashboard:', err)
    )
  }, [cargarBaseCatalogo])

  // Consultar ventas en servidor cada vez que cambia el periodo o preventista
  useEffect(() => {
    cargarVentasPeriodoServidor()
  }, [cargarVentasPeriodoServidor])

  const mapaProductos = useMemo(() => {
    const m = {}
    productos.forEach((p) => {
      m[p.id] = p
    })
    return m
  }, [productos])

  // Lista de años disponibles (últimos 4 años + años presentes)
  const aniosDisponibles = useMemo(() => {
    const actual = new Date().getFullYear()
    const setAnios = new Set([actual, actual - 1, actual - 2, actual - 3])
    ventasEntregadas.forEach((v) => {
      const fStr = v.fecha_entrega || v.fecha_pedido
      if (fStr) {
        const y = new Date(fStr).getFullYear()
        if (!Number.isNaN(y)) setAnios.add(y)
      }
    })
    return Array.from(setAnios).sort((a, b) => b - a)
  }, [ventasEntregadas])

  // Helper centralizado para evaluar el costo exacto de una línea de `venta_detalles`
  const calcularCostoYUnidadesDetalle = useCallback(
    (det) => {
      const prod = mapaProductos[det.producto_id] || {}
      const unidPaq = Math.max(1, Number(prod.unidades_por_paquete) || 6)
      const esBono =
        det.tipo_venta === 'bono_regalo' || det.tipo_venta === 'bono_promocion'

      const botellas =
        Number(det.unidades_totales_descontar) ||
        (det.tipo_venta === 'paquete' || det.tipo_venta === 'bono_promocion'
          ? (Number(det.cantidad) || 0) * unidPaq
          : Number(det.cantidad) || 0)

      // Usar costo_unitario guardado al vender; si no existe, usar costo_paquete actual / unidades_por_paquete
      const costoUnitSnapshot = Number(det.costo_unitario) || 0
      const costoUnitCatalogo = (Number(prod.costo_paquete) || 0) / unidPaq
      const costoUnitario =
        costoUnitSnapshot > 0 ? costoUnitSnapshot : costoUnitCatalogo

      const costoLinea = botellas * costoUnitario
      const ingresoLinea = esBono ? 0 : Number(det.subtotal) || 0

      return {
        prod,
        unidPaq,
        esBono,
        botellas,
        costoUnitario,
        costoLinea,
        ingresoLinea,
        sinCostoConfigurado: costoUnitario <= 0,
      }
    },
    [mapaProductos]
  )

  // Ventas filtradas por Día / Mes / Año / Rango + Preventista
  // (Excluye preventas que siguen en el camión del preventista sin haberse entregado/cobrado aún al cliente)
  const ventasDelPeriodo = useMemo(() => {
    return ventasEntregadas.filter((v) => {
      if (v.etapa_ruta === 'entregado_preventista') {
        return false
      }
      if (vendedorFiltro !== 'TODOS' && v.vendedor_id !== vendedorFiltro) {
        return false
      }
      const fechaRefStr = v.fecha_entrega || v.fecha_pedido
      if (!fechaRefStr) return true
      const f = new Date(fechaRefStr)
      const fIso = obtenerIsoLocal(f)

      if (tipoPeriodo === 'DIA') {
        return fIso === fechaDia
      }
      if (tipoPeriodo === 'MES') {
        return (
          f.getMonth() === Number(mesSeleccionado) &&
          f.getFullYear() === Number(anioSeleccionado)
        )
      }
      if (tipoPeriodo === 'ANIO') {
        return f.getFullYear() === Number(anioSeleccionado)
      }
      if (tipoPeriodo === 'RANGO') {
        return fIso >= rangoDesde && fIso <= rangoHasta
      }
      return true
    })
  }, [
    ventasEntregadas,
    vendedorFiltro,
    tipoPeriodo,
    fechaDia,
    mesSeleccionado,
    anioSeleccionado,
    rangoDesde,
    rangoHasta,
  ])

  // ================= KPIs GLOBALES DE VENTAS, COSTOS Y GANANCIA NETA =================
  const kpisPeriodo = useMemo(() => {
    let totalVentasBrutas = 0
    let costoTotalMercaderia = 0
    let costoSoloBonos = 0
    let totalEfectivo = 0
    let totalQr = 0
    let totalCreditosCalle = 0
    let totalBotellasBono = 0
    const productosSinCostoSet = new Set()

    ventasDelPeriodo.forEach((v) => {
      totalVentasBrutas += Number(v.total) || 0
      totalEfectivo += Number(v.monto_efectivo) || 0
      totalQr += Number(v.monto_qr) || 0
      totalCreditosCalle += Number(v.saldo_credito) || 0

      ;(v.venta_detalles || []).forEach((d) => {
        const calc = calcularCostoYUnidadesDetalle(d)
        costoTotalMercaderia += calc.costoLinea
        if (calc.esBono) {
          costoSoloBonos += calc.costoLinea
          totalBotellasBono += calc.botellas
        }
        if (calc.sinCostoConfigurado && d.producto_id) {
          productosSinCostoSet.add(d.producto_id)
        }
      })
    })

    const gananciaNetaReal = totalVentasBrutas - costoTotalMercaderia
    const margenNetoPct =
      totalVentasBrutas > 0 ? (gananciaNetaReal / totalVentasBrutas) * 100 : 0

    return {
      totalVentasBrutas,
      costoTotalMercaderia,
      costoSoloBonos,
      gananciaNetaReal,
      margenNetoPct,
      totalEfectivo,
      totalQr,
      dineroRealRecaudado: totalEfectivo + totalQr,
      totalCreditosCalle,
      totalBotellasBono,
      cantidadVentas: ventasDelPeriodo.length,
      productosSinCostoCount: productosSinCostoSet.size,
    }
  }, [ventasDelPeriodo, calcularCostoYUnidadesDetalle])

  // ================= DESGLOSE TEMPORAL DE GANANCIAS (POR ENTREGA / POR DÍA / POR MES) =================
  const { tituloDesgloseTemporal, desgloseTemporal } = useMemo(() => {
    // 1) Si es POR AÑO -> agrupar Mes por Mes (Ene - Dic)
    if (tipoPeriodo === 'ANIO') {
      const mapaMes = {}
      ventasDelPeriodo.forEach((v) => {
        const f = new Date(v.fecha_entrega || v.fecha_pedido)
        const mIdx = f.getMonth()
        if (!mapaMes[mIdx]) {
          mapaMes[mIdx] = {
            orden: mIdx,
            etiqueta: `${MESES_NOMBRES[mIdx]} ${anioSeleccionado}`,
            entregas: 0,
            ventas: 0,
            costo: 0,
          }
        }
        mapaMes[mIdx].entregas += 1
        mapaMes[mIdx].ventas += Number(v.total) || 0
        ;(v.venta_detalles || []).forEach((d) => {
          mapaMes[mIdx].costo += calcularCostoYUnidadesDetalle(d).costoLinea
        })
      })

      const filas = Object.values(mapaMes)
        .sort((a, b) => b.orden - a.orden)
        .map((item) => {
          const ganancia = item.ventas - item.costo
          const margenPct = item.ventas > 0 ? (ganancia / item.ventas) * 100 : 0
          return { ...item, ganancia, margenPct }
        })

      return {
        tituloDesgloseTemporal: `Ganancia mes por mes (${anioSeleccionado})`,
        desgloseTemporal: filas,
      }
    }

    // 2) Si es POR DÍA -> mostrar cada entrega realizada ese día
    if (tipoPeriodo === 'DIA') {
      const filas = ventasDelPeriodo.map((v) => {
        const f = new Date(v.fecha_entrega || v.fecha_pedido)
        const hora = f.toLocaleTimeString('es-BO', {
          hour: '2-digit',
          minute: '2-digit',
        })
        const clienteNombre = v.clientes?.nombre || 'Venta Mostrador'
        const ventas = Number(v.total) || 0
        let costo = 0
        ;(v.venta_detalles || []).forEach((d) => {
          costo += calcularCostoYUnidadesDetalle(d).costoLinea
        })
        const ganancia = ventas - costo
        const margenPct = ventas > 0 ? (ganancia / ventas) * 100 : 0
        return {
          id: v.id,
          etiqueta: `${hora} · ${clienteNombre}`,
          subtitulo: v.perfiles?.nombre || 'Tienda Central',
          entregas: 1,
          ventas,
          costo,
          ganancia,
          margenPct,
        }
      })

      return {
        tituloDesgloseTemporal: `Detalle de entregas del día (${fechaDia})`,
        desgloseTemporal: filas,
      }
    }

    // 3) Si es POR MES o RANGO -> agrupar Día por Día
    const mapaDias = {}
    ventasDelPeriodo.forEach((v) => {
      const f = new Date(v.fecha_entrega || v.fecha_pedido)
      const iso = obtenerIsoLocal(f)
      if (!mapaDias[iso]) {
        mapaDias[iso] = {
          orden: iso,
          etiqueta: f.toLocaleDateString('es-BO', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          entregas: 0,
          ventas: 0,
          costo: 0,
        }
      }
      mapaDias[iso].entregas += 1
      mapaDias[iso].ventas += Number(v.total) || 0
      ;(v.venta_detalles || []).forEach((d) => {
        mapaDias[iso].costo += calcularCostoYUnidadesDetalle(d).costoLinea
      })
    })

    const filas = Object.values(mapaDias)
      .sort((a, b) => b.orden.localeCompare(a.orden))
      .map((item) => {
        const ganancia = item.ventas - item.costo
        const margenPct = item.ventas > 0 ? (ganancia / item.ventas) * 100 : 0
        return { ...item, ganancia, margenPct }
      })

    return {
      tituloDesgloseTemporal:
        tipoPeriodo === 'MES'
          ? `Ganancia día por día (${MESES_NOMBRES[mesSeleccionado]} ${anioSeleccionado})`
          : 'Ganancia día por día en el rango',
      desgloseTemporal: filas,
    }
  }, [
    tipoPeriodo,
    ventasDelPeriodo,
    anioSeleccionado,
    mesSeleccionado,
    fechaDia,
    calcularCostoYUnidadesDetalle,
  ])

  // ================= RENTABILIDAD POR BEBIDA / PRODUCTO =================
  const rentabilidadProductos = useMemo(() => {
    const mapa = {}

    ventasDelPeriodo.forEach((v) => {
      ;(v.venta_detalles || []).forEach((d) => {
        const calc = calcularCostoYUnidadesDetalle(d)
        const pid = d.producto_id
        if (!mapa[pid]) {
          mapa[pid] = {
            id: pid,
            nombre: calc.prod.nombre || 'Bebida',
            sabor: calc.prod.sabor || '',
            marca: calc.prod.marca || '',
            imagen_url: calc.prod.imagen_url || '',
            unidPaq: calc.unidPaq,
            botellasVendidas: 0,
            botellasBono: 0,
            ingresos: 0,
            costoTotal: 0,
            sinCosto: calc.sinCostoConfigurado,
          }
        }
        if (calc.esBono) {
          mapa[pid].botellasBono += calc.botellas
        } else {
          mapa[pid].botellasVendidas += calc.botellas
        }
        mapa[pid].ingresos += calc.ingresoLinea
        mapa[pid].costoTotal += calc.costoLinea
      })
    })

    return Object.values(mapa)
      .map((item) => {
        const ganancia = item.ingresos - item.costoTotal
        const margenPct =
          item.ingresos > 0 ? (ganancia / item.ingresos) * 100 : 0
        const vendTexto = formatearCantidadesLimpio(
          item.botellasVendidas,
          item.unidPaq
        )
        const bonoTexto =
          item.botellasBono > 0
            ? ` (+${formatearCantidadesLimpio(item.botellasBono, item.unidPaq)} bono)`
            : ''
        return {
          ...item,
          ganancia,
          margenPct,
          cantidadResumen: `${vendTexto}${bonoTexto}`,
        }
      })
      .sort((a, b) => b.ganancia - a.ganancia)
  }, [ventasDelPeriodo, calcularCostoYUnidadesDetalle])

  // ================= RANKING DE PREVENTISTAS CON GANANCIA NETA REAL =================
  const rankingPreventistas = useMemo(() => {
    const mapa = {}

    perfiles.forEach((p) => {
      if (p.rol === 'preventista' || p.rol === 'central' || p.rol === 'admin') {
        mapa[p.id] = {
          id: p.id,
          nombre: p.nombre,
          rol: p.rol,
          rolEtiqueta: ROLES_INFO[p.rol]?.shortLabel || p.rol,
          pedidosEntregados: 0,
          paquetesVendidos: 0,
          sueltasVendidas: 0,
          bonosRecibidosBotellas: 0,
          totalGeneradoBs: 0,
          costoGeneradoBs: 0,
        }
      }
    })

    ventasDelPeriodo.forEach((v) => {
      const key = v.vendedor_id || 'mostrador'
      if (!mapa[key]) {
        mapa[key] = {
          id: key,
          nombre: v.perfiles?.nombre || 'Tienda Central',
          rol: v.perfiles?.rol || 'central',
          rolEtiqueta: 'Tienda Central',
          pedidosEntregados: 0,
          paquetesVendidos: 0,
          sueltasVendidas: 0,
          bonosRecibidosBotellas: 0,
          totalGeneradoBs: 0,
          costoGeneradoBs: 0,
        }
      }

      mapa[key].pedidosEntregados += 1
      mapa[key].totalGeneradoBs += Number(v.total) || 0

      ;(v.venta_detalles || []).forEach((d) => {
        const cant = Number(d.cantidad) || 0
        const calc = calcularCostoYUnidadesDetalle(d)
        mapa[key].costoGeneradoBs += calc.costoLinea

        if (d.tipo_venta === 'paquete') {
          mapa[key].paquetesVendidos += cant
        } else if (
          d.tipo_venta === 'unidad' ||
          d.tipo_venta === 'paquete_surtido'
        ) {
          mapa[key].sueltasVendidas += cant
        } else if (calc.esBono) {
          mapa[key].bonosRecibidosBotellas += calc.botellas
        }
      })
    })

    return Object.values(mapa)
      .map((r) => ({
        ...r,
        gananciaGeneradaBs: r.totalGeneradoBs - r.costoGeneradoBs,
      }))
      .sort((a, b) => b.gananciaGeneradaBs - a.gananciaGeneradaBs)
  }, [perfiles, ventasDelPeriodo, calcularCostoYUnidadesDetalle])

  // ================= INVENTARIO VALORIZADO (COSTO VS VENTA) =================
  const stockValorizado = useMemo(() => {
    const almacenId = ubicaciones.find((u) => u.tipo === 'almacen')?.id
    const centralId = ubicaciones.find((u) => u.tipo === 'central')?.id

    const mapaStock = {}
    inventario.forEach((item) => {
      if (!mapaStock[item.producto_id]) {
        mapaStock[item.producto_id] = { almacen: 0, central: 0 }
      }
      if (item.ubicacion_id === almacenId) {
        mapaStock[item.producto_id].almacen = Math.max(
          0,
          Number(item.stock_unidades) || 0
        )
      } else if (item.ubicacion_id === centralId) {
        mapaStock[item.producto_id].central = Math.max(
          0,
          Number(item.stock_unidades) || 0
        )
      }
    })

    return productos
      .filter((p) => p.activo !== false)
      .map((prod) => {
        const unidPaq = Math.max(1, Number(prod.unidades_por_paquete) || 6)
        const stDep = mapaStock[prod.id]?.almacen || 0
        const stCen = mapaStock[prod.id]?.central || 0
        const stTot = stDep + stCen

        const paqTot = Math.floor(stTot / unidPaq)
        const botTot = stTot % unidPaq

        const costoPaq = Number(prod.costo_paquete) || 0
        const costoInventarioBs = stTot * (costoPaq / unidPaq)
        const valorEstimadoBs =
          paqTot * (Number(prod.precio_paquete_menor) || 0) +
          botTot * (Number(prod.precio_unidad) || 0)

        return {
          ...prod,
          unidades_por_paquete: unidPaq,
          stockDeposito: stDep,
          stockCentral: stCen,
          stockTotal: stTot,
          depositoTextoLimpio: formatearCantidadesLimpio(stDep, unidPaq),
          centralTextoLimpio: formatearCantidadesLimpio(stCen, unidPaq),
          costoInventarioBs,
          valorEstimadoBs,
          sinCentral: stCen === 0,
        }
      })
  }, [productos, ubicaciones, inventario])

  const etiquetaPeriodoActual = useMemo(() => {
    if (tipoPeriodo === 'DIA') {
      return fechaDia === hoyIso ? `Hoy (${fechaDia})` : `Día: ${fechaDia}`
    }
    if (tipoPeriodo === 'MES') {
      return `${MESES_NOMBRES[mesSeleccionado]} ${anioSeleccionado}`
    }
    if (tipoPeriodo === 'ANIO') {
      return `Año ${anioSeleccionado}`
    }
    return `Del ${rangoDesde} al ${rangoHasta}`
  }, [
    tipoPeriodo,
    fechaDia,
    hoyIso,
    mesSeleccionado,
    anioSeleccionado,
    rangoDesde,
    rangoHasta,
  ])

  const etiquetaVendedorActual = useMemo(() => {
    if (vendedorFiltro === 'TODOS') {
      return 'Toda la Distribuidora'
    }
    return (
      perfiles.find((p) => p.id === vendedorFiltro)?.nombre || 'Preventista'
    )
  }, [vendedorFiltro, perfiles])

  // ================= ACCIONES DE GESTIÓN DE PREVENTISTAS Y CONTRASEÑAS =================
  const abrirModalCrearPreventista = () => {
    setNuevoNombre('')
    setNuevoRol('preventista')
    setNuevoUsuarioLogin('')
    setNuevoPassword('')
    setVerClaveCrear(false)
    setErrorMsg('')
    setModalNuevoUsuario(true)
  }

  const handleCambioNombreNuevo = (val) => {
    setNuevoNombre(val)
    const sugerido = val
      .split('(')[0]
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.')
    setNuevoUsuarioLogin(limpiarIdentificadorUsuario(sugerido))
  }

  const crearNuevoUsuario = async (e) => {
    e.preventDefault()
    if (!nuevoNombre.trim()) return
    setGuardandoUsuario(true)
    setErrorMsg('')
    try {
      const creado = await crearUsuarioConCredencialesSupabase({
        nombre: nuevoNombre.trim(),
        rol: nuevoRol,
        usuarioLogin: nuevoUsuarioLogin.trim(),
        password: nuevoPassword,
      })
      setMensajeExito(
        `Cuenta creada: Usuario "${creado.usuario_login}" | Contraseña "${creado.clave_referencia}"`
      )
      setModalNuevoUsuario(false)
      await cargarTodoDashboard()
      await recargarPerfiles()
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo crear la cuenta.')
    } finally {
      setGuardandoUsuario(false)
    }
  }

  const abrirEdicionUsuario = (u) => {
    setUsuarioEditando(u)
    setVerClaveEditar(false)
    setFormEditarUsuario({
      nombre: u.nombre || '',
      rol: u.rol || 'preventista',
      usuarioLogin: u.usuario_login || '',
      nuevaPassword: '',
      activo: u.activo !== false,
    })
  }

  const guardarCambiosUsuario = async (e) => {
    e.preventDefault()
    if (!usuarioEditando || !formEditarUsuario.nombre.trim()) return
    setGuardandoUsuario(true)
    setErrorMsg('')
    try {
      await actualizarCredencialesPersonalSupabase({
        id: usuarioEditando.id,
        nombre: formEditarUsuario.nombre.trim(),
        rol: formEditarUsuario.rol,
        activo: formEditarUsuario.activo,
        usuarioLogin: formEditarUsuario.usuarioLogin.trim(),
        nuevaPassword: formEditarUsuario.nuevaPassword,
      })
      setMensajeExito(
        `Datos y acceso de "${formEditarUsuario.nombre}" actualizados.`
      )
      setUsuarioEditando(null)
      await cargarTodoDashboard()
      await recargarPerfiles()
      setTimeout(() => setMensajeExito(''), 5000)
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo actualizar la cuenta.')
    } finally {
      setGuardandoUsuario(false)
    }
  }

  const alternarActivoUsuario = async (u) => {
    try {
      const nuevoEstado = !(u.activo !== false)
      await actualizarCredencialesPersonalSupabase({
        id: u.id,
        nombre: u.nombre,
        rol: u.rol,
        activo: nuevoEstado,
        usuarioLogin: u.usuario_login,
      })
      await cargarTodoDashboard()
      await recargarPerfiles()
    } catch (err) {
      setErrorMsg(err.message || 'No se pudo cambiar el estado.')
    }
  }

  const copiarCredencialesPortapapeles = async (u) => {
    const texto = `Acceso BevFlow\nNombre: ${u.nombre}\nUsuario: ${
      u.usuario_login || '-'
    }\nContraseña: ${u.clave_referencia || '(asignada)'}`
    try {
      await navigator.clipboard.writeText(texto)
      setCopiadoId(u.id)
      setTimeout(() => setCopiadoId(null), 2200)
    } catch {
      // ignore
    }
  }

  const formatearBs = (n) => {
    const val = Number(n) || 0
    const abs = Math.abs(val)
    const str = abs.toLocaleString('es-BO', {
      minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })
    return val < 0 ? `-Bs ${str}` : `Bs ${str}`
  }

  if (!esAdmin) {
    return (
      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200 dark:border-white/10 p-10 text-center space-y-3">
        <Lock className="w-8 h-8 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          Acceso Exclusivo para el Dueño / Administrador
        </h2>
      </div>
    )
  }

  const maxGananciaFila = Math.max(
    1,
    ...desgloseTemporal.map((d) => Math.max(0, d.ganancia))
  )

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-14">
      {/* ================= CABECERA MINIMALISTA (CERO RUIDO VISUAL) ================= */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Ganancias y Personal
            </h1>

            {/* Segmented Control principal: Ganancias vs Preventistas */}
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200/70 dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => setSeccionActiva('reportes')}
                className={`h-7.5 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                  seccionActiva === 'reportes'
                    ? 'bg-white dark:bg-[#1E2330] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <TrendingUp size={13} className="text-emerald-500" />
                <span>Ganancias y Reportes</span>
              </button>

              <button
                type="button"
                onClick={() => setSeccionActiva('personal')}
                className={`h-7.5 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                  seccionActiva === 'personal'
                    ? 'bg-white dark:bg-[#1E2330] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Users size={13} className="text-amber-500" />
                <span>Preventistas y Accesos</span>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {perfiles.length}
                </span>
              </button>
            </div>
          </div>

          {/* Botones de acción superior */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={cargarTodoDashboard}
              title="Actualizar datos"
              className="w-9 h-9 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.07] inline-flex items-center justify-center transition cursor-pointer"
            >
              <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
            </button>

            {seccionActiva === 'reportes' ? (
              <button
                type="button"
                onClick={() =>
                  exportarReporteDashboardPDF({
                    periodoEtiqueta: etiquetaPeriodoActual,
                    filtroVendedorEtiqueta: etiquetaVendedorActual,
                    kpis: kpisPeriodo,
                    desgloseTemporal,
                    tituloDesgloseTemporal,
                    rentabilidadProductos,
                    rankingPreventistas,
                    stockValorizado,
                  })
                }
                className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <FileDown size={15} />
                <span>Exportar Reporte PDF</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={abrirModalCrearPreventista}
                className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <Plus size={15} />
                <span>Nuevo Preventista / Usuario</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Filtros Limpia (Por Día, Por Mes, Por Año, Rango + Preventista) */}
        {seccionActiva === 'reportes' && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Selector de modo de periodo */}
              <div className="inline-flex items-center p-1 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08]">
                {[
                  { id: 'DIA', label: 'Por Día' },
                  { id: 'MES', label: 'Por Mes' },
                  { id: 'ANIO', label: 'Por Año' },
                  { id: 'RANGO', label: 'Rango' },
                ].map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setTipoPeriodo(op.id)}
                    className={`h-7.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      tipoPeriodo === op.id
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>

              {/* Controles específicos según Día / Mes / Año / Rango */}
              {tipoPeriodo === 'DIA' && (
                <div className="inline-flex items-center gap-1.5 bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] rounded-xl px-2.5 h-9">
                  <Calendar size={14} className="text-amber-500 shrink-0" />
                  <input
                    type="date"
                    value={fechaDia}
                    onChange={(e) => setFechaDia(e.target.value)}
                    className="bg-transparent border-0 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                  />
                  {fechaDia !== hoyIso && (
                    <button
                      type="button"
                      onClick={() => setFechaDia(hoyIso)}
                      className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline ml-1 cursor-pointer"
                    >
                      Hoy
                    </button>
                  )}
                </div>
              )}

              {tipoPeriodo === 'MES' && (
                <div className="inline-flex items-center gap-1.5">
                  <select
                    value={mesSeleccionado}
                    onChange={(e) => setMesSeleccionado(Number(e.target.value))}
                    className="h-9 px-3 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                  >
                    {MESES_NOMBRES.map((m, idx) => (
                      <option key={m} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    value={anioSeleccionado}
                    onChange={(e) =>
                      setAnioSeleccionado(Number(e.target.value))
                    }
                    className="h-9 px-3 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                  >
                    {aniosDisponibles.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {tipoPeriodo === 'ANIO' && (
                <select
                  value={anioSeleccionado}
                  onChange={(e) => setAnioSeleccionado(Number(e.target.value))}
                  className="h-9 px-3.5 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  {aniosDisponibles.map((y) => (
                    <option key={y} value={y}>
                      Año {y}
                    </option>
                  ))}
                </select>
              )}

              {tipoPeriodo === 'RANGO' && (
                <div className="inline-flex flex-wrap items-center gap-1.5 bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] rounded-xl px-2.5 py-1">
                  <input
                    type="date"
                    value={rangoDesde}
                    onChange={(e) => setRangoDesde(e.target.value)}
                    className="bg-transparent border-0 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                  />
                  <span className="text-xs text-slate-400">a</span>
                  <input
                    type="date"
                    value={rangoHasta}
                    onChange={(e) => setRangoHasta(e.target.value)}
                    className="bg-transparent border-0 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Filtro por Preventista / Canal */}
            <div className="flex items-center h-9 bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] rounded-xl px-3 sm:min-w-[240px]">
              <UserCheck size={14} className="text-amber-500 mr-2 shrink-0" />
              <select
                value={vendedorFiltro}
                onChange={(e) => setVendedorFiltro(e.target.value)}
                className="w-full bg-transparent border-0 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                <option value="TODOS">
                  Toda la Distribuidora (Ruta + Central)
                </option>
                {perfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({ROLES_INFO[p.rol]?.shortLabel || p.rol})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Mensajes de estado */}
      {mensajeExito && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            <span>{mensajeExito}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito('')}
            className="text-emerald-600 dark:text-emerald-300 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/25 text-red-700 dark:text-red-300 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ================= VISTA 1: GANANCIAS Y REPORTES ================= */}
      {seccionActiva === 'reportes' ? (
        <div className="space-y-6">
          {/* AVISO EJECUTIVO EN VIVO: DINERO DE PREVENTISTAS PENDIENTE DE RECIBIR POR EL DUEÑO + CARGA EN RUTA */}
          {(resumenCustodiaRuta.porRendirCount > 0 ||
            resumenCustodiaRuta.enCamionCount > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 tabular-nums">
              {resumenCustodiaRuta.porRendirCount > 0 && (
                <div className="rounded-2xl p-4 bg-amber-50/90 dark:bg-amber-500/[0.11] border border-amber-300/80 dark:border-amber-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-800 dark:text-amber-300">
                      <Wallet size={14} />
                      <span>
                        Dinero Cobrado por Preventistas · Pendiente de Entregar
                        al Dueño ({resumenCustodiaRuta.porRendirCount}{' '}
                        {resumenCustodiaRuta.porRendirCount === 1
                          ? 'pedido'
                          : 'pedidos'}
                        )
                      </span>
                    </div>
                    <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                      Efectivo en mano:{' '}
                      <span className="text-amber-700 dark:text-amber-400">
                        {formatearBs(resumenCustodiaRuta.porRendirEfectivoBs)}
                      </span>{' '}
                      · QR:{' '}
                      <span>
                        {formatearBs(resumenCustodiaRuta.porRendirQrBs)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigate('/despacho?etapa=cobrado_preventista')
                    }
                    className="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                  >
                    <span>Recibir Dinero</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              )}

              {resumenCustodiaRuta.enCamionCount > 0 && (
                <div className="rounded-2xl p-4 bg-white dark:bg-[#161922] border border-sky-200 dark:border-sky-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400">
                      <Truck size={14} />
                      <span>
                        Pedidos Entregados a Preventista · En Ruta por Cobrar
                      </span>
                    </div>
                    <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                      {resumenCustodiaRuta.enCamionCount}{' '}
                      {resumenCustodiaRuta.enCamionCount === 1
                        ? 'pedido'
                        : 'pedidos'}{' '}
                      en camión ({formatearBs(resumenCustodiaRuta.enCamionTotalBs)})
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigate('/despacho?etapa=entregado_preventista')
                    }
                    className="h-9 px-3.5 rounded-xl bg-slate-100 dark:bg-white/[0.07] hover:bg-slate-200/80 dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                  >
                    <span>Ver Ruta</span>
                    <ArrowUpRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Aviso sutil si faltan costos en productos vendidos */}
          {kpisPeriodo.productosSinCostoCount > 0 && (
            <div className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-amber-800 dark:text-amber-300 font-medium">
                Hay {kpisPeriodo.productosSinCostoCount} bebida(s) vendidas sin
                costo de compra registrado (su costo se calcula como Bs 0).
              </span>
              <button
                type="button"
                onClick={() => navigate('/almacen')}
                className="font-bold text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Registrar compra con costo en Almacén</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}

          {/* 1. CUATRO TARJETAS FINANCIERAS LIMPIAS (GANANCIA NETA PROTAGONISTA) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 tabular-nums">
            {/* KPI 1: GANANCIA NETA REAL */}
            <div className="bg-emerald-500/[0.08] dark:bg-emerald-500/[0.1] rounded-2xl p-4 sm:p-5 border border-emerald-500/30 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Ganancia Neta Real
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-800 dark:text-emerald-200">
                  {kpisPeriodo.margenNetoPct.toFixed(1)}% margen
                </span>
              </div>
              <div className="mt-3">
                <div
                  className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                    kpisPeriodo.gananciaNetaReal >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-500'
                  }`}
                >
                  {formatearBs(kpisPeriodo.gananciaNetaReal)}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Ventas menos costo real y bonos
                </p>
              </div>
            </div>

            {/* KPI 2: INGRESOS POR VENTAS ENTREGADAS */}
            <div className="bg-white dark:bg-[#161922] rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-white/[0.07] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  Ventas Entregadas
                </span>
                <TrendingUp size={16} className="text-amber-500" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {formatearBs(kpisPeriodo.totalVentasBrutas)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {kpisPeriodo.cantidadVentas}{' '}
                  {kpisPeriodo.cantidadVentas === 1 ? 'entrega' : 'entregas'} en{' '}
                  {etiquetaPeriodoActual}
                </p>
              </div>
            </div>

            {/* KPI 3: COSTO DE MERCADERÍA VENDIDA + BONOS */}
            <div className="bg-white dark:bg-[#161922] rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-white/[0.07] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  Costo de Mercadería
                </span>
                <Warehouse size={16} className="text-slate-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {formatearBs(kpisPeriodo.costoTotalMercaderia)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {kpisPeriodo.costoSoloBonos > 0
                    ? `Incluye ${formatearBs(
                        kpisPeriodo.costoSoloBonos
                      )} en bonos (${kpisPeriodo.totalBotellasBono} bot.)`
                    : `${kpisPeriodo.totalBotellasBono} bot. de bono entregadas`}
                </p>
              </div>
            </div>

            {/* KPI 4: RECAUDACIÓN REAL VS CRÉDITOS */}
            <div className="bg-white dark:bg-[#161922] rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-white/[0.07] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  Cobrado vs Por Cobrar
                </span>
                <Banknote size={16} className="text-emerald-500" />
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  {formatearBs(kpisPeriodo.dineroRealRecaudado)}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs mt-1">
                  <span className="text-slate-400">
                    Ef: {formatearBs(kpisPeriodo.totalEfectivo)} · QR:{' '}
                    {formatearBs(kpisPeriodo.totalQr)}
                  </span>
                  {kpisPeriodo.totalCreditosCalle > 0 && (
                    <span className="text-red-500 font-semibold">
                      · Créd: {formatearBs(kpisPeriodo.totalCreditosCalle)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 2. TABLA DE EVOLUCIÓN DE GANANCIAS (POR DÍA / POR MES / POR ENTREGA) */}
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.07] flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {tituloDesgloseTemporal}
                </h2>
                <p className="text-xs text-slate-400">
                  Comparativa directa entre ingresos, costo de compra y ganancia
                  neta
                </p>
              </div>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                {etiquetaPeriodoActual}
              </span>
            </div>

            {desgloseTemporal.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">
                No hay entregas registradas en este periodo.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-white/[0.07] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">
                        {tipoPeriodo === 'ANIO'
                          ? 'Mes'
                          : tipoPeriodo === 'DIA'
                          ? 'Hora / Cliente'
                          : 'Día'}
                      </th>
                      <th className="py-3 px-4 text-center">Entregas</th>
                      <th className="py-3 px-4 text-right">Ventas</th>
                      <th className="py-3 px-4 text-right">Costo</th>
                      <th className="py-3 px-4 text-right">Ganancia Neta</th>
                      <th className="py-3 px-4 text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs sm:text-sm">
                    {desgloseTemporal
                      .slice(
                        (paginaDesglose - 1) * TAMANO_DESGLOSE,
                        paginaDesglose * TAMANO_DESGLOSE
                      )
                      .map((fila, idx) => {
                        const anchoPct = Math.max(
                          4,
                          Math.min(
                            100,
                            Math.round(
                              (Math.max(0, fila.ganancia) / maxGananciaFila) *
                                100
                            )
                          )
                        )
                        return (
                          <tr
                            key={fila.id || fila.orden || idx}
                            className="hover:bg-slate-50/80 dark:hover:bg-white/[0.025] transition"
                          >
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 capitalize">
                                {fila.etiqueta}
                              </div>
                              {fila.subtitulo && (
                                <div className="text-[11px] text-slate-400">
                                  {fila.subtitulo}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 text-center text-slate-500 dark:text-slate-400 font-medium">
                              {fila.entregas}
                            </td>

                            <td className="py-3 px-4 text-right font-semibold text-slate-800 dark:text-slate-200">
                              {formatearBs(fila.ventas)}
                            </td>

                            <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                              {formatearBs(fila.costo)}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex flex-col items-end gap-1">
                                <span
                                  className={`font-extrabold ${
                                    fila.ganancia >= 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-red-500'
                                  }`}
                                >
                                  {fila.ganancia >= 0 ? '+' : ''}
                                  {formatearBs(fila.ganancia)}
                                </span>
                                <div className="w-20 h-1 rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      fila.ganancia >= 0
                                        ? 'bg-emerald-500'
                                        : 'bg-red-500'
                                    }`}
                                    style={{ width: `${anchoPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right font-medium text-slate-500 dark:text-slate-400">
                              {fila.margenPct.toFixed(1)}%
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                <PaginationBar
                  paginaActual={paginaDesglose}
                  totalRegistros={desgloseTemporal.length}
                  tamanoPagina={TAMANO_DESGLOSE}
                  onCambiarPagina={setPaginaDesglose}
                  etiquetaItem="filas"
                />
              </div>
            )}
          </div>

          {/* 3. GANANCIA POR BEBIDA (CON IMAGEN DE BOTELLA) */}
          {rentabilidadProductos.length > 0 && (
            <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.07]">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Rentabilidad por Bebida
                </h2>
                <p className="text-xs text-slate-400">
                  Qué productos te dejan más ganancia real descontando costo y
                  bonificaciones
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-white/[0.07] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Bebida</th>
                      <th className="py-3 px-4">Cantidad Salida</th>
                      <th className="py-3 px-4 text-right">Ventas</th>
                      <th className="py-3 px-4 text-right">Costo Total</th>
                      <th className="py-3 px-4 text-right">Ganancia Neta</th>
                      <th className="py-3 px-4 text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs sm:text-sm">
                    {rentabilidadProductos
                      .slice(
                        (paginaBebidas - 1) * TAMANO_BEBIDAS,
                        paginaBebidas * TAMANO_BEBIDAS
                      )
                      .map((p) => (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-white/[0.025] transition"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-10 rounded-xl bg-[#F6F5F2] dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.06] shrink-0 overflow-hidden flex items-center justify-center">
                                <BottleVisual
                                  imagenUrl={p.imagen_url}
                                  nombre={p.nombre}
                                  alturaClass="h-8"
                                />
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-slate-100">
                                  {p.nombre}
                                  {p.sabor && (
                                    <span className="font-normal text-slate-400">
                                      {' '}
                                      · {p.sabor}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {p.marca} · Pack x{p.unidPaq}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">
                            {p.cantidadResumen}
                          </td>

                          <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {formatearBs(p.ingresos)}
                          </td>

                          <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                            {p.sinCosto ? (
                              <span className="text-amber-500 text-xs">
                                Sin costo
                              </span>
                            ) : (
                              formatearBs(p.costoTotal)
                            )}
                          </td>

                          <td
                            className={`py-3 px-4 text-right font-extrabold ${
                              p.ganancia >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-500'
                            }`}
                          >
                            {p.ganancia >= 0 ? '+' : ''}
                            {formatearBs(p.ganancia)}
                          </td>

                          <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                            {p.margenPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <PaginationBar
                  paginaActual={paginaBebidas}
                  totalRegistros={rentabilidadProductos.length}
                  tamanoPagina={TAMANO_BEBIDAS}
                  onCambiarPagina={setPaginaBebidas}
                  etiquetaItem="bebidas"
                />
              </div>
            </div>
          )}

          {/* 4. RENDIMIENTO Y GANANCIA POR PREVENTISTA */}
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.07] flex items-center gap-2.5">
              <Trophy size={17} className="text-amber-500 shrink-0" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Rendimiento y Ganancia por Preventista
                </h2>
                <p className="text-xs text-slate-400">
                  Ventas entregadas y ganancia neta aportada por cada preventista
                  y tienda central
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-white/[0.07] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Preventista / Canal</th>
                    <th className="py-3 px-4 text-center">Entregas</th>
                    <th className="py-3 px-4 text-center">Vendido</th>
                    <th className="py-3 px-4 text-center">Bonos</th>
                    <th className="py-3 px-4 text-right">Ventas</th>
                    <th className="py-3 px-4 text-right">Costo</th>
                    <th className="py-3 px-4 text-right">Ganancia Neta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs sm:text-sm">
                  {rankingPreventistas.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.025] transition"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 ${
                              idx === 0 && item.gananciaGeneradaBs > 0
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {item.nombre}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {item.rolEtiqueta}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center font-semibold text-slate-700 dark:text-slate-300">
                        {item.pedidosEntregados}
                      </td>

                      <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-300">
                        {item.paquetesVendidos} Paq
                        {item.sueltasVendidas > 0
                          ? ` + ${item.sueltasVendidas} Bot`
                          : ''}
                      </td>

                      <td className="py-3 px-4 text-center text-amber-600 dark:text-amber-400">
                        {item.bonosRecibidosBotellas > 0
                          ? `${item.bonosRecibidosBotellas} bot.`
                          : '—'}
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {formatearBs(item.totalGeneradoBs)}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                        {formatearBs(item.costoGeneradoBs)}
                      </td>

                      <td
                        className={`py-3 px-4 text-right font-extrabold ${
                          item.gananciaGeneradaBs >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-500'
                        }`}
                      >
                        {item.gananciaGeneradaBs >= 0 ? '+' : ''}
                        {formatearBs(item.gananciaGeneradaBs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. CAPITAL INVERTIDO EN INVENTARIO (COSTO VS PRECIO DE VENTA) */}
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Inventario Valorizado (Capital al Costo vs Venta)
                </h2>
                <p className="text-xs text-slate-400">
                  Cuánto dinero tienes invertido hoy entre Depósito y Tienda
                  Central
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300">
                  Capital al Costo:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {formatearBs(
                      stockValorizado.reduce(
                        (acc, s) => acc + s.costoInventarioBs,
                        0
                      )
                    )}
                  </strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  Valor de Venta:{' '}
                  <strong>
                    {formatearBs(
                      stockValorizado.reduce(
                        (acc, s) => acc + s.valorEstimadoBs,
                        0
                      )
                    )}
                  </strong>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-white/[0.07] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Bebida</th>
                    <th className="py-3 px-4">Depósito</th>
                    <th className="py-3 px-4">Tienda Central</th>
                    <th className="py-3 px-4 text-right">Capital al Costo</th>
                    <th className="py-3 px-4 text-right">Valor Venta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs sm:text-sm">
                  {stockValorizado.map((s) => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.025] transition"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-10 rounded-xl bg-[#F6F5F2] dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.06] shrink-0 overflow-hidden flex items-center justify-center">
                            <BottleVisual
                              imagenUrl={s.imagen_url}
                              nombre={s.nombre}
                              alturaClass="h-8"
                            />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {s.nombre}
                              {s.sabor ? ` · ${s.sabor}` : ''}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {s.marca} · Pack x{s.unidades_por_paquete}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">
                        {s.depositoTextoLimpio}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={
                            s.sinCentral
                              ? 'text-red-500 font-medium text-xs'
                              : 'text-slate-900 dark:text-slate-100 font-semibold'
                          }
                        >
                          {s.centralTextoLimpio}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-300 font-medium">
                        {Number(s.costo_paquete) > 0 ? (
                          formatearBs(s.costoInventarioBs)
                        ) : (
                          <span className="text-amber-500 text-xs">
                            Sin costo
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                        {formatearBs(s.valorEstimadoBs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ================= VISTA 2: PREVENTISTAS Y CONTRASEÑAS DE ACCESO ================= */
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Cuentas de Preventistas y Personal
              </h2>
              <p className="text-xs text-slate-400">
                Crea preventistas, asígnales su usuario y contraseña para que
                entren desde su celular, o cambia su clave cuando lo necesiten.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.07] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Nombre / Ruta</th>
                  <th className="py-3 px-4">Rol</th>
                  <th className="py-3 px-4">Usuario de Acceso</th>
                  <th className="py-3 px-4">Contraseña</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs sm:text-sm">
                {perfiles.map((u) => {
                  const rInfo = ROLES_INFO[u.rol] || ROLES_INFO.preventista
                  const estaActivo = u.activo !== false
                  const verClave = Boolean(clavesVisibles[u.id])

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/[0.025] transition"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 font-bold text-xs flex items-center justify-center shrink-0">
                            {u.nombre?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {u.nombre}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300">
                          {rInfo.shortLabel}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {u.usuario_login || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        {u.clave_referencia ? (
                          <div className="inline-flex items-center gap-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                            <span>
                              {verClave ? u.clave_referencia : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setClavesVisibles((prev) => ({
                                  ...prev,
                                  [u.id]: !prev[u.id],
                                }))
                              }
                              className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                              title={
                                verClave
                                  ? 'Ocultar contraseña'
                                  : 'Ver contraseña'
                              }
                            >
                              {verClave ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => abrirEdicionUsuario(u)}
                            className="text-xs text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <KeyRound size={12} />
                            <span>Asignar nueva clave</span>
                          </button>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            estaActivo
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-500'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              estaActivo ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          {estaActivo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copiarCredencialesPortapapeles(u)}
                            title="Copiar usuario y contraseña para enviar por WhatsApp"
                            className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer"
                          >
                            {copiadoId === u.id ? (
                              <>
                                <Check size={13} className="text-emerald-500" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} />
                                <span>Copiar acceso</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => abrirEdicionUsuario(u)}
                            className="h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-amber-500 hover:text-slate-950 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                          >
                            <Pencil size={13} />
                            <span>Clave / Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => alternarActivoUsuario(u)}
                            title={
                              estaActivo
                                ? 'Desactivar acceso'
                                : 'Reactivar acceso'
                            }
                            className={`h-8 w-8 rounded-lg inline-flex items-center justify-center transition cursor-pointer ${
                              estaActivo
                                ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500'
                            }`}
                          >
                            <Power size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL CREAR PREVENTISTA CON USUARIO Y CONTRASEÑA ================= */}
      {modalNuevoUsuario && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Nuevo Preventista / Usuario
                </h3>
                <p className="text-xs text-slate-400">
                  Asígnale un usuario y contraseña para ingresar al sistema
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalNuevoUsuario(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={crearNuevoUsuario} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Nombre completo y Ruta *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Luis Torrez (Ruta Sur)"
                  value={nuevoNombre}
                  onChange={(e) => handleCambioNombreNuevo(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Rol en el sistema *
                </label>
                <select
                  value={nuevoRol}
                  onChange={(e) => setNuevoRol(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="preventista">
                    Preventista (Toma de pedidos en ruta)
                  </option>
                  <option value="central">Cajero Tienda Central</option>
                  <option value="almacen">Encargado de Almacén</option>
                  <option value="admin">Dueño / Administrador</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Usuario para entrar *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. luis"
                    value={nuevoUsuarioLogin}
                    onChange={(e) =>
                      setNuevoUsuarioLogin(
                        limpiarIdentificadorUsuario(e.target.value)
                      )
                    }
                    className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Contraseña *
                  </label>
                  <div className="relative">
                    <input
                      type={verClaveCrear ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="Mín. 6 caracteres"
                      value={nuevoPassword}
                      onChange={(e) => setNuevoPassword(e.target.value)}
                      className="w-full h-10 pl-3.5 pr-9 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setVerClaveCrear((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {verClaveCrear ? (
                        <EyeOff size={15} />
                      ) : (
                        <Eye size={15} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalNuevoUsuario(false)}
                  className="h-9 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoUsuario}
                  className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {guardandoUsuario ? 'Creando...' : 'Crear Preventista'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL EDITAR USUARIO Y CAMBIAR CONTRASEÑA ================= */}
      {usuarioEditando && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Editar Acceso y Contraseña
                </h3>
                <p className="text-xs text-slate-400">
                  {usuarioEditando.nombre}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUsuarioEditando(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={guardarCambiosUsuario} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formEditarUsuario.nombre}
                  onChange={(e) =>
                    setFormEditarUsuario({
                      ...formEditarUsuario,
                      nombre: e.target.value,
                    })
                  }
                  className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Usuario de acceso *
                  </label>
                  <input
                    type="text"
                    required
                    value={formEditarUsuario.usuarioLogin}
                    onChange={(e) =>
                      setFormEditarUsuario({
                        ...formEditarUsuario,
                        usuarioLogin: limpiarIdentificadorUsuario(
                          e.target.value
                        ),
                      })
                    }
                    className="w-full h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Rol *
                  </label>
                  <select
                    value={formEditarUsuario.rol}
                    onChange={(e) =>
                      setFormEditarUsuario({
                        ...formEditarUsuario,
                        rol: e.target.value,
                      })
                    }
                    className="w-full h-10 px-3 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="preventista">Preventista</option>
                    <option value="central">Cajero Central</option>
                    <option value="almacen">Almacén</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Nueva Contraseña{' '}
                  <span className="font-normal text-slate-400">
                    (dejar vacío para mantener la actual)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={verClaveEditar ? 'text' : 'password'}
                    minLength={6}
                    placeholder="Escribir nueva contraseña (mín. 6 caract.)"
                    value={formEditarUsuario.nuevaPassword}
                    onChange={(e) =>
                      setFormEditarUsuario({
                        ...formEditarUsuario,
                        nuevaPassword: e.target.value,
                      })
                    }
                    className="w-full h-10 pl-3.5 pr-9 rounded-xl bg-slate-50 dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setVerClaveEditar((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {verClaveEditar ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formEditarUsuario.activo}
                  onChange={(e) =>
                    setFormEditarUsuario({
                      ...formEditarUsuario,
                      activo: e.target.checked,
                    })
                  }
                  className="rounded border-slate-300 text-amber-500"
                />
                <span>Permitir acceso al sistema (usuario activo)</span>
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUsuarioEditando(null)}
                  className="h-9 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoUsuario}
                  className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {guardandoUsuario ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
