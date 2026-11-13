import React, { useState, useEffect, useMemo } from 'react'
import {
  Layers,
  Plus,
  Minus,
  CheckCircle2,
  Sparkles,
  X,
  Trash2,
} from 'lucide-react'
import BottleVisual from './BottleVisual'
import {
  obtenerGrupoSurtido,
  obtenerTipoBeneficio,
  nombreConSabor,
} from '../utils/surtidoHelper'

export default function ModalSurtidoSabores({
  abierto,
  onClose,
  grupoSurtido,
  productos = [],
  stockCentralMap = null,
  paquetesCerradosEnCarrito = 0,
  surtidoExistente = null,
  onGuardarSurtido,
  onEliminarSurtido,
}) {
  // Todos los sabores activos que pertenecen a este `grupo_surtido`
  const saboresDelGrupo = useMemo(() => {
    if (!grupoSurtido) return []
    return productos.filter(
      (p) => p.activo !== false && obtenerGrupoSurtido(p) === grupoSurtido
    )
  }, [productos, grupoSurtido])

  const prodReferencia = saboresDelGrupo[0] || null
  const unidadesPorPaquete = Number(prodReferencia?.unidades_por_paquete) || 6
  const minMayor = Number(prodReferencia?.min_paquetes_mayor) || 5
  const precioMenor = Number(prodReferencia?.precio_paquete_menor) || 0
  const precioMayor = Number(prodReferencia?.precio_paquete_mayor) || precioMenor
  const tipoBeneficio = obtenerTipoBeneficio(prodReferencia)

  const [paquetesASurtir, setPaquetesASurtir] = useState(1)
  const [botellasPorSabor, setBotellasPorSabor] = useState({})

  useEffect(() => {
    if (!abierto || !grupoSurtido) return
    if (surtidoExistente && Number(surtidoExistente.paquetes) > 0) {
      setPaquetesASurtir(Number(surtidoExistente.paquetes))
      setBotellasPorSabor({ ...(surtidoExistente.botellasPorProducto || {}) })
    } else {
      setPaquetesASurtir(1)
      setBotellasPorSabor({})
    }
  }, [abierto, grupoSurtido, surtidoExistente])

  if (!abierto || !grupoSurtido || !prodReferencia) return null

  const metaBotellas = paquetesASurtir * unidadesPorPaquete
  const botellasSeleccionadas = Object.values(botellasPorSabor).reduce(
    (acc, v) => acc + (Number(v) || 0),
    0
  )
  const botellasFaltantes = metaBotellas - botellasSeleccionadas
  const estaCompleto = botellasSeleccionadas === metaBotellas

  // Evaluar si aplica escala mayorista sumando paquetes cerrados del grupo + paquetes a surtir
  const totalPaquetesGrupoCombinado =
    (Number(paquetesCerradosEnCarrito) || 0) + paquetesASurtir
  const aplicaMayorista =
    tipoBeneficio === 'precio_mayor' && totalPaquetesGrupoCombinado >= minMayor
  const precioPaqueteActivo = aplicaMayorista ? precioMayor : precioMenor
  const totalBsSurtido = paquetesASurtir * precioPaqueteActivo

  const cambiarPaquetesASurtir = (nuevoValor) => {
    const val = Math.max(1, parseInt(nuevoValor, 10) || 1)
    setPaquetesASurtir(val)
  }

  const cambiarBotellasSabor = (prodId, nuevoValor) => {
    const num = Math.max(0, parseInt(nuevoValor, 10) || 0)
    setBotellasPorSabor((prev) => {
      const copia = { ...prev }
      if (num <= 0) {
        delete copia[prodId]
      } else {
        copia[prodId] = num
      }
      return copia
    })
  }

  const completarRestoEnSabor = (prodId) => {
    if (botellasFaltantes <= 0) return
    const actual = Number(botellasPorSabor[prodId]) || 0
    cambiarBotellasSabor(prodId, actual + botellasFaltantes)
  }

  const repartirEquitativo = () => {
    if (saboresDelGrupo.length === 0) return
    const n = saboresDelGrupo.length
    const base = Math.floor(metaBotellas / n)
    let resto = metaBotellas % n
    const nuevoMapa = {}
    saboresDelGrupo.forEach((s) => {
      const asignar = base + (resto > 0 ? 1 : 0)
      if (resto > 0) resto--
      if (asignar > 0) nuevoMapa[s.id] = asignar
    })
    setBotellasPorSabor(nuevoMapa)
  }

  const formatearBs = (n) => {
    const val = Number(n) || 0
    return `Bs ${val.toLocaleString('es-BO', {
      minimumFractionDigits: val % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`
  }

  const confirmarSurtido = () => {
    if (!estaCompleto) return
    onGuardarSurtido(grupoSurtido, {
      paquetes: paquetesASurtir,
      botellasPorProducto: botellasPorSabor,
    })
    onClose()
  }

  const porcentajeProgreso = Math.min(
    100,
    Math.round((botellasSeleccionadas / Math.max(1, metaBotellas)) * 100)
  )

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-[#161922] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold truncate">
                Armar Paquetes Surtidos — {grupoSurtido}
              </h3>
              <p className="text-[11px] text-slate-300 truncate">
                Pack x{unidadesPorPaquete} botellas · Mezcla sabores al mismo
                precio de paquete
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Selector superior: Cantidad de paquetes a surtir */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#11141B] border border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                Cantidad de paquetes a surtir
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {paquetesASurtir}{' '}
                {paquetesASurtir === 1 ? 'paquete' : 'paquetes'} ={' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {metaBotellas} botellas
                </strong>{' '}
                por elegir
                {paquetesCerradosEnCarrito > 0 && (
                  <span>
                    {' '}
                    · (+{paquetesCerradosEnCarrito} paq. cerrados en carrito ={' '}
                    {totalPaquetesGrupoCombinado} paq. del grupo)
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => cambiarPaquetesASurtir(paquetesASurtir - 1)}
                className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                min="1"
                value={paquetesASurtir}
                onChange={(e) => cambiarPaquetesASurtir(e.target.value)}
                className="w-12 h-8 text-center rounded-lg bg-white dark:bg-[#1A1E29] border border-slate-200 dark:border-white/10 text-sm font-extrabold text-slate-900 dark:text-white tabular-nums focus:outline-none"
              />
              <button
                type="button"
                onClick={() => cambiarPaquetesASurtir(paquetesASurtir + 1)}
                className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Indicador de Progreso */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span
                className={`font-bold ${
                  estaCompleto
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : botellasFaltantes < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                Seleccionadas: {botellasSeleccionadas} / {metaBotellas} botellas (
                {paquetesASurtir}{' '}
                {paquetesASurtir === 1 ? 'paquete completo' : 'paquetes completos'}
                )
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={repartirEquitativo}
                  className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Repartir equitativo
                </button>
                {botellasSeleccionadas > 0 && (
                  <button
                    type="button"
                    onClick={() => setBotellasPorSabor({})}
                    className="text-[11px] font-medium text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Reiniciar
                  </button>
                )}
              </div>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  estaCompleto
                    ? 'bg-emerald-500'
                    : botellasFaltantes < 0
                    ? 'bg-red-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${porcentajeProgreso}%` }}
              />
            </div>

            {botellasFaltantes > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                Elige {botellasFaltantes}{' '}
                {botellasFaltantes === 1 ? 'botella más' : 'botellas más'} para
                completar el paquete surtido.
              </p>
            )}
            {botellasFaltantes < 0 && (
              <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold">
                Te pasaste por {Math.abs(botellasFaltantes)} botella(s). Resta{' '}
                {Math.abs(botellasFaltantes)} o aumenta la cantidad de paquetes.
              </p>
            )}
          </div>

          {/* Lista de sabores activos del grupo */}
          <div className="divide-y divide-slate-100 dark:divide-white/10 border border-slate-200/80 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-[#1A1E29]">
            {saboresDelGrupo.map((prod) => {
              const cantBot = Number(botellasPorSabor[prod.id]) || 0
              const mostrarStockCentral = stockCentralMap !== null
              const stockCentral = mostrarStockCentral
                ? Number(stockCentralMap[prod.id]) || 0
                : 0

              return (
                <div
                  key={prod.id}
                  className={`p-3 flex items-center justify-between gap-3 transition ${
                    cantBot > 0
                      ? 'bg-amber-50/50 dark:bg-amber-500/10'
                      : 'hover:bg-slate-50/70 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-12 rounded-lg bg-[#F6F5F2] flex items-center justify-center shrink-0 p-1">
                      <BottleVisual
                        imagenUrl={prod.imagen_url}
                        nombre={prod.nombre}
                        alturaClass="h-10"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                          {nombreConSabor(prod)}
                        </span>
                        {prod.sabor && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300">
                            {prod.sabor}
                          </span>
                        )}
                      </div>
                      {mostrarStockCentral && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              stockCentral > 0 ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          <span>Stock Central: {stockCentral} bot.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {botellasFaltantes > 0 && (
                      <button
                        type="button"
                        onClick={() => completarRestoEnSabor(prod.id)}
                        title={`Asignar las ${botellasFaltantes} botellas restantes a este sabor`}
                        className="hidden sm:inline-flex px-2 py-1 rounded-md bg-slate-100 dark:bg-white/10 hover:bg-amber-500/20 text-[10px] font-semibold text-slate-600 dark:text-slate-300 transition cursor-pointer"
                      >
                        +{botellasFaltantes}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => cambiarBotellasSabor(prod.id, cantBot - 1)}
                      className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={cantBot || ''}
                      placeholder="0"
                      onChange={(e) =>
                        cambiarBotellasSabor(prod.id, e.target.value)
                      }
                      className="w-10 h-7 text-center bg-transparent text-xs font-extrabold text-slate-900 dark:text-white tabular-nums focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={botellasFaltantes <= 0}
                      onClick={() => cambiarBotellasSabor(prod.id, cantBot + 1)}
                      className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-amber-500 text-amber-400 dark:text-slate-950 flex items-center justify-center cursor-pointer disabled:opacity-35"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pie del Modal: Resumen de Precio y Botón Confirmar */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#11141B] border-t border-slate-200/80 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
              <span>Total Surtido: {formatearBs(totalBsSurtido)}</span>
              <span className="text-slate-400 font-normal">
                ({formatearBs(precioPaqueteActivo)} / paq)
              </span>
            </div>
            {aplicaMayorista ? (
              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>
                  Escala Mayorista activa ({totalPaquetesGrupoCombinado} paq. en
                  total del grupo)
                </span>
              </div>
            ) : tipoBeneficio === 'precio_mayor' ? (
              <div className="text-[11px] text-slate-500">
                Mayorista ({formatearBs(precioMayor)}/paq) desde {minMayor}{' '}
                paquetes del grupo
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            {surtidoExistente && onEliminarSurtido && (
              <button
                type="button"
                onClick={() => {
                  onEliminarSurtido(grupoSurtido)
                  onClose()
                }}
                className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Quitar</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-200/70 dark:bg-white/10 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={!estaCompleto}
              onClick={confirmarSurtido}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 hover:bg-slate-800 dark:hover:bg-amber-400 text-amber-400 dark:text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Agregar Paquete Surtido</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
