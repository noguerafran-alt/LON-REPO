# ESTADO.md — LON Philosophy

> **Mantenimiento**: este archivo se actualiza en el **mismo commit**
> que cualquier cambio de código — ver `CLAUDE.md`. No es un changelog
> retroactivo perfecto: empieza a llevarse desde acá en adelante.
>
> Última actualización: **2026-08-23**

## Qué hace la app hoy

- **Catálogo público** (`public/index.html`): grilla de productos con
  destacados (carrusel infinito con swipe), filtro por categoría/
  subcategoría con scroll infinito, buscador, detalle de producto con
  deep-link (`?producto=SKU`), carrito, checkout de un producto o del
  carrito, login de cliente con Google ("Mi cuenta"), programa de
  fidelidad de café.
- **Checkout**: Transferencia bancaria (siempre disponible), Mercado
  Pago (con recargo % configurable por categoría del ticket, avisa el
  aumento antes de pagar) y Payway (integrado pero con el radio oculto
  en el frontend — `PAYWAY_HABILITADO = false` en `index.html`, falta
  confirmar el endpoint de checkout hospedado con soporte de Payway
  antes de habilitarlo). **Todo esto es solo para comprar UN producto a
  la vez** — el carrito solo admite transferencia.
- **Panel admin** (`public/admin.html`), pestañas:
  - **Escanear** (nivel 1+2): venta por cámara (QR/código de barras),
    "Vender por lector" (sin cámara, para lector de mano o búsqueda con
    scroll de categorías), "Venta manual" (buscador con foto), "Café
    (fidelidad)", "Reconocer producto por foto" (hash perceptual).
  - **Productos** (nivel 2): generar unidades nuevas, asociar código de
    barras externo, crear producto, subir fotos, config de categorías.
  - **Catálogo** (nivel 2): nombres visibles de categoría + recargo MP
    por categoría, tarifas de envío, catálogo completo (editar precio/
    proveedor/recargo MP/visibilidad, vender, borrar, todo inline).
  - **Pedidos** (nivel 1+2): ver/filtrar pedidos online, cambiar estado,
    registrar la unidad física que sale del local.
  - **Cierre de caja** (nivel 2 exclusivo): foto del ticket del POS del
    local → OCR en el navegador (Tesseract.js) busca el **total
    vendido** → se compara contra el total que la app tiene escaneado
    ese día (VENTAS) → se guarda en hoja `CIERRE_CAJA`. **Ojo:
    comparación solo por el total, sin desglose por categoría** —
    pedido explícito del usuario el 2026-08-23 después de haberse
    implementado primero con desglose (se sacó).
  - **Usuarios** (nivel 2 exclusivo): alta/baja/nivel de cuentas admin.
- **Bots/integraciones**: chatbot de WhatsApp (Cloud API), mail de
  confirmación de transferencia (Gmail SMTP), SEO dinámico por producto
  (`seo.js`) + sitemap.

## Hojas de Google Sheets usadas

**Planilla `SHEET_ID_PRODUCTOS`**: `Productos`, `STOCK` (o el nombre en
`HOJA_STOCK`), `Config` (categorías/subcategorías + nombre visible +
recargo MP), `CODIGOS_BARRA`, `VISITAS`, `Envios`, `CONTADOR_UNIDADES`,
`IMPRIMIR`, `IMPRIMIR APP`, `HISTORICO_SKU`.

**Planilla `SHEET_ID_VENTAS`**: `VENTAS`, `PEDIDOS`, `Clientes`,
`AdminUsers`, **`CIERRE_CAJA` (creada 2026-08-23, hay que verificar que
el usuario ya le puso los encabezados: Fecha, Hora, Total Ticket, Total
Escáner, Diferencia, Vendedor — A a F)**.

## Pendiente / a medias

- **Payway**: código completo (`payway.js`, endpoints, webhook) pero
  deshabilitado en el frontend. Falta confirmar con soporte de Payway
  el endpoint real de checkout hospedado antes de poner
  `PAYWAY_HABILITADO = true`.
- **Mercado Pago / Payway en el carrito**: no implementado, solo
  transferencia. Si se pide, hay que resolver el recargo MP cuando el
  carrito tiene productos de categorías distintas (cada una con su %).
- **Cierre de caja**: el OCR (`buscarTotalEnTicket` en `admin.html`)
  busca la línea con la palabra "total" de mayor monto. No probado
  contra fotos reales de tickets arrugados en un dispositivo real — el
  usuario tiene que probarlo y avisar si el reconocimiento falla
  seguido (en ese caso, conviene bajar a "siempre pedir que se escriba
  a mano" en vez de confiar en el OCR).
- **`README.md` desactualizado**: todavía describe la v1 (solo escáner
  QR → Sheets). No se tocó esta sesión — si se necesita para onboarding
  de alguien nuevo, reescribir.
- **`npm audit`**: 0 vulnerabilidades a la fecha de esta nota
  (`googleapis` se actualizó a 174.0.1 para resolver 4 moderadas). Si
  vuelve a haber, revisar antes de asumir que es indispensable
  actualizar (algunas majors de `googleapis` no tocan la API de Sheets
  que usa esta app).

## Bugs corregidos recientemente que vale la pena recordar

- **Precio duplicado en VENTAS (columnas E/F)**: pasaba en productos
  SIN precio de catálogo — el procesador terminaba copiando el mismo
  número a las dos columnas. Se corrigió limpiando F cuando no hay
  catálogo real con qué comparar (`procesarVentasNuevas` en
  `googleSheets.js`).
- **`extraerSkuGeneral` le come un bloque de más**: la función simple
  (no la "robusta") siempre saca el último bloque separado por `-`, sin
  mirar si es numérico. Si se le pasa un SKU general "pelado" (sin
  serial), lo corrompe. `/producto/:sku` en `server.js` ahora prueba
  también el valor crudo directo contra el catálogo antes de rendirse
  — importante tenerlo en cuenta si se agrega otro lugar que resuelva
  SKUs a mano.
- **XSS en `cliente.html`**: el nombre/SKU del log de "últimos
  escaneados" iba a `innerHTML` sin escapar — el contenido de un
  QR/código de barras es texto arbitrario y no confiable. Corregido con
  `textContent`.

## Convenciones/decisiones no obvias (ver también CLAUDE.md)

- El local vende también por un **POS de café/gastronomía separado**
  (tickets con categorías tipo CAFE, BAKERY, GENERICO — no son las
  categorías de LON). El Cierre de Caja compara el TOTAL general de ese
  ticket contra el total de VENTAS, nunca por categoría.
- Todas las columnas nuevas de Sheets se agregan **al final** de la
  hoja correspondiente (nunca insertando en el medio), para no correr
  las columnas de datos ya cargados. Los encabezados de fila 1 los
  escribe el usuario a mano — la app nunca los gestiona.
