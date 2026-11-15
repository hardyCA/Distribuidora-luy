import React from 'react'
import { Minus, Plus, X, Gift } from 'lucide-react'

function formatearBsCorto(n) {
  const val = Number(n) || 0
  return `Bs ${val.toLocaleString('es-BO', {
    minimumFractionDigits: val % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatearResumenUnidadesPedido({
  totalPaquetes = 0,
  totalPaquetesGratis = 0,
  totalBotellasSueltas = 0,
}) {
  const partes = []
  if (totalPaquetes > 0) {
    partes.push(
      `${totalPaquetes} Paq${
        totalPaquetesGratis > 0 ? ` (+${totalPaquetesGratis} gratis)` : ''
      }`
    )
  } else if (totalPaquetesGratis > 0) {
    partes.push(`+${totalPaquetesGratis} Paq gratis`)
  }
  if (totalBotellasSueltas > 0) {
    partes.push(`${totalBotellasSueltas} Bot`)
  }
  return partes.join(' + ') || '0 items'
}

/**
 * Tabla ultra limpia y sin ruido visual para el resumen del pedido (Preventa y Caja Central).
 * Permite leer de un vistazo: Producto | Formato y Cantidad (- / +) | Subtotal | Quitar.
 */
export default function OrderSummaryTable({
  detalles = [],
  onCambiarCantidad,
  onQuitarLinea,
  onEditarSurtido,
  maxHeightClass = 'max-h-80',
}) {
  return (
    <div className="rounded-xl border border-slate-200/85 dark:border-white/[0.08] overflow-hidden bg-slate-50/40 dark:bg-[#11141B]/70">
      <div className={`${maxHeightClass} overflow-y-auto`}>
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-[#191D28] border-b border-slate-200/80 dark:border-white/[0.08]">
            <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="py-2 pl-3 pr-2">Bebida</th>
              <th className="py-2 px-2 text-center">Cant.</th>
              <th className="py-2 pl-2 pr-1 text-right">Subtotal</th>
              <th className="py-2 pr-2 w-6" />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/60 dark:divide-white/[0.06] text-xs tabular-nums">
            {detalles.map((item) => {
              const esBonificacion = item.tipo_venta === 'bono_promocion'
              const esSurtido = item.tipo_venta === 'paquete_surtido'
              const esPaquete = item.tipo_venta === 'paquete'
              const campoAjuste = esPaquete ? 'paquetes' : 'sueltas'

              if (esBonificacion) {
                return (
                  <tr
                    key={item.id_linea}
                    className="bg-amber-500/[0.08] dark:bg-amber-500/[0.10]"
                  >
                    <td className="py-2 pl-3 pr-2">
                      <div className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                        <Gift size={12} className="shrink-0" />
                        <span className="truncate">{item.producto_nombre}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                      +{item.cantidad} Paq Gratis
                    </td>
                    <td className="py-2 pl-2 pr-1 text-right font-extrabold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                      Bs 0
                    </td>
                    <td className="py-2 pr-2" />
                  </tr>
                )
              }

              return (
                <tr
                  key={item.id_linea}
                  className="bg-white dark:bg-[#141821] hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
                >
                  {/* Columna 1: Bebida + Etiqueta clara de Formato + Precio unitario */}
                  <td className="py-2.5 pl-3 pr-2 align-middle">
                    <div className="font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                      {item.producto_nombre}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
                      <span
                        className={`px-1.5 py-0.2 rounded font-bold ${
                          esPaquete
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : esSurtido
                            ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                            : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        }`}
                      >
                        {esPaquete
                          ? `Paq x${item.unidades_por_paquete}`
                          : esSurtido
                          ? 'Surtido'
                          : 'Botella'}
                      </span>

                      <span className="text-slate-400 dark:text-slate-400">
                        {formatearBsCorto(item.precio_aplicado)}
                      </span>

                      {item.es_mayorista && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                          · Mayor
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Columna 2: Control directo de Cantidad (- N +) */}
                  <td className="py-2.5 px-1.5 align-middle text-center">
                    {esSurtido ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                          {item.cantidad} bot
                        </span>
                        {onEditarSurtido && item.grupo_surtido && (
                          <button
                            type="button"
                            onClick={() => onEditarSurtido(item.grupo_surtido)}
                            className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    ) : onCambiarCantidad ? (
                      <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-white/[0.06] rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            onCambiarCantidad(
                              item.producto_id,
                              campoAjuste,
                              item.cantidad - 1
                            )
                          }
                          className="w-6 h-6 rounded-md hover:bg-white dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center transition cursor-pointer"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="min-w-[20px] text-center font-extrabold text-slate-900 dark:text-white">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onCambiarCantidad(
                              item.producto_id,
                              campoAjuste,
                              item.cantidad + 1
                            )
                          }
                          className="w-6 h-6 rounded-md bg-amber-500/20 hover:bg-amber-500 text-amber-700 dark:text-amber-300 hover:text-slate-950 flex items-center justify-center transition cursor-pointer"
                        >
                          <Plus size={11} className="stroke-[2.5]" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {item.cantidad}
                      </span>
                    )}
                  </td>

                  {/* Columna 3: Subtotal alineado */}
                  <td className="py-2.5 pl-1 pr-1 align-middle text-right font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                    {formatearBsCorto(item.subtotal)}
                  </td>

                  {/* Columna 4: Quitar fila */}
                  <td className="py-2.5 pr-2 align-middle text-right">
                    {onQuitarLinea && (
                      <button
                        type="button"
                        onClick={() => onQuitarLinea(item)}
                        title="Quitar del pedido"
                        className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
