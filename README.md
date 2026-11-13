# Distribuidora-luy

Sistema integral de gestión para distribuidora de bebidas (**BevFlow**):

- **Preventa en Ruta (Online / Offline con Dexie.js)** y cotizaciones con precios por paquete, mayorista, botella suelta y paquetes surtidos.
- **Cadena de Custodia en 4 Etapas**:
  1. Pedido Pendiente en Tienda.
  2. Entrega de carga al Preventista (descuento automático de stock en Tienda Central).
  3. Entrega y cobro al Cliente en ruta (Efectivo, QR, Mixto o Crédito).
  4. Rendición y entrega de dinero recaudado al Dueño con Acta PDF firmable.
- **Almacén, Compras con Costo Ponderado y Traspasos** entre Depósito y Tienda Central.
- **Dashboard Financiero para el Dueño**: Ganancia neta real por Día, Mes, Año o Rango, control de créditos y gestión de accesos/contraseñas de preventistas.

## Instalación y ejecución local

1. Copiar `.env.example` a `.env` y completar las credenciales de Supabase.
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Iniciar entorno de desarrollo:
   ```bash
   npm run dev
   ```
