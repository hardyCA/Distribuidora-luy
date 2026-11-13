import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  CreditCard,
  Search,
  UserCheck,
  MessageCircle,
  Banknote,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  History,
  Download,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  Phone,
  Calendar,
  Sparkles,
} from 'lucide-react'
import { supabase, obtenerOCrearPerfilPorRol } from '../lib/supabase'
import { useRole } from '../context/RoleContext'
import {
  generarReciboAbonoPDF,
  generarUrlWhatsAppCredito,
} from '../utils/pdfGenerator'
import PaginationBar from '../components/PaginationBar'

const TAMANO_PAGINA_CREDITOS = 16

export default function CreditosPage() {
  const { rolActual, infoRol, usuarioActual } = useRole()

  const [ventasCredito, setVentasCredito] = useState([])
  const [abonosPorVenta, setAbonosPorVenta] = useState({})
  const [perfiles, setPerfiles] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorGeneral, setErrorGeneral] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')

  // Filtros + Paginación eficiente para Plan Gratuito Supabase
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [preventistaFiltro, setPreventistaFiltro] = useState('TODOS')
  const [estadoDeudaFiltro, setEstadoDeudaFiltro] = useState('CON_DEUDA') // 'CON_DEUDA' | 'PAGADAS'
  const [paginaActual, setPaginaActual] = useState(1)
  const [totalPagadasServidor, setTotalPagadasServidor] = useState(0)

  // Control de historial desplegable en cada tarjeta: { [venta_id]: boolean }
  const [historialExpandido, setHistorialExpandido] = useState({})

  // Modal "💸 Registrar Abono / Cobro de Deuda"
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null)
  const [abonoEfectivo, setAbonoEfectivo] = useState('')
  const [abonoQr, setAbonoQr] = useState('')
  const [guardandoAbono, setGuardandoAbono] = useState(false)
  const [errorModal, setErrorModal] = useState('')
  const [reciboListo, setReciboListo] = useState(null)

  const cargarCreditosYAbonos = useCallback(async () => {
    setCargando(true)
    setErrorGeneral('')
    try {
      let queryVentas = supabase
        .from('ventas')
        .select(
          `
          id,
          codigo_local,
          cliente_id,
          vendedor_id,
          total,
          monto_efectivo,
          monto_qr,
          saldo_credito,
          fecha_pedido,
          clientes (id, nombre, telefono, direccion),
          perfiles:vendedor_id (id, nombre, rol),
          venta_detalles (
            id,
            producto_id,
            tipo_venta,
            cantidad,
            precio_aplicado,
            subtotal,
            productos (id, nombre, marca, unidades_por_paquete)
          )
        `,
          { count: 'exact' }
        )
        .eq('estado', 'entregado')
        .order('fecha_pedido', { ascending: false })

      if (preventistaFiltro !== 'TODOS') {
        queryVentas = queryVentas.eq('vendedor_id', preventistaFiltro)
      }

      if (estadoDeudaFiltro === 'CON_DEUDA') {
        // Descarga ÚNICAMENTE las notas que realmente tienen deuda activa (> 0)
        queryVentas = queryVentas.gt('saldo_credito', 0)
      } else {
        // Para deudas ya canceladas, paginar en servidor para ahorrar Egress
        const desde = (paginaActual - 1) * TAMANO_PAGINA_CREDITOS
        const hasta = desde + TAMANO_PAGINA_CREDITOS - 1
        queryVentas = queryVentas.eq('saldo_credito', 0)
        if (!busquedaCliente.trim()) {
          queryVentas = queryVentas.range(desde, hasta)
        } else {
          queryVentas = queryVentas.limit(80)
        }
      }

      const [resVentas, resPerfiles] = await Promise.all([
        queryVentas,
        supabase.from('perfiles').select('id, nombre, rol, activo').order('nombre', { ascending: true }),
      ])

      if (resVentas.error) throw resVentas.error

      const listaVentas = resVentas.data || []
      if (estadoDeudaFiltro === 'PAGADAS') {
        setTotalPagadasServidor(
          typeof resVentas.count === 'number' ? resVentas.count : listaVentas.length
        )
      }

      // Consultar abonos SOLO de las notas cargadas en pantalla (evita descargar miles de filas históricas)
      const idsVentas = listaVentas.map((v) => v.id).filter(Boolean)
      const mapaAb = {}
      if (idsVentas.length > 0) {
        const { data: dataAbonos, error: errAbonos } = await supabase
          .from('abonos_credito')
          .select('*, perfiles:cobrador_id (id, nombre, rol)')
          .in('venta_id', idsVentas)
          .order('fecha', { ascending: false })

        if (errAbonos) throw errAbonos
        ;(dataAbonos || []).forEach((ab) => {
          if (!mapaAb[ab.venta_id]) {
            mapaAb[ab.venta_id] = []
          }
          mapaAb[ab.venta_id].push(ab)
        })
      }

      setAbonosPorVenta(mapaAb)
      setVentasCredito(listaVentas)
      setPerfiles(resPerfiles.data || [])
    } catch (err) {
      console.error('Error cargando créditos:', err)
      setErrorGeneral(
        err.message || 'No se pudo cargar la cartera de créditos.'
      )
    } finally {
      setCargando(false)
    }
  }, [estadoDeudaFiltro, preventistaFiltro, paginaActual, busquedaCliente])

  useEffect(() => {
    cargarCreditosYAbonos()
  }, [cargarCreditosYAbonos])

  // Filtrar ventas con saldo_credito > 0 (o ya canceladas que tuvieron abonos)
  const ventasFiltradas = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase()
    return ventasCredito.filter((v) => {
      const saldo = Number(v.saldo_credito) || 0
      const tieneAbonos = (abonosPorVenta[v.id] || []).length > 0

      if (estadoDeudaFiltro === 'CON_DEUDA' && saldo <= 0) return false
      if (estadoDeudaFiltro === 'PAGADAS' && (saldo > 0 || !tieneAbonos)) {
        return false
      }

      if (preventistaFiltro !== 'TODOS' && v.vendedor_id !== preventistaFiltro) {
        return false
      }

      if (!q) return true
      const coincideNombre = v.clientes?.nombre?.toLowerCase().includes(q)
      const coincideFolio = v.codigo_local?.toLowerCase().includes(q)
      return coincideNombre || coincideFolio
    })
  }, [
    ventasCredito,
    abonosPorVenta,
    estadoDeudaFiltro,
    preventistaFiltro,
    busquedaCliente,
  ])

  const resumenCartera = useMemo(() => {
    let totalPorCobrar = 0
    let notasConDeuda = 0
    ventasCredito.forEach((v) => {
      const s = Number(v.saldo_credito) || 0
      if (s > 0) {
        if (
          preventistaFiltro === 'TODOS' ||
          v.vendedor_id === preventistaFiltro
        ) {
          totalPorCobrar += s
          notasConDeuda++
        }
      }
    })
    return { totalPorCobrar, notasConDeuda }
  }, [ventasCredito, preventistaFiltro])

  const abrirModalAbono = (venta) => {
    setVentaSeleccionada(venta)
    setAbonoEfectivo(String(Number(venta.saldo_credito) || 0))
    setAbonoQr('0')
    setErrorModal('')
  }

  const saldoActualModal = Number(ventaSeleccionada?.saldo_credito) || 0
  const efecInputNum = Math.max(0, parseFloat(abonoEfectivo) || 0)
  const qrInputNum = Math.max(0, parseFloat(abonoQr) || 0)
  const sumaAbonoHoy = Number((efecInputNum + qrInputNum).toFixed(2))
  const superaSaldoPendiente = sumaAbonoHoy > saldoActualModal + 0.01
  const nuevoSaldoRestante = Math.max(
    0,
    Number((saldoActualModal - sumaAbonoHoy).toFixed(2))
  )

  const registrarAbonoEnSupabase = async (e) => {
    e.preventDefault()
    if (!ventaSeleccionada) return

    if (sumaAbonoHoy <= 0) {
      setErrorModal('Ingresa un monto mayor a Bs 0 en Efectivo o QR.')
      return
    }

    if (superaSaldoPendiente) {
      setErrorModal(
        `La suma del abono (Bs ${sumaAbonoHoy.toFixed(
          2
        )}) no puede superar el saldo pendiente actual (Bs ${saldoActualModal.toFixed(
          2
        )}).`
      )
      return
    }

    setGuardandoAbono(true)
    setErrorModal('')

    try {
      let validCobradorId = usuarioActual?.id
      if (!validCobradorId || String(validCobradorId).startsWith('local-')) {
        const { perfil } = await obtenerOCrearPerfilPorRol(
          rolActual,
          infoRol.defaultName
        )
        validCobradorId = perfil?.id || null
      }

      // 1) Insertar registro en `abonos_credito`
      const { data: nuevoAbono, error: abErr } = await supabase
        .from('abonos_credito')
        .insert([
          {
            venta_id: ventaSeleccionada.id,
            cobrador_id: validCobradorId,
            monto_efectivo: efecInputNum,
            monto_qr: qrInputNum,
          },
        ])
        .select('*, perfiles:cobrador_id(id, nombre, rol)')
        .single()

      if (abErr) throw abErr

      // 2) Actualizar fila correspondiente en `ventas` sumando a monto_efectivo y monto_qr, y restando de saldo_credito
      const nuevoEfectivoVenta = Number(
        ((Number(ventaSeleccionada.monto_efectivo) || 0) + efecInputNum).toFixed(
          2
        )
      )
      const nuevoQrVenta = Number(
        ((Number(ventaSeleccionada.monto_qr) || 0) + qrInputNum).toFixed(2)
      )

      const { data: ventaAct, error: vErr } = await supabase
        .from('ventas')
        .update({
          monto_efectivo: nuevoEfectivoVenta,
          monto_qr: nuevoQrVenta,
          saldo_credito: nuevoSaldoRestante,
        })
        .eq('id', ventaSeleccionada.id)
        .select()
        .single()

      if (vErr) throw vErr

      const historialActualizado = [
        nuevoAbono,
        ...(abonosPorVenta[ventaSeleccionada.id] || []),
      ]

      setReciboListo({
        venta: { ...ventaSeleccionada, ...ventaAct },
        cliente: ventaSeleccionada.clientes || { nombre: 'Cliente' },
        abonoActual: nuevoAbono,
        historialAbonos: historialActualizado,
        cobradorNombre: usuarioActual?.nombre || infoRol.defaultName,
      })

      setMensajeExito(
        `💸 Abono de Bs ${sumaAbonoHoy.toFixed(2)} registrado para ${
          ventaSeleccionada.clientes?.nombre || 'el cliente'
        }. Nuevo saldo pendiente: Bs ${nuevoSaldoRestante.toFixed(2)}.`
      )
      setVentaSeleccionada(null)
      await cargarCreditosYAbonos()
      setTimeout(() => setMensajeExito(''), 5500)
    } catch (err) {
      console.error('Error registrando abono:', err)
      setErrorModal(err.message || 'No se pudo registrar el abono.')
    } finally {
      setGuardandoAbono(false)
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
    <div className="space-y-6 pb-12">
      {/* ================= CABECERA MINIMALISTA ESTILO LINEAR (2 FILAS LIMPIAS) ================= */}
      <div className="space-y-3">
        {/* Fila 1: Título + Contador y Total por Cobrar | Botón Actualizar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Créditos y Cobranzas
            </h1>
            <span className="text-sm font-normal text-slate-400">
              {resumenCartera.notasConDeuda} cuentas ·{' '}
              <strong className="text-red-600 dark:text-red-400 font-semibold">
                {formatearBs(resumenCartera.totalPorCobrar)}
              </strong>{' '}
              por cobrar
            </span>
          </div>

          <button
            type="button"
            onClick={cargarCreditosYAbonos}
            className="self-start sm:self-auto h-9 px-3.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Fila 2: Buscador + Filtro por Preventista + Estado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Buscador por Nombre del Cliente */}
          <div className="relative">
            <Search size={16} className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar cliente o folio..."
              className="w-full h-9 pl-9 pr-8 rounded-lg bg-white dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none"
            />
            {busquedaCliente && (
              <button
                type="button"
                onClick={() => setBusquedaCliente('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Selector de Preventista */}
          <div className="flex items-center h-9 bg-white dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 rounded-lg px-3">
            <UserCheck size={15} className="text-amber-500 mr-2 shrink-0" />
            <select
              value={preventistaFiltro}
              onChange={(e) => setPreventistaFiltro(e.target.value)}
              className="w-full bg-transparent border-0 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="TODOS">Todos los preventistas</option>
              {perfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.rol})
                </option>
              ))}
            </select>
          </div>

          {/* Pestañas: Con Saldo Pendiente vs Canceladas con Historial */}
          <div className="flex items-center bg-white dark:bg-white/5 p-0.5 rounded-lg border border-slate-200 dark:border-white/10 h-9">
            <button
              type="button"
              onClick={() => {
                setEstadoDeudaFiltro('CON_DEUDA')
                setPaginaActual(1)
              }}
              className={`flex-1 h-full rounded-md text-xs font-medium transition cursor-pointer ${
                estadoDeudaFiltro === 'CON_DEUDA'
                  ? 'bg-red-600 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Con Deuda
            </button>
            <button
              type="button"
              onClick={() => {
                setEstadoDeudaFiltro('PAGADAS')
                setPaginaActual(1)
              }}
              className={`flex-1 h-full rounded-md text-xs font-medium transition cursor-pointer ${
                estadoDeudaFiltro === 'PAGADAS'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Canceladas
            </button>
          </div>
        </div>
      </div>

      {/* Notificaciones */}
      {mensajeExito && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{mensajeExito}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito('')}
            className="text-emerald-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorGeneral && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorGeneral}</span>
        </div>
      )}

      {/* ================= TARJETAS DE DEUDA POR CLIENTE ================= */}
      {cargando ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="bg-white rounded-2xl border border-slate-200 p-5 h-60 animate-pulse"
            />
          ))}
        </div>
      ) : ventasFiltradas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <div className="text-base font-bold text-slate-800">
            {estadoDeudaFiltro === 'CON_DEUDA'
              ? '¡Excelente! No hay clientes con saldo de crédito pendiente en este filtro'
              : 'No se encontraron deudas canceladas con este criterio'}
          </div>
          <p className="text-xs text-slate-500">
            Cuando se entregue un pedido con saldo a crédito en Despacho o Caja
            Central, aparecerá automáticamente aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(estadoDeudaFiltro === 'CON_DEUDA' || busquedaCliente.trim()
              ? ventasFiltradas.slice(
                  (paginaActual - 1) * TAMANO_PAGINA_CREDITOS,
                  paginaActual * TAMANO_PAGINA_CREDITOS
                )
              : ventasFiltradas
            ).map((venta) => {
            const clienteObj = venta.clientes || { nombre: 'Cliente' }
            const totalOriginal = Number(venta.total) || 0
            const pagadoEfectivo = Number(venta.monto_efectivo) || 0
            const pagadoQr = Number(venta.monto_qr) || 0
            const yaPagadoTotal = pagadoEfectivo + pagadoQr
            const saldoPendiente = Number(venta.saldo_credito) || 0
            const abonosDeEstaVenta = abonosPorVenta[venta.id] || []
            const estaExpandido = Boolean(historialExpandido[venta.id])

            const urlRecordatorioWa = generarUrlWhatsAppCredito({
              venta,
              cliente: clienteObj,
              abonoReciente: null,
              cobradorNombre: usuarioActual?.nombre || 'Distribuidora',
            })

            const fechaPedidoTxt = venta.fecha_pedido
              ? new Date(venta.fecha_pedido).toLocaleDateString('es-BO', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : '-'

            return (
              <div
                key={venta.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition flex flex-col justify-between overflow-hidden"
              >
                <div className="p-5 space-y-4">
                  {/* Cabecera: Folio + Fecha + Preventista */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-slate-900 text-amber-400">
                        {venta.codigo_local}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {fechaPedidoTxt}
                      </span>
                    </div>

                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      Vendedor: {venta.perfiles?.nombre || 'Tienda Central'}
                    </span>
                  </div>

                  {/* Nombre del Cliente y Teléfono con botón de recordatorio WhatsApp */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900">
                        {clienteObj.nombre}
                      </h2>
                      <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>📍 {clienteObj.direccion || 'Sin referencia'}</span>
                        {clienteObj.telefono && (
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {clienteObj.telefono}
                          </span>
                        )}
                      </p>
                    </div>

                    {saldoPendiente > 0 && (
                      <a
                        href={urlRecordatorioWa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition no-underline shrink-0"
                        title="Enviar recordatorio de deuda por WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Recordatorio WhatsApp</span>
                      </a>
                    )}
                  </div>

                  {/* Bloque Financiero de la Nota: Total Original, Ya Pagó y SALDO PENDIENTE EN ROJO */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Total Original
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-slate-900 mt-0.5 block">
                        {formatearBs(totalOriginal)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                        Ya Pagó
                      </span>
                      <span className="text-sm sm:text-base font-extrabold text-emerald-800 mt-0.5 block">
                        {formatearBs(yaPagadoTotal)}
                      </span>
                      <span className="text-[10px] text-emerald-700/80 block">
                        Ef: {pagadoEfectivo} · QR: {pagadoQr}
                      </span>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        saldoPendiente > 0
                          ? 'bg-red-50 border-red-300 text-red-900'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider block ${
                          saldoPendiente > 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        Saldo Pendiente
                      </span>
                      <span
                        className={`text-sm sm:text-base font-extrabold mt-0.5 block ${
                          saldoPendiente > 0 ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatearBs(saldoPendiente)}
                      </span>
                    </div>
                  </div>

                  {/* Historial desplegable de pagos/abonos anteriores en esta nota */}
                  <div className="border border-slate-200/80 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setHistorialExpandido((prev) => ({
                          ...prev,
                          [venta.id]: !prev[venta.id],
                        }))
                      }
                      className="w-full px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-xs font-bold text-slate-700 transition cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-amber-600" />
                        Historial de Abonos en esta Nota ({abonosDeEstaVenta.length})
                      </span>
                      {estaExpandido ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {estaExpandido && (
                      <div className="p-3 bg-white divide-y divide-slate-100 text-xs">
                        {abonosDeEstaVenta.length === 0 ? (
                          <div className="text-slate-400 py-1.5 text-center">
                            Aún no se registraron abonos posteriores a la entrega.
                          </div>
                        ) : (
                          abonosDeEstaVenta.map((ab) => {
                            const f = ab.fecha ? new Date(ab.fecha) : new Date()
                            const sumaAb =
                              (Number(ab.monto_efectivo) || 0) +
                              (Number(ab.monto_qr) || 0)
                            return (
                              <div
                                key={ab.id}
                                className="py-2 flex items-center justify-between gap-2"
                              >
                                <div>
                                  <div className="font-bold text-slate-800">
                                    {f.toLocaleDateString('es-BO')} ·{' '}
                                    {f.toLocaleTimeString('es-BO', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Cobrador: {ab.perfiles?.nombre || 'Operador'} · Efec:{' '}
                                    {formatearBs(ab.monto_efectivo)} / QR:{' '}
                                    {formatearBs(ab.monto_qr)}
                                  </div>
                                </div>
                                <span className="font-extrabold text-emerald-700">
                                  +{formatearBs(sumaAb)}
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pie de Tarjeta: Recibo PDF + Botón "💸 Registrar Abono / Cobro de Deuda" */}
                <div className="px-5 py-3.5 bg-slate-50/90 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      generarReciboAbonoPDF({
                        venta,
                        cliente: clienteObj,
                        abonoActual: abonosDeEstaVenta[0] || null,
                        historialAbonos: abonosDeEstaVenta,
                        cobradorNombre:
                          usuarioActual?.nombre || infoRol.defaultName,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/90 text-xs font-bold transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Recibo de Pago PDF</span>
                  </button>

                  {saldoPendiente > 0 && (
                    <button
                      type="button"
                      onClick={() => abrirModalAbono(venta)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-extrabold shadow-xs transition cursor-pointer"
                    >
                      <Banknote className="w-4 h-4" />
                      <span>💸 Registrar Abono / Cobro de Deuda</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          </div>

          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07]">
            <PaginationBar
              paginaActual={paginaActual}
              totalRegistros={
                estadoDeudaFiltro === 'PAGADAS' && !busquedaCliente.trim()
                  ? totalPagadasServidor
                  : ventasFiltradas.length
              }
              tamanoPagina={TAMANO_PAGINA_CREDITOS}
              onCambiarPagina={setPaginaActual}
              cargando={cargando}
              etiquetaItem="cuentas"
            />
          </div>
        </div>
      )}

      {/* ================= MODAL "💸 REGISTRAR ABONO / COBRO DE DEUDA" ================= */}
      {ventaSeleccionada && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Banknote className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold">
                    💸 Registrar Abono / Cobro de Deuda
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Cliente: {ventaSeleccionada.clientes?.nombre} · Nota:{' '}
                    {ventaSeleccionada.codigo_local}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVentaSeleccionada(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={registrarAbonoEnSupabase} className="p-6 space-y-4">
              {errorModal && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorModal}</span>
                </div>
              )}

              {/* Resumen de la deuda actual */}
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 block">
                    Saldo Pendiente Actual
                  </span>
                  <span className="text-xs text-red-800">
                    Total Nota: {formatearBs(ventaSeleccionada.total)}
                  </span>
                </div>
                <span className="text-lg font-extrabold text-red-700">
                  {formatearBs(saldoActualModal)}
                </span>
              </div>

              {/* Botones rápidos de llenado */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAbonoEfectivo(String(saldoActualModal))
                    setAbonoQr('0')
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  Todo en Efectivo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAbonoEfectivo('0')
                    setAbonoQr(String(saldoActualModal))
                  }}
                  className="flex-1 py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
                >
                  Todo por QR
                </button>
              </div>

              {/* Campos de Efectivo y QR */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pago hoy en Efectivo (Bs)
                  </label>
                  <div className="relative">
                    <Banknote className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={abonoEfectivo}
                      onChange={(e) => {
                        setAbonoEfectivo(e.target.value)
                        setErrorModal('')
                      }}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-extrabold text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Pago hoy por QR (Bs)
                  </label>
                  <div className="relative">
                    <QrCode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={abonoQr}
                      onChange={(e) => {
                        setAbonoQr(e.target.value)
                        setErrorModal('')
                      }}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-extrabold text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Vista previa del nuevo saldo */}
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                  superaSaldoPendiente
                    ? 'bg-red-50 border-red-300 text-red-800'
                    : 'bg-slate-900 text-white border-slate-800'
                }`}
              >
                <div className="flex justify-between">
                  <span className="opacity-80">Total Abono Hoy:</span>
                  <span className="font-extrabold text-amber-400">
                    {formatearBs(sumaAbonoHoy)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-white/10">
                  <span className="opacity-80">Nuevo Saldo Pendiente:</span>
                  <span className="font-extrabold text-emerald-400">
                    {formatearBs(nuevoSaldoRestante)}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setVentaSeleccionada(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    guardandoAbono || sumaAbonoHoy <= 0 || superaSaldoPendiente
                  }
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-extrabold cursor-pointer disabled:opacity-40"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {guardandoAbono ? 'Guardando Abono...' : 'Confirmar Abono'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL DE RECIBO DE ABONO LISTO PARA PDF Y WHATSAPP ================= */}
      {reciboListo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-5 bg-slate-900 text-white text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-7 h-7 stroke-[2.5]" />
              </div>
              <h3 className="text-base font-extrabold">
                ¡Abono Registrado Correctamente!
              </h3>
              <p className="text-xs text-slate-300">
                Cliente: <strong>{reciboListo.cliente?.nombre}</strong>
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Abonado Hoy:</span>
                  <span className="font-extrabold text-emerald-700">
                    {formatearBs(
                      (Number(reciboListo.abonoActual?.monto_efectivo) || 0) +
                        (Number(reciboListo.abonoActual?.monto_qr) || 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-600 font-bold">
                    Nuevo Saldo Pendiente:
                  </span>
                  <span className="font-extrabold text-red-600">
                    {formatearBs(reciboListo.venta?.saldo_credito)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => generarReciboAbonoPDF(reciboListo)}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar Recibo de Pago en PDF</span>
                </button>

                <a
                  href={generarUrlWhatsAppCredito({
                    venta: reciboListo.venta,
                    cliente: reciboListo.cliente,
                    abonoReciente: reciboListo.abonoActual,
                    cobradorNombre: reciboListo.cobradorNombre,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 no-underline"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Enviar Recibo por WhatsApp al Cliente</span>
                </a>
              </div>

              <button
                type="button"
                onClick={() => setReciboListo(null)}
                className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
