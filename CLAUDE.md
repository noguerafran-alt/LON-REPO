# LON Philosophy — contexto para Claude Code

App de e-commerce + gestión de inventario para LON Philosophy (casa de
libros, velas, joyas y objetos de diseño, Argentina), usando **Google
Sheets como base de datos** (no hay SQL). Desplegada en Render:
`lonphilosophy.onrender.com`.

## Regla de oro: actualizar ESTADO.md

**Cada cambio de este repo se acompaña de una actualización de
`ESTADO.md`, en el mismo commit.** El proyecto se trabaja desde
distintas sesiones de Claude (que no comparten memoria entre sí) y
potencialmente desde distintos usuarios de la máquina. Un cambio que no
quede anotado en `ESTADO.md` es un cambio que la próxima sesión va a
redescubrir a los ponchazos, o va a deshacer sin saberlo.

Qué corresponde anotar ahí: función/endpoint/panel nuevo, columna o
hoja de Sheets nueva, variable de entorno nueva, una decisión de diseño
no obvia (y el motivo), algo que se probó y se descartó (evita
reintentarlo), un bug que costó encontrar, y lo que quedó a medias.

## Arquitectura

- **Backend**: Node + Express (`server.js`, ~4300 líneas — casi todos los
  endpoints viven ahí). `googleSheets.js` tiene toda la lógica de lectura/
  escritura a Sheets. `config.js` centraliza nombres de hoja, columnas
  (índice 0 = A) y variables de entorno — **cambiar la estructura de una
  hoja se hace ahí, no hardcodeando índices en otro archivo**.
- **Dos spreadsheets de Google**: `SHEET_ID_PRODUCTOS` (catálogo, stock,
  config de categorías, códigos de barra, visitas) y `SHEET_ID_VENTAS`
  (ventas, pedidos, clientes, cierre de caja).
- **Frontend**: HTML+JS vanilla sin build step, todo en `public/`. Los
  archivos grandes (`admin.html`, `index.html`) tienen un único
  `<script>` con todas las funciones — no hay módulos ES ni bundler.
- **Sin base de datos real**: cada `get*`/`actualizar*` en
  `googleSheets.js` hace una llamada a la API de Sheets. Cuidado con
  N+1 en loops — se prefiere leer la hoja entera una vez y filtrar en
  memoria.

## Convenciones del proyecto (aprendidas de las correcciones del usuario)

- **Todo en español**: nombres de funciones, variables, comentarios,
  mensajes de error al usuario. Mezclar inglés desentona con el resto.
- **Comentarios solo para el WHY, no el WHAT**: se explica una decisión
  no obvia o una restricción escondida, no lo que ya dice el nombre de
  la función. Sin bloques de comentario largos.
- **Nunca confiar en el navegador para precios/permisos**: el total de
  una compra, el nivel de admin, el recargo de Mercado Pago — todo se
  recalcula/verifica del lado del servidor aunque el cliente ya lo haya
  calculado para mostrarlo. El navegador solo hace vista previa.
- **Nivel 1 vs nivel 2 de admin**: nivel 1 = operar el mostrador
  (Escanear, Pedidos). Nivel 2 = todo lo administrativo (Productos,
  Catálogo, Cierre de caja, Usuarios). Se oculta la pestaña en la
  interfaz **y** se rechaza en el servidor (`requiereNivel2`) — las dos
  cosas, no alcanza con una sola.
- **Nunca vender/guardar solo sin repaso humano**: "Reconocer producto
  por foto", el OCR del cierre de caja — siempre muestran un resultado
  para confirmar, nunca actúan automáticamente. Mantener este criterio
  en features nuevas que interpreten datos con margen de error (fotos,
  OCR, reconocimiento).
- **CSS**: cuidado con reglas genéricas de ID (`#panelX input[type=...]`)
  que le ganan en especificidad a reglas de clase más específicas
  declaradas después — ya pasó más de una vez que esto rompía inputs
  angostos estirándolos al 100%. Si se agrega un input dentro de un
  panel con reglas genéricas, prefijar con el ID del panel para ganar
  la especificidad.
- **Verificar sin credenciales**: este entorno de desarrollo no tiene
  `credentials.json` ni tokens de Mercado Pago/Payway, así que no se
  puede probar contra las APIs reales. El patrón establecido es simular
  el `fetch` en el navegador (Browser tools) y probar la lógica de
  parseo/cálculo con Node directo — dejarlo documentado en el mensaje
  de commit qué se pudo y qué no se pudo verificar así.
- **Nunca `git push --force` ni se saltan hooks.** Commits nuevos, no
  `--amend` (salvo pedido explícito). Mensajes de commit largos y
  explicando el *por qué*, no solo el qué.

## Cosas del negocio que no son obvias

- El local tiene un **POS aparte** (café/gastronomía) que emite tickets
  con sus propias categorías (CAFE, BAKERY, GENERICO, LIBROS PERIPLO...)
  — no son las categorías internas de LON (Libros, Velas, Joyas). Nunca
  mapear una taxonomía con la otra. En el cierre de caja esas categorías
  del POS **sí se guardan** (desglose de lo vendido ese día) pero **no
  se comparan** contra las de LON ni contra el escáner.
- El programa de fidelidad de café: 3 escaneos pagos → el contador queda
  "pendiente" (no se resetea) → el 4to escaneo es el regalo y ahí sí
  resetea a 0.
- Los envíos a domicilio muestran un costo *estimado* (tabla fija por
  provincia en la hoja `Envios`), no una cotización real por API.
- Mercado Pago y Payway son medios de pago **solo para comprar UN
  producto a la vez** (`/crear-pago`) — el checkout del carrito
  (`/crear-pago-carrito`) sigue siendo transferencia únicamente.

## Variables de entorno (ver consola al arrancar — avisa cuál falta)

Google: `GOOGLE_CREDENTIALS_JSON` (o `credentials.json` local),
`SHEET_ID_PRODUCTOS`, `SHEET_ID_VENTAS`, `GOOGLE_OAUTH_CLIENT_ID`,
`ADMIN_SEED_EMAIL`. Sesión: `SESSION_SECRET`. Sitio: `PUBLIC_URL`,
`SITIO_URL`. Pagos: `MP_ACCESS_TOKEN`, `PAYWAY_PRIVATE_API_KEY` /
`PAYWAY_PUBLIC_API_KEY` / `PAYWAY_SITE_ID`. Mail:
`EMAIL_USER`/`EMAIL_APP_PASSWORD`. WhatsApp: `WHATSAPP_TOKEN` /
`WHATSAPP_PHONE_NUMBER_ID`. Cierre de caja (IA gratis, opcional):
`OPENROUTER_API_KEY` / `OPENROUTER_MODEL` (default
`z-ai/glm-5.2:free`). El chatbot de WhatsApp sigue usando
`ANTHROPIC_API_KEY` si está, pero el cierre de caja **no**.

## Antes de decir que algo "funciona"

Para cambios de frontend, probar en el navegador (Browser tools),
simulando fetch/APIs si hace falta. Para cambios de backend sin
credenciales locales, correr `node --check` en cada archivo tocado y
levantar el servidor un momento para confirmar que arranca sin errores
nuevos — y decirlo explícitamente si algo no se pudo probar contra las
APIs reales (Sheets, Mercado Pago, Payway).
