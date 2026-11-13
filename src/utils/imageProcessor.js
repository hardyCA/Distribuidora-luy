/**
 * Utilidad para eliminar el fondo de la foto de una botella 100% en el navegador:
 * 1) Procesador inteligente por inundación de bordes (Flood-Fill + Feathering en HTML5 Canvas)
 *    ideal para fotos de botellas sobre fondos claros/neutros en menos de 150ms.
 * 2) Integración con IA `@imgly/background-removal` para fondos complejos.
 */

export async function quitarFondoEnNavegador(fileOrBlob, usarIA = false, onProgreso = null) {
  if (usarIA) {
    try {
      if (onProgreso) onProgreso('Cargando modelo IA de recorte...')
      const { removeBackground } = await import('@imgly/background-removal')
      const resultadoBlob = await removeBackground(fileOrBlob, {
        progress: (key, current, total) => {
          if (onProgreso && total > 0) {
            const pct = Math.round((current / total) * 100)
            onProgreso(`Procesando con IA (${pct}%)...`)
          }
        },
      })
      return resultadoBlob
    } catch (err) {
      console.warn('Fallback a recorte inteligente en Canvas:', err)
    }
  }

  if (onProgreso) onProgreso('Recortando silueta de la botella...')
  return await recortarFondoCanvasInteligente(fileOrBlob)
}

/**
 * Algoritmo de recorte desde los bordes exteriores (Flood-Fill con suavizado de bordes alpha)
 * Mantiene intactas las etiquetas blancas internas de la botella porque solo elimina el fondo
 * conectado al borde exterior de la imagen.
 */
export function recortarFondoCanvasInteligente(fileOrBlob, tolerancia = 42) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const objectUrl = URL.createObjectURL(fileOrBlob)

    img.onload = () => {
      try {
        const maxDim = 900
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height

        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const imgData = ctx.getImageData(0, 0, width, height)
        const data = imgData.data

        // Muestrear el color de fondo predominante en las 4 esquinas
        const esquinas = [
          [0, 0],
          [width - 1, 0],
          [0, height - 1],
          [width - 1, height - 1],
          [Math.floor(width / 2), 0],
        ]

        let rBg = 0
        let gBg = 0
        let bBg = 0
        esquinas.forEach(([x, y]) => {
          const idx = (y * width + x) * 4
          rBg += data[idx]
          gBg += data[idx + 1]
          bBg += data[idx + 2]
        })
        rBg = Math.round(rBg / esquinas.length)
        gBg = Math.round(gBg / esquinas.length)
        bBg = Math.round(bBg / esquinas.length)

        const visitado = new Uint8Array(width * height)
        const cola = new Int32Array(width * height)
        let head = 0
        let tail = 0

        const agregarSiBorde = (x, y) => {
          const pos = y * width + x
          if (!visitado[pos]) {
            visitado[pos] = 1
            cola[tail++] = pos
          }
        }

        // Sembrar todos los bordes exteriores de la imagen
        for (let x = 0; x < width; x++) {
          agregarSiBorde(x, 0)
          agregarSiBorde(x, height - 1)
        }
        for (let y = 0; y < height; y++) {
          agregarSiBorde(0, y)
          agregarSiBorde(width - 1, y)
        }

        const distanciaColor = (idx) => {
          const dr = data[idx] - rBg
          const dg = data[idx + 1] - gBg
          const db = data[idx + 2] - bBg
          return Math.sqrt(dr * dr + dg * dg + db * db)
        }

        const umbralDuro = tolerancia
        const umbralSuave = tolerancia * 1.45

        while (head < tail) {
          const pos = cola[head++]
          const idx = pos * 4
          const dist = distanciaColor(idx)

          if (dist <= umbralSuave) {
            if (dist <= umbralDuro) {
              data[idx + 3] = 0 // 100% transparente
            } else {
              // Borde suavizado (anti-aliasing natural)
              const factor = (dist - umbralDuro) / (umbralSuave - umbralDuro)
              data[idx + 3] = Math.round(data[idx + 3] * factor)
            }

            const x = pos % width
            const y = (pos - x) / width

            if (x > 0) agregarSiBorde(x - 1, y)
            if (x < width - 1) agregarSiBorde(x + 1, y)
            if (y > 0) agregarSiBorde(x, y - 1)
            if (y < height - 1) agregarSiBorde(x, y + 1)
          }
        }

        ctx.putImageData(imgData, 0, 0)
        URL.revokeObjectURL(objectUrl)

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('No se pudo generar el PNG sin fondo'))
          },
          'image/png',
          0.95
        )
      } catch (e) {
        URL.revokeObjectURL(objectUrl)
        reject(e)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('No se pudo leer la imagen seleccionada'))
    }

    img.src = objectUrl
  })
}
