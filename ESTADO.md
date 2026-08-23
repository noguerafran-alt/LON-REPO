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
    ese día (VENTAS) → se guarda en hoja `CIERRE_CAJA`. La
    **comparación** sigue siendo solo por el total. Además se **muestra
    en pantalla** el desglose por categoría del ticket (CAFE, BAKERY,
    GENERICO...) — informativo, no se compara ni se guarda. Ver
    “Cierre de caja: categorías del ticket” más abajo para la historia
    de esta decisión, que fue y volvió.
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
- **Cierre de caja / OCR**: probándolo en el celular el 2026-08-23 **no
  reconoció el total** ("No se encontró el total en la foto"). Se
  reforzó en tres frentes (ver sección propia más abajo), pero **sigue
  sin haber una prueba exitosa contra un ticket real**: el usuario tiene
  que volver a probarlo. Si aún así falla seguido, el camino no es
  seguir ajustando el OCR sino apoyarse en la lista de montos
  candidatos (que ya no requiere tipear) o pedir el total a mano
  directamente. **Falta que el usuario diga qué número exacto vio en
  pantalla** el 2026-08-23 (reportó “$1000 menos”): si fue 445.800 ya
  queda cubierto por la corrección con la suma de categorías; si fue
  otro, hay algo más que mirar.
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

## Cierre de caja: categorías del ticket (2026-08-23, segunda vuelta)

El desglose por categoría se había implementado, se **sacó** ese mismo
día por pedido del usuario, y se volvió a pedir unas horas después. No
es una contradicción: lo que se sacó fue **comparar** las categorías del
ticket contra las de LON (no coinciden, no tiene sentido); lo que se
pidió ahora es solo **verlas en pantalla** al escanear, además del
total. La comparación y lo que se guarda en `CIERRE_CAJA` no cambiaron
— siguen siendo las 6 columnas A-F, solo el total.

**Cómo se detecta cuál línea es una categoría.** En el papel la
categoría está en negrita y más grande (`32 CAFE  $ 187.300,00`) y sus
productos van indentados debajo. El OCR no ve negrita ni tamaño, y la
sangría se pierde seguido, así que no se puede usar el aspecto. Lo que
**siempre** se cumple es que los productos de una categoría suman el
monto de la categoría: 32 CAFE = 187.300 = 24.800 + 52.200 + 60.000 +
14.400 + 23.000 + 6.400 + 6.500. `extraerCategoriasDelTicket` recorre
los renglones y toma como categoría la que cierra con los siguientes
(`cuantosProductosCierran`); si un renglón no cierra por un error de
lectura, cae a la heurística de “nombre todo en MAYÚSCULAS y sin
sangría”. Esto además resuelve el caso molesto de los productos que
también están en mayúsculas (`1 NUEZ C/ CHOCOLATE`, `1 VELA HARROW`):
no se cuentan como categoría porque ya fueron consumidos como producto
de la de arriba.

Detalles que importan: se lee solo la sección “DETALLE DE PRODUCTOS
DESPACHADOS” y se corta en “OTROS MOVIMIENTOS”, para no sumar los
**retiros de caja** (`Total Retiros: $ -140.000,00`) como si fueran
ventas. `DESCUENTOS` viene en negativo y se respeta el signo — es lo que
hace que la suma cierre. El símbolo `$` es opcional en el regex del
renglón porque el OCR lo lee como `S` o `5`; lo que ancla el renglón son
los dos decimales del final.

**Fila de control “Suma de categorías”**: se muestra la suma y se avisa
en rojo si no coincide con el total vendido. No es decoración — es la
forma de darse cuenta de que el OCR leyó mal un renglón, que es
precisamente el tipo de error que si no se ve termina guardado en la
hoja. Probado contra la transcripción del ticket real del 2026-08-23:
detecta las 12 categorías, ninguna de más, y la suma da 446.800 = total
vendido.

**Corrección del total con la suma (el caso “me restó $1000”).** El
2026-08-23 el usuario reportó que la app mostró en pantalla un total
distinto (menor) al del ticket. No es un bug del código: el camino
input → `POST /admin/cierre-caja` → hoja manda el número tal cual, sin
transformarlo. Es Tesseract leyendo mal **un dígito** (`446.800` →
`445.800`), y eso no se arregla con regex.

Lo que sí se puede hacer es detectarlo, porque el ticket trae la
información dos veces. El monto de una categoría que **cerró con sus
productos** está validado por dos lecturas independientes del papel; el
total vendido se leyó una sola vez. Así que cuando todas las categorías
con monto positivo cerraron (`sumaConfiable`), la suma es más confiable
que el total leído y aparece un botón **“Usar $X (suma de
categorías)”**. Es un botón y no una corrección automática a propósito:
el número termina en una planilla de plata y el admin tiene que poder
mirar el papel antes. Si el total no se encontró en la foto pero las
categorías cuadran, la suma se carga sola en el input (avisando).

Ojo con la asimetría: si el dígito mal leído cae en una **categoría** y
no en el total, esa categoría no cierra con sus productos,
`sumaConfiable` da falso y solo se avisa — no se ofrece corregir nada,
que es lo correcto. Verificado con Node simulando el total en 445.800:
avisa y ofrece corregir a 446.800.

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
