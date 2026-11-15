import React, { useState } from 'react'
import { ArrowLeft, Plus, Check, ChevronRight, Layers } from 'lucide-react'

function BrandBoxCard({ item, onSelectMarca }) {
  const [logoError, setLogoError] = useState(false)
  const tieneSeleccionActiva = Boolean(item.badgeActivo)
  const mostrarLogo = Boolean(item.logoUrl) && !logoError

  return (
    <button
      type="button"
      onClick={() => onSelectMarca(item.nombre)}
      className={`group relative text-left rounded-2xl p-4 sm:p-4.5 min-h-[144px] sm:min-h-[160px] transition-all duration-150 flex flex-col justify-between cursor-pointer border ${
        tieneSeleccionActiva
          ? 'bg-amber-500/[0.09] dark:bg-amber-500/[0.12] border-amber-500/75 ring-1 ring-amber-500/30 shadow-xs'
          : 'bg-white dark:bg-[#161922] border-slate-200/85 dark:border-white/[0.08] hover:border-amber-500/55 dark:hover:border-amber-400/50 hover:bg-slate-50/40 dark:hover:bg-[#1B1F2B] hover:shadow-sm'
      }`}
    >
      {/* Insignias superiores (Carrito activo o alerta de stock) */}
      {(item.badgeActivo || item.alertaTexto) && (
        <div className="absolute top-3 right-3 z-20">
          {item.badgeActivo ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500 text-slate-950 text-[11px] font-extrabold shadow-xs tabular-nums">
              <Check size={11} className="stroke-[3]" />
              <span>{item.badgeActivo}</span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold tabular-nums ${
                item.alertaTipo === 'danger'
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
              }`}
            >
              {item.alertaTexto}
            </span>
          )}
        </div>
      )}

      {/* PROTAGONISTA CENTRAL: Logo Oficial de la Marca (si existe) O Nombre Grande Tipográfico (CERO botellas) */}
      {mostrarLogo ? (
        <div className="flex-1 w-full rounded-xl bg-slate-50/90 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/[0.05] flex items-center justify-center px-3 py-3 min-h-[82px] sm:min-h-[92px] overflow-hidden">
          <img
            src={item.logoUrl}
            alt={item.nombre}
            onError={() => setLogoError(true)}
            className="max-h-14 sm:max-h-18 max-w-[85%] w-auto object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center px-2 pt-3 pb-2">
          <span className="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 leading-tight line-clamp-2 transition-colors">
            {item.nombre}
          </span>
        </div>
      )}

      {/* Pie limpio: Detalle y flecha táctil */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between gap-2">
        <div className="min-w-0">
          {mostrarLogo && (
            <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {item.nombre}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              {item.cantidadProductos}{' '}
              {item.cantidadProductos === 1 ? 'bebida' : 'bebidas'}
            </span>
            {item.subtituloExtra && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {item.subtituloExtra}
                </span>
              </>
            )}
            {item.permiteSurtido && (
              <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold">
                <Layers size={11} />
                <span>Surtible</span>
              </span>
            )}
          </div>
        </div>

        <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/[0.06] group-hover:bg-amber-500 group-hover:text-slate-950 text-slate-400 dark:text-slate-400 flex items-center justify-center shrink-0 transition">
          <ChevronRight size={15} />
        </span>
      </div>
    </button>
  )
}

/**
 * Grilla de Cajas de Marcas (Nivel 1: Cajas de Marcas con Logo o Nombre Grande -> Nivel 2: Bebidas de esa Marca).
 * Cero botellas en las cajas de marcas para máxima limpieza visual.
 */
export function BrandBoxesGrid({
  marcas = [],
  onSelectMarca,
  onVerTodas,
  onCrearMarca,
  columnasClass = 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
  tituloSeccion = 'Selecciona una marca',
  textoVerTodas = 'Ver todas juntas',
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {tituloSeccion} ({marcas.length})
        </span>

        {onVerTodas && marcas.length > 0 && (
          <button
            type="button"
            onClick={onVerTodas}
            className="text-xs font-semibold text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition cursor-pointer"
          >
            {textoVerTodas} →
          </button>
        )}
      </div>

      <div className={`grid ${columnasClass} gap-3 sm:gap-3.5`}>
        {marcas.map((item) => (
          <BrandBoxCard
            key={item.nombre}
            item={item}
            onSelectMarca={onSelectMarca}
          />
        ))}

        {/* Caja especial para crear una nueva marca directo desde la grilla (solo Admin en Productos) */}
        {onCrearMarca && (
          <button
            type="button"
            onClick={onCrearMarca}
            className="group rounded-2xl p-4 border-2 border-dashed border-slate-300/90 dark:border-white/15 hover:border-amber-500 dark:hover:border-amber-400 bg-slate-50/60 dark:bg-white/[0.02] hover:bg-amber-500/[0.06] transition flex flex-col items-center justify-center text-center min-h-[144px] sm:min-h-[160px] gap-2.5 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 group-hover:bg-amber-500 text-amber-600 dark:text-amber-400 group-hover:text-slate-950 flex items-center justify-center transition">
              <Plus size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Nueva Marca
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Nombre y logo opcional
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Barra superior limpia cuando el usuario entró dentro de una Marca (o eligió "Ver todas").
 * Permite regresar a las Cajas de Marcas con 1 solo toque cómodo del pulgar.
 */
export function BrandActiveBar({
  marcaActiva,
  logoUrl = '',
  cantidadItems = 0,
  onVolverMarcas,
  children,
}) {
  const esTodas = marcaActiva === 'TODAS'
  const [logoErr, setLogoErr] = useState(false)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 sm:px-3.5 rounded-2xl bg-white dark:bg-[#161922] border border-slate-200/85 dark:border-white/[0.08]">
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onVolverMarcas}
          className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-white/[0.07] dark:hover:bg-white/[0.13] text-slate-800 dark:text-white text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer shrink-0"
        >
          <ArrowLeft size={15} className="text-amber-500 stroke-[2.5]" />
          <span>Marcas</span>
        </button>

        {!esTodas && logoUrl && !logoErr && (
          <div className="h-8 px-2 rounded-lg bg-slate-50 dark:bg-white/[0.05] border border-slate-200/70 dark:border-white/[0.07] flex items-center justify-center shrink-0">
            <img
              src={logoUrl}
              alt={marcaActiva}
              onError={() => setLogoErr(true)}
              className="max-h-5.5 max-w-[68px] w-auto object-contain"
            />
          </div>
        )}

        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
            {esTodas ? 'Todas las Marcas' : marcaActiva}
          </h2>
          <span className="text-xs font-medium text-slate-400 tabular-nums shrink-0">
            {cantidadItems} {cantidadItems === 1 ? 'bebida' : 'bebidas'}
          </span>
        </div>
      </div>

      {children && (
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {children}
        </div>
      )}
    </div>
  )
}
