import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Warehouse,
  Store,
  ArrowRightLeft,
  PackagePlus,
  History,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  Plus,
  Minus,
  ChevronDown,
} from 'lucide-react'
import {
  supabase,
  obtenerOCrearPerfilPorRol,
  enriquecerProductosConCosto,
  enriquecerMovimientosConCosto,
  registrarCostoCompraAlmacen,
} from '../lib/supabase'
import { useRole } from '../context/RoleContext'
import BottleVisual from '../components/BottleVisual'
import PaginationBar from '../components/PaginationBar'

const TAMANO_STOCK_TARJETAS = 18
const TAMANO_STOCK_LISTA = 25
const TAMANO_MOVIMIENTOS = 20

/**
 * Formatea unidades totales en texto limpio sin redundancias ("0 Paq" ni "0 Bot"):
 * - 0 -> "Sin stock"
 * - 24 (x12) -> "2 Paq"
 * - 5 (x12) -> "5 Bot"
 * - 29 (x12) -> "2 Paq + 5 Bot"
 */
function formatearCantidadesLimpio(unidadesTotales, unidadesPorPaquete = 6) {
  const total = Math.max(0, Math.floor(Number(unidadesTotales) || 0))
  const factor = Math.max(1, Math.floor(Number(unidadesPorPaquete) || 1))
  if (total === 0) return 'Sin stock'

  if (factor === 1) {
    return `${total} Bot`
  }

  const paq = Math.floor(total / factor)
  const bot = total % factor

  if (paq > 0 && bot > 0) return `${paq} Paq + ${bot} Bot`
  if (paq > 0) return `${paq} Paq`
  return `${bot} Bot`
}

/**
 * Formatea el desglose de un movimiento histórico sin mostrar ceros innecesarios.
 */
function formatearDesgloseMovimiento(paqRaw, botRaw, totalRaw, unidadesPorPaquete = 6) {
  const paq = Math.max(0, Math.floor(Number(paqRaw) || 0))
  const bot = Math.max(0, Math.floor(Number(botRaw) || 0))
  if (paq > 0 && bot > 0) return `${paq} Paq + ${bot} Bot`
  if (paq > 0) return `${paq} Paq`
  if (bot > 0) return `${bot} Bot`
  return formatearCantidadesLimpio(totalRaw, unidadesPorPaquete)
}

export default function AlmacenPage() {
  const { rolActual, infoRol, usuarioActual } = useRole()
  const puedeOperarAlmacen = rolActual === 'admin' || rolActual === 'almacen'

  const [productos, setProductos] = useState([])
  const [marcasTabla, setMarcasTabla] = useState([])
  const [ubicaciones, setUbicaciones] = useState([])
  const [inventario, setInventario] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorGeneral, setErrorGeneral] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')

  // Pestaña activa: 'stock' | 'historial'
  const [pestanaActiva, setPestanaActiva] = useState('stock')
  // Modo visual en Stock: 'tarjetas' (con protagonismo de imagen) | 'lista' (tabla limpia con miniatura)
  const [vistaStock, setVistaStock] = useState('tarjetas')

  // Buscador y filtro rápido por Marca (compartido entre Stock e Historial)
  const [busqueda, setBusqueda] = useState('')
  const [marcaSeleccionada, setMarcaSeleccionada] = useState('TODAS')

  // Filtro de historial ('TODOS' | 'compra_almacen' | 'traspaso_a_central') + Paginación en servidor
  const [filtroTipoMov, setFiltroTipoMov] = useState('TODOS')
  const [paginaStock, setPaginaStock] = useState(1)
  const [paginaMov, setPaginaMov] = useState(1)
  const [totalMovServidor, setTotalMovServidor] = useState(0)
  const [cargandoMovs, setCargandoMovs] = useState(false)

  // Modal activo: null | 'compra_almacen' | 'traspaso_a_central'
  const [modalTipo, setModalTipo] = useState(null)
  const [mostrarSelectorModal, setMostrarSelectorModal] = useState(false)
  const [busquedaModal, setBusquedaModal] = useState('')
  const [marcaModalFiltro, setMarcaModalFiltro] = useState('TODAS')
  const [productoIdSel, setProductoIdSel] = useState('')
  const [paquetesInput, setPaquetesInput] = useState('')
  const [sueltasInput, setSueltasInput] = useState('')
  const [costoPaqueteInput, setCostoPaqueteInput] = useState('')
  const [costoTotalInput, setCostoTotalInput] = useState('')
  const [modoCostoEditado, setModoCostoEditado] = useState('paquete')
  const [procesando, setProcesando] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  const cargarMovimientosPaginados = useCallback(
    async (pagina = paginaMov, tipoMov = filtroTipoMov, textoQ = busqueda, marcaFiltro = marcaSeleccionada) => {
      setCargandoMovs(true)
      try {
        const desde = (pagina - 1) * TAMANO_MOVIMIENTOS
        const hasta = desde + TAMANO_MOVIMIENTOS - 1
        const hayFiltroLocal = Boolean(textoQ.trim()) || marcaFiltro !== 'TODAS'

        let queryMov = supabase
          .from('movimientos_stock')
          .select(
            '*, productos(id, nombre, marca, sabor, imagen_url, unidades_por_paquete), perfiles(nombre, rol)',
            { count: 'exact' }
          )
          .order('fecha', { ascending: false })

        if (tipoMov !== 'TODOS') {
          queryMov = queryMov.eq('tipo', tipoMov)
        }

        if (!hayFiltroLocal) {
          queryMov = queryMov.range(desde, hasta)
        } else {
          queryMov = queryMov.limit(120)
        }

        const resMov = await queryMov
        if (resMov.error) throw resMov.error
        const listaMovs = await enriquecerMovimientosConCosto(resMov.data || [])
        setMovimientos(listaMovs)
        setTotalMovServidor(
          typeof resMov.count === 'number' ? resMov.count : listaMovs.length
        )
      } catch (err) {
        console.error('Error cargando movimientos paginados:', err)
      } finally {
        setCargandoMovs(false)
      }
    },
    [paginaMov, filtroTipoMov, busqueda, marcaSeleccionada]
  )

  const cargarDatosAlmacen = useCallback(async () => {
    setCargando(true)
    setErrorGeneral('')
    try {
      const [resProd, resMarcas, resUbic, resInv] = await Promise.all([
        supabase
          .from('productos')
          .select('*')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
        supabase
          .from('marcas')
          .select('*')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
        supabase.from('ubicaciones').select('*'),
        supabase.from('inventario').select('*'),
      ])

      if (resProd.error) throw resProd.error
      if (resUbic.error) throw resUbic.error
      if (resInv.error) throw resInv.error

      const listaProds = await enriquecerProductosConCosto(resProd.data || [])
      setProductos(listaProds)
      if (!resMarcas.error && resMarcas.data) {
        setMarcasTabla(resMarcas.data)
      }
      setUbicaciones(resUbic.data || [])
      setInventario(resInv.data || [])

      if (listaProds.length > 0 && !productoIdSel) {
        setProductoIdSel(listaProds[0].id)
      }

      await cargarMovimientosPaginados(1, filtroTipoMov, busqueda, marcaSeleccionada)
    } catch (err) {
      console.error('Error cargando almacén:', err)
      setErrorGeneral(err.message || 'No se pudo cargar la información de almacén.')
    } finally {
      setCargando(false)
    }
  }, [productoIdSel]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarDatosAlmacen()
  }, [cargarDatosAlmacen])

  useEffect(() => {
    if (pestanaActiva === 'historial') {
      cargarMovimientosPaginados(paginaMov, filtroTipoMov, busqueda, marcaSeleccionada)
    }
  }, [pestanaActiva, paginaMov, filtroTipoMov, busqueda, marcaSeleccionada, cargarMovimientosPaginados])

  const mapaProductosPorId = useMemo(() => {
    const m = {}
    productos.forEach((p) => {
      m[p.id] = p
    })
    return m
  }, [productos])

  const ubicacionAlmacenId = useMemo(
    () => ubicaciones.find((u) => u.tipo === 'almacen')?.id,
    [ubicaciones]
  )
  const ubicacionCentralId = useMemo(
    () => ubicaciones.find((u) => u.tipo === 'central')?.id,
    [ubicaciones]
  )

  const stockPorProducto = useMemo(() => {
    const mapa = {}
    for (const item of inventario) {
      if (!mapa[item.producto_id]) {
        mapa[item.producto_id] = { almacen: 0, central: 0 }
      }
      if (item.ubicacion_id === ubicacionAlmacenId) {
        mapa[item.producto_id].almacen = Math.max(0, Number(item.stock_unidades) || 0)
      } else if (item.ubicacion_id === ubicacionCentralId) {
        mapa[item.producto_id].central = Math.max(0, Number(item.stock_unidades) || 0)
      }
    }
    return mapa
  }, [inventario, ubicacionAlmacenId, ubicacionCentralId])

  // Lista dinámica de marcas
  const marcasDisponibles = useMemo(() => {
    const setMarcas = new Set()
    marcasTabla.forEach((m) => {
      if (m.activo !== false && m.nombre?.trim()) {
        setMarcas.add(m.nombre.trim())
      }
    })
    productos.forEach((p) => {
      if (p.marca?.trim()) {
        setMarcas.add(p.marca.trim())
      }
    })
    return Array.from(setMarcas).sort((a, b) => a.localeCompare(b, 'es'))
  }, [marcasTabla, productos])

  // Productos filtrados en tiempo real
  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return productos.filter((p) => {
      if (
        marcaSeleccionada !== 'TODAS' &&
        (p.marca || '').trim() !== marcaSeleccionada
      ) {
        return false
      }
      if (!q) return true
      const coincideNombre = p.nombre?.toLowerCase().includes(q)
      const coincideSabor = p.sabor?.toLowerCase().includes(q)
      const coincideMarca = p.marca?.toLowerCase().includes(q)
      return coincideNombre || coincideSabor || coincideMarca
    })
  }, [productos, marcaSeleccionada, busqueda])

  // Productos filtrados dentro del Modal de Entrada / Traspaso
  const productosModalFiltrados = useMemo(() => {
    const q = busquedaModal.trim().toLowerCase()
    return productos.filter((p) => {
      if (
        marcaModalFiltro !== 'TODAS' &&
        (p.marca || '').trim() !== marcaModalFiltro
      ) {
        return false
      }
      if (!q) return true
      return (
        p.nombre?.toLowerCase().includes(q) ||
        p.sabor?.toLowerCase().includes(q) ||
        p.marca?.toLowerCase().includes(q)
      )
    })
  }, [productos, marcaModalFiltro, busquedaModal])

  const productoSeleccionado = useMemo(
    () => productos.find((p) => p.id === productoIdSel) || null,
    [productos, productoIdSel]
  )

  const unidadesPorPaqueteActual = Math.max(
    1,
    Number(productoSeleccionado?.unidades_por_paquete) || 6
  )
  const stockDepositoActualUnidades = productoSeleccionado
    ? stockPorProducto[productoSeleccionado.id]?.almacen || 0
    : 0
  const stockCentralActualUnidades = productoSeleccionado
    ? stockPorProducto[productoSeleccionado.id]?.central || 0
    : 0

  // Cálculo en vivo de paquetes y botellas sueltas ingresadas en el modal
  const numPaquetes = Math.max(0, parseInt(paquetesInput, 10) || 0)
  const numSueltas = Math.max(0, parseInt(sueltasInput, 10) || 0)
  const totalBotellasOperacion = numPaquetes * unidadesPorPaqueteActual + numSueltas

  const superaStockDeposito =
    modalTipo === 'traspaso_a_central' &&
    totalBotellasOperacion > stockDepositoActualUnidades

  const sincronizarCostosPorCantidad = (
    nuevoPaqStr,
    nuevoSueltasStr,
    unidPaq = unidadesPorPaqueteActual,
    costoPaqStr = costoPaqueteInput,
    costoTotStr = costoTotalInput,
    modo = modoCostoEditado
  ) => {
    const p = Math.max(0, parseInt(nuevoPaqStr, 10) || 0)
    const s = Math.max(0, parseInt(nuevoSueltasStr, 10) || 0)
    const factor = Math.max(1, Number(unidPaq) || 6)
    const totBot = p * factor + s

    if (totBot <= 0) {
      if (modo === 'paquete') setCostoTotalInput('')
      return
    }

    if (modo === 'paquete') {
      const cPaq = Number(costoPaqStr)
      if (cPaq > 0) {
        const calcTotal = Number(((totBot / factor) * cPaq).toFixed(2))
        setCostoTotalInput(String(calcTotal))
      }
    } else {
      const cTot = Number(costoTotStr)
      if (cTot > 0) {
        const calcPaq = Number(((cTot / totBot) * factor).toFixed(2))
        setCostoPaqueteInput(String(calcPaq))
      }
    }
  }

  const seleccionarProductoEnModal = (prodObj, totBotellasActual = 0) => {
    if (!prodObj) return
    setProductoIdSel(prodObj.id)
    const ultimoCosto = Number(prodObj.costo_paquete) || 0
    const nuevoCostoPaqStr = ultimoCosto > 0 ? String(ultimoCosto) : ''
    setModoCostoEditado('paquete')
    setCostoPaqueteInput(nuevoCostoPaqStr)
    if (totBotellasActual > 0 && ultimoCosto > 0) {
      const factor = Math.max(1, Number(prodObj.unidades_por_paquete) || 6)
      setCostoTotalInput(
        String(Number(((totBotellasActual / factor) * ultimoCosto).toFixed(2)))
      )
    } else {
      setCostoTotalInput('')
    }
  }

  const abrirModalOperacion = (tipo, prodId = null) => {
    if (!puedeOperarAlmacen) return
    setModalTipo(tipo)
    setBusquedaModal('')
    setErrorModal('')
    setPaquetesInput('')
    setSueltasInput('')
    setCostoTotalInput('')
    setModoCostoEditado('paquete')

    if (prodId) {
      const prodObj = productos.find((p) => p.id === prodId)
      setMarcaModalFiltro(prodObj?.marca?.trim() || 'TODAS')
      seleccionarProductoEnModal(prodObj, 0)
      setMostrarSelectorModal(false)
    } else {
      const marcaInicial =
        marcaSeleccionada !== 'TODAS' ? marcaSeleccionada : 'TODAS'
      setMarcaModalFiltro(marcaInicial)
      setMostrarSelectorModal(true)

      const candidatos =
        marcaInicial === 'TODAS'
          ? productos
          : productos.filter((p) => (p.marca || '').trim() === marcaInicial)

      if (candidatos.length > 0) {
        const primeroConStock =
          tipo === 'traspaso_a_central'
            ? candidatos.find((p) => (stockPorProducto[p.id]?.almacen || 0) > 0)
            : null
        const elegido = primeroConStock || candidatos[0]
        seleccionarProductoEnModal(elegido, 0)
      } else if (productos.length > 0) {
        setMarcaModalFiltro('TODAS')
        seleccionarProductoEnModal(productos[0], 0)
      }
    }
  }

  const ajustarPaquetes = (delta) => {
    const sig = Math.max(0, numPaquetes + delta)
    const nuevoStr = sig === 0 ? '' : String(sig)
    setPaquetesInput(nuevoStr)
    if (modalTipo === 'compra_almacen') {
      sincronizarCostosPorCantidad(nuevoStr, sueltasInput)
    }
    setErrorModal('')
  }

  const ajustarSueltas = (delta) => {
    const sig = Math.max(0, numSueltas + delta)
    const nuevoStr = sig === 0 ? '' : String(sig)
    setSueltasInput(nuevoStr)
    if (modalTipo === 'compra_almacen') {
      sincronizarCostosPorCantidad(paquetesInput, nuevoStr)
    }
    setErrorModal('')
  }

  const cambiarCostoPaqueteManual = (valor) => {
    setModoCostoEditado('paquete')
    setCostoPaqueteInput(valor)
    setErrorModal('')
    const num = Number(valor)
    if (totalBotellasOperacion > 0 && num > 0) {
      const calcTotal = Number(
        ((totalBotellasOperacion / unidadesPorPaqueteActual) * num).toFixed(2)
      )
      setCostoTotalInput(String(calcTotal))
    } else if (!valor) {
      setCostoTotalInput('')
    }
  }

  const cambiarCostoTotalManual = (valor) => {
    setModoCostoEditado('total')
    setCostoTotalInput(valor)
    setErrorModal('')
    const num = Number(valor)
    if (totalBotellasOperacion > 0 && num > 0) {
      const calcPaq = Number(
        ((num / totalBotellasOperacion) * unidadesPorPaqueteActual).toFixed(2)
      )
      setCostoPaqueteInput(String(calcPaq))
    } else if (!valor) {
      setCostoPaqueteInput('')
    }
  }

  const cargarTodoElDepositoEnModal = () => {
    if (stockDepositoActualUnidades <= 0) return
    const paq = Math.floor(stockDepositoActualUnidades / unidadesPorPaqueteActual)
    const bot = stockDepositoActualUnidades % unidadesPorPaqueteActual
    setPaquetesInput(paq > 0 ? String(paq) : '')
    setSueltasInput(bot > 0 ? String(bot) : '')
    setErrorModal('')
  }

  const ejecutarMovimientoRPC = async (e) => {
    e.preventDefault()
    if (!puedeOperarAlmacen || !modalTipo || !productoSeleccionado) return

    if (totalBotellasOperacion <= 0) {
      setErrorModal('Ingresa al menos 1 paquete o 1 botella.')
      return
    }

    const costoPaqueteNum = Number(costoPaqueteInput) || 0
    const costoTotalNum =
      Number(costoTotalInput) > 0
        ? Number(costoTotalInput)
        : Number(
            (
              (totalBotellasOperacion / unidadesPorPaqueteActual) *
              costoPaqueteNum
            ).toFixed(2)
          ) || 0

    if (modalTipo === 'compra_almacen' && costoPaqueteNum <= 0) {
      setErrorModal(
        'Ingresa el costo de compra por paquete (o el total pagado) de esta entrada.'
      )
      return
    }

    if (
      modalTipo === 'traspaso_a_central' &&
      totalBotellasOperacion > stockDepositoActualUnidades
    ) {
      setErrorModal(
        `Stock insuficiente en Depósito. Disponible: ${formatearCantidadesLimpio(
          stockDepositoActualUnidades,
          unidadesPorPaqueteActual
        )}.`
      )
      return
    }

    setProcesando(true)
    setErrorModal('')

    try {
      const stockPrevioUnidades =
        stockDepositoActualUnidades + stockCentralActualUnidades
      const costoPaquetePrevio = Number(productoSeleccionado.costo_paquete) || 0

      let validUserId = usuarioActual?.id
      if (!validUserId || String(validUserId).startsWith('local-')) {
        const { perfil } = await obtenerOCrearPerfilPorRol(
          rolActual,
          infoRol.defaultName
        )
        validUserId = perfil?.id
      }

      const { error } = await supabase.rpc('registrar_movimiento_almacen', {
        p_tipo: modalTipo,
        p_producto_id: productoSeleccionado.id,
        p_usuario_id: validUserId,
        p_paquetes: numPaquetes,
        p_sueltas: numSueltas,
      })

      if (error) throw error

      if (modalTipo === 'compra_almacen') {
        await registrarCostoCompraAlmacen({
          productoId: productoSeleccionado.id,
          stockPrevioUnidades,
          costoPaquetePrevio,
          unidadesPorPaquete: unidadesPorPaqueteActual,
          botellasCompradas: totalBotellasOperacion,
          costoPaqueteCompra: costoPaqueteNum,
          costoTotalCompra: costoTotalNum,
        })
      }

      const resumenCant = formatearCantidadesLimpio(
        totalBotellasOperacion,
        unidadesPorPaqueteActual
      )
      const etiquetaAccion =
        modalTipo === 'compra_almacen'
          ? `Compra registrada: +${resumenCant} de ${
              productoSeleccionado.nombre
            } en Depósito (Total: Bs ${costoTotalNum.toLocaleString('es-BO', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}).`
          : `Traspaso completado: ${resumenCant} de ${productoSeleccionado.nombre} enviados a Tienda Central.`

      setMensajeExito(etiquetaAccion)
      setModalTipo(null)
      await cargarDatosAlmacen()
      setTimeout(() => setMensajeExito(''), 5000)
    } catch (err) {
      console.error('Error en RPC registrar_movimiento_almacen:', err)
      setErrorModal(
        err.message || 'Ocurrió un error al registrar el movimiento.'
      )
    } finally {
      setProcesando(false)
    }
  }

  const movimientosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return movimientos.filter((m) => {
      if (filtroTipoMov !== 'TODOS' && m.tipo !== filtroTipoMov) {
        return false
      }
      const prodRef = m.productos || mapaProductosPorId[m.producto_id]
      if (
        marcaSeleccionada !== 'TODAS' &&
        (prodRef?.marca || '').trim() !== marcaSeleccionada
      ) {
        return false
      }
      if (!q) return true
      const coincideNombre = prodRef?.nombre?.toLowerCase().includes(q)
      const coincideSabor = prodRef?.sabor?.toLowerCase().includes(q)
      const coincideMarca = prodRef?.marca?.toLowerCase().includes(q)
      const coincideOperador = m.perfiles?.nombre?.toLowerCase().includes(q)
      return coincideNombre || coincideSabor || coincideMarca || coincideOperador
    })
  }, [movimientos, filtroTipoMov, marcaSeleccionada, busqueda, mapaProductosPorId])

  const formatearFechaHora = (iso) => {
    if (!iso) return { fecha: '-', hora: '-' }
    const d = new Date(iso)
    return {
      fecha: d.toLocaleDateString('es-BO', {
        day: '2-digit',
        month: 'short',
      }),
      hora: d.toLocaleTimeString('es-BO', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  }

  const limpiarNombreOperador = (nombreRaw) => {
    if (!nombreRaw) return 'Operador'
    return String(nombreRaw).replace(/\s*\(.*?\)\s*/g, '').trim() || 'Operador'
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-12">
      {/* ================= CABECERA MINIMALISTA (CERO REDUNDANCIA) ================= */}
      <div className="space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Izquierda: Título + Pestañas limpias */}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Almacén
            </h1>

            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-white/[0.05] border border-slate-200/70 dark:border-white/[0.07]">
              <button
                type="button"
                onClick={() => setPestanaActiva('stock')}
                className={`h-7.5 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                  pestanaActiva === 'stock'
                    ? 'bg-white dark:bg-[#1E2330] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>Stock</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {productosFiltrados.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPestanaActiva('historial')}
                className={`h-7.5 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                  pestanaActiva === 'historial'
                    ? 'bg-white dark:bg-[#1E2330] text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <History size={13} />
                <span>Movimientos</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {movimientosFiltrados.length}
                </span>
              </button>
            </div>
          </div>

          {/* Derecha: Acciones principales claras y con alto contraste en Dark/Light */}
          <div className="flex flex-wrap items-center gap-2">
            {pestanaActiva === 'stock' && (
              <div
                className="inline-flex items-center p-0.5 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08]"
                title="Cambiar vista"
              >
                <button
                  type="button"
                  onClick={() => setVistaStock('tarjetas')}
                  className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition cursor-pointer ${
                    vistaStock === 'tarjetas'
                      ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                  title="Vista con tarjetas"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setVistaStock('lista')}
                  className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition cursor-pointer ${
                    vistaStock === 'lista'
                      ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                  title="Vista en tabla compacta"
                >
                  <List size={15} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={cargarDatosAlmacen}
              title="Actualizar inventario"
              className="w-9 h-9 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.07] inline-flex items-center justify-center transition cursor-pointer"
            >
              <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
            </button>

            {puedeOperarAlmacen && (
              <>
                <button
                  type="button"
                  onClick={() => abrirModalOperacion('compra_almacen')}
                  className="h-9 px-3.5 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/90 dark:border-white/10 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-white/[0.08] text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <PackagePlus size={15} className="text-emerald-500" />
                  <span>Entrada a Depósito</span>
                </button>

                <button
                  type="button"
                  onClick={() => abrirModalOperacion('traspaso_a_central')}
                  className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <ArrowRightLeft size={15} />
                  <span>Traspasar a Central</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Fila de Buscador + Píldoras de Marcas (Cero ruido visual) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search
                size={15}
                className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value)
                  setPaginaStock(1)
                  setPaginaMov(1)
                }}
                placeholder="Buscar bebida o sabor..."
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => {
                    setBusqueda('')
                    setPaginaStock(1)
                    setPaginaMov(1)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {pestanaActiva === 'historial' && (
              <div className="inline-flex items-center p-0.5 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] shrink-0">
                {[
                  { id: 'TODOS', label: 'Todos' },
                  { id: 'compra_almacen', label: 'Entradas' },
                  { id: 'traspaso_a_central', label: 'Traspasos' },
                ].map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => {
                      setFiltroTipoMov(op.id)
                      setPaginaMov(1)
                    }}
                    className={`h-7.5 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                      filtroTipoMov === op.id
                        ? 'bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Píldoras de Marcas horizontales */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setMarcaSeleccionada('TODAS')
                setPaginaStock(1)
                setPaginaMov(1)
              }}
              className={`h-8 px-3 rounded-xl text-xs transition shrink-0 cursor-pointer ${
                marcaSeleccionada === 'TODAS'
                  ? 'bg-slate-900 text-white dark:bg-white/15 dark:text-white font-semibold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              Todas
            </button>
            {marcasDisponibles.map((marca) => (
              <button
                key={marca}
                type="button"
                onClick={() => {
                  setMarcaSeleccionada(marca)
                  setPaginaStock(1)
                  setPaginaMov(1)
                }}
                className={`h-8 px-3 rounded-xl text-xs transition shrink-0 cursor-pointer ${
                  marcaSeleccionada === marca
                    ? 'bg-slate-900 text-white dark:bg-white/15 dark:text-white font-semibold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                {marca}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notificación limpia de éxito / error */}
      {mensajeExito && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-800 dark:text-emerald-300 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            <span>{mensajeExito}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito('')}
            className="text-emerald-600 dark:text-emerald-300 hover:opacity-80 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {errorGeneral && (
        <div className="bg-red-500/10 border border-red-500/25 text-red-700 dark:text-red-300 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          <span>{errorGeneral}</span>
        </div>
      )}

      {/* ================= PESTAÑA 1: STOCK POR UBICACIÓN (CON IMAGEN Y CERO RUIDO VISUAL) ================= */}
      {pestanaActiva === 'stock' ? (
        productosFiltrados.length === 0 ? (
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.06] p-10 text-center text-sm text-slate-400">
            No se encontraron bebidas para el filtro seleccionado.
          </div>
        ) : vistaStock === 'tarjetas' ? (
          /* VISTA EN TARJETAS VISUALES (Mismo lenguaje de diseño de Despacho y Productos) */
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {productosFiltrados
                .slice(
                  (paginaStock - 1) * TAMANO_STOCK_TARJETAS,
                  paginaStock * TAMANO_STOCK_TARJETAS
                )
                .map((prod) => {
              const unidPaq = Math.max(1, Number(prod.unidades_por_paquete) || 6)
              const st = stockPorProducto[prod.id] || { almacen: 0, central: 0 }
              const textoDeposito = formatearCantidadesLimpio(st.almacen, unidPaq)
              const textoCentral = formatearCantidadesLimpio(st.central, unidPaq)

              const sinCentral = st.central <= 0
              const bajoCentral = st.central > 0 && st.central < unidPaq * 2
              const sugerirTraspaso = (sinCentral || bajoCentral) && st.almacen > 0

              return (
                <div
                  key={prod.id}
                  className="group bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] hover:border-slate-300 dark:hover:border-white/15 p-4 flex flex-col justify-between gap-3.5 transition"
                >
                  {/* Cabecera con Foto Real de Botella + Identidad */}
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-16 rounded-xl bg-[#F6F5F2] dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.06] shrink-0 overflow-hidden flex items-center justify-center">
                      <BottleVisual
                        imagenUrl={prod.imagen_url}
                        nombre={prod.nombre}
                        alturaClass="h-13"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2">
                        {prod.nombre}
                        {prod.sabor && (
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            {' '}
                            · {prod.sabor}
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                        {prod.marca} · Pack x{unidPaq}
                        {rolActual === 'admin' &&
                          Number(prod.costo_paquete) > 0 && (
                            <span className="text-slate-500 dark:text-slate-400">
                              {' '}
                              · Costo Bs{' '}
                              {Number(prod.costo_paquete).toLocaleString(
                                'es-BO',
                                {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                }
                              )}
                              /paq
                            </span>
                          )}
                      </p>
                    </div>
                  </div>

                  {/* Comparativa limpia: Depósito vs Tienda Central */}
                  <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 dark:border-white/[0.06] tabular-nums">
                    <div className="rounded-xl bg-slate-50/80 dark:bg-white/[0.025] px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                        <Warehouse size={12} />
                        <span>Depósito</span>
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          st.almacen > 0
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-400 dark:text-slate-600 font-medium'
                        }`}
                      >
                        {textoDeposito}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50/80 dark:bg-white/[0.025] px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            sinCentral
                              ? 'bg-red-500'
                              : bajoCentral
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                        <span>Tienda Central</span>
                      </div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          sinCentral
                            ? 'text-red-500 dark:text-red-400 font-medium'
                            : bajoCentral
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {textoCentral}
                      </div>
                    </div>
                  </div>

                  {/* Acciones directas de 1 clic */}
                  {puedeOperarAlmacen && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          abrirModalOperacion('compra_almacen', prod.id)
                        }
                        className="flex-1 h-8 rounded-xl bg-slate-100/90 dark:bg-white/[0.05] hover:bg-slate-200/80 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Plus size={13} className="text-emerald-500" />
                        <span>Entrada</span>
                      </button>

                      <button
                        type="button"
                        disabled={st.almacen <= 0}
                        onClick={() =>
                          abrirModalOperacion('traspaso_a_central', prod.id)
                        }
                        className={`flex-1 h-8 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                          sugerirTraspaso
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                            : 'bg-slate-100/90 dark:bg-white/[0.05] hover:bg-slate-200/80 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <ArrowRightLeft size={13} />
                        <span>Traspasar</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            </div>
            {productosFiltrados.length > TAMANO_STOCK_TARJETAS && (
              <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07]">
                <PaginationBar
                  paginaActual={paginaStock}
                  totalRegistros={productosFiltrados.length}
                  tamanoPagina={TAMANO_STOCK_TARJETAS}
                  onCambiarPagina={setPaginaStock}
                  etiquetaItem="bebidas"
                />
              </div>
            )}
          </div>
        ) : (
          /* VISTA EN TABLA COMPACTA CON MINIATURA DE BOTELLA Y CERO RUIDO */
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-white/[0.07] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Bebida</th>
                    <th className="py-3 px-4">Depósito</th>
                    <th className="py-3 px-4">Tienda Central</th>
                    {puedeOperarAlmacen && (
                      <th className="py-3 px-4 text-right">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-white/[0.06] text-sm tabular-nums">
                  {productosFiltrados
                    .slice(
                      (paginaStock - 1) * TAMANO_STOCK_LISTA,
                      paginaStock * TAMANO_STOCK_LISTA
                    )
                    .map((prod) => {
                    const unidPaq = Math.max(1, Number(prod.unidades_por_paquete) || 6)
                    const st = stockPorProducto[prod.id] || { almacen: 0, central: 0 }
                    const textoDeposito = formatearCantidadesLimpio(st.almacen, unidPaq)
                    const textoCentral = formatearCantidadesLimpio(st.central, unidPaq)
                    const sinCentral = st.central <= 0
                    const bajoCentral = st.central > 0 && st.central < unidPaq * 2

                    return (
                      <tr
                        key={prod.id}
                        className="group hover:bg-slate-50/80 dark:hover:bg-white/[0.025] transition"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-11 rounded-xl bg-[#F6F5F2] dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.06] shrink-0 overflow-hidden flex items-center justify-center">
                              <BottleVisual
                                imagenUrl={prod.imagen_url}
                                nombre={prod.nombre}
                                alturaClass="h-9"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {prod.nombre}
                                {prod.sabor && (
                                  <span className="font-normal text-slate-400">
                                    {' '}
                                    · {prod.sabor}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 tabular-nums">
                                {prod.marca} · Pack x{unidPaq}
                                {rolActual === 'admin' &&
                                  Number(prod.costo_paquete) > 0 && (
                                    <span className="text-slate-500 dark:text-slate-400">
                                      {' '}
                                      · Costo Bs{' '}
                                      {Number(
                                        prod.costo_paquete
                                      ).toLocaleString('es-BO', {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 2,
                                      })}
                                      /paq
                                    </span>
                                  )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={
                              st.almacen > 0
                                ? 'font-semibold text-slate-900 dark:text-slate-100'
                                : 'text-xs text-slate-400 dark:text-slate-500'
                            }
                          >
                            {textoDeposito}
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                sinCentral
                                  ? 'bg-red-500'
                                  : bajoCentral
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                            />
                            <span
                              className={
                                sinCentral
                                  ? 'text-xs font-medium text-red-500 dark:text-red-400'
                                  : 'font-semibold text-slate-900 dark:text-slate-100'
                              }
                            >
                              {textoCentral}
                            </span>
                          </div>
                        </td>

                        {puedeOperarAlmacen && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  abrirModalOperacion('compra_almacen', prod.id)
                                }
                                className="h-7.5 px-2.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200/80 dark:hover:bg-white/[0.1] text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <Plus size={12} className="text-emerald-500" />
                                <span>Entrada</span>
                              </button>
                              <button
                                type="button"
                                disabled={st.almacen <= 0}
                                onClick={() =>
                                  abrirModalOperacion('traspaso_a_central', prod.id)
                                }
                                className="h-7.5 px-2.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-amber-500 hover:text-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                              >
                                <ArrowRightLeft size={12} />
                                <span>Traspasar</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar
              paginaActual={paginaStock}
              totalRegistros={productosFiltrados.length}
              tamanoPagina={TAMANO_STOCK_LISTA}
              onCambiarPagina={setPaginaStock}
              etiquetaItem="bebidas"
            />
          </div>
        )
      ) : (
        /* ================= PESTAÑA 2: HISTORIAL DE MOVIMIENTOS CON IMAGEN ================= */
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden">
          {movimientosFiltrados.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              {cargandoMovs
                ? 'Cargando movimientos...'
                : 'No hay movimientos registrados para este filtro.'}
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200/60 dark:divide-white/[0.06]">
                {(busqueda.trim() || marcaSeleccionada !== 'TODAS'
                  ? movimientosFiltrados.slice(
                      (paginaMov - 1) * TAMANO_MOVIMIENTOS,
                      paginaMov * TAMANO_MOVIMIENTOS
                    )
                  : movimientosFiltrados
                ).map((mov) => {
                const esCompra = mov.tipo === 'compra_almacen'
                const prodRef =
                  mov.productos || mapaProductosPorId[mov.producto_id] || {}
                const imgUrl =
                  prodRef.imagen_url ||
                  mapaProductosPorId[mov.producto_id]?.imagen_url
                const unidPaq = Math.max(
                  1,
                  Number(prodRef.unidades_por_paquete) || 6
                )
                const desgloseLimpio = formatearDesgloseMovimiento(
                  mov.cantidad_paquetes,
                  mov.cantidad_unidades_sueltas,
                  mov.total_unidades,
                  unidPaq
                )
                const { fecha, hora } = formatearFechaHora(mov.fecha)

                return (
                  <div
                    key={mov.id}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-white/[0.025] transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-11 rounded-xl bg-[#F6F5F2] dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.06] shrink-0 overflow-hidden flex items-center justify-center">
                        <BottleVisual
                          imagenUrl={imgUrl}
                          nombre={prodRef.nombre}
                          alturaClass="h-9"
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {prodRef.nombre || 'Bebida'}
                          {prodRef.sabor && (
                            <span className="font-normal text-slate-400">
                              {' '}
                              · {prodRef.sabor}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          <span
                            className={`font-medium ${
                              esCompra
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {esCompra
                              ? '↘ Entrada a Depósito'
                              : '↗ Traspaso a Central'}
                          </span>
                          <span>·</span>
                          <span>
                            {fecha}, {hora}
                          </span>
                          <span className="hidden sm:inline">·</span>
                          <span className="hidden sm:inline">
                            {limpiarNombreOperador(
                              mov.perfiles?.nombre || usuarioActual?.nombre
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div
                        className={`text-sm font-bold ${
                          esCompra
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {esCompra ? `+${desgloseLimpio}` : desgloseLimpio}
                      </div>
                      {rolActual === 'admin' &&
                      esCompra &&
                      (Number(mov.costo_total) > 0 ||
                        Number(mov.costo_paquete) > 0) ? (
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {Number(mov.costo_total) > 0 && (
                            <span>
                              Bs{' '}
                              {Number(mov.costo_total).toLocaleString('es-BO', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          )}
                          {Number(mov.costo_paquete) > 0 && (
                            <span className="text-slate-400">
                              {' '}
                              (Bs{' '}
                              {Number(mov.costo_paquete).toLocaleString(
                                'es-BO',
                                {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                }
                              )}
                              /paq)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">
                          Pack x{unidPaq}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              </div>
              <PaginationBar
                paginaActual={paginaMov}
                totalRegistros={
                  busqueda.trim() || marcaSeleccionada !== 'TODAS'
                    ? movimientosFiltrados.length
                    : totalMovServidor
                }
                tamanoPagina={TAMANO_MOVIMIENTOS}
                onCambiarPagina={setPaginaMov}
                cargando={cargandoMovs}
                etiquetaItem="movimientos"
              />
            </>
          )}
        </div>
      )}

      {/* ================= MODAL VISUAL DE ENTRADA / TRASPASO (SENIOR UX/UI) ================= */}
      {puedeOperarAlmacen && modalTipo && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Cabecera limpia del modal */}
            <div className="px-5 py-4 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    modalTipo === 'compra_almacen'
                      ? 'bg-emerald-500/12 text-emerald-500'
                      : 'bg-amber-500/15 text-amber-500'
                  }`}
                >
                  {modalTipo === 'compra_almacen' ? (
                    <PackagePlus size={18} />
                  ) : (
                    <ArrowRightLeft size={18} />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {modalTipo === 'compra_almacen'
                      ? 'Entrada a Depósito'
                      : 'Traspasar a Tienda Central'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {modalTipo === 'compra_almacen'
                      ? 'Registra mercadería nueva que ingresa al Depósito'
                      : 'Mueve stock del Depósito hacia Tienda Central'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalTipo(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center justify-center transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={ejecutarMovimientoRPC} className="p-5 space-y-4">
              {errorModal && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-600 dark:text-red-300 font-medium flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{errorModal}</span>
                </div>
              )}

              {/* Tarjeta visual de la bebida seleccionada + selector desplegable con fotos */}
              <div className="space-y-2.5">
                {productoSeleccionado && (
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-14 rounded-xl bg-white dark:bg-white/[0.05] border border-slate-200/60 dark:border-white/[0.06] shrink-0 overflow-hidden flex items-center justify-center">
                        <BottleVisual
                          imagenUrl={productoSeleccionado.imagen_url}
                          nombre={productoSeleccionado.nombre}
                          alturaClass="h-11"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {productoSeleccionado.nombre}
                          {productoSeleccionado.sabor
                            ? ` · ${productoSeleccionado.sabor}`
                            : ''}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {productoSeleccionado.marca} · Pack x
                          {unidadesPorPaqueteActual}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] mt-1 tabular-nums">
                          <span className="text-slate-500 dark:text-slate-300">
                            Depósito:{' '}
                            <strong className="text-slate-900 dark:text-white">
                              {formatearCantidadesLimpio(
                                stockDepositoActualUnidades,
                                unidadesPorPaqueteActual
                              )}
                            </strong>
                          </span>
                          <span className="text-slate-500 dark:text-slate-300">
                            Central:{' '}
                            <strong className="text-slate-900 dark:text-white">
                              {formatearCantidadesLimpio(
                                stockCentralActualUnidades,
                                unidadesPorPaqueteActual
                              )}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setMostrarSelectorModal((v) => !v)}
                      className="h-8 px-2.5 rounded-lg bg-white dark:bg-white/[0.07] border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/15 inline-flex items-center gap-1 shrink-0 transition cursor-pointer"
                    >
                      <span>Cambiar</span>
                      <ChevronDown
                        size={13}
                        className={`transition-transform ${
                          mostrarSelectorModal ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>
                )}

                {/* Selector visual con fotos y filtro por marca */}
                {mostrarSelectorModal && (
                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#11141C] p-3 space-y-2.5">
                    <div className="relative">
                      <Search
                        size={14}
                        className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      />
                      <input
                        type="text"
                        value={busquedaModal}
                        onChange={(e) => setBusquedaModal(e.target.value)}
                        placeholder="Buscar bebida..."
                        className="w-full h-8 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500/60"
                      />
                    </div>

                    {marcasDisponibles.length > 0 && (
                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
                        <button
                          type="button"
                          onClick={() => setMarcaModalFiltro('TODAS')}
                          className={`h-6.5 px-2.5 rounded-lg text-[11px] transition shrink-0 cursor-pointer ${
                            marcaModalFiltro === 'TODAS'
                              ? 'bg-slate-900 text-white dark:bg-white/15 font-semibold'
                              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                          }`}
                        >
                          Todas
                        </button>
                        {marcasDisponibles.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMarcaModalFiltro(m)}
                            className={`h-6.5 px-2.5 rounded-lg text-[11px] transition shrink-0 cursor-pointer ${
                              marcaModalFiltro === m
                                ? 'bg-slate-900 text-white dark:bg-white/15 font-semibold'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                      {productosModalFiltrados.map((p) => {
                        const stDep = stockPorProducto[p.id]?.almacen || 0
                        const uPaq = Math.max(
                          1,
                          Number(p.unidades_por_paquete) || 6
                        )
                        const activo = p.id === productoIdSel

                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              seleccionarProductoEnModal(
                                p,
                                totalBotellasOperacion
                              )
                              setMostrarSelectorModal(false)
                              setErrorModal('')
                            }}
                            className={`w-full p-2 rounded-xl flex items-center justify-between gap-2.5 text-left transition cursor-pointer ${
                              activo
                                ? 'bg-amber-500/12 border border-amber-500/35'
                                : 'hover:bg-slate-50 dark:hover:bg-white/[0.04] border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-9 rounded-lg bg-[#F6F5F2] dark:bg-white/[0.05] shrink-0 overflow-hidden flex items-center justify-center">
                                <BottleVisual
                                  imagenUrl={p.imagen_url}
                                  nombre={p.nombre}
                                  alturaClass="h-7"
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                  {p.nombre}
                                  {p.sabor ? ` · ${p.sabor}` : ''}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {p.marca} · Pack x{uPaq}
                                </div>
                              </div>
                            </div>

                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300 shrink-0 tabular-nums">
                              {formatearCantidadesLimpio(stDep, uPaq)}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Controles táctiles para Paquetes y Botellas sueltas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08]">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    Paquetes (x{unidadesPorPaqueteActual})
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => ajustarPaquetes(-1)}
                      className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/15 inline-flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={paquetesInput}
                      onChange={(e) => {
                        const val = e.target.value
                        setPaquetesInput(val)
                        if (modalTipo === 'compra_almacen') {
                          sincronizarCostosPorCantidad(val, sueltasInput)
                        }
                        setErrorModal('')
                      }}
                      className="w-full h-9 text-center rounded-xl bg-white dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-base font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => ajustarPaquetes(1)}
                      className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/15 inline-flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08]">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                    Botellas sueltas
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => ajustarSueltas(-1)}
                      className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/15 inline-flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={sueltasInput}
                      onChange={(e) => {
                        const val = e.target.value
                        setSueltasInput(val)
                        if (modalTipo === 'compra_almacen') {
                          sincronizarCostosPorCantidad(paquetesInput, val)
                        }
                        setErrorModal('')
                      }}
                      className="w-full h-9 text-center rounded-xl bg-white dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-base font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => ajustarSueltas(1)}
                      className="w-9 h-9 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/15 inline-flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Atajos rápidos para operar con 1 toque */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  {[1, 5, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => ajustarPaquetes(n)}
                      className="h-7 px-2.5 rounded-lg bg-slate-100 dark:bg-white/[0.05] hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 font-medium transition cursor-pointer"
                    >
                      +{n} Paq
                    </button>
                  ))}
                  {modalTipo === 'traspaso_a_central' &&
                    stockDepositoActualUnidades > 0 && (
                      <button
                        type="button"
                        onClick={cargarTodoElDepositoEnModal}
                        className="h-7 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 font-semibold transition cursor-pointer"
                      >
                        Todo el depósito
                      </button>
                    )}
                </div>

                {totalBotellasOperacion > 0 && (
                  <span
                    className={`font-semibold tabular-nums ${
                      superaStockDeposito
                        ? 'text-red-500'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Total:{' '}
                    {formatearCantidadesLimpio(
                      totalBotellasOperacion,
                      unidadesPorPaqueteActual
                    )}{' '}
                    ({totalBotellasOperacion} bot.)
                  </span>
                )}
              </div>

              {superaStockDeposito && (
                <p className="text-xs font-medium text-red-500 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>
                    Supera lo disponible en Depósito (
                    {formatearCantidadesLimpio(
                      stockDepositoActualUnidades,
                      unidadesPorPaqueteActual
                    )}
                    ).
                  </span>
                </p>
              )}

              {/* Costo de Compra (SOLO al ingresar mercadería nueva a Depósito) */}
              {modalTipo === 'compra_almacen' && (
                <div className="p-3.5 rounded-2xl bg-slate-50/90 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Costo de esta compra
                    </span>
                    {Number(productoSeleccionado?.costo_paquete) > 0 && (
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        Últ. costo: Bs{' '}
                        {Number(
                          productoSeleccionado.costo_paquete
                        ).toLocaleString('es-BO', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                        /paq
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 tabular-nums">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Costo por Paquete (x{unidadesPorPaqueteActual}) *
                      </label>
                      <div className="relative">
                        <span className="text-xs font-semibold text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          Bs
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={costoPaqueteInput}
                          onChange={(e) =>
                            cambiarCostoPaqueteManual(e.target.value)
                          }
                          className="w-full h-9 pl-8 pr-2.5 rounded-xl bg-white dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Total Pagado
                      </label>
                      <div className="relative">
                        <span className="text-xs font-semibold text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                          Bs
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Auto"
                          value={costoTotalInput}
                          onChange={(e) =>
                            cambiarCostoTotalManual(e.target.value)
                          }
                          className="w-full h-9 pl-8 pr-2.5 rounded-xl bg-white dark:bg-[#11141C] border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {Number(costoPaqueteInput) > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>
                        Costo unitario:{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          Bs{' '}
                          {(
                            Number(costoPaqueteInput) / unidadesPorPaqueteActual
                          ).toFixed(2)}
                          /bot.
                        </strong>
                      </span>
                      {rolActual === 'admin' &&
                        Number(productoSeleccionado?.precio_paquete_menor) >
                          0 && (
                          <span>
                            Venta paq: Bs{' '}
                            {Number(productoSeleccionado.precio_paquete_menor)}{' '}
                            ·{' '}
                            <strong
                              className={
                                Number(
                                  productoSeleccionado.precio_paquete_menor
                                ) -
                                  Number(costoPaqueteInput) >=
                                0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-500'
                              }
                            >
                              {Number(
                                productoSeleccionado.precio_paquete_menor
                              ) -
                                Number(costoPaqueteInput) >=
                              0
                                ? '+'
                                : ''}
                              Bs{' '}
                              {(
                                Number(
                                  productoSeleccionado.precio_paquete_menor
                                ) - Number(costoPaqueteInput)
                              ).toFixed(2)}
                              /paq
                            </strong>
                          </span>
                        )}
                    </div>
                  )}
                </div>
              )}

              {/* Pie de acciones */}
              <div className="pt-3 border-t border-slate-200/80 dark:border-white/[0.08] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalTipo(null)}
                  className="h-9 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={
                    procesando ||
                    totalBotellasOperacion <= 0 ||
                    superaStockDeposito
                  }
                  className={`h-9 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    modalTipo === 'compra_almacen'
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  <CheckCircle2 size={15} />
                  <span>
                    {procesando
                      ? 'Guardando...'
                      : modalTipo === 'compra_almacen'
                      ? 'Confirmar Entrada'
                      : 'Confirmar Traspaso'}
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
