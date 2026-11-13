import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Construye el documento jsPDF para Cotización, Nota de Preventa, Nota de Entrega (Día 2) o Venta Directa POS
 */
export function construirDocumentoPDF(venta, cliente, detalles, vendedorNombre = 'Operador') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const esCotizacion = venta?.tipo === 'cotizacion' || venta?.estado === 'cotizacion'
  const esVentaDirecta = venta?.tipo === 'venta_directa'
  const esEntregado = venta?.estado === 'entregado'

  let tituloDocumento = 'NOTA DE PREVENTA - PENDIENTE DE ENTREGA'
  let subtituloDocumento = 'Pedido programado para despacho y entrega en ruta (Día 2)'

  if (esCotizacion) {
    tituloDocumento = 'COTIZACIÓN DE BEBIDAS'
    subtituloDocumento = 'Documento informativo sujeto a confirmación de pedido'
  } else if (esVentaDirecta) {
    tituloDocumento = 'COMPROBANTE DE VENTA - TIENDA CENTRAL'
    subtituloDocumento = 'Venta directa entregada en mostrador de Tienda Central'
  } else if (esEntregado) {
    tituloDocumento = 'NOTA DE ENTREGA FINAL Y LIQUIDACIÓN (DÍA 2)'
    subtituloDocumento = 'Mercadería verificada y entregada de Tienda Central'
  }

  const codigoFolio =
    venta?.codigo_local ||
    String(venta?.id || '')
      .slice(0, 8)
      .toUpperCase()
  const fechaRef =
    esEntregado && venta?.fecha_entrega ? venta.fecha_entrega : venta?.fecha_pedido
  const fechaObj = fechaRef ? new Date(fechaRef) : new Date()
  const fechaTexto = fechaObj.toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const horaTexto = fechaObj.toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Franja Superior Oscura (Estilo Linear / Fintech)
  doc.setFillColor(15, 23, 42) // slate-900
  doc.rect(0, 0, 210, 36, 'F')

  // Nombre de la Distribuidora
  doc.setTextColor(245, 158, 11) // amber-500
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('BEVFLOW DISTRIBUIDORA', 14, 15)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10.5)
  doc.text(tituloDocumento, 14, 23)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.text(subtituloDocumento, 14, 29.5)

  // Bloque derecho: Folio y Fecha
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(245, 158, 11)
  doc.text(`FOLIO: ${codigoFolio}`, 196, 15, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text(`Fecha: ${fechaTexto} ${horaTexto}`, 196, 22, { align: 'right' })
  doc.text(`Responsable: ${vendedorNombre}`, 196, 28.5, { align: 'right' })

  // Caja de Datos del Cliente
  doc.setFillColor(248, 250, 252) // slate-50
  doc.setDrawColor(226, 232, 240) // slate-200
  doc.roundedRect(14, 42, 182, 24, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  doc.text('DATOS DEL CLIENTE', 18, 48)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(cliente?.nombre || 'Cliente Mostrador / Venta Rápida', 18, 55)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(
    `Dirección: ${cliente?.direccion || 'Atención directa / Sin referencia'}`,
    18,
    61.5
  )

  if (cliente?.telefono) {
    doc.text(`Tel / WhatsApp: ${cliente.telefono}`, 192, 55, { align: 'right' })
  }

  // Construcción de filas de la tabla
  const filasTabla = (detalles || []).map((item, idx) => {
    const nombreBase = item.producto_nombre || item.productos?.nombre || 'Bebida'
    const saborProd = item.producto_sabor || item.productos?.sabor || ''
    const nombreProd =
      saborProd &&
      !nombreBase.toLowerCase().includes(saborProd.toLowerCase())
        ? `${nombreBase} (${saborProd})`
        : nombreBase
    const marcaProd = item.producto_marca || item.productos?.marca || ''
    const unidPaq =
      item.unidades_por_paquete || item.productos?.unidades_por_paquete || 6

    const esPaquete = item.tipo_venta === 'paquete'
    const esSurtido = item.tipo_venta === 'paquete_surtido'
    const esBonoPromo = item.tipo_venta === 'bono_promocion'
    const esBonoRegalo = item.tipo_venta === 'bono_regalo'
    const esBono = esBonoPromo || esBonoRegalo

    let formatoTexto = 'Botella Suelta'
    if (esPaquete) {
      formatoTexto = `Paquete x${unidPaq} bot.`
    } else if (esSurtido) {
      formatoTexto = item.nota_surtido || `Paquete Surtido (x${unidPaq})`
    } else if (esBonoPromo) {
      formatoTexto = `BONIFICACIÓN GRATIS (Paq. x${unidPaq})`
    } else if (esBonoRegalo) {
      const botDescontadas =
        Number(item.unidades_totales_descontar) || Number(item.cantidad)
      formatoTexto =
        botDescontadas > Number(item.cantidad)
          ? `BONO REGALO (Paq. x${unidPaq})`
          : 'BONO REGALO (Sueltas)'
    }

    const etiquetaEscala = esBonoPromo
      ? 'BONIF. GRATIS'
      : esBonoRegalo
      ? 'BONO GRATIS'
      : item.escala_aplicada ||
        (esPaquete
          ? item.es_mayorista
            ? 'Mayorista'
            : 'Paq. Menor'
          : esSurtido
          ? 'Paq. Surtido'
          : 'Unidad')

    const precioUnit = esBono ? 0 : Number(item.precio_aplicado) || 0
    const subtotal = esBono ? 0 : Number(item.subtotal) || 0

    return [
      idx + 1,
      marcaProd ? `${nombreProd} (${marcaProd})` : nombreProd,
      formatoTexto,
      esSurtido
        ? `${item.cantidad} bot. surtidas`
        : `${item.cantidad} (${item.unidades_totales_descontar || item.cantidad} bot.)`,
      esBono
        ? 'Bs 0.00 (Bonificación Gratis)'
        : `Bs ${precioUnit.toFixed(2)} (${etiquetaEscala})`,
      esBono ? 'Bs 0.00' : `Bs ${subtotal.toFixed(2)}`,
    ]
  })

  autoTable(doc, {
    startY: 72,
    head: [
      [
        '#',
        'Producto',
        'Formato',
        'Cantidad',
        'Precio Unit. Aplicado',
        'Subtotal',
      ],
    ],
    body: filasTabla,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [245, 158, 11],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 54 },
      2: { cellWidth: 34 },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 36, halign: 'right' },
      5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  })

  const finalY = (doc.lastAutoTable?.finalY || 90) + 8
  const totalGeneral = Number(venta?.total) || 0

  // Si está entregado (o es venta directa), mostrar desglose de cobro (Efectivo, QR, Crédito)
  if (esEntregado || esVentaDirecta) {
    const efec = Number(venta?.monto_efectivo) || 0
    const qr = Number(venta?.monto_qr) || 0
    const cred = Number(venta?.saldo_credito) || 0

    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(14, finalY, 100, 22, 2, 2, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(71, 85, 105)
    doc.text('DESGLOSE DE PAGO / LIQUIDACIÓN:', 18, finalY + 6)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(15, 23, 42)
    doc.text(`Efectivo: Bs ${efec.toFixed(2)}`, 18, finalY + 12.5)
    doc.text(`QR / Transf.: Bs ${qr.toFixed(2)}`, 62, finalY + 12.5)

    doc.setFont('helvetica', 'bold')
    if (cred > 0) {
      doc.setTextColor(180, 83, 9)
      doc.text(`Saldo a Crédito Pendiente: Bs ${cred.toFixed(2)}`, 18, finalY + 18.5)
    } else {
      doc.setTextColor(5, 150, 105)
      doc.text('Estado de Pago: PAGADO AL 100%', 18, finalY + 18.5)
    }
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(
      esCotizacion
        ? 'Precios calculados automáticamente según escala minorista/mayorista vigente.'
        : 'Este comprobante respalda su preventa. El pago y entrega física se realizan en el despacho.',
      14,
      finalY + 11
    )
  }

  // Bloque Total General en grande
  doc.setFillColor(15, 23, 42)
  doc.roundedRect(120, finalY, 76, 22, 2, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(203, 213, 225)
  doc.text('TOTAL GENERAL:', 125, finalY + 8)

  doc.setFontSize(14)
  doc.setTextColor(245, 158, 11)
  doc.text(`Bs ${totalGeneral.toFixed(2)}`, 191, finalY + 16, {
    align: 'right',
  })

  const prefijoArchivo = esCotizacion
    ? 'Cotizacion'
    : esVentaDirecta
    ? 'VentaTienda'
    : esEntregado
    ? 'NotaEntrega'
    : 'Preventa'
  const nombreArchivo = `${prefijoArchivo}_${codigoFolio}.pdf`
  return { doc, nombreArchivo, codigoFolio }
}

/**
 * Genera el PDF y ejecuta descarga o el menú nativo de compartir archivo en móviles (`navigator.share`).
 */
export async function generarYCompartirPDF(
  venta,
  cliente,
  detalles,
  vendedorNombre = 'Operador',
  intentarShareNativo = false
) {
  const { doc, nombreArchivo, codigoFolio } = construirDocumentoPDF(
    venta,
    cliente,
    detalles,
    vendedorNombre
  )

  if (intentarShareNativo && typeof navigator !== 'undefined' && navigator.canShare) {
    try {
      const pdfBlob = doc.output('blob')
      const archivo = new File([pdfBlob], nombreArchivo, {
        type: 'application/pdf',
      })
      if (navigator.canShare({ files: [archivo] })) {
        await navigator.share({
          title: `Comprobante ${codigoFolio} - ${cliente?.nombre || 'Cliente'}`,
          text: `Adjunto comprobante ${codigoFolio} por Bs ${Number(venta?.total || 0).toFixed(2)}`,
          files: [archivo],
        })
        return { compartido: true, nombreArchivo }
      }
    } catch (err) {
      console.warn('Share nativo cancelado o no disponible, descargando PDF:', err)
    }
  }

  doc.save(nombreArchivo)
  return { compartido: false, descargado: true, nombreArchivo }
}

/**
 * Construye el mensaje detallado y devuelve el link de WhatsApp (`https://wa.me/...`)
 */
export function generarUrlWhatsAppPedido(
  venta,
  cliente,
  detalles,
  vendedorNombre = 'Operador'
) {
  const esCotizacion =
    venta?.tipo === 'cotizacion' || venta?.estado === 'cotizacion'
  const esEntregado = venta?.estado === 'entregado'

  const titulo = esCotizacion
    ? '📋 *COTIZACIÓN DE BEBIDAS*'
    : esEntregado
    ? '✅ *NOTA DE ENTREGA Y LIQUIDACIÓN*'
    : '🚚 *NOTA DE PREVENTA (PARA ENTREGA)*'

  const codigo =
    venta?.codigo_local ||
    String(venta?.id || '')
      .slice(0, 8)
      .toUpperCase()

  const lineasItems = (detalles || []).map((d) => {
    const nombreBase = d.producto_nombre || d.productos?.nombre || 'Bebida'
    const saborProd = d.producto_sabor || d.productos?.sabor || ''
    const nombre =
      saborProd &&
      !nombreBase.toLowerCase().includes(saborProd.toLowerCase())
        ? `${nombreBase} (${saborProd})`
        : nombreBase
    const unidPaq =
      d.unidades_por_paquete || d.productos?.unidades_por_paquete || 6
    if (d.tipo_venta === 'bono_promocion') {
      return `🎁 *+${d.cantidad} Paq. Gratis* ${nombre} (Bonificación Gratis — ${d.unidades_totales_descontar} bot.) = *Bs 0.00*`
    }
    if (d.tipo_venta === 'bono_regalo') {
      return `🎁 *${d.cantidad}x* ${nombre} (BONO / REGALO — ${d.unidades_totales_descontar} bot.) = *Bs 0.00*`
    }
    if (d.tipo_venta === 'paquete_surtido') {
      return `• *${d.cantidad} bot.* ${nombre} [${d.nota_surtido || 'Paquete Surtido'}] = *Bs ${Number(
        d.subtotal || 0
      ).toFixed(2)}*`
    }
    const formato =
      d.tipo_venta === 'paquete' ? `Paq. x${unidPaq}` : 'Bot. Suelta'
    return `• *${d.cantidad}x* ${nombre} (${formato}) — Bs ${Number(
      d.precio_aplicado || 0
    ).toFixed(2)} c/u = *Bs ${Number(d.subtotal || 0).toFixed(2)}*`
  })

  const bloquePago = esEntregado
    ? [
        `💵 Efectivo: Bs ${Number(venta?.monto_efectivo || 0).toFixed(2)}`,
        `📱 QR/Transf.: Bs ${Number(venta?.monto_qr || 0).toFixed(2)}`,
        Number(venta?.saldo_credito || 0) > 0
          ? `📝 Saldo a Crédito: Bs ${Number(venta?.saldo_credito || 0).toFixed(2)}`
          : `✨ *Pagado en su totalidad*`,
      ]
    : []

  const mensaje = [
    titulo,
    `*Folio:* ${codigo}`,
    `*Cliente:* ${cliente?.nombre || 'Cliente Mostrador'}`,
    `*Responsable:* ${vendedorNombre}`,
    '────────────────────',
    ...lineasItems,
    '────────────────────',
    `💰 *TOTAL: Bs ${Number(venta?.total || 0).toFixed(2)}*`,
    ...bloquePago,
  ].join('\n')

  const soloDigitos = String(cliente?.telefono || '').replace(/\D/g, '')
  const numero =
    soloDigitos.length === 8
      ? `591${soloDigitos}`
      : soloDigitos.length > 0
      ? soloDigitos
      : ''

  const encoded = encodeURIComponent(mensaje)
  return numero
    ? `https://wa.me/${numero}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`
}

/**
 * Genera un Recibo de Pago / Abono de Crédito en PDF y lo descarga o comparte
 */
export async function generarReciboAbonoPDF({
  venta,
  cliente,
  abonoActual,
  historialAbonos = [],
  cobradorNombre = 'Cobrador',
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const codigoFolio =
    venta?.codigo_local ||
    String(venta?.id || '')
      .slice(0, 8)
      .toUpperCase()
  const ahora = new Date()

  // Cabecera
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 210, 34, 'F')

  doc.setTextColor(245, 158, 11)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('BEVFLOW DISTRIBUIDORA', 14, 14)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.text('COMPROBANTE DE ABONO / COBRO DE CRÉDITO', 14, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.text(`Nota Asociada: ${codigoFolio} · Cobrador: ${cobradorNombre}`, 14, 28.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(245, 158, 11)
  doc.text(
    `Fecha Cobro: ${ahora.toLocaleDateString('es-BO')} ${ahora.toLocaleTimeString(
      'es-BO',
      { hour: '2-digit', minute: '2-digit' }
    )}`,
    196,
    15,
    { align: 'right' }
  )

  // Datos del Cliente y Resumen de la Deuda
  doc.setFillColor(248, 250, 252)
  doc.setDrawColor(226, 232, 240)
  doc.roundedRect(14, 40, 182, 28, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('CLIENTE:', 18, 47)

  doc.setFontSize(11.5)
  doc.setTextColor(15, 23, 42)
  doc.text(cliente?.nombre || 'Cliente', 18, 54)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(`Dirección: ${cliente?.direccion || 'S/D'}`, 18, 61)

  const totalNota = Number(venta?.total) || 0
  const totalPagadoAcumulado =
    (Number(venta?.monto_efectivo) || 0) + (Number(venta?.monto_qr) || 0)
  const saldoRestante = Number(venta?.saldo_credito) || 0

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text(`Total Original Nota: Bs ${totalNota.toFixed(2)}`, 192, 48, {
    align: 'right',
  })
  doc.setTextColor(5, 150, 105)
  doc.text(
    `Total Pagado Acumulado: Bs ${totalPagadoAcumulado.toFixed(2)}`,
    192,
    55,
    { align: 'right' }
  )
  doc.setTextColor(saldoRestante > 0 ? 185 : 5, saldoRestante > 0 ? 28 : 150, saldoRestante > 0 ? 28 : 105)
  doc.text(`SALDO PENDIENTE ACTUAL: Bs ${saldoRestante.toFixed(2)}`, 192, 62, {
    align: 'right',
  })

  // Si hay un abono recién registrado, destacarlo
  let startTablaY = 74
  if (abonoActual) {
    const abEfec = Number(abonoActual.monto_efectivo) || 0
    const abQr = Number(abonoActual.monto_qr) || 0
    const abTotal = abEfec + abQr

    doc.setFillColor(236, 253, 245) // emerald-50
    doc.setDrawColor(167, 243, 208)
    doc.roundedRect(14, 73, 182, 16, 2, 2, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(6, 95, 70)
    doc.text(
      `ABONO REGISTRADO HOY: Bs ${abTotal.toFixed(2)} (Efectivo: Bs ${abEfec.toFixed(
        2
      )} | QR: Bs ${abQr.toFixed(2)})`,
      18,
      83
    )
    startTablaY = 95
  }

  // Tabla con el historial de abonos de esa venta
  const filasAbonos = historialAbonos.map((ab, idx) => {
    const f = ab.fecha ? new Date(ab.fecha) : new Date()
    const ef = Number(ab.monto_efectivo) || 0
    const qr = Number(ab.monto_qr) || 0
    return [
      idx + 1,
      `${f.toLocaleDateString('es-BO')} ${f.toLocaleTimeString('es-BO', {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      ab.perfiles?.nombre || cobradorNombre,
      `Bs ${ef.toFixed(2)}`,
      `Bs ${qr.toFixed(2)}`,
      `Bs ${(ef + qr).toFixed(2)}`,
    ]
  })

  autoTable(doc, {
    startY: startTablaY,
    head: [
      [
        '#',
        'Fecha y Hora de Abono',
        'Cobrador',
        'Pago Efectivo',
        'Pago QR',
        'Total Abonado',
      ],
    ],
    body:
      filasAbonos.length > 0
        ? filasAbonos
        : [['-', 'Sin abonos individuales registrados', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [245, 158, 11],
      fontSize: 8.5,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
    },
    margin: { left: 14, right: 14 },
  })

  const nombreArchivo = `Recibo_Abono_${codigoFolio}.pdf`
  doc.save(nombreArchivo)
  return { nombreArchivo }
}

/**
 * Construye link de WhatsApp para enviar recibo de abono o recordatorio de saldo pendiente
 */
export function generarUrlWhatsAppCredito({
  venta,
  cliente,
  abonoReciente = null,
  cobradorNombre = 'Distribuidora',
}) {
  const codigo =
    venta?.codigo_local ||
    String(venta?.id || '')
      .slice(0, 8)
      .toUpperCase()
  const totalNota = Number(venta?.total) || 0
  const pagado =
    (Number(venta?.monto_efectivo) || 0) + (Number(venta?.monto_qr) || 0)
  const saldo = Number(venta?.saldo_credito) || 0

  let lineas = []
  if (abonoReciente) {
    const abTotal =
      (Number(abonoReciente.monto_efectivo) || 0) +
      (Number(abonoReciente.monto_qr) || 0)
    lineas = [
      '💸 *COMPROBANTE DE ABONO DE CRÉDITO*',
      `*Cliente:* ${cliente?.nombre || 'Cliente'}`,
      `*Nota Folio:* ${codigo}`,
      `*Cobrador:* ${cobradorNombre}`,
      '────────────────────',
      `✅ *Abono recibido hoy:* Bs ${abTotal.toFixed(2)}`,
      `• Total original de la nota: Bs ${totalNota.toFixed(2)}`,
      `• Total abonado a la fecha: Bs ${pagado.toFixed(2)}`,
      saldo > 0
        ? `🔴 *NUEVO SALDO PENDIENTE: Bs ${saldo.toFixed(2)}*`
        : `🎉 *¡DEUDA CANCELADA EN SU TOTALIDAD! (Saldo Bs 0.00)*`,
    ]
  } else {
    lineas = [
      '📋 *ESTADO DE CUENTA - RECORDATORIO DE SALDO*',
      `Estimado(a) *${cliente?.nombre || 'Cliente'}*, le compartimos el detalle de su cuenta pendiente:`,
      `*Nota Folio:* ${codigo}`,
      '────────────────────',
      `• Total de la Nota: Bs ${totalNota.toFixed(2)}`,
      `• Pagado hasta la fecha: Bs ${pagado.toFixed(2)}`,
      `🔴 *SALDO PENDIENTE POR PAGAR: Bs ${saldo.toFixed(2)}*`,
      '',
      '_Quedamos atentos a su pago en efectivo o QR. ¡Muchas gracias!_',
    ]
  }

  const soloDigitos = String(cliente?.telefono || '').replace(/\D/g, '')
  const numero =
    soloDigitos.length === 8
      ? `591${soloDigitos}`
      : soloDigitos.length > 0
      ? soloDigitos
      : ''
  const encoded = encodeURIComponent(lineas.join('\n'))
  return numero
    ? `https://wa.me/${numero}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`
}

/**
 * Exporta el Reporte Ejecutivo de Ventas, Costos, Ganancias (Día / Mes / Año), Preventistas y Stock en PDF
 */
export function exportarReporteDashboardPDF({
  periodoEtiqueta,
  filtroVendedorEtiqueta,
  kpis,
  desgloseTemporal = [],
  tituloDesgloseTemporal = 'DESGLOSE DE GANANCIAS DEL PERIODO',
  rentabilidadProductos = [],
  rankingPreventistas = [],
  stockValorizado = [],
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const ahora = new Date()
  const fmtBs = (v) => `Bs ${Number(v || 0).toFixed(2)}`

  // Cabecera Ejecutiva
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 210, 34, 'F')

  doc.setTextColor(245, 158, 11)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('BEVFLOW — REPORTE DE VENTAS, COSTOS Y GANANCIAS', 14, 13)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9.5)
  doc.text(`Periodo: ${periodoEtiqueta}`, 14, 21)
  doc.text(`Alcance: ${filtroVendedorEtiqueta}`, 14, 27)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.text(
    `Generado: ${ahora.toLocaleDateString('es-BO')} ${ahora.toLocaleTimeString(
      'es-BO',
      { hour: '2-digit', minute: '2-digit' }
    )}`,
    196,
    14,
    { align: 'right' }
  )

  // Bloque KPIs Financieros y de Ganancia Neta
  autoTable(doc, {
    startY: 39,
    head: [
      [
        'Ventas Entregadas',
        'Costo Total (incl. Bonos)',
        'GANANCIA NETA REAL',
        'Margen Neto',
        'Cobrado / Por Cobrar',
      ],
    ],
    body: [
      [
        fmtBs(kpis.totalVentasBrutas),
        `${fmtBs(kpis.costoTotalMercaderia)} (Bonos: ${fmtBs(
          kpis.costoSoloBonos
        )})`,
        fmtBs(kpis.gananciaNetaReal),
        `${Number(kpis.margenNetoPct || 0).toFixed(1)}%`,
        `Cobrado: ${fmtBs(kpis.dineroRealRecaudado)} | Créd: ${fmtBs(
          kpis.totalCreditosCalle
        )}`,
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [245, 158, 11],
      fontSize: 7.8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8.2,
      fontStyle: 'bold',
      textColor: [15, 23, 42],
    },
    margin: { left: 14, right: 14 },
  })

  // 1. Evolución / Desglose Temporal (Día / Mes / Año)
  let currentY = (doc.lastAutoTable?.finalY || 58) + 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text(`1. ${tituloDesgloseTemporal.toUpperCase()}`, 14, currentY)

  const filasTiempo = desgloseTemporal.map((t) => [
    t.etiqueta,
    t.entregas,
    fmtBs(t.ventas),
    fmtBs(t.costo),
    fmtBs(t.ganancia),
    `${Number(t.margenPct || 0).toFixed(1)}%`,
  ])

  autoTable(doc, {
    startY: currentY + 2.5,
    head: [
      [
        'Fecha / Mes',
        'Entregas',
        'Ventas (Bs)',
        'Costo (Bs)',
        'Ganancia Neta (Bs)',
        'Margen',
      ],
    ],
    body:
      filasTiempo.length > 0
        ? filasTiempo
        : [['Sin entregas en este periodo', '0', 'Bs 0.00', 'Bs 0.00', 'Bs 0.00', '0.0%']],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7.8,
    },
    bodyStyles: { fontSize: 7.8 },
    margin: { left: 14, right: 14 },
  })

  // 2. Rentabilidad por Bebida
  if (rentabilidadProductos.length > 0) {
    currentY = (doc.lastAutoTable?.finalY || currentY + 25) + 7
    if (currentY > 250) {
      doc.addPage()
      currentY = 18
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    doc.text('2. GANANCIA POR PRODUCTO / BEBIDA', 14, currentY)

    const filasProd = rentabilidadProductos.map((p, idx) => [
      idx + 1,
      `${p.nombre}${p.sabor ? ` · ${p.sabor}` : ''} (${p.marca})`,
      p.cantidadResumen,
      fmtBs(p.ingresos),
      fmtBs(p.costoTotal),
      fmtBs(p.ganancia),
      `${Number(p.margenPct || 0).toFixed(1)}%`,
    ])

    autoTable(doc, {
      startY: currentY + 2.5,
      head: [
        [
          '#',
          'Bebida',
          'Salidas (+Bonos)',
          'Ventas (Bs)',
          'Costo (Bs)',
          'Ganancia (Bs)',
          'Margen',
        ],
      ],
      body: filasProd,
      theme: 'grid',
      headStyles: {
        fillColor: [16, 185, 129],
        textColor: [255, 255, 255],
        fontSize: 7.8,
      },
      bodyStyles: { fontSize: 7.6 },
      margin: { left: 14, right: 14 },
    })
  }

  // 3. Ranking de Preventistas con Ganancia Real
  currentY = (doc.lastAutoTable?.finalY || currentY + 25) + 7
  if (currentY > 250) {
    doc.addPage()
    currentY = 18
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 23, 42)
  doc.text('3. RENDIMIENTO Y GANANCIA POR PREVENTISTA / CANAL', 14, currentY)

  const filasRanking = (rankingPreventistas || []).map((r, i) => [
    i + 1,
    r.nombre,
    r.rolEtiqueta,
    r.pedidosEntregados,
    `${r.paquetesVendidos} paq / ${r.sueltasVendidas} bot`,
    `${r.bonosRecibidosBotellas} bot.`,
    fmtBs(r.totalGeneradoBs),
    fmtBs(r.costoGeneradoBs),
    fmtBs(r.gananciaGeneradaBs),
  ])

  autoTable(doc, {
    startY: currentY + 2.5,
    head: [
      [
        '#',
        'Vendedor / Canal',
        'Rol',
        'Entregas',
        'Vendido',
        'Bonos',
        'Ventas (Bs)',
        'Costo (Bs)',
        'Ganancia (Bs)',
      ],
    ],
    body:
      filasRanking.length > 0
        ? filasRanking
        : [['-', 'Sin registros', '-', '0', '0', '0', 'Bs 0.00', 'Bs 0.00', 'Bs 0.00']],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7.6,
    },
    bodyStyles: { fontSize: 7.5 },
    margin: { left: 14, right: 14 },
  })

  // 4. Stock Valorizado (Costo vs Venta)
  if (stockValorizado.length > 0) {
    currentY = (doc.lastAutoTable?.finalY || currentY + 25) + 7
    if (currentY > 245) {
      doc.addPage()
      currentY = 18
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    doc.text('4. INVENTARIO ACTUAL VALORIZADO (AL COSTO Y VENTA)', 14, currentY)

    const filasStock = stockValorizado.map((s, idx) => [
      idx + 1,
      `${s.nombre} (${s.marca})`,
      s.depositoTextoLimpio || s.depositoFmt?.texto || '-',
      s.centralTextoLimpio || s.centralFmt?.texto || '-',
      fmtBs(s.costoInventarioBs),
      fmtBs(s.valorEstimadoBs),
    ])

    autoTable(doc, {
      startY: currentY + 2.5,
      head: [
        [
          '#',
          'Bebida',
          'Depósito',
          'Tienda Central',
          'Capital al Costo',
          'Valor Venta Est.',
        ],
      ],
      body: filasStock,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [245, 158, 11],
        fontSize: 7.8,
      },
      bodyStyles: { fontSize: 7.5 },
      margin: { left: 14, right: 14 },
    })
  }

  doc.save(`Reporte_Ganancias_${ahora.toISOString().slice(0, 10)}.pdf`)
}

/**
 * Genera e imprime/descarga la Hoja de Carga Consolidada por Camión / Preventista:
 * 1) Mercadería total a alistar para subir al camión del preventista (Paquetes + Sueltas)
 * 2) Detalle de tiendas/clientes que entregará ese preventista en su ruta
 */
export function generarPDFHojaCargaCamion({
  preventistaNombre = 'Preventista',
  itemsCarga = [],
  pedidosTienda = [],
  totalBs = 0,
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const ahora = new Date()
  const fechaStr = ahora.toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const horaStr = ahora.toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Cabecera
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 210, 34, 'F')

  doc.setTextColor(245, 158, 11)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('HOJA DE ALISTAMIENTO Y CARGA DE CAMIÓN', 14, 14)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.text(`Preventista / Camión: ${preventistaNombre}`, 14, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.text(
    `Tiendas en ruta: ${pedidosTienda.length}  |  Total valorizado de ruta: Bs ${Number(totalBs || 0).toFixed(2)}`,
    14,
    28.5
  )

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 255, 255)
  doc.text(`Fecha: ${fechaStr} ${horaStr}`, 196, 15, { align: 'right' })

  // Tabla 1: Total de Mercadería a Alistar para el Camión
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(15, 23, 42)
  doc.text('1. MERCADERÍA TOTAL A ALISTAR Y SUBIR AL CAMIÓN', 14, 43)

  const filasCarga = itemsCarga.map((it, idx) => [
    idx + 1,
    it.nombre,
    it.marca || '-',
    `x${it.unidades_por_paquete}`,
    it.cantidadTexto || `${it.total_botellas} bot.`,
    `${it.total_botellas} bot.${it.botellas_bono > 0 ? ` (incl. ${it.botellas_bono} gratis)` : ''}`,
    '[   ]',
  ])

  autoTable(doc, {
    startY: 46,
    head: [
      [
        '#',
        'Bebida / Sabor',
        'Marca',
        'Pack',
        'Cantidad a Cargar',
        'Total Botellas',
        'Listo',
      ],
    ],
    body:
      filasCarga.length > 0
        ? filasCarga
        : [['-', 'Sin mercadería pendiente', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [245, 158, 11],
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8.5,
    },
    columnStyles: {
      4: { fontStyle: 'bold' },
      6: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
  })

  // Tabla 2: Lista de Tiendas / Clientes de este Preventista
  const yTiendas = (doc.lastAutoTable?.finalY || 95) + 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(15, 23, 42)
  doc.text(
    `2. PEDIDOS POR TIENDA / CLIENTE (${preventistaNombre.toUpperCase()})`,
    14,
    yTiendas
  )

  const filasTiendas = pedidosTienda.map((ped, idx) => {
    const resumenItems = (ped.venta_detalles || [])
      .map((d) => {
        const nom = d.productos?.nombre || 'Bebida'
        const sab = d.productos?.sabor ? ` ${d.productos.sabor}` : ''
        const esBono =
          d.tipo_venta === 'bono_regalo' || d.tipo_venta === 'bono_promocion'
        const fmt =
          d.tipo_venta === 'paquete'
            ? `${d.cantidad} Paq`
            : d.tipo_venta === 'paquete_surtido'
            ? `${d.unidades_totales_descontar || d.cantidad} Surt.`
            : esBono
            ? `${d.unidades_totales_descontar} Gratis`
            : `${d.cantidad} Bot`
        return `${fmt} ${nom}${sab}`
      })
      .join(' | ')

    return [
      idx + 1,
      ped.codigo_local || '-',
      ped.clientes?.nombre || 'Tienda',
      ped.clientes?.direccion || '-',
      resumenItems,
      `Bs ${Number(ped.total || 0).toFixed(2)}`,
    ]
  })

  autoTable(doc, {
    startY: yTiendas + 3,
    head: [['#', 'Folio', 'Tienda / Cliente', 'Dirección', 'Detalle del Pedido', 'Total']],
    body: filasTiendas,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 7.8,
    },
    columnStyles: {
      5: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  })

  const nombreLimpio = preventistaNombre.replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(`Carga_Camion_${nombreLimpio}_${ahora.toISOString().slice(0, 10)}.pdf`)
}

/**
 * 5. Hoja Ejecutiva A4 de Rendición y Entrega de Dinero del Preventista al Dueño
 */
export function generarPDFRendicionPreventista({
  preventistaNombre = 'Preventista',
  pedidos = [],
  recibidoPor = 'Dueño / Administrador',
  yaRendido = false,
  fechaRendicion = null,
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const ahora = fechaRendicion ? new Date(fechaRendicion) : new Date()
  const fechaStr = ahora.toLocaleDateString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const horaStr = ahora.toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  })

  let totalFacturado = 0
  let totalEfectivo = 0
  let totalQr = 0
  let totalCredito = 0

  pedidos.forEach((p) => {
    totalFacturado += Number(p.total) || 0
    totalEfectivo += Number(p.monto_efectivo) || 0
    totalQr += Number(p.monto_qr) || 0
    totalCredito += Number(p.saldo_credito) || 0
  })
  const totalRecaudado = totalEfectivo + totalQr

  // Cabecera ejecutiva
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, 210, 36, 'F')

  doc.setTextColor(245, 158, 11)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14.5)
  doc.text('ACTA DE RENDICIÓN Y ENTREGA DE DINERO AL DUEÑO', 14, 14)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10.5)
  doc.text(`Preventista: ${preventistaNombre}`, 14, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(203, 213, 225)
  doc.text(
    `Pedidos cobrados: ${pedidos.length}  |  Estado: ${
      yaRendido ? 'DINERO RECIBIDO CONFORME POR EL DUEÑO' : 'PENDIENTE DE ENTREGA AL DUEÑO'
    }`,
    14,
    29
  )

  doc.setTextColor(255, 255, 255)
  doc.text(`Fecha: ${fechaStr} ${horaStr}`, 196, 14, { align: 'right' })
  doc.setTextColor(203, 213, 225)
  doc.text(`Receptor: ${recibidoPor}`, 196, 22, { align: 'right' })

  // Cajas de Resumen Financiero
  const yKpi = 43
  const cajas = [
    {
      label: 'EFECTIVO EN MANO A ENTREGAR',
      valor: `Bs ${totalEfectivo.toFixed(2)}`,
      destacado: true,
    },
    {
      label: 'COBRADO POR QR (BANCO)',
      valor: `Bs ${totalQr.toFixed(2)}`,
      destacado: false,
    },
    {
      label: 'TOTAL RECAUDADO (EFEC + QR)',
      valor: `Bs ${totalRecaudado.toFixed(2)}`,
      destacado: false,
    },
    {
      label: 'DEJADO A CRÉDITO EN TIENDAS',
      valor: `Bs ${totalCredito.toFixed(2)}`,
      destacado: false,
    },
  ]

  cajas.forEach((c, idx) => {
    const x = 14 + idx * 46
    if (c.destacado) {
      doc.setFillColor(254, 243, 199)
      doc.setDrawColor(245, 158, 11)
    } else {
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(203, 213, 225)
    }
    doc.roundedRect(x, yKpi, 44, 18, 2, 2, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.setTextColor(100, 116, 139)
    doc.text(c.label, x + 2.5, yKpi + 6)

    doc.setFontSize(10.5)
    doc.setTextColor(15, 23, 42)
    doc.text(c.valor, x + 2.5, yKpi + 14)
  })

  // Tabla detallada tienda por tienda
  const filas = pedidos.map((ped, idx) => {
    const fCobro =
      ped.info_custodia?.fecha_cobro || ped.fecha_entrega || ped.fecha_pedido
    const horaCobro = fCobro
      ? new Date(fCobro).toLocaleTimeString('es-BO', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '-'

    return [
      idx + 1,
      ped.codigo_local || '-',
      ped.clientes?.nombre || 'Tienda',
      horaCobro,
      `Bs ${Number(ped.total || 0).toFixed(2)}`,
      `Bs ${Number(ped.monto_efectivo || 0).toFixed(2)}`,
      `Bs ${Number(ped.monto_qr || 0).toFixed(2)}`,
      Number(ped.saldo_credito || 0) > 0
        ? `Bs ${Number(ped.saldo_credito || 0).toFixed(2)}`
        : '-',
    ]
  })

  autoTable(doc, {
    startY: 68,
    head: [
      [
        '#',
        'Folio',
        'Tienda / Cliente',
        'Hora Cobro',
        'Total Nota',
        'Efectivo',
        'Pago QR',
        'Crédito',
      ],
    ],
    body:
      filas.length > 0
        ? filas
        : [['-', '-', 'Sin pedidos cobrados', '-', '-', '-', '-', '-']],
    foot: [
      [
        '',
        '',
        'TOTALES DE RUTA',
        '',
        `Bs ${totalFacturado.toFixed(2)}`,
        `Bs ${totalEfectivo.toFixed(2)}`,
        `Bs ${totalQr.toFixed(2)}`,
        `Bs ${totalCredito.toFixed(2)}`,
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [245, 158, 11],
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  const yFirmas = Math.min(265, (doc.lastAutoTable?.finalY || 140) + 28)
  doc.setDrawColor(148, 163, 184)
  doc.line(26, yFirmas, 92, yFirmas)
  doc.line(118, yFirmas, 184, yFirmas)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text('ENTREGUÉ CONFORME (PREVENTISTA)', 59, yFirmas + 5, {
    align: 'center',
  })
  doc.text('RECIBÍ CONFORME (DUEÑO / ADMIN)', 151, yFirmas + 5, {
    align: 'center',
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(preventistaNombre, 59, yFirmas + 10, { align: 'center' })
  doc.text(recibidoPor, 151, yFirmas + 10, { align: 'center' })

  const nombreLimpio = preventistaNombre.replace(/[^a-zA-Z0-9]/g, '_')
  doc.save(
    `Rendicion_Dinero_${nombreLimpio}_${ahora.toISOString().slice(0, 10)}.pdf`
  )
}


