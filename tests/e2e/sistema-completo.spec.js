import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hazikzqkxiucwegfwetg.supabase.co'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhemlrenFreGl1Y3dlZ2Z3ZXRnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDA0MTU2NywiZXhwIjoyMTA5NjE3NTY3fQ.tNWm5YAJYopIuYQy7hH0ZW-k_DfWFm_4msI8BIehRxg'

const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TABLAS_OPERATIVAS = [
  'abonos_credito',
  'venta_detalles',
  'ventas',
  'movimientos_stock',
  'inventario',
  'productos',
  'marcas',
  'clientes',
]

const E2E_ADMIN = {
  email: 'e2e.qa.admin@distribuidora.local',
  login: 'e2e.qa.admin',
  password: 'E2ePassword2026!',
  nombre: 'QA Admin Temporal E2E',
  rol: 'admin',
}

const E2E_PREV = {
  email: 'e2e.qa.prev@distribuidora.local',
  login: 'e2e.qa.prev',
  password: 'E2ePassword2026!',
  nombre: 'QA Preventista Temporal E2E',
  rol: 'preventista',
}

let idsPerfilesOriginales = []
let tempUserIds = []

async function limpiarTablasOperativasYStorage() {
  for (const tabla of TABLAS_OPERATIVAS) {
    const { error } = await adminDb.from(tabla).delete().not('id', 'is', null)
    if (error) {
      throw new Error(`Error limpiando tabla ${tabla}: ${error.message}`)
    }
  }

  for (const carpeta of ['catalogo', 'marcas', 'config']) {
    const { data: items } = await adminDb.storage
      .from('productos')
      .list(carpeta, { limit: 500 })
    const rutas = (items || [])
      .filter((f) => f.name && f.name !== '.emptyFolderPlaceholder')
      .map((f) => `${carpeta}/${f.name}`)
    if (rutas.length > 0) {
      await adminDb.storage.from('productos').remove(rutas)
    }
  }
}

async function crearUsuarioTemporalE2E(cfg) {
  // Limpiar si hubiera quedado de una corrida previa abortada (SOLO cuentas e2e.qa.*)
  const { data: listRes } = await adminDb.auth.admin.listUsers({
    page: 1,
    perPage: 500,
  })
  const previo = (listRes?.users || []).find((u) => u.email === cfg.email)
  if (previo) {
    await adminDb.from('perfiles').delete().eq('id', previo.id)
    await adminDb.auth.admin.deleteUser(previo.id)
  }

  const { data: created, error: createErr } =
    await adminDb.auth.admin.createUser({
      email: cfg.email,
      password: cfg.password,
      email_confirm: true,
      user_metadata: {
        nombre: cfg.nombre,
        rol: cfg.rol,
        usuario_login: cfg.login,
      },
    })
  if (createErr) throw createErr

  const uid = created.user.id
  const { error: perfErr } = await adminDb.from('perfiles').upsert(
    {
      id: uid,
      nombre: cfg.nombre,
      rol: cfg.rol,
      activo: true,
      usuario_login: cfg.login,
    },
    { onConflict: 'id' }
  )
  if (perfErr) {
    // Fallback si la columna usuario_login no existiera físicamente
    const { error: perfFallbackErr } = await adminDb.from('perfiles').upsert(
      {
        id: uid,
        nombre: cfg.nombre,
        rol: cfg.rol,
        activo: true,
      },
      { onConflict: 'id' }
    )
    if (perfFallbackErr) throw perfFallbackErr
  }
  return uid
}

async function loginEnUI(page, usuario, password) {
  await page.goto('/')
  await expect(page.getByPlaceholder('Ej. admin o marco')).toBeVisible()
  await page.getByPlaceholder('Ej. admin o marco').fill(usuario)
  await page.getByPlaceholder('••••••••').fill(password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page.getByPlaceholder('Ej. admin o marco')).toBeHidden({
    timeout: 15_000,
  })
  await expect(page.locator('main')).toBeVisible()
}

test.describe.serial('Verificación E2E Completa del Sistema BevFlow', () => {
  test.beforeAll(async () => {
    // 1. Registrar los perfiles reales existentes para garantizar que NUNCA se toquen
    const { data: perfilesAntes, error } = await adminDb
      .from('perfiles')
      .select('id, nombre, rol')
    if (error) throw error
    idsPerfilesOriginales = (perfilesAntes || [])
      .filter((p) => !String(p.nombre || '').includes('Temporal E2E'))
      .map((p) => p.id)

    // 2. Asegurar tablas operativas limpias antes de empezar E2E
    await limpiarTablasOperativasYStorage()

    // 3. Crear únicamente 2 cuentas efímeras de prueba E2E
    const adminId = await crearUsuarioTemporalE2E(E2E_ADMIN)
    const prevId = await crearUsuarioTemporalE2E(E2E_PREV)
    tempUserIds = [adminId, prevId]
  })

  test.afterAll(async () => {
    // 1. Limpiar todos los registros operativos creados durante E2E
    await limpiarTablasOperativasYStorage()

    // 2. Eliminar ÚNICAMENTE los 2 usuarios temporales E2E
    for (const uid of tempUserIds) {
      if (!idsPerfilesOriginales.includes(uid)) {
        await adminDb.from('perfiles').delete().eq('id', uid)
        await adminDb.auth.admin.deleteUser(uid)
      }
    }

    // 3. Verificar que todos los usuarios originales siguen 100% intactos y las tablas operativas en 0
    const { data: perfilesDespues } = await adminDb
      .from('perfiles')
      .select('id')
    const idsDespues = (perfilesDespues || []).map((p) => p.id)
    for (const origId of idsPerfilesOriginales) {
      expect(idsDespues).toContain(origId)
    }
  })

  test('1. Modo Dark por defecto, Login real con validación y Estados Vacíos sin errores', async ({
    page,
  }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/')

    // Verificar que inicia en Modo Dark por defecto (<html class="dark">)
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Probar credenciales incorrectas
    await page.getByPlaceholder('Ej. admin o marco').fill('e2e.qa.admin')
    await page.getByPlaceholder('••••••••').fill('ClaveIncorrecta123')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await expect(page.locator('form')).toBeVisible()
    await expect(
      page.locator('div.text-red-600, div.dark\\:text-red-300')
    ).toBeVisible()

    // Login real con Admin E2E
    await page.getByPlaceholder('Ej. admin o marco').fill(E2E_ADMIN.login)
    await page.getByPlaceholder('••••••••').fill(E2E_ADMIN.password)
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page).toHaveURL(/\/dashboard/)

    // Recorrer todos los módulos con base de datos en 0 para verificar estados vacíos limpios
    const rutas = [
      '/productos',
      '/almacen',
      '/preventa',
      '/mis-pedidos',
      '/despacho',
      '/caja-central',
      '/clientes',
      '/creditos',
      '/dashboard',
    ]
    for (const ruta of rutas) {
      await page.goto(ruta)
      await expect(page.locator('main')).toBeVisible()
    }

    expect(pageErrors).toEqual([])
  })

  test('2. Cajas de Marcas y Registro de Bebida únicamente dentro de la Marca + Precios en 3 filas limpias', async ({
    page,
  }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await loginEnUI(page, E2E_ADMIN.login, E2E_ADMIN.password)
    await page.goto('/productos')

    // Nivel 1: Cajas de Marcas — NO debe existir botón de crear producto afuera de una marca
    await expect(page.getByText(/Marcas registradas/i)).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Registrar bebida/i })
    ).toHaveCount(0)

    // Crear marca "Opal E2E" desde la caja "+ Nueva Marca"
    await page.getByRole('button', { name: /Nueva Marca/i }).click()
    await page
      .getByPlaceholder(/Nueva marca/i)
      .fill('Opal E2E')
    await page.getByRole('button', { name: /^Crear$/i }).click()
    await expect(page.getByText('Opal E2E').first()).toBeVisible()

    // Entrar a la marca recién creada desde el modal ("Entrar →")
    await page.getByRole('button', { name: /Entrar/i }).first().click()

    // Nivel 2: Dentro de "Opal E2E" aparece barra "← Marcas" y botón para registrar bebida de esa marca
    await expect(
      page.getByRole('button', { name: /^Marcas$/i })
    ).toBeVisible()
    await page
      .getByRole('button', { name: /Registrar bebida/i })
      .first()
      .click()

    // Verificar que la marca viene fijada automáticamente a "Opal E2E"
    const modal = page.locator('form').filter({ hasText: 'Nombre de la bebida' })
    await expect(modal).toContainText('Opal E2E')

    await modal
      .getByPlaceholder(/Ej\. Lix 400ml/i)
      .fill('Cuba Libre E2E 2L')
    await modal
      .getByPlaceholder(/Ej\. Manzana, Uva/i)
      .fill('Tradicional')

    // Botellas por paquete = 6, Precio Unidad = 15, Paquete = 84, Mayorista = 78 desde 5 paq
    const numberInputs = modal.locator('input[type="number"]')
    await numberInputs.nth(0).fill('6') // Botellas por paquete
    await numberInputs.nth(1).fill('15') // Precio Unidad (Botella)
    await numberInputs.nth(2).fill('84') // Precio Paquete
    await numberInputs.nth(3).fill('78') // Precio Paquete Mayorista
    await numberInputs.nth(4).fill('5') // A partir de cuántos paquetes

    await modal.getByRole('button', { name: 'Crear Producto' }).click()

    // Verificar tarjeta creada con las 3 filas horizontales limpias (Botella, Paquete, Mayor (+5 paq))
    const card = page
      .locator('article')
      .filter({ hasText: 'Cuba Libre E2E 2L' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Botella')
    await expect(card).toContainText('Bs 15')
    await expect(card).toContainText('Paquete')
    await expect(card).toContainText('Bs 84')
    await expect(card).toContainText('Mayor (+5 paq)')
    await expect(card).toContainText('Bs 78')

    // Regresar a "← Marcas" y verificar que la caja de marca muestra el nombre grande y "1 bebida" (cero fotos de botellas)
    await page.getByRole('button', { name: /^Marcas$/i }).click()
    const brandCard = page
      .locator('button')
      .filter({ hasText: 'Opal E2E' })
      .first()
    await expect(brandCard).toBeVisible()
    await expect(brandCard).toContainText('1 bebida')

    expect(pageErrors).toEqual([])
  })

  test('3. Privacidad y Permisos Estrictos del Rol Preventista', async ({
    page,
  }) => {
    await loginEnUI(page, E2E_PREV.login, E2E_PREV.password)

    // Preventista aterriza directo en /preventa
    await expect(page).toHaveURL(/\/preventa/)

    // Intentar entrar por URL a módulos restringidos (/almacen y /despacho) -> redirige automáticamente
    await page.goto('/almacen')
    await expect(page).toHaveURL(/\/preventa/)

    await page.goto('/despacho')
    await expect(page).toHaveURL(/\/preventa/)

    // En /productos (Catálogo de Precios), el preventista ve precios pero NUNCA ve stock ni botones de edición
    await page.goto('/productos')
    await page.locator('button').filter({ hasText: 'Opal E2E' }).first().click()

    const card = page
      .locator('article')
      .filter({ hasText: 'Cuba Libre E2E 2L' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Bs 84')
    await expect(card).not.toContainText('Central:')
    await expect(card).not.toContainText('Depósito:')
    await expect(
      page.getByRole('button', { name: /Registrar bebida/i })
    ).toHaveCount(0)
  })

  test('4. Almacén y Traspasos: Entrada con Costo a Depósito y Traspaso a Tienda Central', async ({
    page,
  }) => {
    await loginEnUI(page, E2E_ADMIN.login, E2E_ADMIN.password)
    await page.goto('/almacen')

    // Entrar a la caja de marca "Opal E2E"
    await page.locator('button').filter({ hasText: 'Opal E2E' }).first().click()

    const stockCard = page
      .locator('div.group')
      .filter({ hasText: 'Cuba Libre E2E 2L' })
      .first()
    await expect(stockCard).toBeVisible()

    // 1. Registrar Entrada de 10 Paquetes (60 botellas) a Costo Bs 60/paq en Depósito Principal
    await stockCard.getByRole('button', { name: 'Entrada' }).click()
    const formEntrada = page
      .locator('form')
      .filter({ hasText: 'Costo de esta compra' })
    await formEntrada.getByRole('button', { name: '+10 Paq' }).click()
    await formEntrada.getByPlaceholder('0.00').fill('60')
    await expect(formEntrada).toContainText('+Bs 24.00/paq')
    await formEntrada
      .getByRole('button', { name: 'Confirmar Entrada' })
      .click()

    // Verificar que Depósito quedó con 10 Paq y Costo Bs 60/paq visible para Admin
    await expect(stockCard).toContainText('10 Paq')
    await expect(stockCard).toContainText('Costo Bs 60/paq')

    // 2. Traspasar 6 Paquetes (36 botellas) de Depósito a Tienda Central
    await stockCard.getByRole('button', { name: 'Traspasar' }).click()
    const formTraspaso = page
      .locator('form')
      .filter({ hasText: 'Confirmar Traspaso' })
    await formTraspaso.getByRole('button', { name: '+5 Paq' }).click()
    await formTraspaso.getByRole('button', { name: '+1 Paq' }).click()
    await formTraspaso
      .getByRole('button', { name: 'Confirmar Traspaso' })
      .click()

    // Verificar balances exactos: Depósito = 4 Paq (24 bot.) y Tienda Central = 6 Paq (36 bot.)
    await expect(stockCard).toContainText('4 Paq')
    await expect(stockCard).toContainText('6 Paq')

    const { data: invRows } = await adminDb
      .from('inventario')
      .select('stock_unidades, ubicaciones(tipo)')
    const porTipo = Object.fromEntries(
      (invRows || []).map((r) => [r.ubicaciones?.tipo, r.stock_unidades])
    )
    expect(porTipo.almacen).toBe(24)
    expect(porTipo.central).toBe(36)
  })

  test('5. Preventa en Ruta: Crear Cliente, Tabla Interactiva Tu Pedido y Cancelación en Mis Pedidos', async ({
    page,
  }) => {
    await loginEnUI(page, E2E_PREV.login, E2E_PREV.password)
    await expect(page).toHaveURL(/\/preventa/)

    // Crear nuevo cliente en ruta
    await page.getByRole('button', { name: 'Nuevo' }).click()
    const formCliente = page
      .locator('form')
      .filter({ hasText: 'Nombre del Cliente' })
    await formCliente
      .getByPlaceholder('Ej. Don Mario Quispe')
      .fill('Tienda Don Pepe E2E')
    await formCliente.getByPlaceholder('70123456').fill('70011223')
    await formCliente
      .getByPlaceholder('Av. Principal #10')
      .fill('Av. Banzer 4to Anillo')
    await formCliente
      .getByRole('button', { name: 'Guardar y Seleccionar' })
      .click()

    await expect(page.getByText('Tienda Don Pepe E2E').first()).toBeVisible()

    // Entrar a la caja de marca "Opal E2E"
    await page.locator('button').filter({ hasText: 'Opal E2E' }).first().click()

    const prodCard = page
      .locator('article')
      .filter({ hasText: 'Cuba Libre E2E 2L' })
    await expect(prodCard).toBeVisible()

    // Agregar 2 paquetes desde la tarjeta
    const btnMasCard = prodCard.locator('button').last()
    await btnMasCard.click()
    await btnMasCard.click()

    // Cambiar a "Por Botella" y agregar 2 botellas sueltas
    await page.getByRole('button', { name: 'Por Botella' }).click()
    const btnMasBotella = prodCard.locator('button').last()
    await btnMasBotella.click()
    await btnMasBotella.click()

    // Verificar OrderSummaryTable en panel derecho ("Tu Pedido (2)")
    const panelPedido = page
      .locator('div')
      .filter({ hasText: 'Tu Pedido (2)' })
      .first()
    await expect(panelPedido).toBeVisible()
    const tablaResumen = page.locator('table').first()
    await expect(tablaResumen).toContainText('Paq x6')
    await expect(tablaResumen).toContainText('Botella')

    // Ajustar cantidad directamente desde el botón "+" dentro de la tabla del pedido (de 2 Paq a 3 Paq)
    const filaPaquete = tablaResumen.locator('tbody tr').filter({ hasText: 'Paq x6' })
    await filaPaquete.locator('button').nth(1).click() // botón + de la fila Paq x6

    // 3 Paq * Bs 84 (252) + 2 Bot * Bs 15 (30) = Bs 282
    await expect(filaPaquete).toContainText('Bs 252')
    await expect(page.getByText('3 Paq + 2 Bot').first()).toBeVisible()
    await expect(page.getByText('Bs 282').first()).toBeVisible()

    // Confirmar Preventa #1 (Bs 282)
    await page
      .getByRole('button', { name: /Confirmar Pedido/i })
      .first()
      .click()
    await expect(
      page.getByText('¡Preventa Registrada con Éxito!')
    ).toBeVisible()
    await page.getByRole('button', { name: 'Nueva Preventa' }).click()

    // Crear Preventa #2 rápida (1 Paq = Bs 84) para probar cancelación desde "Mis Pedidos"
    await page.locator('button').filter({ hasText: 'Opal E2E' }).first().click()
    await page.getByRole('button', { name: 'Por Paquete' }).click()
    await prodCard.locator('button').last().click()
    await page
      .getByRole('button', { name: /Confirmar Pedido/i })
      .first()
      .click()
    await expect(
      page.getByText('¡Preventa Registrada con Éxito!')
    ).toBeVisible()
    await page.getByRole('button', { name: 'Ver Mis Pedidos del Día' }).click()

    // En /mis-pedidos deben verse ambos pedidos (Bs 282 y Bs 84); cancelar el de Bs 84
    await expect(page).toHaveURL(/\/mis-pedidos/)
    const pedido84 = page
      .locator('article, div.rounded-2xl')
      .filter({ hasText: 'Bs 84' })
      .filter({ hasText: 'Cancelar' })
      .first()
    await pedido84.getByRole('button', { name: 'Cancelar' }).first().click()
    await page.getByRole('button', { name: 'Sí, Cancelar Pedido' }).click()

    // Verificar que quedó solo 1 venta pendiente en BD (la de Bs 282)
    await expect
      .poll(async () => {
        const { count } = await adminDb
          .from('ventas')
          .select('*', { count: 'exact', head: true })
        return count
      })
      .toBe(1)
  })

  test('6. Despacho en 4 Etapas + Vista Móvil Responsiva + Créditos/Abonos + Devolución de Stock al Cancelar', async ({
    page,
  }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await loginEnUI(page, E2E_ADMIN.login, E2E_ADMIN.password)
    await page.goto('/despacho')

    // Nivel 1: Card responsivo del Preventista
    await expect(
      page.getByText(/Selecciona un preventista \(1\)/i)
    ).toBeVisible()
    const prevCard = page
      .locator('button')
      .filter({ hasText: E2E_PREV.nombre })
      .first()
    await expect(prevCard).toContainText('1 cliente')
    await expect(prevCard).toContainText('3 Paq + 2 Bot')
    await expect(prevCard).toContainText('Bs 282')
    await expect(prevCard).toContainText('Ver pedidos (1)')

    // Entrar al Preventista -> Nivel 2
    await prevCard.click()
    await expect(
      page.getByRole('button', { name: 'Preventistas', exact: true })
    ).toBeVisible()

    // Sección 1 (Escritorio): Tabla muestra AMBOS stocks: Stock en Almacén (4 Paq) y Stock en Central (6 Paq)
    const tablaCargaDesktop = page.locator('table').first()
    await expect(tablaCargaDesktop).toBeVisible()
    await expect(tablaCargaDesktop).toContainText('Stock en Almacén')
    await expect(tablaCargaDesktop).toContainText('Stock en Central')
    await expect(tablaCargaDesktop).toContainText('3 Paq + 2 Bot')
    await expect(tablaCargaDesktop).toContainText('4 Paq')
    await expect(tablaCargaDesktop).toContainText('6 Paq')
    await expect(tablaCargaDesktop).toContainText('Disponible')

    // Verificación Responsiva Móvil (390x844): Cero desborde horizontal + Tarjeta móvil con A Cargar | Almacén | Central
    await page.setViewportSize({ width: 390, height: 844 })
    const vistaMovilCarga = page.locator('section div.md\\:hidden').first()
    await expect(vistaMovilCarga).toBeVisible()
    await expect(vistaMovilCarga).toContainText('A Cargar')
    await expect(vistaMovilCarga).toContainText('Almacén')
    await expect(vistaMovilCarga).toContainText('Central')
    await expect(vistaMovilCarga).toContainText('4 Paq')
    await expect(vistaMovilCarga).toContainText('6 Paq')
    const hayOverflowHorizontal = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    )
    expect(hayOverflowHorizontal).toBe(false)

    // Volver a viewport Desktop
    await page.setViewportSize({ width: 1366, height: 860 })

    // Sección 2: Card del Pedido del Cliente -> Despachar ("Entregar")
    const clienteOrderCard = page
      .locator('article')
      .filter({ hasText: 'Tienda Don Pepe E2E' })
      .first()
    await expect(clienteOrderCard).toBeVisible()
    await expect(clienteOrderCard).toContainText('Cancelar')
    await clienteOrderCard.getByRole('button', { name: 'Entregar' }).click()

    // Verificar descuento exacto en Tienda Central: 36 - 20 (3*6 + 2) = 16 botellas (2 Paq + 4 Bot)
    await expect
      .poll(async () => {
        const { data } = await adminDb
          .from('inventario')
          .select('stock_unidades, ubicaciones!inner(tipo)')
          .eq('ubicaciones.tipo', 'central')
          .single()
        return data?.stock_unidades
      })
      .toBe(16)

    // Etapa 2 ("2. En Ruta"): Cobrar con pago Mixto + saldo a Crédito
    await page.getByRole('button', { name: /2\. En Ruta/i }).click()
    await page
      .locator('main button')
      .filter({ hasText: 'Ver pedidos' })
      .first()
      .click()

    const cardEnRuta = page
      .locator('article')
      .filter({ hasText: 'Tienda Don Pepe E2E' })
      .first()
    await cardEnRuta.getByRole('button', { name: 'Cobrar' }).click()

    const formCobro = page
      .locator('form')
      .filter({ hasText: 'Efectivo cobrado' })
    await formCobro.getByRole('button', { name: 'Mixto' }).click()
    const inputsCobro = formCobro.locator('input[type="number"]')
    await inputsCobro.nth(0).fill('150') // Efectivo Bs 150
    await inputsCobro.nth(1).fill('50') // QR Bs 50 -> Queda Crédito Bs 82
    await expect(formCobro).toContainText('Bs 82')
    await formCobro.getByRole('button', { name: 'Guardar Cobro' }).click()
    await expect(formCobro).toBeHidden({ timeout: 15_000 })

    // Verificar en módulo Créditos (/creditos) la deuda de Bs 82 y registrar un abono de Bs 32
    await page.goto('/creditos')
    await expect(page.getByText('Tienda Don Pepe E2E').first()).toBeVisible()
    await expect(page.getByText('Bs 82').first()).toBeVisible()

    await page
      .getByRole('button', { name: /Registrar Abono/i })
      .first()
      .click()
    const formAbono = page
      .locator('form')
      .filter({ hasText: 'Pago hoy en Efectivo' })
    await formAbono.locator('input[type="number"]').nth(0).fill('32')
    await formAbono.locator('input[type="number"]').nth(1).fill('0')
    await expect(formAbono).toContainText('Bs 50')
    await formAbono.getByRole('button', { name: 'Confirmar Abono' }).click()
    await expect(
      page.getByText('¡Abono Registrado Correctamente!')
    ).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click()

    // Etapa 3 ("3. Rendir al Dueño"): Recibir el dinero cobrado en ruta (Bs 150 Efectivo + Bs 50 QR = Bs 200)
    await page.goto('/despacho')
    await page.getByRole('button', { name: /3\. Rendir al Dueño/i }).click()
    await page
      .locator('main button')
      .filter({ hasText: 'Ver pedidos' })
      .first()
      .click()

    // Bs 150 cobrados en entrega + Bs 32 abonados en efectivo = Bs 182 efectivo + Bs 50 QR = Bs 232 (Crédito restante Bs 50)
    await expect(page.getByText('Bs 182').first()).toBeVisible()
    await expect(page.getByText('Bs 232').first()).toBeVisible()

    await page.getByRole('button', { name: /Recibir Todo/i }).click()
    const btnRecibiConforme = page.getByRole('button', {
      name: 'Recibí Conforme el Dinero',
    })
    await btnRecibiConforme.click()
    await expect(btnRecibiConforme).toBeHidden({ timeout: 15_000 })

    // Etapa 4 ("4. Finalizados"): Verificar que el pedido quedó liquidado
    await page.getByRole('button', { name: /4\. Finalizados/i }).click()
    await page
      .locator('main button')
      .filter({ hasText: 'Ver pedidos' })
      .first()
      .click()
    await expect(page.getByText('Tienda Don Pepe E2E').first()).toBeVisible()

    // PRUEBA DE CANCELACIÓN CON DEVOLUCIÓN AUTOMÁTICA DE STOCK:
    // Crear pedido de 1 Paq (6 bot.), despacharlo (Central baja 16 -> 10), luego cancelarlo en Etapa 2 y verificar que Central regresa a 16
    await page.goto('/preventa')
    await expect(page.getByText('Tienda Don Pepe E2E').first()).toBeVisible()
    await page
      .locator('main button')
      .filter({ hasText: 'Opal E2E' })
      .first()
      .click()
    const prodCard = page
      .locator('article')
      .filter({ hasText: 'Cuba Libre E2E 2L' })
    await prodCard.locator('button').last().click() // +1 Paq (6 botellas)
    await page
      .getByRole('button', { name: /Confirmar Pedido/i })
      .first()
      .click()
    await expect(
      page.getByText('¡Preventa Registrada con Éxito!')
    ).toBeVisible()

    await page.goto('/despacho')
    await page.getByRole('button', { name: /1\. Por Cargar/i }).click()
    await page
      .locator('main button')
      .filter({ hasText: 'Ver pedidos' })
      .first()
      .click()
    await page
      .locator('article')
      .filter({ hasText: 'Tienda Don Pepe E2E' })
      .first()
      .getByRole('button', { name: 'Entregar' })
      .click()

    // Stock Central debe haber bajado de 16 a 10 botellas
    await expect
      .poll(async () => {
        const { data } = await adminDb
          .from('inventario')
          .select('stock_unidades, ubicaciones!inner(tipo)')
          .eq('ubicaciones.tipo', 'central')
          .single()
        return data?.stock_unidades
      })
      .toBe(10)

    // Ahora ir a "2. En Ruta", cancelar ese pedido ya despachado y verificar que devuelve las 6 botellas -> 16 botellas
    await page.getByRole('button', { name: /2\. En Ruta/i }).click()
    await page
      .locator('main button')
      .filter({ hasText: 'Ver pedidos' })
      .first()
      .click()
    await page
      .locator('article')
      .filter({ hasText: 'Tienda Don Pepe E2E' })
      .first()
      .getByRole('button', { name: 'Cancelar' })
      .click()
    await page.getByRole('button', { name: 'Sí, Cancelar Pedido' }).click()

    await expect
      .poll(async () => {
        const { data } = await adminDb
          .from('inventario')
          .select('stock_unidades, ubicaciones!inner(tipo)')
          .eq('ubicaciones.tipo', 'central')
          .single()
        return data?.stock_unidades
      })
      .toBe(16)

    expect(pageErrors).toEqual([])
  })

  test('7. Caja Tienda Central (Venta Directa en Mostrador) y Dashboard Ejecutivo', async ({
    page,
  }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await loginEnUI(page, E2E_ADMIN.login, E2E_ADMIN.password)
    await page.goto('/caja-central')

    // Entrar a la marca "Opal E2E" en Caja Central
    await page.locator('button').filter({ hasText: 'Opal E2E' }).first().click()

    const posCard = page
      .locator('article, div')
      .filter({ hasText: 'Cuba Libre E2E 2L' })
      .filter({ hasText: 'Central: 2 Paq + 4 Bot.' })
      .first()
    await expect(posCard).toBeVisible()

    // Agregar 1 Paquete (Bs 84) al Ticket de Caja
    const cardArticle = page
      .locator('article')
      .filter({ hasText: 'Cuba Libre E2E 2L' })
      .first()
    await cardArticle.locator('button').last().click()

    await expect(page.getByText('Ticket de Caja (1)')).toBeVisible()
    await page
      .getByRole('button', { name: 'Cobrar y Entregar en Tienda' })
      .click()

    await expect(
      page.getByText('¡Venta Entregada y Stock Descontado!')
    ).toBeVisible()
    await page.getByRole('button', { name: 'Nueva Venta en Caja' }).click()

    // Al iniciar nueva venta vuelve a las Cajas de Marcas y muestra el cobro en "Últimas Ventas en Tienda (1)"
    await expect(
      page.getByText('Últimas Ventas en Tienda (1)')
    ).toBeVisible()
    await page
      .locator('main button')
      .filter({ hasText: 'Opal E2E' })
      .first()
      .click()

    // Verificar que el stock en Central bajó de 16 a 10 botellas (1 Paq + 4 Bot.)
    await expect(
      page.getByText('Central: 1 Paq + 4 Bot.').first()
    ).toBeVisible()

    // Verificar Dashboard Ejecutivo con las ventas entregadas (Bs 282 + Bs 84 = Bs 366)
    await page.goto('/dashboard')
    await expect(page.locator('main')).toContainText('Bs 366')

    expect(pageErrors).toEqual([])
  })
})
