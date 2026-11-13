import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Barra de paginación minimalista y sin ruido visual (Light & Dark Mode).
 * Se oculta automáticamente si todo cabe en una sola página (a menos que `mostrarSiempre` sea true).
 */
export default function PaginationBar({
  paginaActual = 1,
  totalRegistros = 0,
  tamanoPagina = 20,
  onCambiarPagina,
  cargando = false,
  etiquetaItem = 'registros',
  mostrarSiempre = false,
}) {
  const totalPaginas = Math.max(
    1,
    Math.ceil((Number(totalRegistros) || 0) / Math.max(1, tamanoPagina))
  )

  if (!mostrarSiempre && totalPaginas <= 1) {
    return null
  }

  const paginaSegura = Math.min(Math.max(1, paginaActual), totalPaginas)
  const desde =
    totalRegistros === 0 ? 0 : (paginaSegura - 1) * tamanoPagina + 1
  const hasta = Math.min(paginaSegura * tamanoPagina, totalRegistros)

  // Construir botones compactos de páginas (ej: 1 ... 4 5 6 ... 12)
  const construirPaginas = () => {
    if (totalPaginas <= 5) {
      return Array.from({ length: totalPaginas }, (_, i) => i + 1)
    }
    const items = [1]
    const inicio = Math.max(2, paginaSegura - 1)
    const fin = Math.min(totalPaginas - 1, paginaSegura + 1)

    if (inicio > 2) items.push('...')
    for (let p = inicio; p <= fin; p += 1) {
      items.push(p)
    }
    if (fin < totalPaginas - 1) items.push('...')
    items.push(totalPaginas)
    return items
  }

  const paginas = construirPaginas()

  return (
    <div className="px-4 py-3 border-t border-slate-200/70 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs tabular-nums select-none">
      <span className="text-slate-400 dark:text-slate-500">
        Mostrando{' '}
        <strong className="font-semibold text-slate-700 dark:text-slate-300">
          {desde}–{hasta}
        </strong>{' '}
        de{' '}
        <strong className="font-semibold text-slate-700 dark:text-slate-300">
          {totalRegistros}
        </strong>{' '}
        {etiquetaItem}
      </span>

      {totalPaginas > 1 && (
        <div className="flex items-center gap-1 self-end sm:self-auto">
          <button
            type="button"
            disabled={cargando || paginaSegura <= 1}
            onClick={() => onCambiarPagina?.(paginaSegura - 1)}
            className="h-7.5 px-2.5 rounded-lg bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center gap-1 font-medium transition cursor-pointer disabled:opacity-35 disabled:pointer-events-none"
          >
            <ChevronLeft size={13} />
            <span>Anterior</span>
          </button>

          <div className="hidden xs:flex sm:flex items-center gap-1">
            {paginas.map((item, idx) =>
              item === '...' ? (
                <span
                  key={`dots-${idx}`}
                  className="px-1.5 text-slate-400 dark:text-slate-600"
                >
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  disabled={cargando}
                  onClick={() => onCambiarPagina?.(item)}
                  className={`min-w-7.5 h-7.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    item === paginaSegura
                      ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </div>

          <span className="sm:hidden px-2 text-slate-500 dark:text-slate-400 font-semibold">
            {paginaSegura} / {totalPaginas}
          </span>

          <button
            type="button"
            disabled={cargando || paginaSegura >= totalPaginas}
            onClick={() => onCambiarPagina?.(paginaSegura + 1)}
            className="h-7.5 px-2.5 rounded-lg bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center gap-1 font-medium transition cursor-pointer disabled:opacity-35 disabled:pointer-events-none"
          >
            <span>Siguiente</span>
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
