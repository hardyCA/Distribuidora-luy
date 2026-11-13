/**
 * Utilidades para cálculo de Escalas Mayoristas, Bonificaciones Automáticas (Ej. 5 + 2 Gratis)
 * y Paquetes Surtidos por Sabores (Ej. Lix 400ml: 3 Manzana + 3 Uva).
 */

export function obtenerGrupoSurtido(prod) {
  if (!prod || !prod.permite_surtido) return null
  return (
    (prod.marca && prod.marca.trim()) ||
    (prod.grupo_surtido && prod.grupo_surtido.trim()) ||
    'Surtido General'
  )
}

export function obtenerTipoBeneficio(prod) {
  const t = prod?.tipo_beneficio_mayor
  if (t === 'bonificacion' || t === 'ninguno' || t === 'precio_mayor') {
    return t
  }
  return 'precio_mayor'
}

export function nombreConSabor(prod) {
  if (!prod) return 'Bebida'
  const base = prod.nombre || 'Bebida'
  const sabor = prod.sabor?.trim()
  if (!sabor) return base
  if (base.toLowerCase().includes(sabor.toLowerCase())) return base
  return `${base} (${sabor})`
}

/**
 * Calcula el resumen completo del carrito (para PreventaPage y CajaCentralPage):
 * - Suma todos los paquetes del mismo `grupo_surtido` (paquetes cerrados + paquetes surtidos)
 *   para evaluar si se activa el precio mayorista en todo el grupo.
 * - Genera automáticamente las filas `bono_promocion` (Bs 0) cuando `tipo_beneficio_mayor === 'bonificacion'`.
 * - Genera las filas `paquete_surtido` por cada sabor elegido con ajuste exacto de centavos.
 * - Valida el stock total requerido por producto (incluyendo bonificaciones y surtidos) si se provee `stockCentralMap`.
 */
export function calcularResumenCarritoIntegral({
  productos = [],
  cantidadesPorProducto = {},
  paquetesSurtidos = {},
  stockCentralMap = null,
}) {
  const detalles = []
  let totalBs = 0
  let ahorroMayoristaBs = 0
  let totalPaquetes = 0
  let totalPaquetesGratis = 0
  let totalBotellasSueltas = 0

  // 1. Calcular el total de paquetes acumulados por `grupo_surtido` (cerrados + surtidos)
  const paquetesPorGrupo = {}

  productos.forEach((prod) => {
    const grupo = obtenerGrupoSurtido(prod)
    if (!grupo) return
    const cantCerrados = Number(cantidadesPorProducto[prod.id]?.paquetes) || 0
    if (cantCerrados > 0) {
      paquetesPorGrupo[grupo] = (paquetesPorGrupo[grupo] || 0) + cantCerrados
    }
  })

  Object.entries(paquetesSurtidos || {}).forEach(([grupoKey, surtidoObj]) => {
    const cantSurtidos = Number(surtidoObj?.paquetes) || 0
    if (cantSurtidos > 0) {
      paquetesPorGrupo[grupoKey] = (paquetesPorGrupo[grupoKey] || 0) + cantSurtidos
    }
  })

  // Mapa para validar stock total de botellas requeridas por `producto_id`
  const botellasRequeridasPorProducto = {}
  const sumarBotellasRequeridas = (prodId, botellas) => {
    const cant = Number(botellas) || 0
    if (cant <= 0) return
    botellasRequeridasPorProducto[prodId] =
      (botellasRequeridasPorProducto[prodId] || 0) + cant
  }

  // 2. Procesar paquetes cerrados y botellas sueltas individuales
  productos.forEach((prod) => {
    const cant = cantidadesPorProducto[prod.id]
    if (!cant) return

    const unidPorPaq = Number(prod.unidades_por_paquete) || 6
    const minMayor = Number(prod.min_paquetes_mayor) || 5
    const precioMenor = Number(prod.precio_paquete_menor) || 0
    const precioMayor = Number(prod.precio_paquete_mayor) || precioMenor
    const precioUnidad = Number(prod.precio_unidad) || 0
    const tipoBeneficio = obtenerTipoBeneficio(prod)
    const bonifCompra = Number(prod.bonif_compra_paquetes) || 0
    const bonifRegalo = Number(prod.bonif_regalo_paquetes) || 0
    const grupo = obtenerGrupoSurtido(prod)
    const nombreMostrar = nombreConSabor(prod)

    // Total de paquetes a evaluar para la escala (del grupo si es surtible, o del producto individual)
    const paquetesParaEscala = grupo
      ? paquetesPorGrupo[grupo] || cant.paquetes
      : cant.paquetes

    // 2.1 Paquetes cerrados de un solo sabor
    if (cant.paquetes > 0) {
      const esMayorista =
        tipoBeneficio === 'precio_mayor' && paquetesParaEscala >= minMayor
      const precioAplicado = esMayorista ? precioMayor : precioMenor
      const subtotal = Number((cant.paquetes * precioAplicado).toFixed(2))

      if (esMayorista && precioMenor > precioMayor) {
        ahorroMayoristaBs += cant.paquetes * (precioMenor - precioMayor)
      }

      totalPaquetes += cant.paquetes
      totalBs += subtotal

      const botellasVendidas = cant.paquetes * unidPorPaq
      sumarBotellasRequeridas(prod.id, botellasVendidas)

      // Calcular si le falta poco para bonificación
      let avisoBonificacion = null
      let paquetesGratis = 0

      if (tipoBeneficio === 'bonificacion' && bonifCompra > 0 && bonifRegalo > 0) {
        paquetesGratis = Math.floor(cant.paquetes / bonifCompra) * bonifRegalo
        const resto = cant.paquetes % bonifCompra
        const faltan = bonifCompra - resto
        if (faltan > 0 && faltan <= bonifCompra) {
          avisoBonificacion = `Falta ${faltan} paq. para recibir +${bonifRegalo} paq. gratis`
        }
      }

      detalles.push({
        id_linea: `${prod.id}-paquete`,
        producto_id: prod.id,
        producto_nombre: nombreMostrar,
        producto_sabor: prod.sabor || null,
        producto_marca: prod.marca,
        unidades_por_paquete: unidPorPaq,
        tipo_venta: 'paquete',
        cantidad: cant.paquetes,
        unidades_totales_descontar: botellasVendidas,
        precio_aplicado: precioAplicado,
        subtotal,
        es_mayorista: esMayorista,
        escala_aplicada: esMayorista
          ? grupo && paquetesParaEscala > cant.paquetes
            ? `Mayorista (${grupo})`
            : 'Mayorista'
          : 'Paq. Menor',
        nota_surtido: null,
        aviso_bonificacion: avisoBonificacion,
      })

      // 2.2 Si aplica Bonificación Automática (`bono_promocion`), insertar sub-línea Bs 0
      if (paquetesGratis > 0) {
        const botellasGratis = paquetesGratis * unidPorPaq
        totalPaquetesGratis += paquetesGratis
        sumarBotellasRequeridas(prod.id, botellasGratis)

        detalles.push({
          id_linea: `${prod.id}-bono_promocion`,
          producto_id: prod.id,
          producto_nombre: nombreMostrar,
          producto_sabor: prod.sabor || null,
          producto_marca: prod.marca,
          unidades_por_paquete: unidPorPaq,
          tipo_venta: 'bono_promocion',
          cantidad: paquetesGratis,
          unidades_totales_descontar: botellasGratis,
          precio_aplicado: 0,
          subtotal: 0,
          es_mayorista: false,
          es_bonificacion: true,
          escala_aplicada: `Bonif. ${bonifCompra}+${bonifRegalo} Gratis`,
          nota_surtido: `Bonificación ${bonifCompra}+${bonifRegalo} Gratis (${paquetesGratis} paq.)`,
        })
      }
    }

    // 2.3 Botellas sueltas
    if (cant.sueltas > 0) {
      const subtotal = Number((cant.sueltas * precioUnidad).toFixed(2))
      totalBotellasSueltas += cant.sueltas
      totalBs += subtotal
      sumarBotellasRequeridas(prod.id, cant.sueltas)

      detalles.push({
        id_linea: `${prod.id}-unidad`,
        producto_id: prod.id,
        producto_nombre: nombreMostrar,
        producto_sabor: prod.sabor || null,
        producto_marca: prod.marca,
        unidades_por_paquete: unidPorPaq,
        tipo_venta: 'unidad',
        cantidad: cant.sueltas,
        unidades_totales_descontar: cant.sueltas,
        precio_aplicado: precioUnidad,
        subtotal,
        es_mayorista: false,
        escala_aplicada: 'Bot. Suelta',
        nota_surtido: null,
      })
    }
  })

  // 3. Procesar Paquetes Surtidos por Sabores (`tipo_venta = 'paquete_surtido'`)
  Object.entries(paquetesSurtidos || {}).forEach(([grupoKey, surtidoObj]) => {
    const cantPaqSurtidos = Number(surtidoObj?.paquetes) || 0
    const botellasMap = surtidoObj?.botellasPorProducto || {}
    if (cantPaqSurtidos <= 0) return

    // Sabores con botellas > 0 dentro de este paquete surtido
    const saboresElegidos = productos.filter(
      (p) => (Number(botellasMap[p.id]) || 0) > 0
    )
    if (saboresElegidos.length === 0) return

    const prodRef = saboresElegidos[0]
    const unidPorPaq = Number(prodRef.unidades_por_paquete) || 6
    const minMayor = Number(prodRef.min_paquetes_mayor) || 5
    const precioMenor = Number(prodRef.precio_paquete_menor) || 0
    const precioMayor = Number(prodRef.precio_paquete_mayor) || precioMenor
    const tipoBeneficio = obtenerTipoBeneficio(prodRef)
    const bonifCompra = Number(prodRef.bonif_compra_paquetes) || 0
    const bonifRegalo = Number(prodRef.bonif_regalo_paquetes) || 0

    const totalPaquetesGrupo = paquetesPorGrupo[grupoKey] || cantPaqSurtidos
    const esMayoristaGrupo =
      tipoBeneficio === 'precio_mayor' && totalPaquetesGrupo >= minMayor
    const precioPaqueteAplicado = esMayoristaGrupo ? precioMayor : precioMenor

    if (esMayoristaGrupo && precioMenor > precioMayor) {
      ahorroMayoristaBs += cantPaqSurtidos * (precioMenor - precioMayor)
    }

    const subtotalObjetivoSurtido = Number(
      (cantPaqSurtidos * precioPaqueteAplicado).toFixed(2)
    )
    const totalBotellasDelSurtido = cantPaqSurtidos * unidPorPaq

    totalPaquetes += cantPaqSurtidos
    totalBs += subtotalObjetivoSurtido

    let sumaSubtotalesParcial = 0

    saboresElegidos.forEach((prodSabor, idx) => {
      const botellasSabor = Number(botellasMap[prodSabor.id]) || 0
      sumarBotellasRequeridas(prodSabor.id, botellasSabor)

      const precioUnitarioSurtido = Number(
        (precioPaqueteAplicado / unidPorPaq).toFixed(4)
      )

      let subtotalSabor = 0
      if (idx < saboresElegidos.length - 1) {
        subtotalSabor = Number(
          ((precioPaqueteAplicado / unidPorPaq) * botellasSabor).toFixed(2)
        )
        sumaSubtotalesParcial = Number(
          (sumaSubtotalesParcial + subtotalSabor).toFixed(2)
        )
      } else {
        // Ajuste exacto de centavos en el último sabor para cuadrar al 100% con el precio del paquete
        subtotalSabor = Number(
          (subtotalObjetivoSurtido - sumaSubtotalesParcial).toFixed(2)
        )
      }

      detalles.push({
        id_linea: `${prodSabor.id}-surtido-${grupoKey}`,
        producto_id: prodSabor.id,
        producto_nombre: nombreConSabor(prodSabor),
        producto_sabor: prodSabor.sabor || null,
        producto_marca: prodSabor.marca,
        unidades_por_paquete: unidPorPaq,
        tipo_venta: 'paquete_surtido',
        cantidad: botellasSabor,
        unidades_totales_descontar: botellasSabor,
        precio_aplicado: precioUnitarioSurtido,
        subtotal: subtotalSabor,
        es_mayorista: esMayoristaGrupo,
        escala_aplicada: esMayoristaGrupo ? 'Surtido Mayorista' : 'Paq. Surtido',
        grupo_surtido: grupoKey,
        paquetes_surtidos_grupo: cantPaqSurtidos,
        nota_surtido: `Paq. Surtido ${grupoKey} (${botellasSabor} de ${totalBotellasDelSurtido})`,
      })
    })

    // Si el grupo surtido tiene bonificación por paquetes comprados
    if (tipoBeneficio === 'bonificacion' && bonifCompra > 0 && bonifRegalo > 0) {
      const paqGratisSurtido =
        Math.floor(cantPaqSurtidos / bonifCompra) * bonifRegalo
      if (paqGratisSurtido > 0) {
        const botGratis = paqGratisSurtido * unidPorPaq
        totalPaquetesGratis += paqGratisSurtido
        sumarBotellasRequeridas(prodRef.id, botGratis)

        detalles.push({
          id_linea: `${prodRef.id}-bono_promocion-surtido-${grupoKey}`,
          producto_id: prodRef.id,
          producto_nombre: nombreConSabor(prodRef),
          producto_sabor: prodRef.sabor || null,
          producto_marca: prodRef.marca,
          unidades_por_paquete: unidPorPaq,
          tipo_venta: 'bono_promocion',
          cantidad: paqGratisSurtido,
          unidades_totales_descontar: botGratis,
          precio_aplicado: 0,
          subtotal: 0,
          es_mayorista: false,
          es_bonificacion: true,
          escala_aplicada: `Bonif. ${bonifCompra}+${bonifRegalo} Gratis`,
          nota_surtido: `Bonificación ${bonifCompra}+${bonifRegalo} Gratis (${paqGratisSurtido} paq.)`,
        })
      }
    }
  })

  // 4. Si se provee `stockCentralMap`, verificar alertas de stock insuficiente en Tienda Central
  const alertasSinStock = []
  if (stockCentralMap) {
    Object.entries(botellasRequeridasPorProducto).forEach(
      ([prodId, totalBotReq]) => {
        const disponible = Number(stockCentralMap[prodId]) || 0
        if (totalBotReq > disponible) {
          const prodObj = productos.find((p) => String(p.id) === String(prodId))
          alertasSinStock.push(
            `${nombreConSabor(prodObj)}: requiere ${totalBotReq} bot. y en Tienda Central hay ${disponible} bot.`
          )
        }
      }
    )
  }

  return {
    detalles,
    totalBs: Number(totalBs.toFixed(2)),
    ahorroMayoristaBs: Number(ahorroMayoristaBs.toFixed(2)),
    totalPaquetes,
    totalPaquetesGratis,
    totalBotellasSueltas,
    paquetesPorGrupo,
    alertasSinStock,
    cantidadLineas: detalles.length,
  }
}
