# ESTADO.md — LON Philosophy

> **Mantenimiento**: este archivo se actualiza en el **mismo commit**
> que cualquier cambio de código — ver `CLAUDE.md`. No es un changelog
> retroactivo perfecto: empieza a llevarse desde acá en adelante.
>
> Última actualización: **2026-08-23 (noche)**

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
    local → OCR en el navegador (Tesseract.js; la foto nunca se sube) →
    parser de las **categorías en negrita** + total vendido → si hay
    `OPENROUTER_API_KEY`, un modelo **gratis** (`:free`) revisa el
    *texto* OCR (no la foto; no usa Anthropic) → se
    muestran las categorías editables, se exige que sumen el total, se
    comparan contra lo escaneado hoy (VENTAS) y se guarda en
    `CIERRE_CAJA` (totales A-F + desglose G-I). La comparación contra
    el escáner sigue siendo solo por el total: las categorías del POS
    no se cruzan con las internas de LON.
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
`AdminUsers`, **`CIERRE_CAJA`** (A-F ya existían: Fecha, Hora, Total
Ticket, Total Escáner, Diferencia, Vendedor. **Agregar a mano en la
fila 1**, al final: **G Categorias**, **H Suma categorias**, **I
Detalle JSON** — la app nunca escribe encabezados).

## Pendiente / a medias

- **Payway**: código completo (`payway.js`, endpoints, webhook) pero
  deshabilitado en el frontend. Falta confirmar con soporte de Payway
  el endpoint real de checkout hospedado antes de poner
  `PAYWAY_HABILITADO = true`.
- **Mercado Pago / Payway en el carrito**: no implementado, solo
  transferencia. Si se pide, hay que resolver el recargo MP cuando el
  carrito tiene productos de categorías distintas (cada una con su %).
- **Cierre de caja / OCR**: el 2026-08-23 a la noche el usuario mandó
  un ticket real de ejemplo (total vendido $296.400, categorías
  LIBROS PERIPLO / ADICIONALES / CAFE / GENERICO / COMIDA / CAFE
  MOLIDO / LIBROS JULITA) y pidió (1) guardar lo vendido por día en
  cada categoría en negrita, (2) que el análisis tenga siempre
  números correctos, (3) usar IA si hace falta. El parser local, con
  esa transcripción, cierra exacto ($296.400). Sigue haciendo falta
  una prueba con foto real desde el celular. Si Tesseract entrega
  texto sucio, un modelo gratis de OpenRouter (si hay
  `OPENROUTER_API_KEY`) revisa ese texto — la foto no sale del
  navegador. Sin esa key, igual funciona el parser local.
- **`README.md` desactualizado**: todavía describe la v1 (solo escáner
  QR → Sheets). No se tocó esta sesión — si se necesita para onboarding
  de alguien nuevo, reescribir.
- **`npm audit`**: 0 vulnerabilidades a la fecha de esta nota
  (`googleapis` se actualizó a 174.0.1 para resolver 4 moderadas). Si
  vuelve a haber, revisar antes de asumir que es indispensable
  actualizar (algunas majors de `googleapis` no tocan la API de Sheets
  que usa esta app).

## Cierre de caja: por qué el OCR fallaba (2026-08-23)

La primera versión pasaba la foto cruda a Tesseract y buscaba con un
solo regex la línea que dijera exactamente "total". Contra un ticket
térmico real eso casi no funciona. Se cambió a:

1. **Preprocesado en canvas antes del OCR** (`prepararFotoTicket`): la
   foto se escala a ~1600px de ancho (Tesseract necesita letra grande;
   la foto de celular trae el ticket chico en el medio), se pasa a
   grises y se le estira el contraste al rango real de la imagen. Se
   hacen **dos pasadas**: primero solo grises, y si no aparece el total,
   una segunda binarizada en blanco y negro con umbral sacado del
   promedio — es la que salva los tickets impresos flojos. Sigue siendo
   todo local, la foto nunca sale del navegador.
2. **Búsqueda del total tolerante a errores de OCR**
   (`buscarTotalEnTicket`): "TOTAL" se reconoce también cuando sale
   T0TAL / TQTAL / IOTAL / T07AL (`REGEX_PALABRA_TOTAL`); si la etiqueta
   quedó sola porque el OCR cortó la línea, se busca el importe en la
   **línea siguiente**; se prefieren las etiquetas fuertes ("total
   vendido", "total general", "venta total") por sobre el simple mayor,
   así un SUBTOTAL grande no gana; y se descartan las líneas de
   "cantidad total de items", IVA, descuentos y anulados.
3. **Salida siempre útil aunque el OCR falle**: debajo del botón se
   listan los **montos candidatos** encontrados en el ticket (>= $1000,
   de mayor a menor, con la línea de origen en el `title`) para tocar el
   correcto sin tipear, y un `<details>` **"Ver el texto que se leyó de
   la foto"**. Ese último es el que permite distinguir "la foto salió
   ilegible" de "se leyó bien pero no se encontró la palabra total" —
   sin eso no hay forma de saber por qué falló.

**Bug de plata que salió de paso**: el parser viejo borraba todos los
puntos y cambiaba la coma por punto. Con `446.800,00` andaba, pero
cuando el OCR lee la coma decimal como punto (`446.800.00`, pasa
seguido) devolvía **44.680.000** — 100 veces el total, y se guardaba así
en `CIERRE_CAJA`. El `parseMontoOcr` nuevo decide cuál separador es el
decimal por la cantidad de dígitos que le siguen (3 → miles, 1 o 2 →
decimal), así que `446.800,00`, `446.800.00`, `446,800` y `446.800`
dan todos 446800. Hay 12 casos de prueba de esta lógica corridos a
mano con Node (no quedaron en el repo: no hay runner de tests todavía).

## Cierre de caja: categorías del ticket (2026-08-23, tercera vuelta)

Se pidió de nuevo, ahora **guardar** lo vendido por día en cada
categoría en negrita del ticket (no solo mostrarlo). La comparación
contra el escáner de LON **sigue siendo solo el total**: las taxonomías
no se cruzan. Lo nuevo es el desglose POS → columnas G-I.

**Cómo se detecta cuál línea es una categoría.** En el papel va en
negrita y más grande (`17 CAFE  $ 95.000,00`) y sus productos van
indentados debajo. El OCR no ve negrita ni tamaño. Lo que **siempre**
se cumple es que los productos de una categoría suman el monto de esa
categoría. `extraerCategoriasDelTicket` (ahora en `ticketCierre.js`,
compartido entre navegador y servidor) toma como categoría la que
cierra con los renglones siguientes; si un renglón no cierra, cae a
“nombre todo en MAYÚSCULAS y sin sangría”. Los productos que también
están en mayúsculas (`1 LIBROS` debajo de LIBROS JULITA) no se cuentan
como categoría porque ya fueron consumidos como producto de la de
arriba.

Se lee solo “DETALLE DE PRODUCTOS DESPACHADOS” y se corta en “OTROS
MOVIMIENTOS” / “Total vendido”, para no sumar retiros. `DESCUENTOS`
viene en negativo y se respeta el signo.

**Números correctos.** Si todas las categorías con monto positivo
cerraron con sus productos, la suma es más confiable que el renglón
“Total vendido” (que se leyó una sola vez y Tesseract puede cambiarle
un dígito). En ese caso el total se corrige a la suma. Si después de
editar a mano las categorías no cierran con el total, al guardar
pregunta; no se silencia.

**IA.** Opcional y **gratis**: OpenRouter con un modelo `:free`
(default `z-ai/glm-5.2:free`, se cambia con `OPENROUTER_MODEL`).
No usa `ANTHROPIC_API_KEY` (esa cobra tokens y queda solo para el
chatbot de WhatsApp). Recibe el texto OCR, nunca la foto. Si el
parser local ya cierra y la IA no, se descarta la IA. Si la IA
cuadra (suma = total) y el local no, gana la IA. Siempre se muestra
para que el admin mire el papel. Sin `OPENROUTER_API_KEY` el cierre
funciona igual, solo con el parser.

**Hoja.** G = texto `17 CAFE $95.000 | 5 COMIDA $27.600 | ...`, H =
suma, I = JSON para el historial del panel. Encabezados los pone el
usuario a mano.

Ticket de ejemplo del 2026-08-23 (noche), parser local:

| Categoría | Cant. | Monto |
|---|---|---|
| LIBROS PERIPLO | 1 | 36.000 |
| ADICIONALES | 3 | 5.700 |
| CAFE | 17 | 95.000 |
| GENERICO | 3 | 38.200 |
| COMIDA | 5 | 27.600 |
| CAFE MOLIDO | 1 | 28.000 |
| LIBROS JULITA | 1 | 65.900 |
| **Total vendido** | | **296.400** |

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
  categorías de LON). El Cierre de Caja **compara** el TOTAL general de
  ese ticket contra el total de VENTAS, nunca por categoría. El desglose
  por categoría sí se **muestra** en pantalla, pero es una lectura del
  papel: no se cruza con nada nuestro ni se guarda.
- Todas las columnas nuevas de Sheets se agregan **al final** de la
  hoja correspondiente (nunca insertando en el medio), para no correr
  las columnas de datos ya cargados. Los encabezados de fila 1 los
  escribe el usuario a mano — la app nunca los gestiona.
