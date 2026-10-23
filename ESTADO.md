# ESTADO.md — LON Philosophy

> **Mantenimiento**: este archivo se actualiza en el **mismo commit**
> que cualquier cambio de código — ver `CLAUDE.md`. No es un changelog
> retroactivo perfecto: empieza a llevarse desde acá en adelante.
>
> Última actualización: **2026-10-22**

## Qué hace la app hoy

- **Catálogo público** (`public/index.html`): grilla de productos (sin
  sección de destacados desde 2026-10-21; los «recomendados» del detalle sí
  quedan), filtro por categoría/
  subcategoría con scroll infinito, buscador, detalle de producto con
  deep-link (`?producto=SKU`), carrito, checkout de un producto o del
  carrito, login de cliente con Google ("Mi cuenta"), programa de
  fidelidad de café.
- **Checkout**: Mercado Pago Checkout Pro (producto único y carrito
  multi-item, con recargo % configurable por categoría) y Payway
  (código en `/crear-pago`, radio oculto en el frontend —
  `PAYWAY_HABILITADO = false`). **Transferencia bancaria ya no se
  admite** en el flujo público: `/crear-pago` y `/crear-pago-carrito`
  la rechazan; `/config-publico` no expone CBU/alias. El carrito crea
  una preferencia multi-item, aplica recargos por categoría, guarda
  `pagoExternoId` en todos los pedidos del grupo y devuelve
  `{ok, pedidoIds, redirectUrl}`.
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
    `OPENROUTER_API_KEY`, un modelo **gratis con visión** lee la foto
    chica del ticket (Tesseract solo no alcanza contra un ticket real)
    → se
    muestran las categorías editables, se exige que sumen el total, se
    comparan contra lo escaneado hoy (VENTAS) y se guarda en
    `CIERRE_CAJA` (totales A-F + desglose G-I). La comparación contra
    el escáner sigue siendo solo por el total: las categorías del POS
    no se cruzan con las internas de LON.
  - **Usuarios** (nivel 2 exclusivo): alta/baja/nivel de cuentas admin.
  - **Contenido** (nivel 2; antes «Landing»): editor de la portada (/)
    con el mismo modelo que el «Contenido» de PROA. Ver sección
    «Admin › Contenido» más abajo.
  - **Carta** (nivel 2): editor de `/carta` (secciones, categorías, productos,
    precios, traducciones, fotos). Ver «Editor de la carta» más abajo.
- **Bots/integraciones**: chatbot de WhatsApp (Cloud API), mail de
  confirmación de transferencia (Gmail SMTP), SEO dinámico por producto
  (`seo.js`) + sitemap.

## Hojas de Google Sheets usadas

**Planilla `SHEET_ID_PRODUCTOS`**: `Productos`, `STOCK` (o el nombre en
`HOJA_STOCK`), `Config` (categorías/subcategorías + nombre visible +
recargo MP), `CODIGOS_BARRA`, `VISITAS`, `Envios`, `CONTADOR_UNIDADES`,
`IMPRIMIR`, `IMPRIMIR APP`, `HISTORICO_SKU`, `Carta` (la carta del café, ver «Editor de la carta»).

**Planilla `SHEET_ID_VENTAS`**: `VENTAS`, `PEDIDOS`, `Clientes`,
`AdminUsers`, **`CIERRE_CAJA`** (A-F ya existían: Fecha, Hora, Total
Ticket, Total Escáner, Diferencia, Vendedor. **Agregar a mano en la
fila 1**, al final: **G Categorias**, **H Suma categorias**, **I
Detalle JSON** — la app nunca escribe encabezados).

## Pendiente / a medias

- **Factura electrónica (ARCA)**: arrancada el 2026-10-20. Hay un módulo
  nuevo `arca.js` con la lógica del comprobante y su autochequeo
  (`node arca.js`), pero **todavía no emite nada** y **no lo llama nadie**:
  falta el certificado y el cliente WSAA/WSFE. La app funciona igual que
  antes. Ver la sección propia más abajo.

- **Payway**: código completo (`payway.js`, endpoints, webhook) pero
  deshabilitado en el frontend. Falta confirmar con soporte de Payway
  el endpoint real de checkout hospedado antes de poner
  `PAYWAY_HABILITADO = true`.
- **Payway en el carrito**: no implementado (solo Mercado Pago). El
  recargo MP por categoría distinta en el carrito ya se aplica item a
  item en `/crear-pago-carrito`.
- **Webhook MP multi-pedido**: la preferencia del carrito usa
  `external_reference` = primer `pedidoId`; el webhook actualiza ese
  pedido. Los demás del grupo quedan con el mismo `pagoExternoId`
  (id de preferencia) hasta reconciliación manual/mejoras futuras.
- **Cierre de caja / OCR**: el 2026-08-23 a la noche el usuario mandó
  un ticket real de ejemplo (total vendido $296.400, categorías
  LIBROS PERIPLO / ADICIONALES / CAFE / GENERICO / COMIDA / CAFE
  MOLIDO / LIBROS JULITA) y pidió (1) guardar lo vendido por día en
  cada categoría en negrita, (2) que el análisis tenga siempre
  números correctos, (3) usar IA si hace falta. El parser local, con
  esa transcripción, cierra exacto ($296.400). Contra la **foto** real
  Tesseract+texto solo encontró CAFE ($95.000). Ahora, si hay
  `OPENROUTER_API_KEY`, se manda una foto chica a un modelo :free con
  visión y se elige la lectura que cierra (suma de categorías = total).
  Sin esa key, sigue el parser local.
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

**IA.** Opcional y **gratis**: OpenRouter. Default de visión
`google/gemma-4-31b-it:free` (`OPENROUTER_VISION_MODEL`); si no
cierra, se prueba el modelo de texto `OPENROUTER_MODEL`. No usa
Anthropic. Se elige la lectura de mayor puntaje (gana la que suma
exacto el total). Siempre se muestra para que el admin mire el papel.

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

## Admin › Contenido (landing editable, 2026-10-08)

- Hoja `Landing` (clave/valor, `SHEET_ID_PRODUCTOS`). `LANDING_DEFAULTS`
  (googleSheets.js) siembra **solo las claves que faltan**; nunca se
  reescriben valores guardados. Guardar manda solo los campos del
  formulario.
- Editable: textos de cada sección (hero, quiénes somos, pilares, el
  espacio, franja catálogo, footer),
  fotos + alt, video de fondo opcional del hero (`hero_video`,
  `POST /admin/landing/video`, hasta `VIDEO_MAX_BYTES` = 40 MB, sin
  transcodificar), fuente general (`landing_fuente`) y de títulos
  (`landing_titulos_fuente`), y por cada bloque de texto
  `<bloque>_fuente` / `_alineacion` / `_tamano` (px 6–120) / `_estilo`
  (normal|bold|italic|bolditalic). Vacío = como se veía antes.
- Render: `public/lon-contenido.js` (`LONContenido.aplicar`) valida todo
  con lista blanca y lo escribe en un `<style>` propio con `!important`.
  Las fuentes se sanean al renderizar (comillas rotas → se re-arma la
  lista; inválida → la de la página), igual que el fix de PROA: un valor
  como `Fraunces', Georgia, serif` dentro de `var()` hacía caer a Times.
  Los bloques de texto (`BLOQUES_TEXTO` en landing.html) y los
  `data-lc-ajustes` de admin.html tienen que usar los mismos nombres.
- Subir foto/video **no publica**: solo deja la URL en el formulario
  hasta tocar Guardar (barra Guardar/Recargar pegada abajo; Recargar
  pide confirmación si hay cambios sin guardar).
- **Fijo en código a propósito** (no son campos): links de los CTA
  (/tienda e Instagram), link de Instagram del footer, menú/categorías,
  header y logo, carrito, Privacidad/Términos/Acceso admin, orden de
  secciones. Las claves viejas `ig_handle`, `cta_secondary_href` y
  `logo` siguen en la hoja pero ya no se editan ni las usa la landing
  (`ig_handle` sí lo sigue leyendo /tienda, y la landing lo usa solo
  como texto de respaldo del @ del footer si `footer_ig_texto` está
  vacío).
- Video del hero con el fix de autoplay de iOS de PROA (#53): muted /
  playsinline como propiedades **y** atributos antes de `src`, invisible
  hasta que reproduce, reintento en el primer gesto. **Sin botón de
  play/pausa** ni nada tocable (2026-10-08): siempre en bucle y sin
  controles; si iOS lo bloquea, queda solo la foto.

## Traducción automática del Contenido (2026-10-21)

- `POST /admin/landing/traducir` (nivel 2, `limiteAdmin`): body
  `{ textos: { clave: españolTexto } }` -> `{ ok, traducciones: { clave: { en, fr, pt } } }`.
  Una sola llamada a OpenRouter por pedido (`llamarOpenRouter` +
  `OPENROUTER_MODEL`, fallback a `openrouter/free`), gratis. Requiere
  `OPENROUTER_API_KEY` en Render; sin ella responde 503 «Falta
  OPENROUTER_API_KEY…» y el admin lo muestra. Prompt, validación del pedido
  y de la respuesta del modelo (JSON, solo claves pedidas, strings, largo)
  en `traduccionLanding.js` (autochequeo: `node traduccionLanding.js`).
- Admin › Contenido: al cambiar un texto en español (evento `change`) se
  rellenan sus casillas en/fr/pt vacías o ya rellenadas automáticamente
  (`data-auto`); lo que el dueño escribió a mano no se pisa. Botón
  «Traducir todo lo vacío» manda en un pedido todos los textos con alguna
  traducción vacía y rellena solo las vacías. Muestra «Traduciendo…» y
  deshabilita botones; si falla, mensaje y no se toca nada.
- Nunca se guarda solo: solo rellena casillas; se publica con Guardar.
- No verificado: el admin con login de Google ni la llamada real a OpenRouter
  (sin credenciales); la lógica del front se revisó por código.

## Grilla de /tienda estilo catálogo de lujo + precios en pesos / US$ (2026-10-22)

- **Grilla** (`.grilla-catalogo-publico` / `.item-catalogo-publico`, `public/index.html`): de borde a borde (margen negativo del gutter de `#vistaCatalogo`, con `overflow:hidden` y `border-left` de 1px entre columnas; la línea de la primera columna queda fuera de pantalla para no generar scroll horizontal), sin tarjeta/radio/sombra, foto 3:4 `object-fit:cover` sobre `#f2f1ef`, nombre y precio a 13px peso normal debajo, hover = leve zoom de la foto (solo `@media (hover:hover)`, sin animación con reduce-motion). En <=900px además línea de 1px entre filas. Respeta el selector 2/3 (celular 2/3, desktop 3/4) y su localStorage. **Salió el botón «Agregar» y el «En stock» de la grilla** (decisión del dueño por la referencia): se agrega desde el detalle. Cada tarjeta es UN `<a href="/tienda?producto=slug">` (`tarjetaProductoHtml`, la misma para categoría, búsqueda y recomendados); un clic normal lo intercepta un listener delegado y abre el detalle sin recargar, Ctrl/medio clic abre el deep-link. Miniatura con `urlMiniaturaPublica` + `onerror` como antes. Los recomendados del detalle usan `.grilla-catalogo-publico` (se borró `.grilla-relacionados`).
- **Formato de precio único**: `public/precio-lon.js` (`LONPrecio.formatear(pesos, idioma, venta)`, autochequeo `node public/precio-lon.js`); en index.html se usa vía `precioTxt` en grilla, detalle, recomendados, carrito, checkout, resumen y envío estimado. Español o sin cotización: `$ 46.000` (es-AR, separador de miles siempre, sin decimales). EN/FR/PT con cotización: `US$ 33` con el locale en-US/fr-FR/pt-BR, redondeado hacia arriba al entero; si es menor a US$ 10, hacia arriba al centavo (`US$ 5.01`). El aviso de recargo MP muestra siempre pesos (es lo que se cobra).
- **`GET /cotizacion-dolar`** (`server.js`, `limiteLecturaPublica`): consulta `DOLAR_API_URL` (opcional en `config.js`, default `https://dolarapi.com/v1/dolares/blue`, sin clave), usa `venta`, valida número finito entre 100 y 100000, timeout 5 s, cache en memoria de 1 h. Si la API falla devuelve la última cotización buena con su fecha (y reintenta en ~1 min); si nunca tuvo una, 503. Responde `{venta, fecha}`.
- **El dólar es SOLO visual.** Carrito, checkout y Mercado Pago siguen cobrando en pesos con los precios del servidor; no se tocó el backend de pagos. En EN/FR/PT el carrito y el checkout muestran el total en US$ más la línea `t_cobro_pesos` con el monto real en pesos, y al pie de la grilla/detalle va `t_precios_nota` (`#notaPrecios`). El frontend pide la cotización una sola vez por carga y solo si el idioma no es español (o al cambiar a uno); si no hay, muestra pesos. Al cambiar de idioma se repinta todo (`repintarTodo`). Claves nuevas `t_precios_nota` y `t_cobro_pesos` en EN/FR/PT; `t_envio_estimado` y `t_recargo_mp` ya no llevan el `$` pegado (reciben el monto formateado).
- Verificado: autochequeo de formato, server real contra dolarapi (venta devuelta), 503 con URL inválida, stub que responde bien y luego falla (la rama «última buena» por código, no se esperó la hora de cache), Edge/playwright con catálogo simulado de 20 productos (1440px 3 y 4 col, 375px 2 y 3 col, ES/EN/FR, detalle, carrito, checkout). Sin verificar: catálogo real y MP.

## Detalle de producto de borde a borde + línea de recargo MP (2026-10-22)

- Solo `public/index.html` + clave `t_con_mp` (EN/FR/PT) en `idioma.js`. `#catalogoDetalleView` va de borde a borde (margen negativo del gutter). Fotos (`#detalleFotos`): hasta 3 una al lado de la otra (1 foto = ancho completo, 2 = mitades), alto `100dvh - 64px`, `object-fit:cover` sobre `#f2f1ef`, línea blanca de 1px entre fotos; con más de 3 la fila se desliza (scroll-snap, sin barra). Miniaturas (botones con aria-label) abajo a la izquierda, la activa subrayada y sincronizada con el scroll; el clic hace scroll suave salvo `prefers-reduced-motion`.
- **Panel flotante** (`.detalle-panel`, 320px, absoluto abajo a la derecha de la galería, a 92px del borde de abajo para no tapar el botón flotante de WhatsApp): nombre, categoría, stock, línea fina, precio a la derecha (`precioTxt`), recargo MP, «Agregar al carrito» (oscuro, bolsa) y «Comprar ahora» (borde); mismos ids y handlers de antes. La descripción va en el panel si mide <=220 caracteres y debajo de las fotos si es más larga. Recomendados debajo, con la grilla de siempre.
- **#btnVolverDeDetalle** se mudó del header a `#catalogoDetalleView` (absoluto arriba a la izquierda sobre la foto, cuadrado claro); el handler no cambió. Tiene que quedar fuera de `#catalogoDetalleContenido` porque ese se repinta con innerHTML.
- **Recargo MP, solo visual**: bajo el precio, «Con Mercado Pago (+N%): $ X» si la categoría tiene recargo > 0 (usa `GET /recargos-mercadopago` y `aplicarRecargoMP`, la misma cuenta y redondeo que `/crear-pago`; en EN/FR/PT en US$). El servidor y el aviso del checkout no se tocaron: el monto real lo sigue calculando el servidor.
- **Celular (<=600px)**: una foto por pantalla deslizable (70dvh), miniaturas debajo en fila (hacen de puntitos), el panel deja de flotar y va debajo a ancho completo; flecha sobre la foto; sin scroll horizontal de la página.
- **Foto sin zoom en PC (2026-10-22)**: en desktop (`@media (min-width:901px)`; celular/tablet <=900px sin cambios) `.detalle-foto img` usa `max-height:calc(100dvh - 64px)` y `object-fit:contain` centrada: la foto entra entera, con bandas `#f2f1ef` a los costados. Miniaturas, scroll y panel sin cambios.
- Verificado con playwright/Edge y un mock de catálogo (1, 3 y 5 fotos, con/sin stock, sin precio, descripción larga, categoría con recargo 10% y otra sin): 1440px y 375px, ES/EN/FR/PT, agregar al carrito, comprar ahora, volver, visitas, 0 errores de consola. No verificado: catálogo y MP reales.

## Panel ☰ compartido landing + /tienda, categorías reales (2026-10-22)

- **Un solo panel**: `public/menu-lon.js` (HTML, CSS inyectado con prefijo `#panelMenuLon`, abrir/cerrar, Esc, velo, X, foco, `aria-expanded`). Lo usan `landing.html` y `index.html` con `LONMenu.iniciar({boton, alCategoria, alCarrito, alCuenta})`; el HTML y CSS del panel ya NO viven en landing.html. Reemplaza el menucito `#menuHeaderCatalogo` de /tienda (sus «Escanear producto» e «Idioma» están dentro del panel). Se carga después de `idioma.js` (que ahora expone `armarSelectores`, porque el panel se crea por JS).
- **Sin lista fija de categorías**: se sacaron los links hardcodeados y las claves `g_cat_*` de idioma.js. Las manda cada página con `LONMenu.fijarCategorias([{categoria, nombre}])`. Landing: `GET /catalogo-categorias` (nuevo, `server.js`, `limiteLecturaPublica`, cache en memoria 60 s; solo categorías con productos públicos con stock, mismo cálculo que las pestañas: clave en mayúsculas + `categoriaVisible` del primer producto). /tienda: `categoriasPublicas()` sobre el catálogo ya cargado (no pide nada). Si el pedido falla o no llegó, el panel muestra solo «Ver catálogo completo». Nombres de Sheets, sin traducir.
- **En /tienda** tocar una categoría usa `elegirSugerencia({tipo:'cat'})` (misma selección que las pestañas, sin recargar) y cierra; Carrito / Mi cuenta hacen click en `#btnAbrirCarrito` / `#btnLoginCliente`. En la landing siguen siendo links `/tienda?cat=`, `?carrito=1`, `?cuenta=1`.
- Verificado con playwright + mock (20 productos, 4 categorías) a 375 y 1280px: lista solo de las públicas, con el fetch abortado sin lista, selección/miga/cierre, carrito, cuenta, idioma EN, sin errores de consola. NO verificado: `/catalogo-categorias` contra Sheets reales.

## Pasada 2 de /tienda: buscador desplegable, idioma en el ☰, links directos (2026-10-22)

- **Buscador desplegable** (`#panelBuscador` + `#veloBuscador`, `index.html`): la lupa abre un panel arriba de todo (encima del header, fondo crema, input con solo una línea de 1px, X a la derecha, velo suave). Debajo, «Sugerencias de búsqueda»: con el campo vacío, categorías y subcategorías con conteo (máx 6); al tipear, categorías/subcategorías + nombres de productos (máx 6), comparando sin tildes ni mayúsculas (`normalizarBusqueda`) sobre el catálogo ya cargado (cero pedidos al server). Categoría/subcategoría = misma selección que las pestañas; producto = detalle `?producto=SKU`; Enter = filtra la grilla por texto; X, Esc y velo cierran. Sigue siendo `#inputBuscarCatalogo` (mismo `terminoBusquedaCatalogo`). Claves `t_sugerencias`, `t_sin_sugerencias`, `t_sug_sub_en` en EN/FR/PT.
- **Idioma solo en landing, en el ☰ de /tienda y en la carta `/carta`**. La carta conserva sus banderas por **decisión del dueño (2026-10-22)**: los turistas entran directo por el QR del café, sin pasar por la landing; no sacarlas. Se sacó `data-selector-idioma` de los headers de catálogo, carrito, login, checkout y detalle; vive dentro de `#menuHeaderCatalogo` con rótulo «Idioma». El menú está en el HTML estático, así que `armarSelectores` de `idioma.js` lo arma sin cambios.
- **Links directos**: `/tienda?cuenta=1` hace click en `#btnLoginCliente` (Mi cuenta o login) y `/tienda?carrito=1` en `#btnAbrirCarrito`; después se borra el parámetro con `history.replaceState`.
- **Landing**: en el ☰, Mi cuenta -> `/tienda?cuenta=1` y Carrito -> `/tienda?carrito=1`. En desktop (>=800px) el header agranda ☰ (botón 48px, ícono 28px), logo (40px) y banderas (32x22, gap 10px) con selectores más específicos (`.header .lon-idioma ...`) para no tocar tienda/carta; mobile sin cambios.

## Navegación del catálogo /tienda (2026-10-22)

Patrón de interfaz de tienda de lujo, con identidad propia de LON (íconos de
línea, Fraunces, crema/bordó). Solo `public/index.html` + claves en `idioma.js`.

- **Header** (`.barra-superior-catalogo`): izquierda ☰ (`#btnBuscarHeader`) y
  lupa (`#btnMostrarBuscadorCatalogo`, abre/cierra `#inputBuscarCatalogo` y
  lo enfoca); centro logo; derecha idiomas, usuario (`#btnLoginCliente`) y
  bolsa (`#btnAbrirCarrito` + `#badgeCarrito`). El botón «🔍 Buscar» de la
  fila de categorías ya no existe.
- **Escanear** (`#btnIrCliente`, `/cliente.html`) pasó al menú del ☰
  (`#menuHeaderCatalogo`, desplegable que se cierra al tocar afuera). Antes el
  ☰ solo abría el buscador (llamaba a un `mostrarListaCatalogo` que no
  existe); ahora solo abre ese menú. Al abrir el detalle de un producto
  sigue ocultándose Escanear.
- **Breadcrumb + título + conteo** (`#catalogoEncabezado`, lo pinta
  `renderizarEncabezadoCatalogo`): «CATEGORÍA | SUBCATEGORÍA» en mono con
  tracking y debajo «Nombre [n]» con la cantidad visible. En búsqueda:
  «BUSCAR» / término. Claves nuevas EN/FR/PT: `t_catalogo_miga`,
  `t_grilla_2`, `t_grilla_3`.
- **Pestañas**: texto plano, gris las no elegidas, tinta y subrayado de 2px
  la elegida; las subcategorías (desplegable ▼ de siempre) usan el mismo
  estilo. La lógica de selección y el carrusel en 3 copias no cambió.
- **Selector de grilla** 2/3 a la derecha de las pestañas
  (`data-grilla` en `#catalogoListaView`, clave localStorage
  `lon_grilla_catalogo`). Celular/tablet (<=900px): 2 o 3 columnas (default
  2). Desktop: 3 o 4 columnas (el botón 3×3 = 4 columnas, default, como
  antes). En celular con 3 columnas se oculta «En stock» y se achican
  nombre/precio/botón Agregar.
- Probado con Chrome headless y catálogo simulado (375px y 1280px). No se
  tocaron carrito, login, checkout ni detalle.

## Se quitan los «Destacados» de /tienda (2026-10-21)

- Pedido del dueño: nada de «Destacados» («Piezas que miramos dos veces») en
  /tienda. Se sacó de `index.html` el contenedor, CSS, JS (carga, auto-avance,
  flechas, repintado en `lon-idioma`) y la hidratación de `destacados_titulo`.
  La página arranca directo con Buscar + categorías + grilla. Reemplaza al PR
  #16 (rama `feat/lon-tienda-sin-destacados`), que nunca se mergeó.
- Se QUEDA: los recomendados/relacionados del detalle de producto, y
  `GET /catalogo-destacados` (lo usa la banda con carrusel de fotos de
  `landing.html`, que no es una sección de destacados). También
  `recentrarCarrusel`, que usan las tabs de categoría.
- Admin › Contenido: se sacó la sección «Tienda» (`destacados_titulo`) y la
  clave salió de `LANDING_DEFAULTS` y `LANDING_TEXTOS_BILINGUES`. Una fila
  `destacados_titulo*` que ya exista en la hoja Landing queda intacta, sin uso.
- `idioma.js`: fuera `t_destacados`, `t_ver_anterior`, `t_ver_siguiente` (EN/FR/PT).
- Verificado: /tienda a 375px arranca directo con Buscar, cambio de idioma sin errores. Sin probar con catálogo real (sin credenciales).

## Rediseño de la landing (2026-10-21)

- **Hero sin tinte bordó (decisión del dueño, 2026-10-21)**: foto y video a
  opacidad 1, fondo `#111` solo mientras carga y overlay negro neutro
  (transparente → `.6` abajo) para que se lea el texto.
- **Anti-parpadeo de fotos**: el `<img>` del hero y el de «espacio» ya no traen
  `src`; llevan `data-respaldo="/hero-editorial.webp"` y nacen con opacity 0.
  Con el CMS se pone `hero_imagen`/`espacio_imagen` y se hace fade-in en
  `onload`; el respaldo solo se carga si el fetch falla, la clave viene vacía
  o la foto del CMS da error. Nunca se ve la foto vieja antes (`cargarFoto` /
  `respaldoFotos` en landing.html).
- **Hero a `100dvh`** (con `100vh` de respaldo): al abrir solo se ve el hero.
- **Barra de categorías eliminada**; las categorías y `/carta` viven solo en
  el menú de las tres barras (ya los tenía).
- **Header estilo Zara Home**: `position:fixed`, transparente sobre el hero
  (degradé oscuro suave para que se lea). Al bajar se esconde
  (`translateY(-100%)`), al subir reaparece con fondo bordó. También
  reaparece con el puntero en los 24px de arriba (`#zonaHeader`, que también
  recibe el toque en celular) y con `focusin` dentro del header (teclado; no
  se esconde si el foco está adentro). Con `prefers-reduced-motion` no se
  esconde ni anima (solo cambia a bordó al salir del tope). Selector de
  idioma intacto (`[data-selector-idioma]` sigue en `.right`).
- **Banda con carrusel** reemplaza «Quiénes somos» y «Qué vas a encontrar»:
  banda bordó con el texto de `sobre_lead` (sigue editable desde Contenido) y
  tres fotos a caballo sobre el borde (truco: el contenedor de las fotos
  tiene un `linear-gradient` 50% bordó / 50% transparente, sin calcular
  alturas). Fotos = productos de `/catalogo-destacados` (mismo endpoint que
  la tienda) con `foto`; carrusel infinito con el patrón de `index.html`
  (3 copias + recentrado). Con 3 o menos fotos quedan quietas; sin fotos la
  banda queda solo con el texto. Autoavance apagado con reduced-motion.
- **Campos huérfanos**: `sobre_titulo`, `sobre_cuerpo`, `sobre_foto_a/b`
  (+ `_alt`), `pilares_titulo`, `pilar_N_titulo/texto`: ya se sacaron del
  panel (ver «CMS completo» abajo).
- `/catalogo-destacados` solo trae productos con consultas/visitas y stock:
  si es un sitio nuevo puede venir vacío y la banda sin fotos.
- **Sin verificar en navegador** (solo `node --check` del script): ni a
  375px, ni el comportamiento del scroll.
- **Ícono de Instagram en el hero (2026-10-21)**: SVG inline de solo trazo
  (cuadrado redondeado + círculo + punto), `currentColor`, 20px / stroke 1.3
  como los íconos del header; `.btn-link` es `inline-flex` con gap 8px. NO
  usar el logo/degradé oficial de IG. **El texto va en un `<span>` hijo** con
  `data-landing="cta_secondary_label"` y `data-i18n="l_instagram"`: el CMS y
  `idioma.js` hacen `textContent` sobre el elemento con esos atributos y, si
  estuvieran en el `<a>`, borrarían el SVG. No volver a poner el texto
  directo en el `<a>`. El estilo editable (`hero_ctas` → `.hero .cta-row a`)
  sigue en el `<a>` y el span lo hereda.

## Header de la landing simplificado (2026-10-22)

- Solo `public/landing.html` (la tienda `index.html` y la carta NO cambiaron). Header: ☰ a la izquierda, logo al centro, selector de idioma a la derecha. Escanear (`/cliente.html`), Carrito (`/tienda?carrito=1` desde el PR #37) y Mi cuenta (`/tienda?cuenta=1` desde el PR #37) pasaron al panel del ☰, arriba de las categorías (claves nuevas `g_carrito` y `g_mi_cuenta` en EN/FR/PT). **El header ocupa todo el ancho (sin `max-width`, 2026-10-22): ☰ y banderas en las esquinas de la pantalla, a 20px del borde como el texto del hero; antes, con tope de 1280px, en pantallas anchas quedaban corridos al medio.** **Orden del panel (2026-10-22, pedido del dueño): primero «Categorías» y sus links, «Ver catálogo completo» y debajo «Carta del café», después Escanear / Carrito / Mi cuenta (`.panel-menu-accesos`) y al final las 4 banderas (`.panel-menu-idioma`, un segundo `data-selector-idioma` que `idioma.js` arma solo y sincroniza con el del header).** El panel se abre desde la derecha (lo cambió el PR #35; #34 lo había puesto a la izquierda) y cierra con Esc, tocando afuera o eligiendo un acceso. En mobile el logo mide 34px y en tablet 36px, igual que el de /tienda (`.logo-barra-catalogo`), pedido del dueño 2026-10-22; en PC (≥800px) 40px.
- Banda de fotos en celular (<800px): cada foto mide la mitad del ancho menos el gap, entran dos completas (antes 1,8). Desktop sigue con tres.

## Ocultar textos de la landing con `<clave>_oculto` + panel ☰ a la derecha (2026-10-22)

- Panel ☰ de la landing: ahora se desliza desde la DERECHA (`right:0`, sombra hacia la izquierda); el botón ☰ sigue a la izquierda del header. Reemplaza lo dicho arriba ("desde la izquierda").
- Cada texto de `LANDING_TEXTOS_BILINGUES` suma la clave `<clave>_oculto` (`'si'` o `''`) en `LANDING_DEFAULTS` (esa lista filtra lo que se guarda). `aplicarContenido` (landing.html): con `'si'` el elemento va `display:none` en todos los idiomas (si es el texto de `a.btn-link`, el link entero); idioma.js puede repintar el texto pero queda oculto. Sin la marca, vacío = texto del HTML como siempre.
- Admin › Contenido: al cargar, el español vacío sin `_oculto` se rellena con el texto real del sitio (fetch `/landing.html` + DOMParser, `[data-landing]`; no se duplican textos en admin.html) y no cuenta como cambio. Al guardar, español vacío → `<clave>=''`, `_oculto='si'` y en/fr/pt vacíos; con texto → `_oculto=''`. Vaciar el español también limpia las casillas de traducción y no dispara la traducción automática. Ayuda nueva junto al español. Guarda: el `_oculto='si'` solo se manda si el español tenía texto (o ya estaba oculto) al cargar/rellenar (`dataset.tuvoTexto='1'`); si el fetch de `/landing.html` falla o está pendiente, un vacío manda `_oculto=''` y no toca en/fr/pt (si no, un Guardar ocultaría las 16 claves sembradas en '').
- Por qué NO «vacío = oculto» a secas: la hoja Landing en producción tiene muchas claves sembradas en `''` que el dueño nunca tocó y hoy muestran el texto del HTML; se esfumarían del sitio en vivo.
- Consecuencia: al guardar, un texto que se rellenó desde el HTML queda guardado con ese texto (igual al actual); si después se cambia el HTML, esa clave ya no sigue al HTML. Los separadores « · » del footer quedan si se oculta Privacidad o Términos.
- Verificado con Edge/playwright sobre `/landing-contenido` simulado (375px y 1280px): vacío sin marca muestra el HTML; `catalogo_*` y `cta_secondary_label` con `_oculto` desaparecen (botón entero); panel ☰ pegado a la derecha. NO verificado: el admin en vivo (login) ni la traducción contra OpenRouter.

## CMS completo de la landing (2026-10-21)

- **Se sacaron del panel y de `LANDING_DEFAULTS`** (la landing rediseñada ya no
  dibuja esas secciones; editarlos no cambiaba nada): `sobre_titulo`,
  `sobre_cuerpo`, `sobre_foto_a`, `sobre_foto_b`, `sobre_foto_a_alt`,
  `sobre_foto_b_alt`, `pilares_titulo`, `pilar_1..3_titulo`,
  `pilar_1..3_texto`, `cta_secondary_href`, `logo`, y todos sus
  `_fuente/_alineacion/_tamano/_estilo` (incl. `pilares_items_*`). **Las filas
  de la hoja Landing NO se borraron**: si había algo cargado, queda. `ig_handle`
  se conserva (lo lee /tienda y es respaldo del @ del footer).
- **Doble idioma por texto**: cada texto editable lleva `<clave>` (español) y
  `<clave>_en`. Lista en `LANDING_TEXTOS_BILINGUES` (googleSheets.js):
  hero_eyebrow, hero_tagline, hero_ubicacion, cta_primary_label,
  cta_secondary_label, sobre_lead, espacio_caption, espacio_quote,
  catalogo_cta_texto, catalogo_cta_label, footer_texto y los
  nuevos de abajo. Las alt de fotos y `footer_ig_texto` (es un @) NO son
  bilingües: la alt sigue en español si el CMS la pisa.
  - Cómo decide qué mostrar (`idioma.js`, función `aplicarDom`): el elemento
    lleva `data-i18n-cms` (ahora significa «lo pisó el CMS») y en el dataset
    `lonEs`/`lonEn` (valores del CMS, '' si no hay) y `lonBase` (texto del HTML).
    Español → `lonEs` o, si está vacío, `lonBase`. Inglés → `lonEn`; si está
    vacío, el diccionario `EN` (por su `data-i18n`); si no hay, `lonBase`.
    Cambia en vivo al tocar la bandera (aplicarDom corre en cada cambio) y
    `aplicarContenido` llama a `LONi18n.repintar()` al terminar el fetch.
    Mismo esquema en `landing.html` y en `index.html` (footer_texto).
  - Ojo: con el inglés vacío y un español editado, en inglés se ve el diccionario
    (o el HTML), no el español nuevo. Es lo pedido; para que no pase hay que
    cargar el inglés.
  - Panel: cada texto muestra «… — Español» y «… — English» (la de inglés indica
    que vacía = traducción automática). La casilla `_en` se arma por JS desde
    `data-lc-bi` en admin.html.
- **Claves nuevas (todas vacías en `LANDING_DEFAULTS`)**: `banda_etiqueta`
  (etiqueta vertical «Making community»), `menu_categorias` (título «Categorías»
  del menú lateral), `footer_instagram` (la palabra «Instagram»),
  `footer_privacidad`, `footer_terminos`, todas con su `_en`; más los
  `<bloque>_mayusculas/_interlineado/_espaciado` de abajo. Seed: ~60 filas vacías
  nuevas en la hoja la primera vez que alguien abre el panel.
- **Estilo nuevo por bloque** (`lon-contenido.js`, mismo `<style>` con
  `!important`, valores validados; nunca se interpola el crudo):
  `_mayusculas` (lista blanca `uppercase|lowercase|capitalize`; vacío = tal cual),
  `_interlineado` (`line-height` sin unidad, 1 a 3), `_espaciado`
  (`letter-spacing` en em, -0.05 a 0.5). Fuera de rango se **ignora** (no se
  recorta). Sin control de color a propósito (decisión del dueño). Bloques con
  estilo: los 10 de antes + `banda_etiqueta` (`.lon-banda-etiqueta`; su CSS trae
  `text-transform:uppercase`, el valor del CMS lo pisa).
- **Fijo a propósito**: los `href` de los CTAs y de Instagram, el logo del
  header, y los nombres de las categorías del menú (salen de Sheets, hoja
  Config; tampoco se traducen).
- **Sin verificar en navegador**: ni el panel (casillas `_en`, nueva fila de
  ajustes), ni el repintado en vivo al tocar la bandera, ni contra Sheets real.
  Probado solo: `node --check` de los scripts y los saneadores de
  `lon-contenido.js` en Node (rangos, valor basura, coma decimal).

## Carta del café online (/carta, 2026-10-20)

- **Qué es**: `public/carta.html`, página pública (sin sesión, armada por JS desde `/carta-datos`),
  servida por `app.get('/carta')` en `server.js`. Linkeada desde la landing
  (barra de categorías y menú lateral). Replica la carta impresa: versalitas
  (`font-variant-caps: all-small-caps`), cajas de 1px con esquinas
  redondeadas, marca de agua con `logo-catalogo.png` al 6% de opacidad,
  puntos guía en SWEET BITES/BAKERY/PATISSERIE/DRINKS. Fraunces, sin fuentes
  ni CDN nuevos.
- **Contenido y fotos (desde 2026-10-22)**: ya no están hardcodeados en el HTML:
  salen de la hoja `Carta` y se editan en Admin › Carta. Ver «Editor de la carta»
  (modelo, semilla, endpoints, fallback). Lo que sigue valiendo de antes: el
  diseño (CSS) no cambió; al tocar un producto con foto se abre un `<dialog>`
  nativo (`showModal()`, `::backdrop` oscuro) que cierra con tocar afuera, Esc o
  la X (`c_cerrar_foto`); el fondo no scrollea mientras está abierto
  (`body.foto-abierta`); el aviso «Tocá un producto para ver su foto»
  (`c_aviso_foto`, `#avisoFoto`) arranca `hidden` y se muestra solo si algún
  producto visible tiene foto. Precios y ortografía tal cual el impreso (incluye
  «ORANGE COFFE» y «CAPUCCINO»: son datos de la semilla, ya se pueden corregir
  desde el editor).
- **Fotos de la banda bordó de la landing editables (2026-10-21)**: Admin ›
  Contenido › «Banda de fotos (debajo de Quiénes somos)», 9 casillas
  `banda_foto_1…9` (+ `_alt` y `_link` opcionales), mismo modelo que
  `hero_imagen` (sube a `/admin/landing/foto`, se publica con Guardar, botón
  Quitar). Claves sumadas a `LANDING_DEFAULTS`.
  - **Regla de fallback** (`landing.html`): con al menos una `banda_foto_N`
    cargada el carrusel usa SOLO esas (orden 1→9, saltando vacías, mismo
    `armar`); sin ninguna, sigue con `/catalogo-destacados` como antes. La
    banda espera a `/landing-contenido` (promesa compartida
    `window.lonContenidoPromesa`, un solo fetch) antes de elegir la fuente: sin
    parpadeo. El link solo se respeta si empieza con `/` (no `//`) o `https://`;
    si no, la foto va sin link.
  - **`espacio_imagen`** (sección «El espacio» del admin) es la foto grande de
    abajo de la banda; la ayuda del admin ahora lo dice. Se muestra **entera,
    sin recorte** (2026-10-22, pedido del dueño): antes iba con
    `max-height:480px` + `object-fit:cover` y cortaba arriba y abajo; no
    volver a `cover`. Desde 2026-10-22 mide **el mismo ancho que la fila de
    fotos de la banda** (`width:100%`, alto automático; mismo margen lateral:
    24px en desktop con el mismo máximo de 1232px, 12px en mobile).
- **Flecha de volver en `/cliente.html` (escanear)** (2026-10-22): fija (se
  sacó la animación que la hacía flotar), más grande (SVG de 30px en un
  área táctil de 44px) y centrada en altura con el logo; antes era el
  carácter «←», que quedaba más baja que el centro del logo.
- **Flecha de volver en `/carta`** (2026-10-22, pedido del dueño): la misma
  flecha SVG en la esquina izquierda de la barra bordó, va a la landing (`/`)
  — sirve igual para quien llegó por el ☰ y para el turista que entró por el
  QR. aria-label con la clave existente `t_volver`. Las banderas siguen a la
  derecha.
- **THE CLASSICS en mobile**: tabla de grilla CSS (nombre + 3 columnas de
  3rem/3.6rem), nunca desborda: el nombre usa `minmax(0,1fr)` y a <=420px
  baja el espaciado de letras. Sin scroll horizontal.

## Editor de la carta (/carta como datos, 2026-10-22)

Pedido del dueño: precios, nombres, categorías y productos de `/carta` editables
(agregar/eliminar productos, eliminar una categoría, en el diseño y en lo que se
ve), en una sección propia del admin y no dentro de Contenido.

- **Modelo**: hoja nueva `Carta` (`HOJA_CARTA`, env `GOOGLE_CARTA_SHEET_NAME`) en
  `SHEET_ID_PRODUCTOS`. **A diferencia de las hojas existentes del dueño, esta la
  crea la app con su fila de encabezados** (`ensureCartaSheet`; también escribe los
  encabezados si la hoja existe pero está vacía; una hoja con datos no se toca).
  Una fila por elemento. Columnas (índices en `COLUMNAS_CARTA` de `config.js`, el
  orden de las claves ES el orden de las columnas A..Y): `tipo` (seccion |
  categoria | subgrupo | item), `id` (estable), `padre` (id), `orden`,
  `nombre_es/_en/_fr/_pt`, `descripcion_es/_en/_fr/_pt`, `formato` (categoría:
  `uno` | `tres` = Small/Medium/Large), `estilo` (categoría con formato uno:
  `filas` | `puntos` guía | `detalle` con descripción), `marca` (SI = marca de agua
  del gajo), `rotulo_1..3` (encabezados de columnas de precio, editables),
  `precio` (formato uno), `precio_s/_m/_l` (formato tres; «-» = no se vende),
  `sin_tacc` (SI), `foto` (URL), `activo` (SI/NO). Jerarquía: sección → categoría
  (el recuadro) → subgrupo opcional (ej. Hot/Cold) → producto. `estilo` y `marca`
  no estaban en el pedido pero hacen falta para que la carta se vea idéntica
  (hay tres estilos de lista y cajas con y sin marca de agua). Título de categoría
  vacío = caja sin `<h3>`.
- **Lógica pura** (`cartaArbol.js`, autochequeo `node cartaArbol.js`): valida el
  árbol, lo pasa a filas y de vuelta (tolerante con una hoja tocada a mano: ignora
  huérfanos y ids repetidos), poda lo inactivo para el público (una categoría o
  sección sin nada visible no se muestra) y completa fotos. El orden es la
  posición en los arrays; `orden` se deriva al guardar.
- **Semilla**: `public/carta-semilla.json` (52 renglones: 50 productos con foto/slug
  + MEDIUM y LARGE de Take Away), generada por `node scripts/generar-carta-semilla.js`
  a partir de **copias congeladas** de la carta y el diccionario originales
  (`scripts/semilla/carta-original.html`, `idioma-original.js`: `carta.html` ya no
  trae el contenido). El script corre sus asserts (50 slugs, precios clave, Toast
  Forest con «(SIN TACC)» en el nombre, erratas conservadas). Los ids de producto
  son los slugs de foto (`espresso`, `palta_toast`…). Si la hoja `Carta` está vacía
  el servidor la siembra UNA vez (`obtenerCarta`/`leerCartaDeLaHoja` en `server.js`),
  sumando las fotos que ya hubiera en Landing (`carta_foto_<id>`).
- **Endpoints**: `GET /carta-datos` (público, `limiteLecturaPublica`, caché de
  servidor 30 s + `Cache-Control: max-age=20`) devuelve `{carta}` solo con lo activo.
  `GET /admin/carta` (todo, sin caché) y `PUT /admin/carta` (árbol completo; un solo
  `values.update` RAW que reemplaza las filas y blanquea las sobrantes): ambos
  `requiereNivel2` + `limiteAdmin`. Reusa `/admin/landing/foto` (fotos) y
  `/admin/landing/traducir` (traducción automática, necesita `OPENROUTER_API_KEY`).
- **Validación (servidor, 400 con mensaje claro)**: tipos, ids `[a-z0-9_-]` únicos,
  estructura padre/hijo (por construcción del árbol; la lectura descarta huérfanos),
  formato/estilo válidos, precio entero 0..9999999 o «-» (formato uno valida `precio`,
  tres valida los tres; rótulos obligatorios en tres), nombre ≤120, descripción ≤600,
  rótulo ≤20, foto `/uploads/…` o `https://`, ≤400 elementos y al menos una sección
  (una carta vacía se confundiría con la hoja sin sembrar y se resembraría sola).
- **Fallback**: si Sheets falla, `/carta-datos` responde 200 con la última carta
  buena en memoria o, si no hay, la semilla (`origen: 'respaldo'`, `no-store`). Si
  falla el propio `/carta-datos`, `carta.html` pide `/carta-semilla.json`. La carta
  pública no se rompe. Limitación: al estar dibujada por JS, `/carta` ya no trae el
  menú en el HTML estático (Google lo ejecuta; otros rastreadores no).
- **`/carta` (`public/carta.html`)**: mismo CSS y mismas clases de antes; solo cambia
  que `#carta` se arma por JS desde los datos (siempre con `textContent`, nunca
  `innerHTML` con datos). Textos por idioma: `nombre_<idioma>` con caída al español;
  el evento `lon-idioma` repinta. Los rótulos Small/Medium/Large no se traducen (como
  antes). Descripciones: cada línea es un `<span class="desc">` (las siguientes a la
  primera llevan `opc`, como «opcional: huevo poché $2000»). Mientras carga se ve
  «· · ·» con `min-height` para que no salte. **Verificado** contra la carta anterior
  en ES/EN/FR/PT a 375px y 1280px: mismo texto, mismas cajas y mismo alto de página
  (los píxeles difieren solo en el antialias del texto partido en spans de antes).
- **Admin › Carta** (pestaña nueva, nivel 2: oculta para nivel 1 y `requiereNivel2`
  en servidor; no se carga de nuevo si ya está cargada, para no pisar cambios sin
  guardar). Editor por árbol con categorías plegables: nombre ES + traducciones
  (traducción automática al cambiar el español, sin pisar lo escrito a mano ni lo
  ya traducido a mano: igual que Contenido, PR #28), agregar producto / subgrupo /
  categoría / sección, eliminar con confirmación (dice cuántos productos se van),
  subir/bajar, visible/oculto, formato y estilo de la categoría, marca de agua,
  rótulos, precio(s), Sin TACC, descripción (solo en estilo «con descripción») y
  foto. Un único Guardar; aviso de cambios sin guardar (también `beforeunload`);
  nada se publica hasta Guardar. **Probado** abriendo `admin.html` en Chrome headless
  con el servidor y los endpoints simulados (agregar, eliminar producto/categoría,
  reordenar, ocultar, formato tres, traducción simulada, foto simulada, PUT validado
  con `validarArbol`, 375px y 1280px sin scroll horizontal). El handler global del
  admin que fuerza MAYÚSCULAS en los inputs de texto ahora exceptúa también
  `#panelCarta` (el de Contenido ya estaba exceptuado).
- **Sin uso / limpieza**: se sacó de Admin › Contenido la sección «Carta — fotos de
  productos» (`CARTA_FOTOS`). Las claves `carta_foto_*` de la hoja Landing quedan
  sin uso tras migrar (no se borraron filas). De `idioma.js` salieron las claves
  `c_*`/`cn_*` que eran solo contenido de la carta (quedan `c_portada`,
  `c_aviso_foto`, `c_sin_tacc`, `c_precios`, `c_cerrar_foto`; paridad EN/FR/PT
  verificada); el contenido hardcodeado de `carta.html` pasó a la semilla.
- **Visor de fotos, verificado de punta a punta (2026-10-22)**: se corrió en el
  navegador poniendo una foto de prueba en un ítem de la semilla y reiniciando el
  servidor. Resultado: solo ese ítem queda clickeable (`con-foto`), el aviso
  «Tocá un producto para ver su foto» aparece recién ahí, el `<dialog>` abre con
  `showModal()`, la imagen carga, el `alt` toma el nombre del producto, el foco
  entra al diálogo, el fondo se oscurece (`::backdrop` rgba(20,6,10,.72)) y el
  scroll de atrás queda bloqueado (`body.foto-abierta`). Cierra con la X, con
  Escape y con click en el fondo. La foto de prueba **se revirtió**: la semilla
  sigue con `foto: ""` en los 52 renglones.
  **Ojo para la próxima sesión**: `/carta-datos` sirve la semilla desde memoria
  (`origen: "respaldo"`), así que **editar `carta-semilla.json` no se ve hasta
  reiniciar el servidor** — no es que el cambio no haya entrado.
- **Lo que falta para que el visor sirva de algo**: no hay ninguna foto cargada.
  El mecanismo está completo, pero hasta que el dueño suba fotos desde
  Admin › Carta ningún producto es clickeable y el aviso no se muestra. Eso es
  correcto y deliberado: la página no invita a tocar algo que no responde.
- **Sin verificar**: contra Sheets real (creación de la hoja, siembra, PUT, fotos
  viejas de Landing), subida real de fotos, traducción real (OpenRouter), y login
  real de nivel 2. El servidor se probó sin credenciales (fallback a semilla).
  Dos ediciones simultáneas son «gana la última» (no hay control de versión).
- **Bug viejo, no tocado**: al recargar `/admin` con sesión guardada,
  `restaurarSesion()` llama `mostrarApp()` antes de que exista
  `btnGenerarDesdeEscaneo` (`const` más abajo) y la excepción queda tragada: no se
  restaura la pestaña activa y el admin vuelve a Escanear (tras un login nuevo
  funciona bien).

## Selector de idioma ES/EN/FR/PT (sitio público, 2026-10-20; FR y PT 2026-10-21)

- **Cuatro idiomas (2026-10-21)**: es, en, fr, pt (`<html lang>` = es / en /
  fr / pt-BR). `idioma.js` tiene un diccionario por idioma (`EN`, `FR`, `PT`,
  mismas ~187 claves, mismas `{variables}`; expuestos en
  `LONi18n.diccionarios`, `LONi18n.claves` sigue siendo EN); si falta una clave
  se cae al español. **Las traducciones FR y PT las hizo una IA: conviene que
  alguien nativo las revise.** Banderas SVG de Francia (tricolor) y Brasil
  (rombo y círculo simplificados); en <=480px las banderas bajan a 18x12 y gap
  1px para que entren las cuatro (probado a 375px en landing, carta y tienda;
  a 320px el header de la tienda se desborda un poco).
  - Agregar un texto: marcarlo y sumar la clave en **los tres** diccionarios
    (EN, FR y PT).
  - CMS: cada texto de `LANDING_TEXTOS_BILINGUES` tiene además `<clave>_fr` y
    `<clave>_pt` (casillas «— Français» / «— Português» en Admin › Contenido;
    `LANDING_DEFAULTS` en googleSheets.js las crea en la hoja Landing, el
    backend filtra por esas claves). Vacío = diccionario y, si no, español.
    `dataset.lonFr` / `lonPt` los llenan landing.html e index.html.
  - Todo lo de abajo, dicho para «inglés», aplica igual a francés y portugués.
- **Qué es**: `public/idioma.js`, compartido por `landing.html`, `carta.html`
  y `index.html` (la tienda). Banderas arriba a la derecha fuerzan
  el idioma; la elección se guarda en `localStorage` (`lon_idioma`,
  en `try/catch` por la navegación privada) y persiste entre páginas y
  visitas. Cambia también `<html lang>`. Default: español. Un solo
  `<script src="/idioma.js">`, sin build ni dependencias.
- **Banderas en SVG inline, no emoji**: Windows no dibuja las banderas
  emoji (muestra "AR"/"US" en texto) y muchos clientes están en Windows.
  Argentina y EE.UU. simplificados (sol y estrellas reducidos).
- **Posición**: cada página tiene un hueco `<div data-selector-idioma>` que
  idioma.js rellena: zona `.right` del header en la landing, derecha de la
  barra `.barra` en la carta, `.acciones-header-catalogo` en la tienda (y
  también en los headers de las pantallas carrito/login/checkout, que tapan
  al principal). El CSS del selector usa `.lon-idioma button.lon-idioma-btn`
  para ganarle a reglas genéricas de `button` (ver CLAUDE.md, CSS).
- **Cómo se marcan los textos**: el español queda escrito en el HTML (si el
  JS no carga, la página sigue en español) y el diccionario del inglés vive
  solo en `idioma.js` (objeto `EN`, ~180 claves; prefijos `g_` compartidas,
  `l_` landing, `c_` carta, `t_` tienda).
  - Texto: `data-i18n="clave"` (reemplaza el `textContent`; si el elemento
    tiene hijos, se envuelve el texto en un `<span data-i18n>`).
  - Atributos: `data-i18n-attr="placeholder:clave,aria-label:clave"`.
  - Texto armado por JS (la tienda): `T(clave, español, {vars})` con
    `{variables}`; al cambiar de idioma idioma.js dispara el evento
    `lon-idioma` y `index.html` repinta catálogo, detalle,
    carrito y checkout. El repintado del detalle NO cuenta como visita.
  - Para agregar un texto: marcarlo y sumar la clave en `EN`.
- **Qué NO se traduce (a propósito, decisión del dueño)**: lo que viene de
  Sheets (nombres/descripciones/categorías de productos, tarifas por
  provincia, datos de transferencia) y el contenido editable de la landing
  salvo lo que el dueño traduce a mano en Admin › Contenido (casilla English de
  cada texto, ver «CMS completo»; antes un texto pisado quedaba en español para
  siempre). Tampoco: mensajes de error que devuelve el
  servidor (`data.error`), `<title>`/meta/SEO (los crawlers ven español), los
  nombres que ya están en inglés en la carta impresa (ESPRESSO, FLAT WHITE...,
  con sus erratas: `ORANGE COFFE`, `CAPUCCINO`), el valor
  interno de los radios de entrega (`Retiro en el local`, que lee el
  servidor), `privacidad.html`, `terminos.html`, `cliente.html`, los pies de
  copyright, ni las páginas `checkout-*.html` ni el admin.
- **Nombres de platos y bebidas (2026-10-21)**: los descriptivos también se
  traducen (antes claves `cn_*` de `idioma.js`; desde 2026-10-22 viven en la
  hoja `Carta` como `nombre_en/_fr/_pt`; p. ej. `ALFAJOR DE PISTACHO` -> `PISTACHIO
  ALFAJOR`). Quedan en español a propósito `ALFAJOR`, `CHIPA`, `MEDIALUNAS`,
  `MACARON` (y `PAIN AU CHOCOLAT`): son nombres propios del producto, sin
  equivalente o que un café no traduce; solo se traduce el complemento.
- **Sin verificar en navegador** al momento de escribir esto (solo
  `node --check` y cruce de claves usadas/definidas).

## Reseñas con tarjeta NFC (/resena, 2026-10-20)

- **Qué hace**: el cliente toca con el celular una tarjeta NFC en el
  mostrador y se abre el formulario de reseña de LON en Google Maps.
  `GET /resena` (en `server.js`, antes de `express.static`) responde un
  302 con `Cache-Control: no-store` a `GOOGLE_RESENA_URL`. No consulta
  Sheets ni tiene rate limit.
- **Por qué la tarjeta apunta a /resena y no a Google directo**: si
  Google cambia el link, se corrige la variable en Render y las tarjetas
  ya repartidas siguen andando. Es 302 y no 301 a propósito: un 301 se
  cachea en el celular y el cliente seguiría yendo al link viejo.
- **Variable de entorno**: `GOOGLE_RESENA_URL` (en `config.js`; avisa al
  arrancar si falta). Es el link «Pedir reseñas» del Perfil de Empresa
  de Google (`https://g.page/r/XXXX/review`) o
  `https://search.google.com/local/writereview?placeid=PLACE_ID`. Si no
  está o no empieza con `https://`, `/resena` manda a una búsqueda de
  Google Maps de «LON Philosophy» para que el tap nunca dé error.
- **Cómo programar la tarjeta**: comprar NTAG213/215/216 de 13,56 MHz
  (las RFID de 125 kHz **no** las lee un celular). App NFC Tools →
  Escribir → Agregar registro → URL →
  `https://lonphilosophy-3h5c.onrender.com/resena`. Probar con un celular
  antes de bloquearla: bloquear es irreversible.
- **Límites de Google**: no permite publicar la reseña solo (abre el
  formulario, el cliente pone las estrellas y publica) ni incentivar
  reseñas con premios.
- **No se hizo**: contador de taps. Agregarlo si se quiere medir
  (hoy el redirect no registra nada).

## Sellado NFC + Google Wallet (2026-10-22)

**Cómo funciona.** El tag NFC del mostrador lleva `https://lonphilosophy.com.ar/sellar?t=<SELLO_NFC_TOKEN>`. `GET /sellar` sirve `public/sellar.html` (ES/EN/FR/PT, claves `s_*` y `t_wallet_agregar` en `idioma.js`). La página usa la **misma sesión de cliente** que «Mi cuenta» (`localStorage lon_cliente_sesion`); sin sesión muestra el botón de Google (`/cliente-login-google`) y al loguear termina el sellado. El `t` también queda en `sessionStorage` por si se recarga. `GET /sellar/estado?t=` dice si el token es válido (para avisar sin pedir login); `POST /cliente/sellar {token, t}` hace el trabajo (rate limit extra `limiteSello`, 10/min por IP).

- Reglas en `sello.js` (puro; autochequeo `node sello.js`): contador `< CAFES_PARA_GRATIS` → +1; contador en el objetivo → **pendiente**, no suma y muestra el QR del `codigoFidelidad` (el NFC **nunca** canjea: el gratis lo confirma el personal en admin como siempre); antes de sumar, antifraude: mínimo `SELLO_MINUTOS_ENTRE` (30) desde el último sello y máximo `SELLO_MAX_POR_DIA` (3 cafés) por día calendario de **America/Argentina/Buenos_Aires** (zona fija, como `arca.js`). Token comparado en tiempo constante (sha256 + `timingSafeEqual`).
- `sellarCafeNfc` (googleSheets.js): lee Clientes **una vez**, decide y escribe `D:G` en un solo update (también completa `codigoFidelidad` si el cliente no tenía). Candado en memoria por email: dos toques seguidos se encolan y el 2.º relee y queda frenado (válido con 1 sola instancia de Render).
- **Regla única del contador (pasada 2)**: `avanzarContador(contador, objetivo, cantidad)` en `sello.js` → `{contador, regalosEntregados, regaloDesbloqueado}` (por debajo del objetivo suma 1; en el objetivo, el siguiente es el canje y vuelve a 0). La usan `registrarCafeCliente` (escaneo del personal, comportamiento idéntico al for anterior) y `decidirSello` (que además limita lo que entra para no pasar de «pendiente»). Ya no hay lógica duplicada.
- **Cantidad por toque (pasada 2)**: `/sellar` primero pregunta «¿Cuántos cafés?» (botones 1/2/3, claves `s_cuantos`, `s_sumado_parcial`, `s_pendiente_sobrantes` en ES/EN/FR/PT) y recién ahí hace `POST /cliente/sellar {token, t, cantidad}`. El servidor valida `cantidad` entero 1–3 (`CANTIDAD_MAX` en `sello.js`); otra cosa → 400. Tras el login también pregunta.
- **Antifraude en cafés**: `SELLO_MAX_POR_DIA` (3) = máximo de **cafés sumados por NFC** por cliente por día AR (`Sellos del dia` guarda `AAAA-MM-DD|cafés`); `SELLO_MINUTOS_ENTRE` (30) corre entre **toques** (un toque suma 1–3). Si pide más de los que le quedan hoy se suman los que entran y la respuesta trae `topeParcial` («Hoy podías sumar 1 más: sumamos 1»); si no queda ninguno, `frenado` como antes. Solo cuentan para el tope los cafés que el NFC realmente sumó.
- **Gratis con sobrantes**: el NFC nunca canjea ni suma de más allá de «pendiente». Si la compra cruza el gratis, suma hasta el objetivo, el gratis ocupa un café y los pagos que le siguen son `sobrantes = pedidos − sumados − 1` (mínimo 0); la pantalla muestra el QR con «¡Uno de estos cafés es gratis! … canjea el gratis y suma los N que quedan» y **esos N no se suman solos**: los suma el personal al escanear. Ejemplos (objetivo 3): contador 2, pide 3 → suma 1, pendiente, sobrantes 3−1−1 = **1**; contador 3 (ya pendiente), pide 2 → suma 0, sobrantes 2−0−1 = **1**; contador 1, pide 3 → suma 2, el 3.º es el gratis, sobrantes **0**; contador 0, pide 3 → suma 3, pendiente, sobrantes **0** (el gratis es el próximo café, no esta compra). Wallet: el PATCH sigue reflejando el contador final.
- Los escaneos del personal (`/admin/cafe-escaneado`) **no** cuentan para el antifraude ni tocan F/G. Admin › «Café (fidelidad)» solo suma, al escanear, «Último sello por NFC: …» (viene de `/admin/cliente-por-codigo-fidelidad`).
- **Google Wallet** (`wallet.js`, autochequeo `node wallet.js`): activo solo con `GOOGLE_WALLET_ISSUER_ID` + credenciales válidas. Clase `${ISSUER}.lon_cafe` («LON Philosophy — Café», bordó `#5E1E2B`, logo `/logo-catalogo.png` absoluto con `PUBLIC_URL`/`SITIO_URL`), objeto por cliente `${ISSUER}.cafe_<codigo saneado>` con puntos = cafés y QR = `codigoFidelidad`. El link `https://pay.google.com/gp/v/save/<jwt>` se firma local (RS256 con `crypto`, sin dependencias nuevas) y viaja como `walletUrl` en `/cliente/mi-cuenta` y `/cliente/sellar`; botón en Mi cuenta y en `/sellar`. Tras cada cambio del contador (sello NFC y escaneo del personal) se hace PATCH del objeto **en segundo plano**: si Google falla solo se loguea; 404 (aún no guardó la tarjeta) se ignora. La clase se crea/actualiza (POST, y PATCH si 409) una vez por proceso, justo antes del primer PATCH; en el JWT de guardado va la clase también.
- Credenciales: por defecto **la misma cuenta de servicio** (`GOOGLE_CREDENTIALS_JSON`); `GOOGLE_WALLET_CREDENTIALS_JSON` permite una aparte. Solo vale el JSON por variable (no `credentials.json` local).

**Variables de entorno nuevas** (todas en `config.js`, con `console.warn` al arrancar en `server.js`): `SELLO_NFC_TOKEN` (sin ella `/sellar` anda abierto), `SELLO_MINUTOS_ENTRE` (30), `SELLO_MAX_POR_DIA` (3), `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_CREDENTIALS_JSON` (opcional).

**Columnas nuevas de la hoja Clientes** (al final; **escribir a mano en la fila 1**, la app no toca encabezados): **F `Ultimo sello`** (fecha-hora ISO UTC) y **G `Sellos del dia`** (`AAAA-MM-DD|N`). Si no están los encabezados igual funciona, pero queda raro de leer.

**Trámites del dueño**
1. Grabar UNA tarjeta NTAG215 con la app gratuita «NFC Tools» (Android/iPhone): Escribir → Agregar registro → URL → `https://lonphilosophy.com.ar/sellar?t=<SELLO_NFC_TOKEN>` → Escribir. Opcional: Otras → Bloquear etiqueta (irreversible) para que nadie la regrabe. Probar antes de bloquear.
2. Cargar `SELLO_NFC_TOKEN` en Render (texto largo al azar).
3. Wallet: cuenta de emisor en pay.google.com/business/console, habilitar la **Google Wallet API** en Google Cloud, dar acceso a la cuenta de servicio como usuario del emisor, cargar `GOOGLE_WALLET_ISSUER_ID`. Mientras el emisor esté en modo demo, solo pueden guardar la tarjeta los testers agregados en la consola; la clase sale con `reviewStatus: UNDER_REVIEW` y hay que pedir la aprobación.

**Límites asumidos.** Las NTAG215 de MercadoLibre no tienen firma SUN/SDM: cualquiera que lea el link (celular con NFC) puede copiarlo; por eso el límite de tiempo + tope diario + login. No se puede probar presencia física (sin geolocalización).

**Tarjeta en la página + iPhone (pasada 3).** `public/tarjeta.js` (compartido; `window.LONTarjeta`) dibuja la tarjeta de fidelidad estilo pase: bordó `#5E1E2B`, logo blanco, nombre, círculos de sellos (N = `CAFES_PARA_GRATIS` + un círculo extra 🎁 que se llena al quedar pendiente) y el QR del `codigoFidelidad`. Se usa en «Mi cuenta» de /tienda (reemplaza el QR suelto y los emojis ☕⚪; el texto «n/m» y el aviso del regalo siguen) y en /sellar tras sellar (reemplaza los círculos y el `<img>` del QR). Para eso `POST /cliente/sellar` ahora devuelve `qrDataUrl` **siempre** (antes solo en pendiente); sin pedidos nuevos. **`/mi-tarjeta`** sirve el mismo `sellar.html` en modo «solo ver» (detecta `location.pathname`; sin token ni sellado, lee `/cliente/mi-cuenta`; sin sesión, botón de Google). **Regla de plataforma**: `LONTarjeta.esIOS()` (iPhone/iPad/iPod por UA, o `Macintosh` con `maxTouchPoints > 1` = iPadOS) oculta el botón «Agregar a Google Wallet» en /sellar y Mi cuenta (Google Wallet no existe en iOS); en Android y desktop se muestra como antes si hay `walletUrl`. En iOS, solo en `/mi-tarjeta` y si no está abierta como app (`navigator.standalone` / `display-mode: standalone`), aparece el aviso cerrable «Agregala a tu pantalla de inicio…» (cierre en `localStorage lon_aviso_inicio`, con try/catch). `sellar.html` lleva `apple-touch-icon` (`/favicon.png`; no hay ícono más grande), `apple-mobile-web-app-title` «LON Café», `apple-mobile-web-app-capable` y `theme-color` bordó; sin service worker ni manifest. Claves nuevas ES/EN/FR/PT en `idioma.js`: `s_inicio_aviso`, `s_tu_tarjeta`, `s_error_tarjeta`. Probado con Playwright (Edge) a 375px, con `fetch` simulado: /mi-tarjeta y Mi cuenta muestran la tarjeta; con UA de iPhone no hay botón Wallet y sí el aviso (y no reaparece tras cerrarlo); con UA de escritorio el botón aparece y el aviso no. No probado: Safari iOS real (el «Agregar a inicio» y `navigator.standalone` dependen del dispositivo) ni el sellado contra Sheets.

**Apple Wallet, pendiente.** Requiere Apple Developer Program (USD 99/año): Pass Type ID + certificado de firma, un endpoint que arme y firme el `.pkpass` (manifest + firma PKCS#7, imágenes) y, para actualizar el contador, un web service de passes con push APNs. Hasta entonces en iPhone alcanza la tarjeta de la página + pantalla de inicio.

**Quedó afuera**: Apple Wallet (ver arriba) y NTAG 424 DNA (firma por toque). La geolocalización **ya no está afuera**: se agregó el 2026-10-23, ver «Geocerca de Wallet» acá abajo.

**Geocerca de Wallet (2026-10-23).** `armarClase()` suma `merchantLocations` con la coordenada del local (la del place_id de `/resena`, hardcodeada como `issuerName`): el pase aparece solo en la pantalla de bloqueo al pasar cerca del local. Se usa `merchantLocations` y **no** `locations`: el campo viejo está deprecado y falla en silencio (la API no devuelve error, los tests pasan y nunca notifica). Hay un assert en `node wallet.js`. El texto de esa notificación **no se calcula en el momento**: es el estado del pase tal como quedó en la última actualización; como `actualizarEnSegundoPlano()` hace PATCH del objeto en cada sello, el contador está al día. **Ningún cliente lo ve todavía**: la cuenta de Wallet sigue en modo Demo. Para salir hacen falta el perfil de pagos de Google (razón social, CUIT, dirección fiscal) y la solicitud de publicación. Issuer ID: 3388000000023222287. No probado contra la API real de Google. **La clase que ya existe en Google se actualiza sola**: `asegurarClase()` hace `POST /loyaltyClass` y, cuando Google responde 409 porque ya está creada, cae al `PATCH` con la clase recién armada — así que el campo nuevo entra en el primer arranque después del deploy, sin tocar nada a mano.

**Verificado**: `node --check`, autochequeos `sello.js`/`wallet.js` (fechas AR con cambio de día, token, ids, JWT RS256 verificado con la pública), server arranca y `/sellar/estado` + `POST /cliente/sellar` responden 403 (token) / 401 (sin sesión); `/sellar` en Chrome headless contra un stub: sin sesión → botón Google, token inválido → mensaje, sellado, pendiente con QR, frenado. **NO verificado**: escritura real en Sheets (F:G, candado), login real de Google en `/sellar`, y toda la API de Wallet (clase, PATCH, y que Google acepte el JWT) — sin credenciales.

## Mudanza en Render (2026-10-20)

- El servicio se mudó a **`https://lonphilosophy-3h5c.onrender.com`**
  (el viejo `lonphilosophy.onrender.com` quedó suspendido). Se cambió la
  URL escrita a mano en el canonical/og/JSON-LD de `index.html`,
  `landing.html`, `privacidad.html`, `terminos.html`, `robots.txt`, el
  default de `SITIO_URL` y la documentación. El sitemap ya salía bien
  porque en Render `SITIO_URL` estaba cargada.
- **Fuera del repo, a revisar a mano en cada mudanza**: variables de
  entorno del servicio nuevo (incluidas `PUBLIC_URL`, `SITIO_URL`,
  `GOOGLE_RESENA_URL`); "Orígenes de JavaScript autorizados" del
  cliente OAuth en Google Cloud (si no, no anda el login admin ni "Mi
  cuenta"); webhook de WhatsApp en Meta.
- Las tarjetas NFC graban `<URL del servicio>/resena`: si el servicio
  vuelve a mudarse, las tarjetas bloqueadas quedan apuntando a la
  dirección vieja. Con dominio propio esto deja de pasar.

## Factura electrónica contra ARCA (2026-10-20, arrancado)

LON es **monotributo** y usa **un solo punto de venta** para el local y la
tienda online (dato del usuario, 2026-10-20).

- Se emite **siempre Factura C** (código 11): el IVA **no** se discrimina,
  así que `ImpNeto = ImpTotal`, `ImpIVA = 0` y **no va** el array de IVA.
  Devoluciones = **nota de crédito C** (código 13), que **tiene que llevar
  el comprobante asociado** (`CbtesAsoc`) o ARCA la rechaza. Si algún día
  LON pasa a responsable inscripto, `arca.js` **no alcanza**: habría que
  sumar Factura A y B con desglose de alícuotas.
- **Ojo con la numeración**: un solo punto de venta **no** quiere decir una
  sola secuencia. La numeración es por **(punto de venta, tipo de
  comprobante)**, así que la Factura C, la nota de crédito y la nota de
  débito llevan cada una la suya. `FECompUltimoAutorizado` se consulta con
  los dos datos. Como el punto de venta es uno solo, las emisiones del
  mismo tipo **no se pueden paralelizar**.

**Qué hay hecho.** Solo `arca.js`, y solo la parte que no toca la red:
arma y valida el comprobante, que es donde se mete la plata. Corre su
autochequeo con `node arca.js`. **No tiene cliente WSAA/WSFE todavía.**

**Por qué el módulo es tan desconfiado con los parámetros.** Pasó dos
rondas de revisión independiente y volvió con agujeros reales las dos
veces, todos verificados corriendo el módulo con la entrada exacta:

- el tope para emitir sin identificar al comprador se salteaba mandando
  `docTipo` como string, porque `'99' !== 99`;
- un importe `'15.000'` (quince mil para cualquiera de acá) facturaba
  **$15**, porque `Number('15.000')` da 15;
- `CbteFch` salía con la zona horaria del proceso: en Render (UTC) una
  venta del 31/10 a las 21:30 se facturaba el 1/11, **y ARCA la aceptaba
  en silencio** porque tolera unos días;
- `Math.round(x * 100) / 100` redondeaba `1.005` a `1`;
- una nota de crédito se armaba sin el comprobante asociado;
- un importe de `1e307` salía con `ImpTotal: Infinity`, porque
  `Infinity <= 0` es falso y el chequeo no lo atrapaba;
- `cuitValido` aceptaba cualquier prefijo mientras cerrara el dígito
  verificador: uno de cada once números inventados al azar.

Por eso ahora el importe se exige `number` (el que llama convierte, porque
sabe de dónde salió el dato), se valida que sea finito y que no pase un
**techo de cordura** contra el cero de más tipeado en el mostrador, los
tipos se validan contra su catálogo con `===`, el CUIT se chequea por
prefijo **y** módulo 11, y la fecha fiscal se arma con una zona **fija**
de Argentina: no usa `config.TIMEZONE`, justamente para que nadie la
mueva sin querer. El autochequeo corre igual con `TZ=UTC` y con
`TIMEZONE=UTC`.

**Dónde va a engancharse (decidido, no implementado).** En el **barrido**
del `setInterval` que ya procesa ventas y tiene el candado
`procesandoVentas`, **no en los endpoints**. Los caminos por los que se
registra una venta se reducen a dos hechos en las hojas: una fila de
`VENTAS` marcada `Vendido` con `G` vacío, y una fila de `PEDIDOS` con
`stockReservado = SI`. Facturar desde ahí los cubre a todos sin tocar
ningún endpoint, y si ARCA se cae la venta no se rompe: reintenta al ciclo
siguiente. Las filas de `VENTAS` que tienen `pedidoId` (G) **no** se
facturan, porque de esas ya factura el pedido.

**El riesgo real, que es del código que falta escribir**: emitir en ARCA y
guardar el CAE en Sheets **no son atómicos**. Si ARCA autoriza y después
falla la escritura, el ciclo siguiente vuelve a emitir y ahí sí hay dos
CAE para la misma venta — y un CAE no se borra, se anula con nota de
crédito. Al implementar hay que escribir una **marca de intención** en la
fila ANTES de llamar a ARCA, y si un ciclo encuentra esa marca sin CAE,
**consultar a ARCA** (`FECompConsultar`) en vez de reintentar a ciegas.

**Lo que se revisó y resultó NO ser problema.** Se dio por sentado que
había que hacer `/scan` idempotente antes de facturar, porque un doble
escaneo mete dos filas en `VENTAS`. No hace falta: `procesarVentasNuevas`
arma `skusYaVendidos` con **todas** las filas `Vendido` de la hoja entera
(no de una ventana), así que la segunda queda `Duplicado, no contado` y el
barrido no la va a facturar.

**Librería**: se eligió `@ramiidv/arca-facturacion` (MIT, firma local con
node-forge, habla directo con ARCA) y se **descartó `@afipsdk/afip.js`
aunque sea la más popular y mejor documentada**: su código manda el
certificado y la clave privada a `app.afipsdk.com`, y con ese par un
tercero puede emitir facturas a nombre del CUIT mientras el certificado
esté vigente. Mismo motivo para `@roslabs/arca-client`. Antes de instalar
nada hay que leerle el `wsaa.js`: es un paquete joven y de autor único.

**Columnas nuevas cuando se implemente**: van **al final** de `VENTAS`
(regla del repo) y los encabezados los escribe el usuario a mano. Como
mínimo: CAE, vencimiento del CAE, número de comprobante y la marca de
estado de la emisión.

**Sin verificar todavía**: el endpoint de producción de `wsfev1`, la lista
completa de campos de `FECAESolicitar`, el tope para facturar a consumidor
final sin identificar (está como constante suelta en `arca.js` por eso
mismo) y los ids de `CondicionIVAReceptorId` (se confirman con
`FEParamGetCondicionIvaReceptor`). Todo eso salió de fuentes secundarias:
el sitio de ARCA cortó la conexión.

**Pendiente de rever**: el mapeo de los caminos de venta se hizo con el
repo 30 commits atrasado, antes de que el carrito pasara a **multi-ítem
con Mercado Pago**. Hay que rehacerlo sobre `main` al día antes de
implementar el enganche, y decidir si se factura por unidad o agrupando.

**Trámite que tiene que hacer el titular del CUIT** (no lo puede hacer la
app): generar la clave privada y el CSR, pedir el certificado de
homologación en **WSASS** y el de producción en *Administración de
Certificados Digitales*, autorizar el servicio **wsfe** para ese alias, y
dar de alta un punto de venta para **web services** (*Factura electrónica
- Monotributo - Webservices*). Un punto de venta de *Comprobantes en
línea* **no sirve**.

## Cafetería (/cafeteria, 2026-10-22)

**No es una página nueva**: es `landing.html` servida con otro contenido. Por eso
no existe ningún `cafeteria.html` y no hay que buscarlo.

- **La ruta vive en `seo.js`, no en `server.js`** (`app.get('/cafeteria')` →
  `landingCafeteria(base)`). Es el mismo lugar desde donde se sirve `/`. Anotado
  porque buscar «cafeteria» en `server.js` no devuelve nada y hace pensar que la
  ruta falta.
- `landingCafeteria()` toma el HTML de la landing, le pone
  `<body data-pagina="cafeteria">` y su propio title, description, canonical y
  `og:url`.
- **El contenido sale de las claves con prefijo `cafe_`** de la misma hoja
  `Landing`. El front detecta el modo por `data-pagina` o por el pathname, le saca
  el prefijo a esas claves y usa el resto igual que en la landing. Una clave
  `cafe_*` vacía cae al texto de fábrica, que es el de la landing.
- Los elementos que cambian de destino llevan `data-cafe-texto`, `data-cafe-i18n`
  y `data-cafe-href`: en la cafetería el botón principal y la franja de abajo
  dicen «Ver la carta» y llevan a `/carta`, no a `/tienda`.
- **Admin › Contenido** pasa a tener cuatro ediciones: Landing, Catálogo,
  Cafetería y Carta. El editor de la carta se mudó adentro de Contenido.
- **Menú ☰** (`public/menu-lon.js`), orden pedido por el dueño: «Ver catálogo
  completo» → **Cafetería** → «Carta del café» → **Sobre LON**. Cafetería va con
  el mismo estilo que las categorías. «Sobre nosotros» pasó a llamarse
  **«Sobre LON»** (clave `g_sobre_lon`, con sus traducciones EN/FR/PT).

**Verificado en el navegador (2026-10-22)**: `/cafeteria` responde 200 con su
title propio y `data-pagina="cafeteria"`; el modo café queda activo; el botón
principal dice «Ver la carta» y apunta a `/carta`; y el menú ☰ muestra las siete
entradas en el orden pedido.

**Sin verificar**: contra Sheets real (las claves `cafe_*` todavía no existen en
la hoja, así que la página muestra los textos de fábrica de la landing), la carga
de fotos propias de la cafetería, y el guardado desde el panel con login nivel 2.

**Cómo quedó esto a medias**: el trabajo se hizo en el worktree `lon-cafeteria`
y quedó **sin commitear** — siete archivos modificados y cero commits. No estaba
roto: le faltaba commitearse. Si alguien hubiera borrado el worktree, se perdía.

## Convenciones/decisiones no obvias (ver también CLAUDE.md)

- **El botón flotante de WhatsApp va en bordó, no en verde** (2026-10-22). El
  verde `--stamp-green` es el color oficial de WhatsApp, pero sobre el crema de
  LON desentonaba; se pasó a `--bg-header` (#5E1E2B), el mismo del header. El
  ícono blanco sigue siendo el de WhatsApp, así que se reconoce igual. Si alguna
  vez se agrega el botón a otra página, usar el mismo color.


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

## Flecha de volver unificada (2026-10-22)

Todas las flechas de volver del sitio usan la misma flecha SVG (30px, trazo
1.4, área táctil 44x44, sin fondo ni animación, color `--header-text`; en el
admin, `--ink` porque su barra es clara). **Modelo: `public/cliente.html`
(`.btn-volver-flecha`).** Aplicada en `index.html` (carrito, login/Mi cuenta,
checkout y detalle de producto; en las barras de pantalla completa va con
`justify-self:start`, en la esquina izquierda) y en `admin.html`
(`.volver-catalogo-header`). En el detalle de producto la flecha va primera
del grupo izquierdo del header, antes del ☰ y la lupa (se muestra solo en el
detalle). No volver al carácter «←» ni a la animación flotante. Las «←» que
son parte de un texto («← Volver al producto», «← Volver a la aplicación» en
privacidad/términos, «← Volver al catálogo» del login admin) se dejaron.
Gotcha: `#vistaCatalogo .volver` (ID, gris `--ink-muted`) le ganaba al color de
la flecha en el detalle; por eso existe `#vistaCatalogo .btn-volver-flecha`
con `--header-text`.
