import React, { useState } from 'react'
import { Sparkles, Boxes, ShieldCheck, ArrowRight, Eye } from 'lucide-react'
import { useRole } from '../context/RoleContext'
import { formatearStock } from '../utils/stock'

export default function PlaceholderPage({
  title,
  subtitle,
  icon: Icon,
  moduleCode,
  features = [],
  readOnlyForAlmacen = false,
}) {
  const { rolActual, infoRol, usuarioActual } = useRole()
  const [ejemploBotellas, setEjemploBotellas] = useState(53)
  const [ejemploUnidadesPorPaquete, setEjemploUnidadesPorPaquete] = useState(6)

  const esModoSoloLectura = readOnlyForAlmacen && rolActual === 'almacen'
  const stockCalculado = formatearStock(ejemploBotellas, ejemploUnidadesPorPaquete)

  return (
    <div className="space-y-6">
      {/* Tarjeta Principal del Módulo (Placeholder elegante estilo Linear / Fintech) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/70">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-sm shrink-0">
              {Icon ? <Icon className="w-6 h-6" /> : <Boxes className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 border border-amber-500/20">
                  {moduleCode || 'Módulo Listo'}
                </span>
                {esModoSoloLectura && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-blue-500/15 text-blue-800 border border-blue-400/30">
                    <Eye className="w-3 h-3" />
                    Modo Solo Lectura de Stock (Rol Almacén)
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
                {title}
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end text-xs text-slate-500 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200/80 shrink-0">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <span>Acceso: {infoRol.label}</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5">
              Operador: {usuarioActual?.nombre}
            </span>
          </div>
        </div>

        {/* Estado de Preparación del Paso 2 */}
        <div className="py-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-lg">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Vista base configurada — Lista para programar en los siguientes pasos</span>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Esta ruta ya cuenta con diseño responsive (Sidebar en Desktop y Barra Inferior
              adaptada al pulgar en Celular), control de permisos para el rol{' '}
              <strong className="text-slate-900">{rolActual}</strong> y conexión activa con
              Supabase y Dexie.js.
            </p>

            {features.length > 0 && (
              <div className="pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Funcionalidades previstas para esta pantalla:
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {features.map((feat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 text-xs font-medium text-slate-700"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mini Widget de Prueba del Helper `formatearStock` del Paso 2 */}
          <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Helper Activo: formatearStock()
              </span>
              <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                src/utils/stock.js
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Total Unidades
                </label>
                <input
                  type="number"
                  min="0"
                  value={ejemploBotellas}
                  onChange={(e) => setEjemploBotellas(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Unid. / Paquete
                </label>
                <input
                  type="number"
                  min="1"
                  value={ejemploUnidadesPorPaquete}
                  onChange={(e) => setEjemploUnidadesPorPaquete(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-900"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 text-white space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Resultado Formateado
              </div>
              <div className="text-sm font-bold text-amber-400">
                {stockCalculado.texto}
              </div>
              <div className="text-[11px] text-slate-300 font-mono">
                {`{ paquetes: ${stockCalculado.paquetes}, sueltas: ${stockCalculado.sueltas} }`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
