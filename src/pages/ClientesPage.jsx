import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import {
  MapPin,
  Search,
  Plus,
  Phone,
  MessageCircle,
  Navigation,
  ShoppingBag,
  List,
  Map as MapIcon,
  CheckCircle2,
  AlertCircle,
  Crosshair,
  X,
  RefreshCw,
  Pencil,
  ExternalLink,
  Users,
} from 'lucide-react'
import { supabase, obtenerOCrearPerfilPorRol } from '../lib/supabase'
import { useRole } from '../context/RoleContext'
import PaginationBar from '../components/PaginationBar'

const TAMANO_PAGINA_CLIENTES = 18

// Corrección oficial del ícono por defecto de Leaflet en Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

// Coordenadas iniciales por defecto (Santa Cruz de la Sierra, Bolivia)
const DEFAULT_CENTER = [-17.7833, -63.1821]

/**
 * Componente auxiliar para recentrar el mapa dinámicamente y corregir el tamaño de los tiles
 */
function ControladorVistaMapa({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize()
      if (center && Array.isArray(center) && center.length === 2) {
        map.setView(center, zoom || map.getZoom(), { animate: true })
      }
    }, 120)
    return () => clearTimeout(timer)
  }, [map, center, zoom])
  return null
}

/**
 * Componente interactivo para el Mini-Mapa del Modal:
 * Permite hacer clic en cualquier parte del mapa o arrastrar el pin para ajustar unos metros
 */
function SelectorPuntoMapa({ latitud, longitud, onSelectCoords }) {
  useMapEvents({
    click(e) {
      onSelectCoords(
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6))
      )
    },
  })

  if (latitud === null || longitud === null) return null

  return (
    <Marker
      position={[latitud, longitud]}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const pos = e.target.getLatLng()
          onSelectCoords(
            Number(pos.lat.toFixed(6)),
            Number(pos.lng.toFixed(6))
          )
        },
      }}
    />
  )
}

const FORM_INICIAL = {
  nombre: '',
  telefono: '',
  direccion: '',
  latitud: null,
  longitud: null,
}

export default function ClientesPage() {
  const navigate = useNavigate()
  const { rolActual, infoRol, usuarioActual } = useRole()

  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorGeneral, setErrorGeneral] = useState('')
  const [mensajeExito, setMensajeExito] = useState('')

  // Vista activa: 'lista' | 'mapa'
  const [vistaActiva, setVistaActiva] = useState('lista')
  const [busqueda, setBusqueda] = useState('')
  const [filtroGps, setFiltroGps] = useState('TODOS') // 'TODOS' | 'CON_GPS' | 'SIN_GPS'
  const [paginaActual, setPaginaActual] = useState(1)

  // Centro del mapa general cuando se pulsa "Ver en Mapa" desde una tarjeta
  const [centroMapaGeneral, setCentroMapaGeneral] = useState(DEFAULT_CENTER)
  const [zoomMapaGeneral, setZoomMapaGeneral] = useState(13)
  const [clienteDestacadoId, setClienteDestacadoId] = useState(null)
  const markersRef = useRef({})

  // Estado del Modal (Crear o Editar Cliente / Actualizar GPS)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [clienteEditando, setClienteEditando] = useState(null)
  const [formData, setFormData] = useState(FORM_INICIAL)
  const [capturandoGps, setCapturandoGps] = useState(false)
  const [gpsCapturadoExito, setGpsCapturadoExito] = useState(false)
  const [errorGps, setErrorGps] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  const cargarClientes = useCallback(async () => {
    setCargando(true)
    setErrorGeneral('')
    try {
      const BLOQUE = 500
      let offset = 0
      const acumulado = []

      while (true) {
        const { data, error } = await supabase
          .from('clientes')
          .select(
            'id, nombre, telefono, direccion, latitud, longitud, fecha_registro, creado_por, perfiles:creado_por(nombre, rol)'
          )
          .order('fecha_registro', { ascending: false })
          .range(offset, offset + BLOQUE - 1)

        if (error) throw error
        const lote = data || []
        acumulado.push(...lote)
        if (lote.length < BLOQUE) break
        offset += BLOQUE
      }

      setClientes(acumulado)

      const primeroConGps = acumulado.find(
        (c) => c.latitud !== null && c.longitud !== null
      )
      if (primeroConGps) {
        setCentroMapaGeneral([
          Number(primeroConGps.latitud),
          Number(primeroConGps.longitud),
        ])
      }
    } catch (err) {
      console.error('Error al cargar clientes:', err)
      setErrorGeneral(err.message || 'No se pudo cargar la lista de clientes.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarClientes()
  }, [cargarClientes])

  // Cuando se selecciona un cliente para ver en el mapa interno, abrir su Popup automáticamente
  useEffect(() => {
    if (vistaActiva === 'mapa' && clienteDestacadoId) {
      const timer = setTimeout(() => {
        const marker = markersRef.current[clienteDestacadoId]
        if (marker) {
          marker.openPopup()
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [vistaActiva, clienteDestacadoId])

  // Filtrado instantáneo por nombre, teléfono, dirección y estado GPS
  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return clientes.filter((c) => {
      const tieneGps = c.latitud !== null && c.longitud !== null
      if (filtroGps === 'CON_GPS' && !tieneGps) return false
      if (filtroGps === 'SIN_GPS' && tieneGps) return false

      if (!q) return true
      const coincideNombre = c.nombre?.toLowerCase().includes(q)
      const coincideTel = c.telefono?.toLowerCase().includes(q)
      const coincideDir = c.direccion?.toLowerCase().includes(q)
      return coincideNombre || coincideTel || coincideDir
    })
  }, [clientes, busqueda, filtroGps])

  const clientesConGps = useMemo(
    () =>
      clientesFiltrados.filter(
        (c) =>
          c.latitud !== null &&
          c.longitud !== null &&
          !Number.isNaN(Number(c.latitud)) &&
          !Number.isNaN(Number(c.longitud))
      ),
    [clientesFiltrados]
  )

  const abrirModalNuevoCliente = () => {
    setClienteEditando(null)
    setFormData(FORM_INICIAL)
    setGpsCapturadoExito(false)
    setErrorGps('')
    setErrorModal('')
    setModalAbierto(true)
  }

  const abrirModalEditarCliente = (cliente) => {
    setClienteEditando(cliente)
    const tieneCoords =
      cliente.latitud !== null && cliente.longitud !== null
    setFormData({
      nombre: cliente.nombre || '',
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      latitud: tieneCoords ? Number(cliente.latitud) : null,
      longitud: tieneCoords ? Number(cliente.longitud) : null,
    })
    setGpsCapturadoExito(tieneCoords)
    setErrorGps('')
    setErrorModal('')
    setModalAbierto(true)
  }

  // Captura GPS con alta precisión (enableHighAccuracy: true)
  const capturarUbicacionGpsActual = () => {
    setErrorGps('')
    if (!('geolocation' in navigator)) {
      setErrorGps(
        'Tu navegador no soporta geolocalización. Puedes tocar cualquier punto del mini-mapa abajo para ubicar la tienda del cliente.'
      )
      return
    }

    setCapturandoGps(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6))
        const lng = Number(position.coords.longitude.toFixed(6))
        setFormData((prev) => ({
          ...prev,
          latitud: lat,
          longitud: lng,
        }))
        setGpsCapturadoExito(true)
        setCapturandoGps(false)
      },
      (err) => {
        setCapturandoGps(false)
        let msg =
          'No se pudo obtener el GPS automático. Puedes tocar el mini-mapa directamente para marcar la ubicación.'
        if (err.code === 1) {
          msg =
            'Permiso de ubicación denegado. Activa el GPS o toca el mini-mapa abajo para marcar la ubicación.'
        }
        setErrorGps(msg)
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    )
  }

  const guardarCliente = async (e) => {
    e.preventDefault()
    if (!formData.nombre.trim()) {
      setErrorModal('El Nombre del Cliente es obligatorio.')
      return
    }

    setGuardando(true)
    setErrorModal('')

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
        nombre: formData.nombre.trim(),
        telefono: formData.telefono.trim() || null,
        direccion: formData.direccion.trim() || null,
        latitud:
          formData.latitud !== null && formData.latitud !== ''
            ? Number(formData.latitud)
            : null,
        longitud:
          formData.longitud !== null && formData.longitud !== ''
            ? Number(formData.longitud)
            : null,
      }

      if (clienteEditando) {
        const { error } = await supabase
          .from('clientes')
          .update(payload)
          .eq('id', clienteEditando.id)
        if (error) throw error
        setMensajeExito(`Cliente "${payload.nombre}" actualizado correctamente.`)
      } else {
        const { error } = await supabase
          .from('clientes')
          .insert([{ ...payload, creado_por: validUserId }])
        if (error) throw error
        setMensajeExito(`Cliente "${payload.nombre}" registrado con éxito.`)
      }

      setModalAbierto(false)
      await cargarClientes()
      setTimeout(() => setMensajeExito(''), 4500)
    } catch (err) {
      console.error('Error guardando cliente:', err)
      setErrorModal(err.message || 'No se pudo guardar el cliente en Supabase.')
    } finally {
      setGuardando(false)
    }
  }

  // Acción: Ver cliente específico en el mapa interno
  const verClienteEnMapaInterno = (cliente) => {
    if (cliente.latitud === null || cliente.longitud === null) return
    setCentroMapaGeneral([Number(cliente.latitud), Number(cliente.longitud)])
    setZoomMapaGeneral(17)
    setClienteDestacadoId(cliente.id)
    setVistaActiva('mapa')
  }

  // Acción: Ir a Hacer Pedido (conecta con el Paso 5)
  const irAHacerPedido = (cliente) => {
    try {
      localStorage.setItem('bebidas_cliente_preventa', JSON.stringify(cliente))
    } catch {
      // ignore storage error
    }
    navigate(`/preventa?cliente_id=${cliente.id}`, {
      state: { clientePreseleccionado: cliente },
    })
  }

  // Formatear enlace limpio de WhatsApp
  const obtenerUrlWhatsApp = (telefono, nombreCliente) => {
    if (!telefono) return null
    const soloDigitos = String(telefono).replace(/\D/g, '')
    if (!soloDigitos) return null
    const numeroFinal =
      soloDigitos.length === 8 ? `591${soloDigitos}` : soloDigitos
    const texto = encodeURIComponent(
      `Hola *${nombreCliente}*, le escribimos de la Distribuidora de Bebidas.`
    )
    return `https://wa.me/${numeroFinal}?text=${texto}`
  }

  const centroMiniMapa =
    formData.latitud !== null && formData.longitud !== null
      ? [Number(formData.latitud), Number(formData.longitud)]
      : DEFAULT_CENTER

  return (
    <div className="space-y-5 pb-8">
      {/* ================= 1. CABECERA MINIMALISTA ESTILO LINEAR (2 FILAS LIMPIAS) ================= */}
      <div className="space-y-3">
        {/* Fila 1: Título + Contador | Selector Lista/Mapa + Nuevo Cliente */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Clientes
            </h1>
            <span className="text-sm font-normal text-slate-400">
              {clientesFiltrados.length} clientes
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center bg-white dark:bg-white/5 p-0.5 rounded-lg border border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setVistaActiva('lista')}
                className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition cursor-pointer ${
                  vistaActiva === 'lista'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <List size={15} />
                <span>Lista</span>
              </button>

              <button
                type="button"
                onClick={() => setVistaActiva('mapa')}
                className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition cursor-pointer ${
                  vistaActiva === 'mapa'
                    ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <MapIcon size={15} />
                <span>Mapa ({clientesConGps.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={cargarClientes}
              title="Actualizar clientes"
              className="h-9 px-3 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
            </button>

            <button
              type="button"
              onClick={abrirModalNuevoCliente}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-semibold text-xs transition cursor-pointer"
            >
              <Plus size={16} />
              <span>Nuevo Cliente</span>
            </button>
          </div>
        </div>

        {/* Fila 2: Buscador compacto + Píldoras de estado GPS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPaginaActual(1)
              }}
              placeholder="Buscar cliente por nombre, teléfono o dirección..."
              className="w-full h-9 pl-9 pr-8 rounded-lg bg-white dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda('')
                  setPaginaActual(1)
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setFiltroGps('TODOS')
                setPaginaActual(1)
              }}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer ${
                filtroGps === 'TODOS'
                  ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold'
                  : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              Todos ({clientes.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroGps('CON_GPS')
                setPaginaActual(1)
              }}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer ${
                filtroGps === 'CON_GPS'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              Con GPS ({clientes.filter((c) => c.latitud !== null).length})
            </button>
            <button
              type="button"
              onClick={() => {
                setFiltroGps('SIN_GPS')
                setPaginaActual(1)
              }}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition shrink-0 cursor-pointer ${
                filtroGps === 'SIN_GPS'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
              }`}
            >
              Sin GPS ({clientes.filter((c) => c.latitud === null).length})
            </button>
          </div>
        </div>
      </div>

      {/* Botón flotante en Móvil para "Nuevo Cliente" */}
      <button
        type="button"
        onClick={abrirModalNuevoCliente}
        className="sm:hidden fixed bottom-20 right-4 z-30 inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-amber-500 text-slate-950 font-bold text-xs shadow-lg border border-amber-400 active:scale-95 transition"
      >
        <Plus size={16} />
        <span>Nuevo Cliente</span>
      </button>

      {/* Mensajes de estado */}
      {mensajeExito && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{mensajeExito}</span>
          </div>
          <button
            type="button"
            onClick={() => setMensajeExito('')}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorGeneral && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorGeneral}</span>
        </div>
      )}

      {/* ================= 3. VISTA A: LISTA DE CLIENTES (TARJETAS ÁGILES) ================= */}
      {vistaActiva === 'lista' && (
        <>
          {cargando ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-2xl border border-slate-200/80 p-5 h-52 animate-pulse flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="h-5 bg-slate-200 rounded w-3/4" />
                    <div className="h-4 bg-slate-100 rounded w-full" />
                    <div className="h-4 bg-slate-100 rounded w-1/2" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-9 bg-slate-100 rounded-xl" />
                    <div className="h-9 bg-slate-100 rounded-xl" />
                    <div className="h-9 bg-slate-100 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <div className="text-base font-bold text-slate-800">
                No se encontraron clientes con ese criterio
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Puedes registrar un nuevo cliente pulsando el botón{' '}
                <strong>&ldquo;+ Nuevo Cliente&rdquo;</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {clientesFiltrados
                  .slice(
                    (paginaActual - 1) * TAMANO_PAGINA_CLIENTES,
                    paginaActual * TAMANO_PAGINA_CLIENTES
                  )
                  .map((cliente) => {
                const tieneGps =
                  cliente.latitud !== null &&
                  cliente.longitud !== null &&
                  !Number.isNaN(Number(cliente.latitud))
                const urlWa = obtenerUrlWhatsApp(cliente.telefono, cliente.nombre)
                const urlGoogleMaps = tieneGps
                  ? `https://www.google.com/maps?q=${cliente.latitud},${cliente.longitud}`
                  : null

                return (
                  <div
                    key={cliente.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-slate-300/90 transition-all flex flex-col justify-between overflow-hidden"
                  >
                    <div className="p-5 space-y-3">
                      {/* Fila superior: Estado GPS + Botón Editar */}
                      <div className="flex items-center justify-between gap-2">
                        {tieneGps ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/12 text-emerald-800 border border-emerald-500/25 text-[11px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            GPS Registrado
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => abrirModalEditarCliente(cliente)}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 border border-amber-500/30 text-[11px] font-bold transition cursor-pointer"
                          >
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            Sin GPS (Tocar para capturar)
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => abrirModalEditarCliente(cliente)}
                          title="Editar cliente o actualizar ubicación GPS"
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-900 text-slate-600 hover:text-amber-400 transition cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Nombre del Cliente */}
                      <div>
                        <h2 className="text-base font-bold text-slate-900 leading-snug">
                          {cliente.nombre}
                        </h2>
                        <p className="text-xs text-slate-600 mt-1 flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span>
                            {cliente.direccion || 'Sin dirección / referencia especificada'}
                          </span>
                        </p>
                      </div>

                      {/* Teléfono y metadatos */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{cliente.telefono || 'Sin teléfono'}</span>
                        </div>
                        {tieneGps && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/70">
                            {Number(cliente.latitud).toFixed(4)},{' '}
                            {Number(cliente.longitud).toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botones de Acción Rápida en cada Tarjeta */}
                    <div className="px-4 py-3 bg-slate-50/90 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
                      {/* 1. Botón WhatsApp */}
                      {urlWa ? (
                        <a
                          href={urlWa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-2xs"
                          title="Abrir chat directo en WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      ) : (
                        <span
                          title="Este cliente no tiene teléfono registrado"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-200/70 text-slate-400 text-xs font-semibold cursor-not-allowed"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Sin WA</span>
                        </span>
                      )}

                      {/* 2. Botón Ver en Mapa / Cómo llegar */}
                      {tieneGps && (
                        <>
                          <button
                            type="button"
                            onClick={() => verClienteEnMapaInterno(cliente)}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/90 text-xs font-bold transition cursor-pointer"
                            title="Ver en Mapa de Clientes"
                          >
                            <MapIcon className="w-3.5 h-3.5 text-amber-600" />
                            <span>Mapa</span>
                          </button>

                          <a
                            href={urlGoogleMaps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/90 text-xs font-bold transition"
                            title="Abrir navegación GPS en Google Maps"
                          >
                            <Navigation className="w-3.5 h-3.5 text-blue-600" />
                            <span>Cómo llegar</span>
                          </a>
                        </>
                      )}

                      {/* 3. Botón Hacer Pedido */}
                      <button
                        type="button"
                        onClick={() => irAHacerPedido(cliente)}
                        className="ml-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold transition cursor-pointer shadow-2xs"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Hacer Pedido</span>
                      </button>
                    </div>
                  </div>
                )
              })}
              </div>

              {clientesFiltrados.length > TAMANO_PAGINA_CLIENTES && (
                <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07]">
                  <PaginationBar
                    paginaActual={paginaActual}
                    totalRegistros={clientesFiltrados.length}
                    tamanoPagina={TAMANO_PAGINA_CLIENTES}
                    onCambiarPagina={setPaginaActual}
                    etiquetaItem="tiendas"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ================= 4. VISTA B: MAPA DE CLIENTES (UBICACIÓN DE SUS TIENDAS) ================= */}
      {vistaActiva === 'mapa' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900">
              <MapPin className="w-4 h-4 text-amber-500" />
              <span>Mapa de Clientes (Ubicación de sus tiendas)</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Mostrando {clientesConGps.length} clientes geolocalizados · Toca un marcador
              para ver detalles e iniciar pedido
            </span>
          </div>

          <div className="h-[68vh] min-h-[420px] w-full relative z-10">
            <MapContainer
              center={centroMapaGeneral}
              zoom={zoomMapaGeneral}
              scrollWheelZoom={true}
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ControladorVistaMapa
                center={centroMapaGeneral}
                zoom={zoomMapaGeneral}
              />

              {clientesConGps.map((cliente) => {
                const urlWa = obtenerUrlWhatsApp(cliente.telefono, cliente.nombre)
                const urlGmaps = `https://www.google.com/maps?q=${cliente.latitud},${cliente.longitud}`

                return (
                  <Marker
                    key={cliente.id}
                    position={[Number(cliente.latitud), Number(cliente.longitud)]}
                    ref={(el) => {
                      if (el) markersRef.current[cliente.id] = el
                    }}
                  >
                    <Popup minWidth={240}>
                      <div className="space-y-2 py-1">
                        <div className="font-bold text-slate-900 text-sm leading-snug">
                          {cliente.nombre}
                        </div>
                        <div className="text-xs text-slate-600">
                          📍 {cliente.direccion || 'Sin referencia escrita'}
                        </div>
                        {cliente.telefono && (
                          <div className="text-xs text-slate-700 font-medium">
                            📞 {cliente.telefono}
                          </div>
                        )}

                        <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100">
                          {urlWa && (
                            <a
                              href={urlWa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 !text-white text-[11px] font-bold inline-flex items-center gap-1 no-underline"
                            >
                              <span>WhatsApp</span>
                            </a>
                          )}

                          <a
                            href={urlGmaps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 !text-slate-800 border border-slate-200 text-[11px] font-bold inline-flex items-center gap-1 no-underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Google Maps</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => irAHacerPedido(cliente)}
                            className="w-full mt-1 py-1.5 px-3 rounded-lg bg-slate-900 text-amber-400 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Iniciar Pedido</span>
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
          </div>
        </div>
      )}

      {/* ================= 2. MODAL DE REGISTRO RÁPIDO CON CAPTURA GPS (+ NUEVO CLIENTE) ================= */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl max-w-xl w-full overflow-hidden">
            {/* Cabecera del Modal */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold">
                    {clienteEditando
                      ? 'Editar Cliente / Actualizar GPS'
                      : '+ Nuevo Cliente'}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Registra los datos del cliente y captura la ubicación GPS de su tienda
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={guardarCliente}
              className="p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            >
              {errorModal && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorModal}</span>
                </div>
              )}

              {/* Campo Principal: Nombre del Cliente */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre del Cliente *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Don Mario Quispe"
                  value={formData.nombre}
                  onChange={(e) =>
                    setFormData({ ...formData, nombre: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Campos opcionales: Teléfono y Dirección */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono / WhatsApp (opcional)
                  </label>
                  <input
                    type="tel"
                    placeholder="Ej. 70123456"
                    value={formData.telefono}
                    onChange={(e) =>
                      setFormData({ ...formData, telefono: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dirección o Referencia (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Av. Banzer 4to Anillo esq. Calle 2"
                    value={formData.direccion}
                    onChange={(e) =>
                      setFormData({ ...formData, direccion: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Bloque Especial de Geolocalización GPS */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Geolocalización GPS (Ubicación de su tienda)
                  </span>

                  {formData.latitud !== null && formData.longitud !== null && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 text-[11px] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      {gpsCapturadoExito
                        ? 'Ubicación GPS capturada con éxito'
                        : 'Coordenadas seleccionadas'}
                    </span>
                  )}
                </div>

                {/* Botón grande y táctil para capturar GPS actual */}
                <button
                  type="button"
                  onClick={capturarUbicacionGpsActual}
                  disabled={capturandoGps}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-amber-400 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-60"
                >
                  <Crosshair
                    className={`w-4 h-4 ${capturandoGps ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {capturandoGps
                      ? 'Obteniendo señal GPS de alta precisión...'
                      : '📍 Capturar Ubicación Actual (GPS)'}
                  </span>
                </button>

                {errorGps && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium">
                    {errorGps}
                  </div>
                )}

                {/* Mini-mapa interactivo de vista previa y ajuste fino */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      Puedes tocar el mapa o arrastrar el marcador para afinar la
                      ubicación:
                    </span>
                    {formData.latitud !== null && formData.longitud !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            latitud: null,
                            longitud: null,
                          }))
                          setGpsCapturadoExito(false)
                        }}
                        className="text-red-600 hover:underline font-semibold cursor-pointer"
                      >
                        Quitar pin
                      </button>
                    )}
                  </div>

                  <div className="h-48 w-full rounded-xl overflow-hidden border border-slate-200 relative z-10">
                    <MapContainer
                      center={centroMiniMapa}
                      zoom={formData.latitud !== null ? 16 : 13}
                      scrollWheelZoom={true}
                      className="h-full w-full"
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <ControladorVistaMapa
                        center={centroMiniMapa}
                        zoom={formData.latitud !== null ? 16 : 13}
                      />
                      <SelectorPuntoMapa
                        latitud={formData.latitud}
                        longitud={formData.longitud}
                        onSelectCoords={(lat, lng) => {
                          setFormData((prev) => ({
                            ...prev,
                            latitud: lat,
                            longitud: lng,
                          }))
                          setGpsCapturadoExito(true)
                        }}
                      />
                    </MapContainer>
                  </div>

                  {formData.latitud !== null && formData.longitud !== null ? (
                    <div className="text-[11px] font-mono text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200/80 flex items-center justify-between">
                      <span>Latitud: {formData.latitud}</span>
                      <span>Longitud: {formData.longitud}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic">
                      Sin coordenadas seleccionadas (también puedes guardar sin GPS y
                      capturarlo luego en la tienda del cliente).
                    </div>
                  )}
                </div>
              </div>

              {/* Botones inferiores del modal */}
              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {guardando
                      ? 'Guardando en Supabase...'
                      : clienteEditando
                      ? 'Guardar Cambios'
                      : 'Registrar Cliente'}
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
