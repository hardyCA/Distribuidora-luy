import React, { useState } from 'react'

/**
 * Componente de protagonismo visual para la botella:
 * - Si el producto tiene `imagen_url`, muestra la botella recortada con sombra realista
 *   proyectada detrás (`drop-shadow-[0_18px_16px_rgba(0,0,0,0.22)]`) y zoom sutil en hover.
 * - Si aún no tiene foto, muestra una silueta editorial minimalista en tono ámbar/piedra.
 */
export default function BottleVisual({
  imagenUrl,
  nombre,
  alturaClass = 'h-44',
}) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="relative w-full h-full flex items-center justify-center py-3 px-2 select-none">
      {/* Halo / pedestal sutil en la base */}
      <div className="absolute bottom-3 w-20 h-3.5 rounded-full bg-stone-900/8 blur-[5px] pointer-events-none" />

      {imagenUrl && !imgError ? (
        <img
          src={imagenUrl}
          alt={nombre || 'Botella'}
          loading="lazy"
          decoding="async"
          onError={() => setImgError(true)}
          className={`${alturaClass} w-full object-contain drop-shadow-[0_18px_16px_rgba(0,0,0,0.22)] group-hover:scale-105 transition-transform duration-300`}
        />
      ) : (
        /* Silueta minimalista y elegante de botella en tono ámbar/piedra */
        <div
          className={`${alturaClass} flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-300 drop-shadow-[0_14px_12px_rgba(28,25,23,0.14)]`}
        >
          <svg
            viewBox="0 0 80 200"
            className="h-full w-auto"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Cápsula / Tapa superior */}
            <rect
              x="31"
              y="8"
              width="18"
              height="14"
              rx="3"
              className="fill-amber-600/85"
            />
            {/* Cuello de la botella */}
            <path
              d="M33 22H47L49 58H31L33 22Z"
              className="fill-stone-300/90"
            />
            {/* Cuerpo estilizado de la botella */}
            <path
              d="M31 58C21 68 16 78 16 94V178C16 185.732 22.268 192 30 192H50C57.732 192 64 185.732 64 178V94C64 78 59 68 49 58H31Z"
              className="fill-stone-300/85 stroke-stone-400/50"
              strokeWidth="1.5"
            />
            {/* Brillo lateral de cristal */}
            <path
              d="M23 92C23 82 26 74 32 66"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeOpacity="0.65"
            />
            <line
              x1="22"
              y1="102"
              x2="22"
              y2="174"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeOpacity="0.45"
            />
            {/* Etiqueta editorial minimalista en el centro */}
            <rect
              x="21"
              y="104"
              width="38"
              height="48"
              rx="4"
              className="fill-[#FAF9F6] stroke-amber-500/40"
              strokeWidth="1"
            />
            <line
              x1="28"
              y1="120"
              x2="52"
              y2="120"
              className="stroke-amber-600/80"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="32"
              y1="130"
              x2="48"
              y2="130"
              className="stroke-stone-400"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <line
              x1="35"
              y1="138"
              x2="45"
              y2="138"
              className="stroke-stone-300"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
    </div>
  )
}
