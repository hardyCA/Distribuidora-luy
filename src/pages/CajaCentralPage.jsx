import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Store,
  Search,
  Plus,
  Minus,
  CheckCircle2,
  Sparkles,
  Download,
  Share2,
  MessageCircle,
  Banknote,
  QrCode,
  Split,
  CreditCard,
  Trash2,
  User,
  Users,
  X,
  RefreshCw,
  AlertTriangle,
  Layers,
  Receipt,
} from 'lucide-react'
import {
  supabase,
  obtenerOCrearPerfilPorRol,
  enriquecerProductosConCosto,
} from '../lib/supabase'
import { useRole } from '../context/RoleContext'
import { formatearStock } from '../utils/stock'
import BottleVisual from '../components/BottleVisual'
import ModalSurtidoSabores from '../components/ModalSurtidoSabores'
import {
  calcularResumenCarritoIntegral,
  obtenerGrupoSurtido,
  obtenerTipoBeneficio,
} from '../utils/surtidoHelper'
import {
  generarYCompartirPDF,
  generarUrlWhatsAppPedido,
} from '../utils/pdfGenerator'

export default function CajaCentralPage() {
  const { rolActual, infoRol, usuarioActual } = useRole()

  const [productos, setProductos] = useState([])
  const [marcasTabla, setMarcasTabla] = useState([])
  const [clientes, setClientes] = useState([])
  const [stockCentralMap, setStockCentralMap] = useState({})
  const [stockAlmacenMap, setStockAlmacenMap] = useState({})
  const [ventasHoy, setVentasHoy] = useState([])
  const [cargando, setCargando] = useState(true)

  // Selección de Cliente: null significa "Cliente Mostrador / Venta Rápida"
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [buscadorClienteAbierto, setBuscadorClienteAbierto] = useState(false)
  const [busquedaCliente, setBusquedaCliente] = useState('')

  // Filtros del catálogo POS + Selector global Paquetes / Botellas (por defecto Paquetes)
  const [busquedaProd, setBusquedaProd] = useState('')
  const [marcaFiltro, setMarcaFiltro] = useState('TODAS')
  const [modoUnidadPos, setModoUnidadPos] = useState('paquetes') // 'paquetes' | 'sueltas'

  // Carrito POS: { [producto_id]: { paquetes: number, sueltas: number } }
  const [carritoPos, setCarritoPos] = useState({})
  // Paquetes surtidos por grupo en POS
  const [paquetesSurtidosPos, setPaquetesSurtidosPos] = useState({})
  const [grupoSurtidoModalPos, setGrupoSurtidoModalPos] = useState(null)

  // Método de pago integrado en la misma ventana del POS
  const [metodoPago, setMetodoPago] = useState('efectivo') // 'efectivo' | 'qr' | 'mixto' | 'credito'
  const [inputEfectivo, setInputEfectivo] = useState('')
  const [inputQr, setInputQr] = useState('')

  // Estado de cobro y comprobante listo
  const [procesandoVenta, setProcesandoVenta] = useState(false)
  const [errorPos, setErrorPos] = useState('')
  const [ventaCompletada, setVentaCompletada] = useState(null)

  const cargarDatosPOS = useCallback(async () => {
    setCargando(true)
    try {
      const [resProds, resMarcas, resCli, resUbic, resInv, resVentas] =
        await Promise.all([
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
          supabase
            .from('clientes')
            .select('*')
            .order('nombre', { ascending: true }),
          supabase.from('ubicaciones').select('*'),
          supabase.from('inventario').select('*'),
          supabase
            .from('ventas')
            .select(
              `
            *,
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
            )
            .eq('tipo', 'venta_directa')
            .order('fecha_pedido', { ascending: false })
            .limit(30),
        ])

      const prodsConCosto = await enriquecerProductosConCosto(resProds.data || [])
      setProductos(prodsConCosto)
      setMarcasTabla(resMarcas.data || [])
      setClientes(resCli.data || [])
      setVentasHoy(resVentas.data || [])

      const centralId = resUbic.data?.find((u) => u.tipo === 'central')?.id
      const almacenId = resUbic.data?.find((u) => u.tipo === 'almacen')?.id
      const mapaSt = {}
      const mapaAl = {}
      ;(resInv.data || []).forEach((item) => {
        if (item.ubicacion_id === centralId) {
          mapaSt[item.producto_id] = Number(item.stock_unidades) || 0
        } else if (item.ubicacion_id === almacenId) {
          mapaAl[item.producto_id] = Number(item.stock_unidades) || 0
        }
      })
      setStockCentralMap(mapaSt)
      setStockAlmacenMap(mapaAl)
    } catch (err) {
      console.error('Error cargando Caja Tienda Central:', err)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarDatosPOS()
  }, [cargarDatosPOS])

  // Marcas disponibles (alimentadas por la tabla `marcas` + productos activos)
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

  const gruposSurtiblesEnVistaPos = useMemo(() => {
    const s = new Set()
    productosFiltrados.forEach((p) => {
      const g = obtenerGrupoSurtido(p)
      if (g) s.add(g)
    })
    return Array.from(s)
  }, [productosFiltrados])

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase()
    if (!q) return clientes.slice(0, 25)
    return clientes.filter(
      (c) =>
        c.nombre?.toLowerCase().includes(q) ||
        c.telefono?.toLowerCase().includes(q) ||
        c.direccion?.toLowerCase().includes(q)
    )
  }, [clientes, busquedaCliente])

  const actualizarCantidadPos = (productoId, campo, valorNuevo) => {
    const num = Math.max(0, parseInt(valorNuevo, 10) || 0)
    setErrorPos('')
    setCarritoPos((prev) => {
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

  const guardarSurtidoPos = (grupoKey, surtidoData) => {
    setErrorPos('')
    setPaquetesSurtidosPos((prev) => ({
      ...prev,
      [grupoKey]: surtidoData,
    }))
  }

  const eliminarSurtidoPos = (grupoKey) => {
    setErrorPos('')
    setPaquetesSurtidosPos((prev) => {
      const copia = { ...prev }
      delete copia[grupoKey]
      return copia
    })
  }

  // Cálculo automático del carrito con escalas mayorista/bonificación/surtidos y validación de stock en Tienda Central
  const resumenPos = useMemo(
    () =>
      calcularResumenCarritoIntegral({
        productos,
        cantidadesPorProducto: carritoPos,
        paquetesSurtidos: paquetesSurtidosPos,
        stockCentralMap,
      }),
    [productos, carritoPos, paquetesSurtidosPos, stockCentralMap]
  )

  // Sincronizar montos de Efectivo y QR automáticamente cuando cambia el Total o el Método de Pago
  useEffect(() => {
    const total = Number(resumenPos.totalBs) || 0
    if (metodoPago === 'efectivo') {
      setInputEfectivo(String(total))
      setInputQr('0')
    } else if (metodoPago === 'qr') {
      setInputEfectivo('0')
      setInputQr(String(total))
    } else if (metodoPago === 'credito') {
      setInputEfectivo('0')
      setInputQr('0')
    } else if (metodoPago === 'mixto') {
      const mitad = Math.floor(total / 2)
      setInputEfectivo(String(mitad))
      setInputQr(String(Number((total - mitad).toFixed(2))))
    }
  }, [resumenPos.totalBs, metodoPago])

  const montoEfectivoNum = Math.max(0, parseFloat(inputEfectivo) || 0)
  const montoQrNum = Math.max(0, parseFloat(inputQr) || 0)
  const sumaPagada = Number((montoEfectivoNum + montoQrNum).toFixed(2))
  const saldoCreditoCalculado = Math.max(
    0,
    Number((resumenPos.totalBs - sumaPagada).toFixed(2))
  )

  /**
   * Acción Principal: "Cobrar y Entregar en Tienda"
   * 1) Crea la venta con `tipo = 'venta_directa'` y sus `venta_detalles`
   * 2) Llama inmediatamente al RPC `confirmar_entrega_y_descontar_stock`
   */
  const cobrarYEntregarEnTienda = async () => {
    if (resumenPos.detalles.length === 0) {
      setErrorPos('Agrega al menos un producto al carrito del Punto de Venta.')
      return
    }

    if (resumenPos.alertasSinStock.length > 0) {
      setErrorPos(
        `Stock insuficiente en Tienda Central: ${resumenPos.alertasSinStock[0]}`
      )
      return
    }

    if (sumaPagada > resumenPos.totalBs + 0.01) {
      setErrorPos('La suma de Efectivo + QR no puede superar el Total a pagar.')
      return
    }

    if (saldoCreditoCalculado > 0 && !clienteSeleccionado?.id) {
      setErrorPos(
        'Para dejar saldo a Crédito debes seleccionar un Cliente registrado (no Cliente Mostrador).'
      )
      return
    }

    setProcesandoVenta(true)
    setErrorPos('')

    try {
      let validUserId = usuarioActual?.id
      if (!validUserId || String(validUserId).startsWith('local-')) {
        const { perfil } = await obtenerOCrearPerfilPorRol(
          rolActual,
          infoRol.defaultName
        )
        validUserId = perfil?.id || null
      }

      const codigoFolio = `POS-${Date.now().toString().slice(-6)}-${Math.floor(
        10 + Math.random() * 89
      )}`

      // 1. Insertar cabecera en `ventas` con `tipo = 'venta_directa'`
      const { data: nuevaVenta, error: vErr } = await supabase
        .from('ventas')
        .insert([
          {
            codigo_local: codigoFolio,
            tipo: 'venta_directa',
            estado: 'pendiente_entrega',
            cliente_id: clienteSeleccionado?.id || null,
            vendedor_id: validUserId,
            total: resumenPos.totalBs,
            monto_efectivo: 0,
            monto_qr: 0,
            saldo_credito: 0,
          },
        ])
        .select()
        .single()

      if (vErr) throw vErr

      // 2. Insertar filas en `venta_detalles` (con snapshot de costo_unitario si existe la columna)
      const mapaProds = {}
      productos.forEach((p) => {
        mapaProds[p.id] = p
      })

      const filasBase = resumenPos.detalles.map((d) => ({
        venta_id: nuevaVenta.id,
        producto_id: d.producto_id,
        tipo_venta: d.tipo_venta,
        cantidad: d.cantidad,
        unidades_totales_descontar: d.unidades_totales_descontar,
        precio_aplicado: d.precio_aplicado,
        subtotal: d.subtotal,
        nota_surtido: d.nota_surtido || null,
      }))

      const filasConCosto = filasBase.map((f) => {
        const pRef = mapaProds[f.producto_id]
        const uPaq = Math.max(1, Number(pRef?.unidades_por_paquete) || 6)
        const cPaq = Number(pRef?.costo_paquete) || 0
        return {
          ...f,
          costo_unitario: cPaq > 0 ? Number((cPaq / uPaq).toFixed(4)) : null,
        }
      })

      const { error: detErrCosto } = await supabase
        .from('venta_detalles')
        .insert(filasConCosto)

      if (detErrCosto) {
        const { error: detErr } = await supabase
          .from('venta_detalles')
          .insert(filasBase)
        if (detErr) throw detErr
      }

      // 3. Llamar de inmediato al RPC `confirmar_entrega_y_descontar_stock`
      const { error: rpcErr } = await supabase.rpc(
        'confirmar_entrega_y_descontar_stock',
        {
          p_venta_id: nuevaVenta.id,
          p_monto_efectivo: montoEfectivoNum,
          p_monto_qr: montoQrNum,
          p_saldo_credito: saldoCreditoCalculado,
        }
      )

      if (rpcErr) throw rpcErr

      const ventaFinal = {
        ...nuevaVenta,
        estado: 'entregado',
        monto_efectivo: montoEfectivoNum,
        monto_qr: montoQrNum,
        saldo_credito: saldoCreditoCalculado,
        fecha_entrega: new Date().toISOString(),
      }

      const clienteSnapshot = clienteSeleccionado || {
        nombre: 'Cliente Mostrador / Venta Rápida',
        direccion: 'Venta directa en Tienda Central',
      }

      setVentaCompletada({
        venta: ventaFinal,
        cliente: clienteSnapshot,
        detalles: resumenPos.detalles,
        cajeroNombre: usuarioActual?.nombre || infoRol.defaultName,
      })

      setCarritoPos({})
      setPaquetesSurtidosPos({})
      await cargarDatosPOS()
    } catch (err) {
      console.error('Error en venta directa POS:', err)
      setErrorPos(
        err.message || 'No se pudo procesar la venta en Tienda Central.'
      )
    } finally {
      setProcesandoVenta(false)
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
    <div className="space-y-6 pb-16">
      {/* ================= CABECERA MINIMALISTA ESTILO LINEAR ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Caja Tienda Central
          </h1>
          <span className="text-sm font-normal text-slate-400">
            {productosFiltrados.length} productos
          </span>
        </div>

        <button
          type="button"
          onClick={cargarDatosPOS}
          className="self-start sm:self-auto h-9 px-3.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
          <span>Actualizar Stock</span>
        </button>
      </div>

      {/* ================= LAYOUT PRINCIPAL POS: CATÁLOGO (IZQ) + CAJA DE COBRO (DER) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMNA IZQUIERDA (7 cols): Selector de Cliente + Catálogo de Bebidas */}
        <div className="lg:col-span-7 space-y-4">
          {/* 1. SELECCIÓN DE CLIENTE O "CLIENTE MOSTRADOR / VENTA RÁPIDA" */}
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.06] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Users size={15} className="text-amber-500" />
                Cliente para la Venta en Tienda
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setClienteSeleccionado(null)
                    setBuscadorClienteAbierto(false)
                  }}
                  className={`h-8 px-2.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    !clienteSeleccionado
                      ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Cliente Mostrador
                </button>

                <button
                  type="button"
                  onClick={() => setBuscadorClienteAbierto((prev) => !prev)}
                  className="h-8 px-2.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 text-xs font-medium transition cursor-pointer"
                >
                  {buscadorClienteAbierto
                    ? 'Cerrar buscador'
                    : 'Buscar Cliente'}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#11141B] border border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 flex items-center justify-center shrink-0">
                  <User size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    {clienteSeleccionado
                      ? clienteSeleccionado.nombre
                      : 'Cliente Mostrador / Venta Rápida'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {clienteSeleccionado
                      ? `${
                          clienteSeleccionado.direccion || 'Sin referencia'
                        } · ${clienteSeleccionado.telefono || 'S/N'}`
                      : 'Venta al contado en mostrador (Para dar a crédito, elige un cliente registrado)'}
                  </div>
                </div>
              </div>
            </div>

            {buscadorClienteAbierto && (
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 space-y-2">
                <div className="relative">
                  <Search size={15} className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={busquedaCliente}
                    onChange={(e) => setBusquedaCliente(e.target.value)}
                    placeholder="Buscar cliente por nombre, teléfono o dirección..."
                    className="w-full h-9 pl-9 pr-4 rounded-lg bg-white dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-white/10 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A1E29]">
                  {clientesFiltrados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClienteSeleccionado(c)
                        setBuscadorClienteAbierto(false)
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{c.nombre}</div>
                        <div className="text-[11px] text-slate-500">
                          {c.direccion || 'Sin dirección'} · {c.telefono || 'S/N'}
                        </div>
                      </div>
                      <span className="font-bold text-amber-700">Seleccionar →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. FILA LIMPIA DE BÚSQUEDA Y PÍLDORAS DE MARCA (SIN CAJA ENVOLVENTE) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative w-full sm:w-72 shrink-0">
              <Search size={16} className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={busquedaProd}
                onChange={(e) => setBusquedaProd(e.target.value)}
                placeholder="Buscar bebida o marca..."
                className="w-full h-9 pl-9 pr-8 rounded-lg bg-white dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
              />
              {busquedaProd && (
                <button
                  type="button"
                  onClick={() => setBusquedaProd('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {marcasDisponibles.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setMarcaFiltro('TODAS')}
                  className={`h-8 px-3 rounded-lg text-xs font-medium shrink-0 cursor-pointer ${
                    marcaFiltro === 'TODAS'
                      ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                      : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Todas
                </button>
                {marcasDisponibles.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarcaFiltro(m)}
                    className={`h-8 px-3 rounded-lg text-xs font-medium shrink-0 cursor-pointer ${
                      marcaFiltro === m
                        ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                        : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fila limpia: Surtidos por marca (izq) + Selector global Por Paquete / Por Botella (der) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {gruposSurtiblesEnVistaPos.map((grupo) => {
                const surtidoActual = paquetesSurtidosPos[grupo]
                const cantPaqSurt = Number(surtidoActual?.paquetes) || 0
                return (
                  <button
                    key={grupo}
                    type="button"
                    onClick={() => setGrupoSurtidoModalPos(grupo)}
                    className={`h-8 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer ${
                      cantPaqSurt > 0
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-300 font-semibold'
                        : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10'
                    }`}
                  >
                    <Layers size={14} className="text-amber-500 shrink-0" />
                    <span>
                      Surtir sabores: {grupo}
                      {cantPaqSurt > 0 ? ` (${cantPaqSurt} paq)` : ''}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="ml-auto inline-flex items-center p-0.5 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] shrink-0">
              <button
                type="button"
                onClick={() => setModoUnidadPos('paquetes')}
                className={`h-7.5 px-3 rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1.5 ${
                  modoUnidadPos === 'paquetes'
                    ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 font-semibold shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
                }`}
              >
                <span>Por Paquete</span>
              </button>
              <button
                type="button"
                onClick={() => setModoUnidadPos('sueltas')}
                className={`h-7.5 px-3 rounded-lg text-xs transition cursor-pointer inline-flex items-center gap-1.5 ${
                  modoUnidadPos === 'sueltas'
                    ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 font-semibold shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium'
                }`}
              >
                <span>Por Botella</span>
              </button>
            </div>
          </div>

          {/* 3. CATÁLOGO POS EDITORIAL MINIMALISTA CON ESCALAS AUTOMÁTICAS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {productosFiltrados.map((prod) => {
              const unidPaq = Number(prod.unidades_por_paquete) || 6
              const minMayor = Number(prod.min_paquetes_mayor) || 5
              const tipoBeneficio = obtenerTipoBeneficio(prod)
              const esBonificacion = tipoBeneficio === 'bonificacion'
              const esFijo = tipoBeneficio === 'ninguno'
              const bonifCompra = Number(prod.bonif_compra_paquetes) || 5
              const bonifRegalo = Number(prod.bonif_regalo_paquetes) || 2
              const grupoSurtidoProd = obtenerGrupoSurtido(prod)

              const cant = carritoPos[prod.id] || { paquetes: 0, sueltas: 0 }
              const stockDisp = stockCentralMap[prod.id] || 0
              const stockAlm = stockAlmacenMap[prod.id] || 0
              const stockFmt = formatearStock(stockDisp, unidPaq)
              const stockAlmFmt = formatearStock(stockAlm, unidPaq)

              const paquetesGrupoTotal = grupoSurtidoProd
                ? resumenPos.paquetesPorGrupo[grupoSurtidoProd] || cant.paquetes
                : cant.paquetes

              const esMayorista =
                tipoBeneficio === 'precio_mayor' &&
                paquetesGrupoTotal >= minMayor

              const paquetesGratisProd =
                esBonificacion && bonifCompra > 0
                  ? Math.floor(cant.paquetes / bonifCompra) * bonifRegalo
                  : 0
              const faltanParaBonif =
                esBonificacion && bonifCompra > 0
                  ? bonifCompra - (cant.paquetes % bonifCompra)
                  : 0

              const botellasEnSurtido = grupoSurtidoProd
                ? Number(
                    paquetesSurtidosPos[grupoSurtidoProd]?.botellasPorProducto?.[
                      prod.id
                    ]
                  ) || 0
                : 0

              const enCarrito =
                cant.paquetes > 0 || cant.sueltas > 0 || botellasEnSurtido > 0

              return (
                <article
                  key={prod.id}
                  className={`group bg-[#F6F5F2] hover:bg-[#EFECE6] rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 ${
                    enCarrito ? 'ring-2 ring-amber-500 bg-[#F3EFE8]' : ''
                  }`}
                >
                  {/* Bloque Horizontal: 35% Botella sin fondo | 65% Jerarquía Tipográfica Limpia */}
                  <div className="flex items-center gap-4">
                    <div className="w-[35%] shrink-0 flex items-center justify-center">
                      <BottleVisual
                        imagenUrl={prod.imagen_url}
                        nombre={prod.nombre}
                        alturaClass="h-40"
                      />
                    </div>

                    <div className="w-[65%] min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-500 truncate">
                        <span>{prod.marca || 'BEBIDA'}</span>
                        <span className="mx-1.5 text-stone-400">•</span>
                        <span className="text-stone-600 normal-case tracking-normal font-medium">
                          Pack x{unidPaq}
                        </span>
                        {prod.permite_surtido && (
                          <span className="text-amber-700 normal-case tracking-normal font-semibold">
                            {' '}
                            • Surtible
                          </span>
                        )}
                      </div>

                      <div className="mt-1 mb-3">
                        <h3 className="text-lg font-bold text-stone-900 leading-tight line-clamp-2">
                          {prod.nombre}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          {prod.sabor && (
                            <span className="text-xs font-medium text-stone-500">
                              Sabor: {prod.sabor}
                            </span>
                          )}
                          {grupoSurtidoProd && (
                            <button
                              type="button"
                              onClick={() =>
                                setGrupoSurtidoModalPos(grupoSurtidoProd)
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

                      {/* Fila de Precios (Sin cajas ni bordes alrededor) */}
                      <div
                        className={`grid ${
                          esFijo ? 'grid-cols-2' : 'grid-cols-3'
                        } divide-x divide-stone-200/80 tabular-nums`}
                      >
                        <div className="pr-2">
                          <span className="block text-[11px] text-stone-400 uppercase">
                            Botella
                          </span>
                          <span className="block text-sm font-semibold text-stone-700 mt-0.5">
                            {formatearBs(prod.precio_unidad)}
                          </span>
                        </div>

                        <div className="px-2">
                          <span className="block text-[11px] text-stone-400 uppercase">
                            Paquete
                          </span>
                          <span
                            className={`block text-sm mt-0.5 ${
                              cant.paquetes > 0 && !esMayorista
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
                                <span className="block text-[11px] text-amber-700 font-medium uppercase">
                                  Bonificación
                                </span>
                                <span className="block text-sm font-extrabold text-amber-700 mt-0.5">
                                  {bonifCompra} + {bonifRegalo} Gratis
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="block text-[11px] text-amber-700 font-medium uppercase">
                                  Mayor (+{minMayor} paq)
                                </span>
                                <span
                                  className={`block text-base font-extrabold mt-0.5 ${
                                    esMayorista
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

                      {/* Pie de Stock Minimalista (1 sola línea inferior con status dots) */}
                      <div className="mt-3.5 pt-2.5 border-t border-stone-200/70 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
                        <span
                          title={`Stock en Tienda Central: ${stockDisp} botellas`}
                          className="inline-flex items-center gap-1.5 font-medium text-stone-800"
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              stockDisp < unidPaq * 2
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                          />
                          <span>
                            Central: {stockFmt.paquetes} Paq + {stockFmt.sueltas}{' '}
                            Bot.
                          </span>
                        </span>

                        <span
                          title={`Stock en Depósito Principal: ${stockAlm} botellas`}
                          className="inline-flex items-center gap-1.5 text-xs text-stone-500"
                        >
                          <span className="w-2 h-2 rounded-full bg-stone-400" />
                          <span>
                            Depósito: {stockAlmFmt.paquetes} Paq +{' '}
                            {stockAlmFmt.sueltas} Bot.
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Aviso de bonificación o escala mayorista */}
                  {esBonificacion ? (
                    paquetesGratisProd > 0 ? (
                      <div className="mt-2 text-[11px] font-extrabold text-amber-800 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>
                          +{paquetesGratisProd} Paq. Gratis por bonificación (Bs
                          0)
                        </span>
                      </div>
                    ) : cant.paquetes > 0 ? (
                      <div className="mt-2 text-[11px] font-semibold text-amber-800">
                        Falta {faltanParaBonif} paq. para recibir +
                        {bonifRegalo} paq. gratis
                      </div>
                    ) : null
                  ) : (
                    esMayorista && (
                      <div className="mt-2 text-[11px] font-extrabold text-emerald-700 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>¡Precio Mayorista Aplicado!</span>
                      </div>
                    )
                  )}

                  {/* Control único amplio según modo activo (Por Paquete por defecto o Por Botella) */}
                  <div className="mt-2.5 pt-2.5 border-t border-stone-200/70 dark:border-white/[0.08]">
                    {modoUnidadPos === 'paquetes' ? (
                      <div className="flex items-center justify-between gap-3 bg-white dark:bg-[#11141B] border border-stone-200/70 dark:border-white/[0.08] rounded-xl px-3.5 py-2">
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xs sm:text-sm font-bold text-stone-800 dark:text-slate-100">
                              Paquetes
                            </span>
                            <span className="text-[11px] text-stone-400 dark:text-slate-400">
                              (x{unidPaq} bot.)
                            </span>
                          </div>
                          {cant.sueltas > 0 && (
                            <button
                              type="button"
                              onClick={() => setModoUnidadPos('sueltas')}
                              className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline mt-0.5 block cursor-pointer"
                            >
                              +{cant.sueltas} bot. suelta
                              {cant.sueltas === 1 ? '' : 's'} en venta
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              actualizarCantidadPos(
                                prod.id,
                                'paquetes',
                                cant.paquetes - 1
                              )
                            }
                            className="w-8.5 h-8.5 rounded-xl bg-stone-100 dark:bg-white/[0.08] hover:bg-stone-200 dark:hover:bg-white/[0.15] flex items-center justify-center text-stone-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={cant.paquetes || ''}
                            placeholder="0"
                            onChange={(e) =>
                              actualizarCantidadPos(
                                prod.id,
                                'paquetes',
                                e.target.value
                              )
                            }
                            className="w-11 h-8.5 text-center bg-transparent text-sm font-extrabold text-stone-900 dark:text-white tabular-nums focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              actualizarCantidadPos(
                                prod.id,
                                'paquetes',
                                cant.paquetes + 1
                              )
                            }
                            className="w-8.5 h-8.5 rounded-xl bg-stone-900 dark:bg-amber-500 hover:bg-stone-800 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center cursor-pointer"
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
                          {cant.paquetes > 0 && (
                            <button
                              type="button"
                              onClick={() => setModoUnidadPos('paquetes')}
                              className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline mt-0.5 block cursor-pointer"
                            >
                              +{cant.paquetes} paq. en venta
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              actualizarCantidadPos(
                                prod.id,
                                'sueltas',
                                cant.sueltas - 1
                              )
                            }
                            className="w-8.5 h-8.5 rounded-xl bg-stone-100 dark:bg-white/[0.08] hover:bg-stone-200 dark:hover:bg-white/[0.15] flex items-center justify-center text-stone-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={cant.sueltas || ''}
                            placeholder="0"
                            onChange={(e) =>
                              actualizarCantidadPos(
                                prod.id,
                                'sueltas',
                                e.target.value
                              )
                            }
                            className="w-11 h-8.5 text-center bg-transparent text-sm font-extrabold text-stone-900 dark:text-white tabular-nums focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              actualizarCantidadPos(
                                prod.id,
                                'sueltas',
                                cant.sueltas + 1
                              )
                            }
                            className="w-8.5 h-8.5 rounded-xl bg-stone-900 dark:bg-amber-500 hover:bg-stone-800 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 flex items-center justify-center cursor-pointer"
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
        </div>

        {/* COLUMNA DERECHA (5 cols): Caja de Cobro y Método de Pago Integrado */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold">
                  Ticket de Caja y Liquidación ({resumenPos.detalles.length})
                </span>
              </div>
              {resumenPos.detalles.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCarritoPos({})
                    setPaquetesSurtidosPos({})
                  }}
                  className="text-xs text-slate-300 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpiar</span>
                </button>
              )}
            </div>

            <div className="p-5 space-y-4">
              {errorPos && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorPos}</span>
                </div>
              )}

              {resumenPos.detalles.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                  <Store className="w-8 h-8 mx-auto opacity-50" />
                  <p>
                    Selecciona los paquetes o botellas sueltas a la izquierda para
                    cobrar en Tienda Central.
                  </p>
                </div>
              ) : (
                <>
                  {/* Líneas del carrito */}
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {resumenPos.detalles.map((item) => {
                      const esBonificacion =
                        item.tipo_venta === 'bono_promocion'
                      const esSurtido = item.tipo_venta === 'paquete_surtido'

                      if (esBonificacion) {
                        return (
                          <div
                            key={item.id_linea}
                            className="py-1.5 pl-3 pr-2 flex items-center justify-between gap-2 text-xs bg-amber-50/60 rounded-lg my-0.5"
                          >
                            <span className="font-semibold text-amber-800">
                              + {item.cantidad} Paq. Gratis por bonificación (
                              {item.producto_nombre})
                            </span>
                            <span className="font-extrabold text-amber-800 shrink-0">
                              Bs 0
                            </span>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={item.id_linea}
                          className="py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                              <span className="truncate">
                                {item.producto_nombre}
                              </span>
                              {esSurtido && item.grupo_surtido && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setGrupoSurtidoModalPos(item.grupo_surtido)
                                  }
                                  className="text-[10px] font-semibold text-amber-700 hover:underline shrink-0 cursor-pointer"
                                >
                                  (Editar surtido)
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {item.cantidad}{' '}
                              {item.tipo_venta === 'paquete'
                                ? `Paq. x${item.unidades_por_paquete}`
                                : esSurtido
                                ? `bot. (${item.nota_surtido})`
                                : 'Bot. Suelta'}{' '}
                              · {formatearBs(item.precio_aplicado)} (
                              {item.escala_aplicada})
                            </div>
                            {item.aviso_bonificacion && (
                              <div className="text-[10px] font-semibold text-amber-700 mt-0.5">
                                {item.aviso_bonificacion}
                              </div>
                            )}
                          </div>
                          <span className="font-extrabold text-slate-900 shrink-0">
                            {formatearBs(item.subtotal)}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {resumenPos.ahorroMayoristaBs > 0 && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex justify-between">
                      <span>Ahorro Escala Mayorista:</span>
                      <span>-{formatearBs(resumenPos.ahorroMayoristaBs)}</span>
                    </div>
                  )}

                  {/* Selector de Método de Pago en la misma ventana */}
                  <div className="pt-2 border-t border-slate-100 space-y-2.5">
                    <span className="text-xs font-bold text-slate-700 block">
                      Método de Pago:
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMetodoPago('efectivo')}
                        className={`py-2 px-1 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer ${
                          metodoPago === 'efectivo'
                            ? 'bg-slate-900 text-amber-400 border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <Banknote className="w-4 h-4" />
                        <span>Efectivo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMetodoPago('qr')}
                        className={`py-2 px-1 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer ${
                          metodoPago === 'qr'
                            ? 'bg-slate-900 text-amber-400 border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <QrCode className="w-4 h-4" />
                        <span>QR</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMetodoPago('mixto')}
                        className={`py-2 px-1 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer ${
                          metodoPago === 'mixto'
                            ? 'bg-slate-900 text-amber-400 border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <Split className="w-4 h-4" />
                        <span>Mixto</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMetodoPago('credito')}
                        className={`py-2 px-1 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer ${
                          metodoPago === 'credito'
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <CreditCard className="w-4 h-4" />
                        <span>Crédito</span>
                      </button>
                    </div>

                    {/* Montos desglosados */}
                    <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          Efectivo (Bs)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={inputEfectivo}
                          onChange={(e) => setInputEfectivo(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-extrabold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          QR (Bs)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={inputQr}
                          onChange={(e) => setInputQr(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-extrabold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-amber-800 mb-1">
                          Crédito
                        </label>
                        <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-300 text-xs font-extrabold text-amber-950">
                          {formatearBs(saldoCreditoCalculado)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Total y Botón Principal "Cobrar y Entregar en Tienda" */}
                  <div className="p-4 rounded-xl bg-slate-900 text-white flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Total a Cobrar
                    </span>
                    <span className="text-xl font-extrabold text-amber-400">
                      {formatearBs(resumenPos.totalBs)}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={procesandoVenta}
                    onClick={cobrarYEntregarEnTienda}
                    className="w-full py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                    <span>
                      {procesandoVenta
                        ? 'Cobrando y descontando stock...'
                        : 'Cobrar y Entregar en Tienda'}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Mini Historial de Ventas Directas Recientes en Tienda Central */}
          {ventasHoy.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Últimas Ventas en Tienda Central ({ventasHoy.length})
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                {ventasHoy.slice(0, 8).map((v) => (
                  <div
                    key={v.id}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {v.clientes?.nombre || 'Cliente Mostrador'} ·{' '}
                        <span className="font-mono text-[11px] text-slate-500">
                          {v.codigo_local}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Efec: {formatearBs(v.monto_efectivo)} · QR:{' '}
                        {formatearBs(v.monto_qr)}
                        {Number(v.saldo_credito) > 0
                          ? ` · Créd: ${formatearBs(v.saldo_credito)}`
                          : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-extrabold text-slate-900">
                        {formatearBs(v.total)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          generarYCompartirPDF(
                            v,
                            v.clientes || {
                              nombre: 'Cliente Mostrador / Venta Rápida',
                            },
                            v.venta_detalles,
                            v.perfiles?.nombre || 'Caja Central',
                            false
                          )
                        }
                        title="Descargar recibo PDF"
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-900 text-slate-700 hover:text-amber-400 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= MODAL DE VENTA COMPLETADA EN TIENDA CENTRAL ================= */}
      {ventaCompletada && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-5 bg-slate-900 text-white text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
              </div>
              <h3 className="text-base font-extrabold">
                ¡Venta Entregada y Stock Descontado!
              </h3>
              <p className="text-xs text-slate-300">
                Folio:{' '}
                <strong className="text-amber-400">
                  {ventaCompletada.venta.codigo_local}
                </strong>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-bold text-slate-900">
                    {ventaCompletada.cliente.nombre}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Efectivo / QR:</span>
                  <span className="font-bold text-slate-900">
                    {formatearBs(ventaCompletada.venta.monto_efectivo)} /{' '}
                    {formatearBs(ventaCompletada.venta.monto_qr)}
                  </span>
                </div>
                {Number(ventaCompletada.venta.saldo_credito) > 0 && (
                  <div className="flex justify-between text-amber-800 font-bold">
                    <span>Saldo a Crédito:</span>
                    <span>{formatearBs(ventaCompletada.venta.saldo_credito)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-slate-200 text-sm">
                  <span className="font-bold text-slate-800">Total Cobrado:</span>
                  <span className="font-extrabold text-slate-900">
                    {formatearBs(ventaCompletada.venta.total)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() =>
                    generarYCompartirPDF(
                      ventaCompletada.venta,
                      ventaCompletada.cliente,
                      ventaCompletada.detalles,
                      ventaCompletada.cajeroNombre,
                      true
                    )
                  }
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <Share2 className="w-4 h-4" />
                  <span>Imprimir / Descargar Comprobante PDF</span>
                </button>

                <a
                  href={generarUrlWhatsAppPedido(
                    ventaCompletada.venta,
                    ventaCompletada.cliente,
                    ventaCompletada.detalles,
                    ventaCompletada.cajeroNombre
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 no-underline"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Enviar Comprobante por WhatsApp</span>
                </a>
              </div>

              <button
                type="button"
                onClick={() => setVentaCompletada(null)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
              >
                Nueva Venta en Caja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL ARMAR PAQUETE SURTIDO POR SABORES EN CAJA CENTRAL ================= */}
      <ModalSurtidoSabores
        abierto={Boolean(grupoSurtidoModalPos)}
        onClose={() => setGrupoSurtidoModalPos(null)}
        grupoSurtido={grupoSurtidoModalPos}
        productos={productos}
        stockCentralMap={stockCentralMap}
        paquetesCerradosEnCarrito={
          grupoSurtidoModalPos
            ? productos
                .filter((p) => obtenerGrupoSurtido(p) === grupoSurtidoModalPos)
                .reduce(
                  (acc, p) =>
                    acc + (Number(carritoPos[p.id]?.paquetes) || 0),
                  0
                )
            : 0
        }
        surtidoExistente={
          grupoSurtidoModalPos ? paquetesSurtidosPos[grupoSurtidoModalPos] : null
        }
        onGuardarSurtido={guardarSurtidoPos}
        onEliminarSurtido={eliminarSurtidoPos}
      />
    </div>
  )
}
