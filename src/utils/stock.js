/**
 * Formatea una cantidad total de unidades en paquetes y botellas sueltas.
 * - Si stockUnidades < 0: devuelve paquetes: 0, sueltas: 0 y texto: "Faltante: X bot."
 * - Si stockUnidades === 0: devuelve paquetes: 0, sueltas: 0 y texto: "0 Paq + 0 Bot. (Sin stock)"
 * - Si stockUnidades > 0: devuelve paquetes, sueltas y texto: "X Paq + Y Bot."
 *
 * @param {number} stockUnidades - Cantidad total en botellas/unidades sueltas
 * @param {number} unidadesPorPaquete - Unidades que conforman un paquete/caja (por defecto 6)
 * @returns {{ paquetes: number, sueltas: number, texto: string, sinStock: boolean, deficit: number }}
*/
export function formatearStock(stockUnidades = 0, unidadesPorPaquete = 6) {
  const total = Number(stockUnidades) || 0
  const porPaquete = Number(unidadesPorPaquete) > 0 ? Number(unidadesPorPaquete) : 6

  if (total < 0) {
    const faltante = Math.abs(total)
    return {
      paquetes: 0,
      sueltas: 0,
      sinStock: true,
      deficit: faltante,
      texto: `Faltante: ${faltante} bot.`,
    }
  }

  if (total === 0) {
    return {
      paquetes: 0,
      sueltas: 0,
      sinStock: true,
      deficit: 0,
      texto: '0 Paq + 0 Bot. (Sin stock)',
    }
  }

  const paquetes = Math.floor(total / porPaquete)
  const sueltas = total % porPaquete

  return {
    paquetes,
    sueltas,
    sinStock: false,
    deficit: 0,
    texto: `${paquetes} Paq + ${sueltas} Bot.`,
  }
}
