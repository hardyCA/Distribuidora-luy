import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Package,
  Search,
  Plus,
  Pencil,
  Trash2,
  Tag,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Sparkles,
  Upload,
  Wand2,
  RotateCcw,
  Check,
  LayoutGrid,
  List,
  Layers,
  Image as ImageIcon,
} from 'lucide-react'
import {
  supabase,
  subirImagenProductoSupabase,
  subirLogoMarcaSupabase,
  obtenerMapaLogosMarcas,
  obtenerLogoDeMarca,
  guardarLogoMarcaRespaldo,
  renombrarLogoMarcaRespaldo,
  enriquecerMarcasConLogo,
} from '../lib/supabase'
import { useRole } from '../context/RoleContext'
import { formatearStock } from '../utils/stock'
import { quitarFondoEnNavegador } from '../utils/imageProcessor'
import BottleVisual from '../components/BottleVisual'
import PaginationBar from '../components/PaginationBar'
import { BrandBoxesGrid, BrandActiveBar } from '../components/BrandBoxesGrid'

const TAMANO_PROD_TARJETAS = 18
const TAMANO_PROD_TABLA = 25

const FORM_INICIAL = {
  nombre: '',
  marca: '',
  sabor: '',
  unidades_por_paquete: 6,
  precio_unidad: '',
  precio_paquete_menor: '',
  precio_paquete_mayor: '',
  min_paquetes_mayor: 5,
  tipo_beneficio_mayor: 'precio_mayor', // 'precio_mayor' | 'bonificacion' | 'ninguno'
  bonif_compra_paquetes: 5,
  bonif_regalo_paquetes: 2,
  permite_surtido: false,
  grupo_surtido: '',
  imagen_url: '',
  activo: true,
}

export default function ProductosPage() {
  const { rolActual } = useRole()
  const esAdmin = rolActual === 'admin'
  const ocultarStock = rolActual === 'preventista'

  const [productos, setProductos] = useState([])
  const [marcasTabla, setMarcasTabla] = useState([])
  const [mapaLogosMarcas, setMapaLogosMarcas] = useState({})
  const [ubicaciones, setUbicaciones] = useState([])
  const [inventario, setInventario] = useState([])
  const [cargando, setCargando] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Filtros y Modo de Vista ('tarjetas' | 'lista')
  // `marcaSeleccionada === null` muestra primero las Cajas de Marcas; un string filtra esa marca (o 'TODAS' para ver todo junto)
  const [busqueda, setBusqueda] = useState('')
  const [marcaSeleccionada, setMarcaSeleccionada] = useState(null)
  const [mostrarInactivos, setMostrarInactivos] = useState(false)
  const [modoVista, setModoVista] = useState('tarjetas')
  const [paginaActual, setPaginaActual] = useState(1)

  useEffect(() => {
    setPaginaActual(1)
  }, [busqueda, marcaSeleccionada, mostrarInactivos, modoVista])

  // Modal Crear / Editar Producto (solo admin)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [productoEditando, setProductoEditando] = useState(null)
  const [formData, setFormData] = useState(FORM_INICIAL)
  const [guardando, setGuardando] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  // Creación rápida de marca "[+ Nueva Marca]" al vuelo dentro del Modal de Producto
  const [mostrarNuevaMarcaInline, setMostrarNuevaMarcaInline] = useState(false)
  const [nombreNuevaMarcaInline, setNombreNuevaMarcaInline] = useState('')
  const [creandoMarcaInline, setCreandoMarcaInline] = useState(false)

  // Modal de Gestión Completa de Marcas + Subida de Logo Oficial
  const [modalMarcasAbierto, setModalMarcasAbierto] = useState(false)
  const [nuevaMarcaInput, setNuevaMarcaInput] = useState('')
  const [nuevoLogoBlob, setNuevoLogoBlob] = useState(null)
  const [nuevoLogoPreview, setNuevoLogoPreview] = useState('')
  const [procesandoFondoLogoNuevo, setProcesandoFondoLogoNuevo] = useState(false)
  const [marcaObjetivoLogo, setMarcaObjetivoLogo] = useState('')
  const [subiendoLogoDeMarca, setSubiendoLogoDeMarca] = useState('')
  const nuevoLogoInputRef = useRef(null)
  const logoExistenteInputRef = useRef(null)
  const [marcaEditandoId, setMarcaEditandoId] = useState(null)
  const [marcaEditandoNombre, setMarcaEditandoNombre] = useState('')
  const [procesandoMarca, setProcesandoMarca] = useState(false)
  const [errorModalMarcas, setErrorModalMarcas] = useState('')
  const [exitoModalMarcas, setExitoModalMarcas] = useState('')

  // Estados de carga de foto y eliminación de fondo en el Modal de Producto
  const fileInputRef = useRef(null)
  const [archivoOriginal, setArchivoOriginal] = useState(null)
  const [archivoParaSubir, setArchivoParaSubir] = useState(null)
  const [vistaPreviaUrl, setVistaPreviaUrl] = useState('')
  const [fondoRemovido, setFondoRemovido] = useState(false)
  const [procesandoFondo, setProcesandoFondo] = useState(false)
  const [estadoProgresoIA, setEstadoProgresoIA] = useState('')
  const [arrastrandoArchivo, setArrastrandoArchivo] = useState(false)

  const cargarCatalogoEInventario = useCallback(async () => {
    setCargando(true)
    setErrorMsg('')
    try {
      const [resProd, resMarcas, resUbic, resInv, mapaLogos] = await Promise.all([
        supabase.from('productos').select('*').order('nombre', { ascending: true }),
        supabase.from('marcas').select('*').order('nombre', { ascending: true }),
        supabase.from('ubicaciones').select('*'),
        supabase.from('inventario').select('*'),
        obtenerMapaLogosMarcas(true),
      ])

      if (resProd.error) throw resProd.error
      if (resUbic.error) throw resUbic.error
      if (resInv.error) throw resInv.error

      const marcasConLogo = await enriquecerMarcasConLogo(resMarcas.data || [])
      setProductos(resProd.data || [])
      setMarcasTabla(marcasConLogo)
      setMapaLogosMarcas(mapaLogos || {})
      setUbicaciones(resUbic.data || [])
      setInventario(resInv.data || [])
    } catch (err) {
      console.error('Error cargando catálogo:', err)
      setErrorMsg(err.message || 'Error al conectar con Supabase.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarCatalogoEInventario()
  }, [cargarCatalogoEInventario])

  // Identificar IDs de Depósito Principal ('almacen') y Tienda Central ('central')
  const ubicacionAlmacenId = useMemo(
    () => ubicaciones.find((u) => u.tipo === 'almacen')?.id,
    [ubicaciones]
  )
  const ubicacionCentralId = useMemo(
    () => ubicaciones.find((u) => u.tipo === 'central')?.id,
    [ubicaciones]
  )

  // Mapa rápido de stock por producto_id
  const stockPorProducto = useMemo(() => {
    const mapa = {}
    for (const item of inventario) {
      if (!mapa[item.producto_id]) {
        mapa[item.producto_id] = { almacen: 0, central: 0 }
      }
      if (item.ubicacion_id === ubicacionAlmacenId) {
        mapa[item.producto_id].almacen = Number(item.stock_unidades) || 0
      } else if (item.ubicacion_id === ubicacionCentralId) {
        mapa[item.producto_id].central = Number(item.stock_unidades) || 0
      }
    }
    return mapa
  }, [inventario, ubicacionAlmacenId, ubicacionCentralId])

  // Conteo de productos por nombre de marca
  const conteoProductosPorMarca = useMemo(() => {
    const conteo = {}
    productos.forEach((p) => {
      const m = p.marca?.trim()
      if (m) {
        conteo[m] = (conteo[m] || 0) + 1
      }
    })
    return conteo
  }, [productos])

  // Lista unificada de marcas activas
  const marcasDisponibles = useMemo(() => {
    const setMarcas = new Set()
    marcasTabla.forEach((m) => {
      if (m.activo !== false && m.nombre?.trim()) {
        setMarcas.add(m.nombre.trim())
      }
    })
    productos.forEach((p) => {
      if (p.marca && p.marca.trim()) {
        setMarcas.add(p.marca.trim())
      }
    })
    return Array.from(setMarcas).sort((a, b) => a.localeCompare(b, 'es'))
  }, [marcasTabla, productos])

  // Opciones para el selector `<select>` en el Modal de Producto
  const opcionesSelectMarca = useMemo(() => {
    const activas = marcasTabla
      .filter((m) => m.activo !== false && m.nombre?.trim())
      .map((m) => m.nombre.trim())

    if (formData.marca && !activas.includes(formData.marca.trim())) {
      activas.push(formData.marca.trim())
    }
    return Array.from(new Set(activas)).sort((a, b) => a.localeCompare(b, 'es'))
  }, [marcasTabla, formData.marca])

  // Tarjetas resumen por Marca para la vista inicial de Cajas de Marcas (Logo oficial o Nombre Grande, CERO botellas)
  const tarjetasMarcas = useMemo(() => {
    return marcasDisponibles.map((nombreMarca) => {
      const prodsMarca = productos.filter(
        (p) =>
          (mostrarInactivos || p.activo !== false) &&
          (p.marca || '').trim() === nombreMarca
      )
      const filaMarca = marcasTabla.find(
        (m) => (m.nombre || '').trim().toLowerCase() === nombreMarca.toLowerCase()
      )
      const logoUrl =
        filaMarca?.logo_url || obtenerLogoDeMarca(nombreMarca, mapaLogosMarcas)

      let sinCentralCount = 0
      if (!ocultarStock) {
        prodsMarca.forEach((p) => {
          const stCen = stockPorProducto[p.id]?.central || 0
          if (stCen <= 0) sinCentralCount += 1
        })
      }

      return {
        nombre: nombreMarca,
        logoUrl,
        cantidadProductos: prodsMarca.length,
        permiteSurtido: prodsMarca.some((p) => Boolean(p.permite_surtido)),
        alertaTexto:
          !ocultarStock && prodsMarca.length > 0 && sinCentralCount > 0
            ? `${sinCentralCount} sin Central`
            : '',
        alertaTipo: 'warning',
      }
    })
  }, [
    marcasDisponibles,
    marcasTabla,
    mapaLogosMarcas,
    productos,
    mostrarInactivos,
    ocultarStock,
    stockPorProducto,
  ])

  const mostrarCajasMarcas = marcaSeleccionada === null && !busqueda.trim()

  // Filtrado de productos por buscador, marca y estado activo
  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return productos.filter((p) => {
      if (!mostrarInactivos && p.activo === false) return false
      if (
        marcaSeleccionada &&
        marcaSeleccionada !== 'TODAS' &&
        (p.marca || '').trim() !== marcaSeleccionada
      ) {
        return false
      }
      if (!q) return true
      const coincideNombre = p.nombre?.toLowerCase().includes(q)
      const coincideMarca = p.marca?.toLowerCase().includes(q)
      const coincideSabor = p.sabor?.toLowerCase().includes(q)
      return coincideNombre || coincideMarca || coincideSabor
    })
  }, [productos, busqueda, marcaSeleccionada, mostrarInactivos])

  // ================= FUNCIONES DE GESTIÓN DE MARCAS Y LOGOS =================
  const abrirModalGestionMarcas = () => {
    if (!esAdmin) return
    setNuevaMarcaInput('')
    setNuevoLogoBlob(null)
    setNuevoLogoPreview('')
    setMarcaEditandoId(null)
    setMarcaEditandoNombre('')
    setErrorModalMarcas('')
    setExitoModalMarcas('')
    setModalMarcasAbierto(true)
  }

  const seleccionarArchivoNuevoLogo = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setNuevoLogoBlob(file)
    setNuevoLogoPreview(URL.createObjectURL(file))
  }

  const quitarFondoLogoNuevo = async () => {
    if (!nuevoLogoBlob) return
    setProcesandoFondoLogoNuevo(true)
    setErrorModalMarcas('')
    try {
      const sinFondo = await quitarFondoEnNavegador(nuevoLogoBlob, false)
      setNuevoLogoBlob(sinFondo)
      setNuevoLogoPreview(URL.createObjectURL(sinFondo))
    } catch {
      setErrorModalMarcas('No se pudo recortar el fondo del logo.')
    } finally {
      setProcesandoFondoLogoNuevo(false)
    }
  }

  const subirYAsignarLogoAMarcaExistente = async (
    nombreMarca,
    file,
    recortarFondo = false
  ) => {
    if (!nombreMarca || !file) return
    setSubiendoLogoDeMarca(nombreMarca)
    setErrorModalMarcas('')
    setExitoModalMarcas('')
    try {
      let blobFinal = file
      if (recortarFondo) {
        blobFinal = await quitarFondoEnNavegador(file, false)
      }
      const publicUrl = await subirLogoMarcaSupabase(blobFinal, nombreMarca)
      const nuevoMapa = await guardarLogoMarcaRespaldo(nombreMarca, publicUrl)
      setMapaLogosMarcas(nuevoMapa)
      setMarcasTabla((prev) =>
        prev.map((m) =>
          (m.nombre || '').trim().toLowerCase() === nombreMarca.trim().toLowerCase()
            ? { ...m, logo_url: publicUrl }
            : m
        )
      )
      setExitoModalMarcas(`Logo actualizado para "${nombreMarca}".`)
    } catch (err) {
      setErrorModalMarcas(err.message || 'No se pudo subir el logo de la marca.')
    } finally {
      setSubiendoLogoDeMarca('')
      setMarcaObjetivoLogo('')
    }
  }

  const quitarLogoDeMarcaExistente = async (nombreMarca) => {
    if (!nombreMarca) return
    setSubiendoLogoDeMarca(nombreMarca)
    try {
      const nuevoMapa = await guardarLogoMarcaRespaldo(nombreMarca, '')
      setMapaLogosMarcas(nuevoMapa)
      setMarcasTabla((prev) =>
        prev.map((m) =>
          (m.nombre || '').trim().toLowerCase() === nombreMarca.trim().toLowerCase()
            ? { ...m, logo_url: '' }
            : m
        )
      )
      setExitoModalMarcas(`Logo quitado de "${nombreMarca}".`)
    } finally {
      setSubiendoLogoDeMarca('')
    }
  }

  const recortarFondoLogoDeMarcaExistente = async (nombreMarca, logoUrlActual) => {
    if (!nombreMarca || !logoUrlActual) return
    setSubiendoLogoDeMarca(nombreMarca)
    setErrorModalMarcas('')
    try {
      const resp = await fetch(logoUrlActual)
      const blob = await resp.blob()
      await subirYAsignarLogoAMarcaExistente(nombreMarca, blob, true)
    } catch {
      setSubiendoLogoDeMarca('')
      setErrorModalMarcas('Sube el logo desde tu dispositivo para quitarle el fondo.')
    }
  }

  const agregarNuevaMarca = async (e) => {
    if (e) e.preventDefault()
    const nombreLimpio = nuevaMarcaInput.trim()
    if (!nombreLimpio) return

    setProcesandoMarca(true)
    setErrorModalMarcas('')
    setExitoModalMarcas('')

    try {
      const { data, error } = await supabase
        .from('marcas')
        .insert([{ nombre: nombreLimpio, activo: true }])
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error(`La marca "${nombreLimpio}" ya está registrada.`)
        }
        throw error
      }

      let logoSubidoUrl = ''
      if (nuevoLogoBlob) {
        logoSubidoUrl = await subirLogoMarcaSupabase(nuevoLogoBlob, data.nombre)
        const nuevoMapa = await guardarLogoMarcaRespaldo(
          data.nombre,
          logoSubidoUrl
        )
        setMapaLogosMarcas(nuevoMapa)
      }

      const marcaConLogo = { ...data, logo_url: logoSubidoUrl }
      setMarcasTabla((prev) =>
        [...prev, marcaConLogo].sort((a, b) =>
          a.nombre.localeCompare(b.nombre, 'es')
        )
      )
      setNuevaMarcaInput('')
      setNuevoLogoBlob(null)
      setNuevoLogoPreview('')
      setExitoModalMarcas(`Marca "${data.nombre}" creada.`)
    } catch (err) {
      setErrorModalMarcas(err.message || 'No se pudo agregar la marca.')
    } finally {
      setProcesandoMarca(false)
    }
  }

  // Crear marca al vuelo desde el botón [+ Nueva Marca] dentro del Modal de Producto
  const crearMarcaAlVuelo = async () => {
    const nombreLimpio = nombreNuevaMarcaInline.trim()
    if (!nombreLimpio) return

    setCreandoMarcaInline(true)
    setErrorModal('')

    try {
      const existente = marcasTabla.find(
        (m) => m.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase()
      )

      if (existente) {
        if (existente.activo === false) {
          await supabase
            .from('marcas')
            .update({ activo: true })
            .eq('id', existente.id)
        }
        setFormData((prev) => ({ ...prev, marca: existente.nombre }))
      } else {
        const { data, error } = await supabase
          .from('marcas')
          .insert([{ nombre: nombreLimpio, activo: true }])
          .select()
          .single()

        if (error) throw error

        setMarcasTabla((prev) =>
          [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        )
        setFormData((prev) => ({ ...prev, marca: data.nombre }))
      }

      setNombreNuevaMarcaInline('')
      setMostrarNuevaMarcaInline(false)
    } catch (err) {
      setErrorModal(err.message || 'No se pudo crear la nueva marca.')
    } finally {
      setCreandoMarcaInline(false)
    }
  }

  // Renombrar marca en `marcas` y actualizar automáticamente los registros en `productos`
  const guardarEdicionMarca = async (marcaObj) => {
    const nuevoNombre = marcaEditandoNombre.trim()
    const viejoNombre = marcaObj.nombre.trim()

    if (!nuevoNombre || nuevoNombre === viejoNombre) {
      setMarcaEditandoId(null)
      return
    }

    setProcesandoMarca(true)
    setErrorModalMarcas('')
    setExitoModalMarcas('')

    try {
      const { error: errMarca } = await supabase
        .from('marcas')
        .update({ nombre: nuevoNombre })
        .eq('id', marcaObj.id)

      if (errMarca) {
        if (errMarca.code === '23505') {
          throw new Error(`Ya existe otra marca con el nombre "${nuevoNombre}".`)
        }
        throw errMarca
      }

      const { error: errProd } = await supabase
        .from('productos')
        .update({ marca: nuevoNombre })
        .eq('marca', viejoNombre)

      if (errProd) throw errProd

      await supabase
        .from('productos')
        .update({ grupo_surtido: nuevoNombre })
        .eq('marca', nuevoNombre)
        .eq('permite_surtido', true)

      await renombrarLogoMarcaRespaldo(viejoNombre, nuevoNombre)

      if (marcaSeleccionada === viejoNombre) {
        setMarcaSeleccionada(nuevoNombre)
      }
      if (formData.marca === viejoNombre) {
        setFormData((prev) => ({ ...prev, marca: nuevoNombre }))
      }

      setMarcaEditandoId(null)
      setExitoModalMarcas(
        `Marca renombrada a "${nuevoNombre}" y productos actualizados.`
      )
      await cargarCatalogoEInventario()
    } catch (err) {
      setErrorModalMarcas(err.message || 'Error al renombrar la marca.')
    } finally {
      setProcesandoMarca(false)
    }
  }

  // Eliminar marca (si no tiene productos asociados) o desactivarla/reactivarla
  const eliminarODesactivarMarca = async (marcaObj) => {
    const cantidadAsociados = conteoProductosPorMarca[marcaObj.nombre] || 0
    setProcesandoMarca(true)
    setErrorModalMarcas('')
    setExitoModalMarcas('')

    try {
      if (cantidadAsociados === 0) {
        const { error } = await supabase
          .from('marcas')
          .delete()
          .eq('id', marcaObj.id)
        if (error) throw error

        setMarcasTabla((prev) => prev.filter((m) => m.id !== marcaObj.id))
        if (marcaSeleccionada === marcaObj.nombre) {
          setMarcaSeleccionada(null)
        }
        setExitoModalMarcas(`Marca "${marcaObj.nombre}" eliminada.`)
      } else {
        const nuevoEstado = marcaObj.activo === false ? true : false
        const { error } = await supabase
          .from('marcas')
          .update({ activo: nuevoEstado })
          .eq('id', marcaObj.id)
        if (error) throw error

        setMarcasTabla((prev) =>
          prev.map((m) =>
            m.id === marcaObj.id ? { ...m, activo: nuevoEstado } : m
          )
        )
        setExitoModalMarcas(
          nuevoEstado
            ? `Marca "${marcaObj.nombre}" reactivada.`
            : `Marca "${marcaObj.nombre}" archivada (${cantidadAsociados} productos asociados).`
        )
      }
    } catch (err) {
      setErrorModalMarcas(err.message || 'No se pudo actualizar la marca.')
    } finally {
      setProcesandoMarca(false)
    }
  }

  // ================= FUNCIONES DE MODAL DE PRODUCTO E IMAGEN =================
  const resetearEstadoImagenModal = (urlExistente = '') => {
    setArchivoOriginal(null)
    setArchivoParaSubir(null)
    setVistaPreviaUrl(urlExistente || '')
    setFondoRemovido(false)
    setProcesandoFondo(false)
    setEstadoProgresoIA('')
  }

  const abrirModalNuevo = (marcaForzada = null) => {
    if (!esAdmin) return
    setProductoEditando(null)
    const marcaContexto =
      typeof marcaForzada === 'string' && marcaForzada
        ? marcaForzada
        : marcaSeleccionada && marcaSeleccionada !== 'TODAS'
        ? marcaSeleccionada
        : marcasTabla.find((m) => m.activo !== false)?.nombre || ''
    setFormData({
      ...FORM_INICIAL,
      marca: marcaContexto,
    })
    setMostrarNuevaMarcaInline(false)
    setNombreNuevaMarcaInline('')
    resetearEstadoImagenModal('')
    setErrorModal('')
    setModalAbierto(true)
  }

  const abrirModalEditar = (prod) => {
    if (!esAdmin) return
    setProductoEditando(prod)
    const tipoBeneficio =
      prod.tipo_beneficio_mayor === 'bonificacion' ||
      prod.tipo_beneficio_mayor === 'ninguno'
        ? prod.tipo_beneficio_mayor
        : 'precio_mayor'
    setFormData({
      nombre: prod.nombre || '',
      marca: prod.marca || '',
      sabor: prod.sabor || '',
      unidades_por_paquete: prod.unidades_por_paquete ?? 6,
      precio_unidad: prod.precio_unidad ?? '',
      precio_paquete_menor: prod.precio_paquete_menor ?? '',
      precio_paquete_mayor: prod.precio_paquete_mayor ?? '',
      min_paquetes_mayor: prod.min_paquetes_mayor ?? 5,
      tipo_beneficio_mayor: tipoBeneficio,
      bonif_compra_paquetes: prod.bonif_compra_paquetes || 5,
      bonif_regalo_paquetes: prod.bonif_regalo_paquetes || 2,
      permite_surtido: Boolean(prod.permite_surtido),
      grupo_surtido: prod.grupo_surtido || '',
      imagen_url: prod.imagen_url || '',
      activo: prod.activo !== false,
    })
    setMostrarNuevaMarcaInline(false)
    setNombreNuevaMarcaInline('')
    resetearEstadoImagenModal(prod.imagen_url || '')
    setErrorModal('')
    setModalAbierto(true)
  }

  const manejarArchivoSeleccionado = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setArchivoOriginal(file)
    setArchivoParaSubir(file)
    setFondoRemovido(false)
    const preview = URL.createObjectURL(file)
    setVistaPreviaUrl(preview)
  }

  const ejecutarQuitarFondo = async (usarModeloIA = false) => {
    let fuente = archivoOriginal
    if (!fuente && vistaPreviaUrl) {
      try {
        setProcesandoFondo(true)
        setEstadoProgresoIA('Preparando imagen...')
        const resp = await fetch(vistaPreviaUrl)
        fuente = await resp.blob()
        setArchivoOriginal(fuente)
      } catch {
        setProcesandoFondo(false)
        setErrorModal('Selecciona una imagen desde tu dispositivo para quitarle el fondo.')
        return
      }
    }

    if (!fuente) return

    setProcesandoFondo(true)
    setErrorModal('')
    try {
      const blobSinFondo = await quitarFondoEnNavegador(
        fuente,
        usarModeloIA,
        (msg) => setEstadoProgresoIA(msg)
      )
      setArchivoParaSubir(blobSinFondo)
      setVistaPreviaUrl(URL.createObjectURL(blobSinFondo))
      setFondoRemovido(true)
    } catch (err) {
      console.error('Error al quitar fondo:', err)
      setErrorModal(
        'No se pudo recortar el fondo automáticamente. Puedes guardar la foto original.'
      )
    } finally {
      setProcesandoFondo(false)
      setEstadoProgresoIA('')
    }
  }

  const restaurarFotoOriginal = () => {
    if (!archivoOriginal) return
    setArchivoParaSubir(archivoOriginal)
    setVistaPreviaUrl(URL.createObjectURL(archivoOriginal))
    setFondoRemovido(false)
  }

  const guardarProducto = async (e) => {
    e.preventDefault()
    if (!esAdmin) return

    if (!formData.marca.trim()) {
      setErrorModal('Selecciona o crea una marca para el producto.')
      return
    }

    setGuardando(true)
    setErrorModal('')

    try {
      let urlImagenFinal = formData.imagen_url || null

      if (archivoParaSubir) {
        urlImagenFinal = await subirImagenProductoSupabase(
          archivoParaSubir,
          formData.nombre || 'bebida'
        )
      }

      const marcaFinal = formData.marca.trim()

      const existeEnTabla = marcasTabla.some(
        (m) => m.nombre.trim().toLowerCase() === marcaFinal.toLowerCase()
      )
      if (!existeEnTabla) {
        await supabase
          .from('marcas')
          .insert([{ nombre: marcaFinal, activo: true }])
      }

      const precioMenorNum = parseFloat(formData.precio_paquete_menor) || 0
      const tipoBeneficio = formData.tipo_beneficio_mayor || 'precio_mayor'

      let precioMayorFinal = precioMenorNum
      let minPaqMayorFinal = 1
      let bonifCompraFinal = 0
      let bonifRegaloFinal = 0

      if (tipoBeneficio === 'precio_mayor') {
        precioMayorFinal =
          parseFloat(formData.precio_paquete_mayor) || precioMenorNum
        minPaqMayorFinal = Math.max(
          1,
          parseInt(formData.min_paquetes_mayor, 10) || 5
        )
      } else if (tipoBeneficio === 'bonificacion') {
        precioMayorFinal = precioMenorNum
        bonifCompraFinal = Math.max(
          1,
          parseInt(formData.bonif_compra_paquetes, 10) || 5
        )
        bonifRegaloFinal = Math.max(
          1,
          parseInt(formData.bonif_regalo_paquetes, 10) || 1
        )
        minPaqMayorFinal = bonifCompraFinal
      }

      const permiteSurtidoBool = Boolean(formData.permite_surtido)
      const grupoSurtidoFinal = permiteSurtidoBool ? marcaFinal : null

      const payload = {
        nombre: formData.nombre.trim(),
        marca: marcaFinal,
        sabor: formData.sabor?.trim() || null,
        unidades_por_paquete: Math.max(
          1,
          parseInt(formData.unidades_por_paquete, 10) || 6
        ),
        precio_unidad: parseFloat(formData.precio_unidad) || 0,
        precio_paquete_menor: precioMenorNum,
        precio_paquete_mayor: precioMayorFinal,
        min_paquetes_mayor: minPaqMayorFinal,
        tipo_beneficio_mayor: tipoBeneficio,
        bonif_compra_paquetes: bonifCompraFinal,
        bonif_regalo_paquetes: bonifRegaloFinal,
        permite_surtido: permiteSurtidoBool,
        grupo_surtido: grupoSurtidoFinal,
        imagen_url: urlImagenFinal,
        activo: Boolean(formData.activo),
      }

      if (productoEditando) {
        const { error } = await supabase
          .from('productos')
          .update(payload)
          .eq('id', productoEditando.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('productos').insert([payload])
        if (error) throw error
      }

      setModalAbierto(false)
      await cargarCatalogoEInventario()
    } catch (err) {
      setErrorModal(err.message || 'No se pudo guardar el producto.')
    } finally {
      setGuardando(false)
    }
  }

  const formatearPrecioLimpio = (valor) => {
    const num = Number(valor) || 0
    return `Bs ${num.toLocaleString('es-BO', {
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`
  }

  // Formato inteligente sin redundancia ("10 Paq" si no hay sueltas, o "10 Paq + 2 Bot.")
  const formatearStockCorto = (stockUnidades = 0, unidadesPorPaquete = 6) => {
    const { paquetes, sueltas, deficit } = formatearStock(
      stockUnidades,
      unidadesPorPaquete
    )
    if (deficit > 0) return `-${deficit} bot.`
    if (paquetes === 0 && sueltas === 0) return '0 Paq'
    if (sueltas === 0) return `${paquetes} Paq`
    if (paquetes === 0) return `${sueltas} Bot.`
    return `${paquetes} Paq + ${sueltas} Bot.`
  }

  // Cálculo auxiliar en tiempo real dentro del modal para ayudar al dueño a verificar sus precios
  const costoBotellaEnPaqueteNormal = useMemo(() => {
    const paq = parseFloat(formData.precio_paquete_menor) || 0
    const unid = Math.max(1, parseInt(formData.unidades_por_paquete, 10) || 6)
    if (paq <= 0) return null
    return (paq / unid).toFixed(2)
  }, [formData.precio_paquete_menor, formData.unidades_por_paquete])

  const ahorroPorPaqueteMayorista = useMemo(() => {
    const menor = parseFloat(formData.precio_paquete_menor) || 0
    const mayor = parseFloat(formData.precio_paquete_mayor) || 0
    if (menor > 0 && mayor > 0 && menor > mayor) {
      return (menor - mayor).toFixed(2)
    }
    return null
  }, [formData.precio_paquete_menor, formData.precio_paquete_mayor])

  return (
    <div className="space-y-5 pb-12">
      {/* ================= CABECERA MINIMALISTA (CAJAS DE MARCAS -> BEBIDAS) ================= */}
      <div className="space-y-3.5">
        {/* Fila 1: Título + Contador | Acciones */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Productos y Precios
            </h1>
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500 tabular-nums">
              {mostrarCajasMarcas
                ? `${tarjetasMarcas.length} ${
                    tarjetasMarcas.length === 1 ? 'marca' : 'marcas'
                  }`
                : `${productosFiltrados.length} ${
                    productosFiltrados.length === 1 ? 'bebida' : 'bebidas'
                  }`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={cargarCatalogoEInventario}
              title="Actualizar catálogo"
              className="h-8.5 px-2.5 rounded-lg bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.08] text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Sincronizar</span>
            </button>

            {esAdmin && (
              <>
                <button
                  type="button"
                  onClick={abrirModalGestionMarcas}
                  className="h-8.5 px-3 rounded-lg bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Tag size={14} className="text-amber-500" />
                  <span>Gestionar Marcas</span>
                </button>

                {/* REGLA UX: Solo cuando entras dentro de una Marca aparece el botón para crear productos de esa marca */}
                {marcaSeleccionada && marcaSeleccionada !== 'TODAS' && (
                  <button
                    type="button"
                    onClick={() => abrirModalNuevo(marcaSeleccionada)}
                    className="h-8.5 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                  >
                    <Plus size={15} className="stroke-[2.5]" />
                    <span>Nuevo en {marcaSeleccionada}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Fila 2: Buscador rápido directo + Controles cuando se está dentro de una marca */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative w-full sm:w-80">
            <Search
              size={15}
              className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={
                marcaSeleccionada && marcaSeleccionada !== 'TODAS'
                  ? `Buscar dentro de ${marcaSeleccionada}...`
                  : 'Buscar bebida o sabor directo...'
              }
              className="w-full h-9 pl-9 pr-8 rounded-xl bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 transition"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {!mostrarCajasMarcas && (
            <div className="flex items-center gap-2.5 ml-auto">
              {esAdmin && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mostrarInactivos}
                    onChange={(e) => setMostrarInactivos(e.target.checked)}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span>Inactivos</span>
                </label>
              )}

              <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setModoVista('tarjetas')}
                  title="Vista de tarjetas"
                  className={`h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer ${
                    modoVista === 'tarjetas'
                      ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid size={13} />
                  <span>Tarjetas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModoVista('lista')}
                  title="Vista de tabla rápida de precios"
                  className={`h-7 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer ${
                    modoVista === 'lista'
                      ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <List size={13} />
                  <span>Precios</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Barra de retorno a Marcas cuando el usuario entró a una caja de marca */}
        {!mostrarCajasMarcas && (
          <BrandActiveBar
            marcaActiva={
              marcaSeleccionada || `Resultados para "${busqueda.trim()}"`
            }
            logoUrl={
              marcaSeleccionada && marcaSeleccionada !== 'TODAS'
                ? obtenerLogoDeMarca(marcaSeleccionada, mapaLogosMarcas)
                : ''
            }
            cantidadItems={productosFiltrados.length}
            onVolverMarcas={() => {
              setMarcaSeleccionada(null)
              setBusqueda('')
            }}
          >
            {esAdmin && marcaSeleccionada && marcaSeleccionada !== 'TODAS' && (
              <button
                type="button"
                onClick={() => abrirModalNuevo(marcaSeleccionada)}
                className="h-8.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
              >
                <Plus size={15} className="stroke-[2.5]" />
                <span>Registrar bebida</span>
              </button>
            )}
          </BrandActiveBar>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ================= CONTENIDO PRINCIPAL: NIVEL 1 (CAJAS DE MARCAS) -> NIVEL 2 (BEBIDAS DE LA MARCA) ================= */}
      {cargando ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className="bg-white dark:bg-[#161922] border border-slate-200/70 dark:border-white/[0.06] rounded-2xl p-4 h-44 animate-pulse"
            />
          ))}
        </div>
      ) : mostrarCajasMarcas ? (
        <BrandBoxesGrid
          marcas={tarjetasMarcas}
          onSelectMarca={(nombreMarca) => setMarcaSeleccionada(nombreMarca)}
          onVerTodas={() => setMarcaSeleccionada('TODAS')}
          onCrearMarca={esAdmin ? abrirModalGestionMarcas : null}
          tituloSeccion="Marcas registradas"
          textoVerTodas="Ver todas las bebidas"
        />
      ) : productosFiltrados.length === 0 ? (
        <div className="bg-white dark:bg-[#161922] border border-slate-200/80 dark:border-white/[0.08] rounded-2xl p-10 text-center space-y-3">
          <Package className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {marcaSeleccionada && marcaSeleccionada !== 'TODAS' && !busqueda.trim()
              ? `Aún no hay bebidas registradas en la marca "${marcaSeleccionada}"`
              : 'No se encontraron bebidas con ese criterio'}
          </div>
          {esAdmin &&
          marcaSeleccionada &&
          marcaSeleccionada !== 'TODAS' &&
          !busqueda.trim() ? (
            <button
              type="button"
              onClick={() => abrirModalNuevo(marcaSeleccionada)}
              className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus size={15} className="stroke-[2.5]" />
              <span>Registrar primera bebida de {marcaSeleccionada}</span>
            </button>
          ) : (
            <p className="text-xs text-slate-400">
              Prueba cambiando el texto de búsqueda o vuelve a todas las marcas.
            </p>
          )}
        </div>
      ) : modoVista === 'tarjetas' ? (
        /* ================= MODO 1: GALERÍA EDITORIAL DE TARJETAS (CERO RUIDO VISUAL) ================= */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {productosFiltrados
              .slice(
                (paginaActual - 1) * TAMANO_PROD_TARJETAS,
                paginaActual * TAMANO_PROD_TARJETAS
              )
              .map((prod) => {
            const unidadesPorPaq = Number(prod.unidades_por_paquete) || 6
            const minMayor = Number(prod.min_paquetes_mayor) || 5
            const stocks = stockPorProducto[prod.id] || {
              almacen: 0,
              central: 0,
            }

            const centralSinStock = stocks.central === 0
            const centralStockBajo =
              !centralSinStock && stocks.central < unidadesPorPaq * 2

            const tipoBeneficio = prod.tipo_beneficio_mayor || 'precio_mayor'
            const esFijo = tipoBeneficio === 'ninguno'
            const esBonificacion = tipoBeneficio === 'bonificacion'
            const bonifCompra = Number(prod.bonif_compra_paquetes) || 5
            const bonifRegalo = Number(prod.bonif_regalo_paquetes) || 2

            return (
              <article
                key={prod.id}
                onClick={() => {
                  if (esAdmin) abrirModalEditar(prod)
                }}
                className={`group relative bg-[#F6F5F2] hover:bg-[#EFECE6] rounded-2xl p-4 sm:p-5 transition-all duration-150 flex items-center gap-4 ${
                  esAdmin ? 'cursor-pointer' : ''
                } ${prod.activo === false ? 'opacity-55' : ''}`}
              >
                {/* COLUMNA IZQUIERDA (32% - Botella Protagonista con Sombra Realista) */}
                <div className="w-[32%] shrink-0 flex items-center justify-center">
                  <BottleVisual
                    imagenUrl={prod.imagen_url}
                    nombre={prod.nombre}
                    alturaClass="h-40"
                  />
                </div>

                {/* COLUMNA DERECHA (68% - Jerarquía Tipográfica Limpia) */}
                <div className="w-[68%] min-w-0 flex flex-col justify-between">
                  <div>
                    {/* Línea 1: MARCA • Pack xN + Surtible + Botón Editar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500 truncate">
                        <span className="truncate">{prod.marca || 'BEBIDA'}</span>
                        <span className="text-stone-300 dark:text-slate-600">•</span>
                        <span className="text-stone-600 normal-case tracking-normal font-medium shrink-0">
                          Pack x{unidadesPorPaq}
                        </span>
                        {prod.permite_surtido && (
                          <span
                            title="Permite mezclar sabores de la misma marca en un paquete"
                            className="inline-flex items-center gap-0.5 text-amber-700 normal-case tracking-normal font-semibold shrink-0"
                          >
                            <span>•</span>
                            <Layers className="w-2.5 h-2.5" />
                            <span>Surtible</span>
                          </span>
                        )}
                      </div>

                      {esAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            abrirModalEditar(prod)
                          }}
                          title="Editar producto y precios"
                          className="p-1.5 rounded-lg text-stone-400 group-hover:text-stone-900 dark:group-hover:text-white hover:bg-stone-200/70 dark:hover:bg-white/10 transition cursor-pointer shrink-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Línea 2: Nombre de la Bebida + Sabor limpio (sin repetir la palabra "Sabor:") */}
                    <div className="mt-1 mb-3.5">
                      <h2 className="text-base sm:text-lg font-bold text-stone-900 leading-snug line-clamp-2">
                        {prod.nombre}
                      </h2>
                      {prod.sabor && (
                        <span className="inline-block text-xs font-medium text-stone-500 mt-0.5">
                          {prod.sabor}
                        </span>
                      )}
                    </div>

                    {/* Precios en 3 filas horizontales limpias (Cero cortes de línea) */}
                    <div className="divide-y divide-stone-200/75 dark:divide-white/[0.06] tabular-nums text-xs">
                      <div className="py-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-slate-400">
                          Botella
                        </span>
                        <span className="font-semibold text-stone-700 dark:text-slate-200 whitespace-nowrap">
                          {formatearPrecioLimpio(prod.precio_unidad)}
                        </span>
                      </div>

                      <div className="py-1 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-stone-400 dark:text-slate-400">
                          Paquete
                        </span>
                        <span className="font-bold text-stone-900 dark:text-white whitespace-nowrap">
                          {formatearPrecioLimpio(prod.precio_paquete_menor)}
                        </span>
                      </div>

                      {!esFijo && (
                        <div className="py-1 flex items-center justify-between gap-2">
                          {esBonificacion ? (
                            <>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                Promo
                              </span>
                              <span className="font-extrabold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                {bonifCompra}+{bonifRegalo} Gratis
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                Mayor (+{minMayor} paq)
                              </span>
                              <span className="font-extrabold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                {formatearPrecioLimpio(prod.precio_paquete_mayor)}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Línea 4: Pie de Stock Minimalista (Oculto para preventista) */}
                  {!ocultarStock && (
                    <div className="mt-3.5 pt-2.5 border-t border-stone-200/70 dark:border-white/[0.07] flex items-center justify-between gap-2 text-[11px] tabular-nums">
                      <span
                        title={`Tienda Central: ${stocks.central} botellas en total`}
                        className="inline-flex items-center gap-1.5 text-stone-600"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            centralSinStock || centralStockBajo
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                        <span>
                          Central:{' '}
                          <strong className="text-stone-900 font-semibold">
                            {formatearStockCorto(stocks.central, unidadesPorPaq)}
                          </strong>
                        </span>
                      </span>

                      <span
                        title={`Depósito Principal: ${stocks.almacen} botellas en total`}
                        className="text-stone-500"
                      >
                        Depósito:{' '}
                        <strong className="font-medium text-stone-700">
                          {formatearStockCorto(stocks.almacen, unidadesPorPaq)}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
          </div>
          {productosFiltrados.length > TAMANO_PROD_TARJETAS && (
            <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07]">
              <PaginationBar
                paginaActual={paginaActual}
                totalRegistros={productosFiltrados.length}
                tamanoPagina={TAMANO_PROD_TARJETAS}
                onCambiarPagina={setPaginaActual}
                etiquetaItem="bebidas"
              />
            </div>
          )}
        </div>
      ) : (
        /* ================= MODO 2: TABLA EJECUTIVA DE PRECIOS (LECTURA Y COMPARACIÓN INSTANTÁNEA) ================= */
        <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-white/[0.07] text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-[#11141B]/60">
                  <th className="py-3 pl-4 pr-3">Bebida</th>
                  <th className="py-3 px-3">Marca</th>
                  <th className="py-3 px-3 text-center">Formato</th>
                  <th className="py-3 px-3 text-right">Unidad</th>
                  <th className="py-3 px-3 text-right">Paquete</th>
                  <th className="py-3 px-3 text-right">Escala Mayorista</th>
                  {!ocultarStock && (
                    <th className="py-3 px-3 text-right hidden md:table-cell">
                      Stock Central / Dep.
                    </th>
                  )}
                  {esAdmin && <th className="py-3 pl-2 pr-4 w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs sm:text-sm tabular-nums">
                {productosFiltrados
                  .slice(
                    (paginaActual - 1) * TAMANO_PROD_TABLA,
                    paginaActual * TAMANO_PROD_TABLA
                  )
                  .map((prod) => {
                  const unidadesPorPaq = Number(prod.unidades_por_paquete) || 6
                  const minMayor = Number(prod.min_paquetes_mayor) || 5
                  const tipoBeneficio =
                    prod.tipo_beneficio_mayor || 'precio_mayor'
                  const esFijo = tipoBeneficio === 'ninguno'
                  const esBonificacion = tipoBeneficio === 'bonificacion'
                  const bonifCompra = Number(prod.bonif_compra_paquetes) || 5
                  const bonifRegalo = Number(prod.bonif_regalo_paquetes) || 2
                  const stocks = stockPorProducto[prod.id] || {
                    almacen: 0,
                    central: 0,
                  }

                  return (
                    <tr
                      key={prod.id}
                      onClick={() => {
                        if (esAdmin) abrirModalEditar(prod)
                      }}
                      className={`hover:bg-slate-50/90 dark:hover:bg-white/[0.03] transition ${
                        esAdmin ? 'cursor-pointer' : ''
                      } ${prod.activo === false ? 'opacity-50' : ''}`}
                    >
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-10 rounded-lg bg-[#F6F5F2] flex items-center justify-center shrink-0 overflow-hidden">
                            <BottleVisual
                              imagenUrl={prod.imagen_url}
                              nombre={prod.nombre}
                              alturaClass="h-8"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {prod.nombre}
                            </div>
                            {prod.sabor && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {prod.sabor}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {prod.marca || '—'}
                          </span>
                          {prod.permite_surtido && (
                            <span
                              title="Surtible entre sabores de la marca"
                              className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded"
                            >
                              Surtible
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center text-xs text-slate-500 dark:text-slate-400">
                        x{unidadesPorPaq} bot.
                      </td>

                      <td className="py-2.5 px-3 text-right font-medium text-slate-600 dark:text-slate-300">
                        {formatearPrecioLimpio(prod.precio_unidad)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                        {formatearPrecioLimpio(prod.precio_paquete_menor)}
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {esFijo ? (
                          <span className="text-xs text-slate-400">Fijo</span>
                        ) : esBonificacion ? (
                          <span className="font-bold text-amber-700 dark:text-amber-400">
                            {bonifCompra} + {bonifRegalo} Gratis
                          </span>
                        ) : (
                          <div>
                            <span className="font-extrabold text-amber-700 dark:text-amber-400">
                              {formatearPrecioLimpio(prod.precio_paquete_mayor)}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-1">
                              (+{minMayor} paq)
                            </span>
                          </div>
                        )}
                      </td>

                      {!ocultarStock && (
                        <td className="py-2.5 px-3 text-right text-xs text-slate-500 hidden md:table-cell">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatearStockCorto(stocks.central, unidadesPorPaq)}
                          </span>
                          <span className="mx-1 text-slate-300 dark:text-slate-600">
                            /
                          </span>
                          <span>
                            {formatearStockCorto(stocks.almacen, unidadesPorPaq)}
                          </span>
                        </td>
                      )}

                      {esAdmin && (
                        <td className="py-2.5 pl-2 pr-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              abrirModalEditar(prod)
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            paginaActual={paginaActual}
            totalRegistros={productosFiltrados.length}
            tamanoPagina={TAMANO_PROD_TABLA}
            onCambiarPagina={setPaginaActual}
            etiquetaItem="bebidas"
          />
        </div>
      )}

      {/* ================= MODAL 1: GESTIONAR MARCAS (DISEÑO LIMPIO) ================= */}
      {esAdmin && modalMarcasAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-md w-full overflow-hidden">
            {/* Cabecera limpia sin ruido */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Tag size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Marcas de Bebidas
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Al renombrar una marca se actualizan sus productos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalMarcasAbierto(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {errorModalMarcas && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorModalMarcas}</span>
                </div>
              )}

              {exitoModalMarcas && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{exitoModalMarcas}</span>
                </div>
              )}

              {/* Input oculto para subir/cambiar logo de una marca ya creada */}
              <input
                ref={logoExistenteInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file && marcaObjetivoLogo) {
                    subirYAsignarLogoAMarcaExistente(marcaObjetivoLogo, file, false)
                  }
                  e.target.value = ''
                }}
                className="hidden"
              />

              {/* Formulario rápido para agregar marca + Logo opcional */}
              <form
                onSubmit={agregarNuevaMarca}
                className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.08] space-y-2.5"
              >
                <div className="flex gap-2">
                  <input
                    ref={nuevoLogoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        seleccionarArchivoNuevoLogo(e.target.files[0])
                      }
                      e.target.value = ''
                    }}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => nuevoLogoInputRef.current?.click()}
                    title="Subir logo opcional de la marca"
                    className="h-9 px-2.5 rounded-lg bg-white dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 hover:border-amber-500 text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition"
                  >
                    {nuevoLogoPreview ? (
                      <img
                        src={nuevoLogoPreview}
                        alt="Logo"
                        className="h-5 w-8 object-contain"
                      />
                    ) : (
                      <>
                        <ImageIcon size={14} className="text-amber-500" />
                        <span>Logo</span>
                      </>
                    )}
                  </button>

                  <input
                    type="text"
                    value={nuevaMarcaInput}
                    onChange={(e) => setNuevaMarcaInput(e.target.value)}
                    placeholder="Nueva marca (ej. Huari, Coca-Cola)..."
                    className="flex-1 h-9 px-3 rounded-lg bg-white dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-xs sm:text-sm text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none min-w-0"
                  />

                  <button
                    type="submit"
                    disabled={procesandoMarca || !nuevaMarcaInput.trim()}
                    className="h-9 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1 shrink-0 transition cursor-pointer disabled:opacity-50"
                  >
                    <Plus size={15} className="stroke-[2.5]" />
                    <span>Crear</span>
                  </button>
                </div>

                {nuevoLogoPreview && (
                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">
                      Logo listo para guardar
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={procesandoFondoLogoNuevo}
                        onClick={quitarFondoLogoNuevo}
                        className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Wand2 size={11} />
                        <span>
                          {procesandoFondoLogoNuevo
                            ? 'Quitando...'
                            : 'Quitar fondo blanco'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNuevoLogoBlob(null)
                          setNuevoLogoPreview('')
                        }}
                        className="text-slate-400 hover:text-red-500 cursor-pointer"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                )}
              </form>

              {/* Lista de marcas con su Logo Oficial o botón para subirlo */}
              <div className="border border-slate-200/80 dark:border-white/[0.08] rounded-xl divide-y divide-slate-100 dark:divide-white/[0.06] overflow-hidden max-h-80 overflow-y-auto">
                {marcasTabla.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No hay marcas registradas todavía.
                  </div>
                ) : (
                  marcasTabla.map((m) => {
                    const cantProds = conteoProductosPorMarca[m.nombre] || 0
                    const estaEditando = marcaEditandoId === m.id
                    const logoActual =
                      m.logo_url || obtenerLogoDeMarca(m.nombre, mapaLogosMarcas)
                    const estaSubiendoEsteLogo = subiendoLogoDeMarca === m.nombre

                    return (
                      <div
                        key={m.id}
                        className={`px-3 py-2.5 flex items-center justify-between gap-2 bg-white dark:bg-[#161922] hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition ${
                          m.activo === false ? 'opacity-55' : ''
                        }`}
                      >
                        {estaEditando ? (
                          <div className="flex-1 flex items-center gap-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={marcaEditandoNombre}
                              onChange={(e) =>
                                setMarcaEditandoNombre(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  guardarEdicionMarca(m)
                                } else if (e.key === 'Escape') {
                                  setMarcaEditandoId(null)
                                }
                              }}
                              className="flex-1 h-8 px-2.5 rounded-lg bg-white dark:bg-[#1A1E29] border border-amber-500 text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={procesandoMarca}
                              onClick={() => guardarEdicionMarca(m)}
                              className="h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMarcaEditandoId(null)}
                              className="h-8 px-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-xs cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2.5 min-w-0">
                              {/* Botón / Miniatura de Logo de Marca */}
                              <button
                                type="button"
                                disabled={Boolean(estaSubiendoEsteLogo)}
                                onClick={() => {
                                  setMarcaObjetivoLogo(m.nombre)
                                  logoExistenteInputRef.current?.click()
                                }}
                                title={
                                  logoActual
                                    ? 'Cambiar logo de esta marca'
                                    : 'Subir logo oficial de esta marca'
                                }
                                className="w-11 h-9 rounded-lg bg-slate-50 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/10 hover:border-amber-500 flex items-center justify-center shrink-0 overflow-hidden transition cursor-pointer"
                              >
                                {estaSubiendoEsteLogo ? (
                                  <RefreshCw
                                    size={13}
                                    className="animate-spin text-amber-500"
                                  />
                                ) : logoActual ? (
                                  <img
                                    src={logoActual}
                                    alt={m.nombre}
                                    className="max-h-7 max-w-[36px] object-contain"
                                  />
                                ) : (
                                  <ImageIcon
                                    size={14}
                                    className="text-slate-400 hover:text-amber-500"
                                  />
                                )}
                              </button>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {m.nombre}
                                  </span>
                                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                    ({cantProds})
                                  </span>
                                  {m.activo === false && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                      Inactiva
                                    </span>
                                  )}
                                </div>
                                {logoActual ? (
                                  <div className="flex items-center gap-2 text-[10px] mt-0.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        recortarFondoLogoDeMarcaExistente(
                                          m.nombre,
                                          logoActual
                                        )
                                      }
                                      className="text-amber-600 dark:text-amber-400 hover:underline font-semibold cursor-pointer"
                                    >
                                      Quitar fondo
                                    </button>
                                    <span className="text-slate-300 dark:text-slate-600">
                                      ·
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        quitarLogoDeMarcaExistente(m.nombre)
                                      }
                                      className="text-slate-400 hover:text-red-500 cursor-pointer"
                                    >
                                      Sin logo
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMarcaObjetivoLogo(m.nombre)
                                      logoExistenteInputRef.current?.click()
                                    }}
                                    className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-medium cursor-pointer"
                                  >
                                    + Subir logo
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {m.activo !== false && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMarcaSeleccionada(m.nombre)
                                    setModalMarcasAbierto(false)
                                  }}
                                  title="Entrar a esta marca para ver o registrar sus productos"
                                  className="h-7 px-2 rounded-lg bg-amber-500/12 hover:bg-amber-500 text-amber-700 dark:text-amber-300 hover:text-slate-950 text-[11px] font-bold transition cursor-pointer"
                                >
                                  Entrar →
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setMarcaEditandoId(m.id)
                                  setMarcaEditandoNombre(m.nombre)
                                  setErrorModalMarcas('')
                                  setExitoModalMarcas('')
                                }}
                                title="Renombrar marca"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                disabled={procesandoMarca}
                                onClick={() => eliminarODesactivarMarca(m)}
                                title={
                                  cantProds === 0
                                    ? 'Eliminar marca'
                                    : m.activo === false
                                    ? 'Reactivar marca'
                                    : 'Archivar marca'
                                }
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL 2: CREAR / EDITAR PRODUCTO Y PRECIOS (DISEÑO SENIOR CERO RUIDO) ================= */}
      {esAdmin && modalAbierto && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xl max-w-xl w-full overflow-hidden">
            {/* Cabecera limpia del modal */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {productoEditando ? 'Editar Producto y Precios' : 'Nuevo Producto'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Configura presentación, fotografía y escala de precios
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={guardarProducto}
              className="p-5 sm:p-6 space-y-5 max-h-[84vh] overflow-y-auto"
            >
              {errorModal && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorModal}</span>
                </div>
              )}

              {/* SECCIÓN 1: FOTO A LA IZQUIERDA + IDENTIDAD DEL PRODUCTO A LA DERECHA */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                {/* Estudio compacto de Fotografía (4 cols) */}
                <div className="sm:col-span-4 flex flex-col items-center space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        manejarArchivoSeleccionado(e.target.files[0])
                      }
                    }}
                    className="hidden"
                  />

                  <div
                    onDragOver={(e) => {
                      e.preventDefault()
                      setArrastrandoArchivo(true)
                    }}
                    onDragLeave={() => setArrastrandoArchivo(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setArrastrandoArchivo(false)
                      if (e.dataTransfer.files?.[0]) {
                        manejarArchivoSeleccionado(e.dataTransfer.files[0])
                      }
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full h-40 rounded-2xl border border-dashed flex flex-col items-center justify-center relative overflow-hidden cursor-pointer transition ${
                      arrastrandoArchivo
                        ? 'border-amber-500 bg-amber-50/40'
                        : 'border-slate-300 dark:border-white/15 bg-[#F6F5F2] hover:border-slate-400'
                    }`}
                  >
                    {vistaPreviaUrl ? (
                      <img
                        src={vistaPreviaUrl}
                        alt="Vista previa"
                        className="h-34 w-auto object-contain drop-shadow-[0_14px_12px_rgba(0,0,0,0.22)]"
                      />
                    ) : (
                      <div className="text-center p-3 space-y-1">
                        <Upload className="w-5 h-5 text-slate-400 mx-auto" />
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Subir foto
                        </div>
                        <div className="text-[10px] text-slate-400">
                          JPG, PNG o WebP
                        </div>
                      </div>
                    )}

                    {procesandoFondo && (
                      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center p-2 text-center text-white">
                        <Sparkles className="w-5 h-5 text-amber-400 animate-spin mb-1" />
                        <span className="text-[11px] font-semibold">
                          {estadoProgresoIA || 'Quitando fondo...'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Acciones rápidas de imagen debajo del recuadro */}
                  {vistaPreviaUrl ? (
                    <div className="w-full space-y-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={procesandoFondo}
                          onClick={() => ejecutarQuitarFondo(false)}
                          title="Recortar fondo blanco/claro al instante"
                          className="flex-1 h-7.5 px-2 rounded-lg bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 text-[11px] font-bold inline-flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50"
                        >
                          <Wand2 size={12} />
                          <span>Quitar fondo</span>
                        </button>
                        <button
                          type="button"
                          disabled={procesandoFondo}
                          onClick={() => ejecutarQuitarFondo(true)}
                          title="Quitar fondo complejo con IA"
                          className="h-7.5 px-2 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[11px] font-bold inline-flex items-center gap-0.5 transition cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles size={11} />
                          <span>IA</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between px-0.5 text-[11px]">
                        {fondoRemovido && archivoOriginal ? (
                          <button
                            type="button"
                            onClick={restaurarFotoOriginal}
                            className="text-slate-500 hover:text-slate-800 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw size={11} />
                            <span>Original</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                          >
                            Cambiar
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            resetearEstadoImagenModal('')
                            setFormData((prev) => ({ ...prev, imagen_url: '' }))
                          }}
                          className="text-slate-400 hover:text-red-500 cursor-pointer"
                        >
                          Quitar foto
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Campos Principales (8 cols) */}
                <div className="sm:col-span-8 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Nombre de la bebida *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Lix 400ml, Ron Abuelo 750ml"
                      value={formData.nombre}
                      onChange={(e) =>
                        setFormData({ ...formData, nombre: e.target.value })
                      }
                      className="w-full h-9.5 px-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Marca: Fijada automáticamente a la marca activa al crear nuevo producto */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                          Marca *
                        </label>
                        {productoEditando && (
                          <button
                            type="button"
                            onClick={() =>
                              setMostrarNuevaMarcaInline((prev) => !prev)
                            }
                            className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            {mostrarNuevaMarcaInline ? 'Cancelar' : '+ Nueva'}
                          </button>
                        )}
                      </div>

                      {!productoEditando ? (
                        <div className="w-full h-9.5 px-3 rounded-lg bg-amber-500/10 border border-amber-500/35 flex items-center gap-2">
                          {obtenerLogoDeMarca(
                            formData.marca,
                            mapaLogosMarcas
                          ) ? (
                            <img
                              src={obtenerLogoDeMarca(
                                formData.marca,
                                mapaLogosMarcas
                              )}
                              alt={formData.marca}
                              className="h-5 w-auto max-w-[44px] object-contain shrink-0"
                            />
                          ) : (
                            <Tag
                              size={13}
                              className="text-amber-600 dark:text-amber-400 shrink-0"
                            />
                          )}
                          <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                            {formData.marca}
                          </span>
                        </div>
                      ) : mostrarNuevaMarcaInline ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={nombreNuevaMarcaInline}
                            onChange={(e) =>
                              setNombreNuevaMarcaInline(e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                crearMarcaAlVuelo()
                              }
                            }}
                            placeholder="Ej. Huari"
                            className="w-full h-9.5 px-2.5 rounded-lg bg-white dark:bg-[#1A1E29] border border-amber-500 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={
                              creandoMarcaInline ||
                              !nombreNuevaMarcaInline.trim()
                            }
                            onClick={crearMarcaAlVuelo}
                            className="h-9.5 px-2.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold shrink-0 cursor-pointer disabled:opacity-50"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <select
                          required
                          value={formData.marca}
                          onChange={(e) =>
                            setFormData({ ...formData, marca: e.target.value })
                          }
                          className="w-full h-9.5 px-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                        >
                          <option value="" disabled>
                            Seleccionar...
                          </option>
                          {opcionesSelectMarca.map((nombreMarca) => (
                            <option key={nombreMarca} value={nombreMarca}>
                              {nombreMarca}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Botellas por paquete */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                        Botellas por paquete *
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={formData.unidades_por_paquete}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            unidades_por_paquete: e.target.value,
                          })
                        }
                        className="w-full h-9.5 px-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-semibold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Sabor */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Sabor o variedad{' '}
                      <span className="text-slate-400 font-normal">
                        (opcional)
                      </span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Manzana, Uva, Durazno, Tradicional..."
                      value={formData.sabor}
                      onChange={(e) =>
                        setFormData({ ...formData, sabor: e.target.value })
                      }
                      className="w-full h-9.5 px-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* SECCIÓN 2: ESQUEMA DE PRECIOS Y REGLA MAYORISTA (LIMPIO, INTUITIVO Y CON CÁLCULO EN VIVO) */}
              <div className="pt-3 border-t border-slate-100 dark:border-white/[0.07] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Estructura de Precios (Bs)
                  </span>
                  {costoBotellaEnPaqueteNormal && (
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      En paquete cada botella sale a{' '}
                      <strong className="text-slate-600 dark:text-slate-300">
                        Bs {costoBotellaEnPaqueteNormal}
                      </strong>
                    </span>
                  )}
                </div>

                {/* Precios Base: Unidad Suelta y Paquete Normal */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Precio Unidad (Botella) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        value={formData.precio_unidad}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            precio_unidad: e.target.value,
                          })
                        }
                        className="w-full h-10 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Precio Paquete (x{formData.unidades_por_paquete || 6}) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                        Bs
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        value={formData.precio_paquete_menor}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            precio_paquete_menor: e.target.value,
                          })
                        }
                        className="w-full h-10 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                {/* Selector de Regla Mayorista (Segmented Control limpio) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Beneficio por compra mayorista
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#11141B] border border-slate-200/60 dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          tipo_beneficio_mayor: 'precio_mayor',
                        })
                      }
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        formData.tipo_beneficio_mayor === 'precio_mayor'
                          ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      Precio Mayorista
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          tipo_beneficio_mayor: 'bonificacion',
                        })
                      }
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        formData.tipo_beneficio_mayor === 'bonificacion'
                          ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      Paquetes Gratis
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          tipo_beneficio_mayor: 'ninguno',
                        })
                      }
                      className={`py-2 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        formData.tipo_beneficio_mayor === 'ninguno'
                          ? 'bg-white dark:bg-[#1E2230] text-slate-900 dark:text-white shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      Precio Único
                    </button>
                  </div>

                  {/* Opción A: Precio Mayorista */}
                  {formData.tipo_beneficio_mayor === 'precio_mayor' && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          Precio Paquete Mayorista *
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-amber-600 dark:text-amber-400 pointer-events-none">
                            Bs
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            placeholder="0.00"
                            value={formData.precio_paquete_mayor}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                precio_paquete_mayor: e.target.value,
                              })
                            }
                            className="w-full h-10 pl-8 pr-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-amber-300 dark:border-amber-500/40 text-sm font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          A partir de cuántos paquetes *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={formData.min_paquetes_mayor}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              min_paquetes_mayor: e.target.value,
                            })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                        />
                      </div>

                      {ahorroPorPaqueteMayorista && (
                        <div className="col-span-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                          ✓ El cliente ahorra Bs {ahorroPorPaqueteMayorista} por
                          paquete comprando desde {formData.min_paquetes_mayor || 5}{' '}
                          paquetes.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Opción B: Bonificación en Paquetes Gratis */}
                  {formData.tipo_beneficio_mayor === 'bonificacion' && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          Comprando (paquetes) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={formData.bonif_compra_paquetes}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bonif_compra_paquetes: e.target.value,
                            })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          Recibe GRATIS (paquetes) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={formData.bonif_regalo_paquetes}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bonif_regalo_paquetes: e.target.value,
                            })
                          }
                          className="w-full h-10 px-3 rounded-lg bg-slate-50 dark:bg-[#1A1E29] border border-amber-300 dark:border-amber-500/40 text-sm font-bold text-slate-900 dark:text-white focus:border-amber-500 focus:outline-none tabular-nums"
                        />
                      </div>

                      <div className="col-span-2 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                        ✓ Por cada {formData.bonif_compra_paquetes || 5} paquetes
                        se agregan +{formData.bonif_regalo_paquetes || 2} paquetes
                        a Bs 0 automáticamente.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* SECCIÓN 3: OPCIONES DE SURTIDO Y ESTADO (EN UNA SOLA FRANJA LIMPIA) */}
              <div className="pt-3 border-t border-slate-100 dark:border-white/[0.07] space-y-2.5">
                <label className="flex items-center justify-between gap-3 py-1 cursor-pointer select-none">
                  <div>
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Permitir armar paquetes surtidos entre sabores
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Se agrupa con los demás sabores de{' '}
                      <strong>{formData.marca || 'la misma marca'}</strong>
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.permite_surtido)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setFormData((prev) => ({
                        ...prev,
                        permite_surtido: checked,
                        grupo_surtido: checked ? prev.marca || '' : '',
                      }))
                    }}
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 py-1 cursor-pointer select-none">
                  <div>
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Producto disponible en catálogo de ventas
                    </span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      Desactívalo si temporalmente no se comercializa
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.activo}
                    onChange={(e) =>
                      setFormData({ ...formData, activo: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                </label>
              </div>

              {/* PIE DE ACCIONES DEL MODAL */}
              <div className="pt-3 border-t border-slate-100 dark:border-white/[0.08] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="h-9.5 px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando || procesandoFondo}
                  className="h-9.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {guardando
                      ? 'Guardando...'
                      : productoEditando
                      ? 'Guardar Cambios'
                      : 'Crear Producto'}
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
