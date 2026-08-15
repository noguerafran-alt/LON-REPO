/* ============================================================
 *  server.js
 *  Para cambiar nombres de hoja, IDs de spreadsheet, columnas, etc.
 *  editar config.js — este archivo no deberia necesitar tocarse
 *  para "instalar" la app en otro negocio.
 * ============================================================ */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const config = require('./config');
const {
  appendRow,
  getStockPorSkuGeneral,
  extraerSkuGeneral,
  getFilasImprimir,
  getCatalogoProductos,
  generarUnidades,
  getConfigCategorias,
  crearCategoriaConfig,
  getNombresVisiblesCategorias,
  actualizarNombreVisibleCategoria,
  getTarifasEnvio,
  actualizarTarifaEnvio,
  buscarClientePorEmail,
  crearClienteSiNoExiste,
  buscarClientePorCodigoFidelidad,
  registrarCafeCliente,
  crearProductoNuevo,
  agregarFotoProducto,
  eliminarFotoProducto,
  actualizarDescripcionProducto,
  actualizarPrecioProducto,
  actualizarProveedorProducto,
  eliminarProductoCompleto,
  actualizarLinksCatalogoProductos,
  buscarAsociacionCodigoBarra,
  asociarCodigoBarra,
  buscarSkuCompletoDisponible,
  procesarVentasNuevas,
  ajustarStockCantidad,
  registrarVisitaProducto,
  getVisitasPorSkuGeneral,
  getConsultasPorSkuGeneral,
  getAdminUsers,
  buscarAdminUserPorEmail,
  crearOActualizarAdminUser,
  eliminarAdminUser,
  crearPedido,
  getPedidos,
  getPedidoPorId,
  getPedidoPorPagoExternoId,
  actualizarPedido,
} = require('./googleSheets');
const { generarPdfEtiquetas } = require('./generarEtiquetas');
const QRCode = require('qrcode');
const payway = require('./payway');
const emailService = require('./email');
const imagenes = require('./imagenes');
const whatsapp = require('./whatsapp');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sanitizarTexto, esEmailValido, sanitizarTelefono, sanitizarCodigoPostal, enteroEnRango } = require('./validacion');

const app = express();

// Render (y la mayoría de los hostings) ponen la app detrás de un proxy
// reverso: sin esto, TODAS las requests parecen venir de la IP interna
// del proxy en vez de la del visitante real. Es crítico para que el
// rate limiting de más abajo limite por visitante y no por "todo el
// tráfico junto" (que se comportaría como si todos compartieran un
// único límite global).
app.set('trust proxy', 1);

// Cabeceras de seguridad estándar (X-Content-Type-Options, quita
// X-Powered-By para no anunciar que corremos Express, etc). `false` en
// contentSecurityPolicy porque las páginas ya cargan scripts/estilos de
// varios CDNs (fonts.googleapis.com, unpkg.com, accounts.google.com) y
// una CSP genérica los bloquearía; si en algún momento se quiere sumar
// una CSP a medida, hay que listar esos orígenes explícitamente.
// SE AGREGA crossOriginOpenerPolicy PARA PERMITIR POPUPS DE GOOGLE LOGIN
app.use(helmet({ 
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

app.use(express.json({
  limit: '2mb',
  // Guardamos el cuerpo crudo ANTES de parsearlo: hace falta tal cual
  // (bytes exactos) para verificar la firma HMAC de Meta en el webhook
  // de WhatsApp — si se recalcula desde el JSON ya parseado, la firma
  // no coincide aunque el contenido sea "igual".
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
// Las fotos de producto tienen nombre unico (SKU + timestamp), asi que
// nunca cambian de contenido: se pueden cachear fuerte en el navegador.
// Con esto, la segunda visita al catalogo muestra las fotos al instante,
// sin volver a bajarlas.
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads'), {
  maxAge: '365d',
  immutable: true,
}));
app.use(express.static(path.join(__dirname, 'public')));

/* ============================================================
 *  RATE LIMITING
 * ============================================================
 * Varios niveles, de más laxo a más estricto, según qué tan caro o
 * abusable es cada grupo de endpoints:
 *
 *  - limiteGeneral: red de seguridad para toda la API. Cubre casos que
 *    no entran en ninguna categoría más específica de abajo.
 *  - limiteLecturaPublica: catálogo, consulta de producto, config
 *    pública — de lectura, sin login, pero igual conviene topearlas
 *    para que no se puedan usar para tirar abajo el servidor o agotar
 *    la cuota de la API de Google Sheets (que es compartida por toda
 *    la app: si se agota, se cae para todo el mundo, no solo para quien
 *    abusó).
 *  - limiteEscrituraPublica: acciones públicas que cuestan algo real
 *    (mandan un mail, crean un pedido, o gastan cuota de la API de
 *    Claude en /chat-web) — bastante más estricto.
 *  - limiteLogin: intentos de login. Google ya protege la cuenta en sí,
 *    esto es para que no usen el endpoint para golpear el servidor o
 *    la verificación de tokens de Google en loop.
 *  - limiteAdmin: todo lo de /admin/* y /scan. Ya requieren sesión
 *    válida, así que esto no es tanto "anti-abuso" como protección de
 *    la cuota de Sheets ante un bug o un script que se vuelva loco.
 *
 * `standardHeaders: true` manda los headers RateLimit-* estándar (útil
 * para que el frontend pueda mostrar "esperá un momento" si hiciera
 * falta). `legacyHeaders: false` apaga los headers X-RateLimit-*
 * viejos, redundantes con los estándar.
 * ============================================================ */
function crearLimitador(opciones) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Esperá un momento y probá de nuevo.' },
    ...opciones,
  });
}

const limiteGeneral = crearLimitador({ windowMs: 15 * 60 * 1000, max: 600 });
const limiteLecturaPublica = crearLimitador({ windowMs: 60 * 1000, max: 60 });
const limiteEscrituraPublica = crearLimitador({ windowMs: 15 * 60 * 1000, max: 20 });
const limiteLogin = crearLimitador({ windowMs: 15 * 60 * 1000, max: 15 });
const limiteAdmin = crearLimitador({ windowMs: 60 * 1000, max: 120 });

// Red de seguridad general primero (se aplica a todo); los límites más
// específicos de abajo, montados sobre rutas puntuales, son ADEMÁS de
// este, no en su reemplazo.
app.use(limiteGeneral);

// Rutas amigables (sin ".html") ademas del acceso directo a los archivos.
app.get('/cliente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cliente.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));


if (!config.SHEET_ID_VENTAS || config.SHEET_ID_VENTAS.startsWith('PONE_ACA')) {
  console.warn('⚠️  Falta configurar SHEET_ID_VENTAS en config.js o en la variable de entorno.');
}
if (!config.SHEET_ID_PRODUCTOS || config.SHEET_ID_PRODUCTOS.startsWith('PONE_ACA')) {
  console.warn('⚠️  Falta configurar SHEET_ID_PRODUCTOS en config.js o en la variable de entorno.');
}
if (!config.GOOGLE_OAUTH_CLIENT_ID) {
  console.warn('⚠️  No configuraste GOOGLE_OAUTH_CLIENT_ID — el login del panel admin (Iniciar sesión con Google) no va a funcionar hasta que lo agregues.');
}
if (!config.ADMIN_SEED_EMAIL) {
  console.warn('⚠️  No configuraste ADMIN_SEED_EMAIL — si la hoja AdminUsers está vacía, nadie va a poder entrar al panel admin.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  No configuraste SESSION_SECRET en Render (queda el valor por defecto) — cambialo por uno propio y secreto, por ejemplo con `openssl rand -hex 32`.');
}
if (!config.PUBLIC_URL) {
  console.warn('⚠️  No configuraste PUBLIC_URL — los pagos con Payway y el webhook de WhatsApp no van a funcionar hasta que la agregues (ver README).');
}
if (!config.PAYWAY_PRIVATE_API_KEY || !config.PAYWAY_PUBLIC_API_KEY || !config.PAYWAY_SITE_ID) {
  console.warn('⚠️  No configuraste PAYWAY_PRIVATE_API_KEY / PAYWAY_PUBLIC_API_KEY / PAYWAY_SITE_ID — la opción "Pagar con tarjeta (Payway)" no va a funcionar hasta que los agregues. La opción "Transferencia bancaria" funciona igual, no depende de esto.');
}
if (!config.EMAIL_USER || !config.EMAIL_APP_PASSWORD) {
  console.warn('⚠️  No configuraste EMAIL_USER / EMAIL_APP_PASSWORD — no se va a poder mandar el mail de confirmación con los datos de transferencia (el pedido se crea igual, solo no se manda el mail).');
}
if (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
  console.warn('⚠️  No configuraste WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID — el chatbot de WhatsApp no va a poder responder hasta que los agregues.');
}

const credentials = process.env.GOOGLE_CREDENTIALS_JSON
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
  : undefined;

// Una sola cuenta de servicio con acceso (Editor) a AMBAS planillas:
// la de ventas/stock y la de catalogo/productos.
const auth = new google.auth.GoogleAuth({
  credentials,
  keyFile: credentials ? undefined : (process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

/* ============================================================
 *  LOGIN ADMIN CON GOOGLE + SESIONES POR NIVEL
 * ============================================================
 * El panel admin ya NO usa una contraseña compartida. El navegador
 * inicia sesión con Google (Google Identity Services, en admin.html),
 * nos manda el "ID token" que eso le da, y acá:
 *
 *   1) verificamos ese token con Google (confirma que es una cuenta
 *      real y que el token no está vencido ni manipulado),
 *   2) buscamos el email en la hoja AdminUsers para saber el nivel
 *      (1 o 2) — o lo damos de alta automático si es ADMIN_SEED_EMAIL,
 *   3) le devolvemos NUESTRA propia sesión: un token firmado con
 *      SESSION_SECRET que el navegador manda en cada pedido de ahí en
 *      más. Nunca reenviamos el token de Google ni lo guardamos.
 *
 * Cada endpoint del panel exige una de estas dos cosas llamando a
 * requiereSesion() (nivel 1 o 2: Escanear + Pedidos) o
 * requiereNivel2() (Productos + gestión de usuarios). La atribución de
 * "quién generó esto" sale SIEMPRE de esta sesión verificada en el
 * servidor, nunca de un campo que mande el navegador.
 * ============================================================ */

const clienteGoogleOAuth = new google.auth.OAuth2(config.GOOGLE_OAUTH_CLIENT_ID);

/** Firma una sesión como "cuerpo.firma" (base64url + HMAC-SHA256). */
function firmarSesion(payload) {
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const firma = crypto.createHmac('sha256', config.SESSION_SECRET).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

/** Verifica y decodifica un token de sesión (firma + vencimiento). No
    valida el campo `tipo` — eso lo hace cada verificador especifico
    (admin/cliente), para que un token de un tipo no sirva para el otro
    aunque compartan el mismo secreto de firma. */
function verificarSesionFirmada(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;

  const firmaEsperada = crypto.createHmac('sha256', config.SESSION_SECRET).update(cuerpo).digest('base64url');
  const bufFirma = Buffer.from(firma);
  const bufEsperada = Buffer.from(firmaEsperada);
  if (bufFirma.length !== bufEsperada.length || !crypto.timingSafeEqual(bufFirma, bufEsperada)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
  if (!payload || !payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

/** Firma una sesión de admin. Incluye tipo:'admin' para que este token
    nunca pueda usarse en un endpoint de cliente ni viceversa. */
function firmarSesionAdmin(payload) {
  return firmarSesion({ ...payload, tipo: 'admin' });
}

function verificarSesionAdmin(token) {
  const payload = verificarSesionFirmada(token);
  if (!payload || payload.tipo !== 'admin') return null;
  return payload; // { tipo, email, nivel, nombre, exp }
}

/** Firma una sesión de cliente del catálogo público (login con Google,
    sin whitelist previa — cualquier cuenta de Google puede loguearse). */
function firmarSesionCliente(payload) {
  return firmarSesion({ ...payload, tipo: 'cliente' });
}

function verificarSesionCliente(token) {
  const payload = verificarSesionFirmada(token);
  if (!payload || payload.tipo !== 'cliente') return null;
  return payload; // { tipo, email, nombre, exp }
}

/** Exige una sesión de cliente válida. Si es inválida o venció, responde
    401 y devuelve null — el caller debe hacer `if (!sesion) return;`. */
function requiereSesionCliente(req, res) {
  const sesion = verificarSesionCliente(tokenDeLaRequest(req));
  if (!sesion) {
    res.status(401).json({ error: 'Sesión inválida o vencida. Volvé a iniciar sesión.' });
    return null;
  }
  return sesion;
}

/** El token de sesión viaja como `token` en el body (POST) o en la
    query string (GET). */
function tokenDeLaRequest(req) {
  if (req.body && req.body.token) return req.body.token;
  if (req.query && req.query.token) return req.query.token;
  return null;
}

/** Exige una sesión válida de CUALQUIER nivel (1 o 2). Si es inválida o
    venció, responde 401 y devuelve null — el caller debe hacer
    `if (!sesion) return;` inmediatamente después de llamar a esto. */
function requiereSesion(req, res) {
  const sesion = verificarSesionAdmin(tokenDeLaRequest(req));
  if (!sesion) {
    res.status(401).json({ error: 'Sesión inválida o vencida. Volvé a iniciar sesión.' });
    return null;
  }
  return sesion;
}

/** Exige una sesión de nivel 2 (acceso total). Nivel 1 recibe 403 con un
    mensaje claro de por qué no puede. */
function requiereNivel2(req, res) {
  const sesion = requiereSesion(req, res);
  if (!sesion) return null;
  if (sesion.nivel !== 2) {
    res.status(403).json({ error: 'Esta acción es solo para usuarios de nivel 2.' });
    return null;
  }
  return sesion;
}

app.post('/admin-login-google', limiteLogin, async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Falta el token de Google.' });
    }
    if (!config.GOOGLE_OAUTH_CLIENT_ID) {
      return res.status(500).json({ error: 'El servidor no tiene configurado GOOGLE_OAUTH_CLIENT_ID.' });
    }

    let payloadGoogle;
    try {
      const ticket = await clienteGoogleOAuth.verifyIdToken({ idToken, audience: config.GOOGLE_OAUTH_CLIENT_ID });
      payloadGoogle = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ error: 'No se pudo verificar la cuenta de Google. Probá iniciar sesión de nuevo.' });
    }

    if (!payloadGoogle || !payloadGoogle.email || !payloadGoogle.email_verified) {
      return res.status(401).json({ error: 'La cuenta de Google no tiene el email verificado.' });
    }

    const email = String(payloadGoogle.email).trim().toLowerCase();
    const nombreGoogle = payloadGoogle.name || payloadGoogle.email;

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { usuario } = await buscarAdminUserPorEmail(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_ADMIN_USERS, email);

    let nivel;
    let nombre;

    if (usuario) {
      nivel = usuario.nivel;
      nombre = usuario.nombre || nombreGoogle;
    } else if (config.ADMIN_SEED_EMAIL && email === config.ADMIN_SEED_EMAIL) {
      // Primera vez que entra el dueño de la cuenta semilla: lo damos de
      // alta solo como nivel 2, para que despues aparezca en la lista de
      // usuarios del panel igual que cualquier otro.
      const { fecha, hora } = fechaYHoraActual();
      await crearOActualizarAdminUser(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_ADMIN_USERS, {
        email, nivel: 2, nombre: nombreGoogle, fecha: `${fecha} ${hora}`, agregadoPor: '(automático)',
      });
      nivel = 2;
      nombre = nombreGoogle;
    } else {
      return res.status(403).json({ error: 'Tu cuenta de Google no está autorizada para entrar al panel admin. Pedile a un administrador que te agregue.' });
    }

    const exp = Date.now() + config.SESSION_DURACION_HORAS * 60 * 60 * 1000;
    const token = firmarSesionAdmin({ email, nivel, nombre, exp });

    res.json({ ok: true, token, email, nivel, nombre, exp });
  } catch (err) {
    console.error('Error en el login con Google:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});

/* Login de CLIENTES del catálogo público (Google Identity), separado
   del login de admin: acá no hay whitelist — cualquier cuenta de
   Google se da de alta sola la primera vez que inicia sesión. */
app.post('/cliente-login-google', limiteLogin, async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Falta el token de Google.' });
    }
    if (!config.GOOGLE_OAUTH_CLIENT_ID) {
      return res.status(500).json({ error: 'El servidor no tiene configurado GOOGLE_OAUTH_CLIENT_ID.' });
    }

    let payloadGoogle;
    try {
      const ticket = await clienteGoogleOAuth.verifyIdToken({ idToken, audience: config.GOOGLE_OAUTH_CLIENT_ID });
      payloadGoogle = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ error: 'No se pudo verificar la cuenta de Google. Probá iniciar sesión de nuevo.' });
    }

    if (!payloadGoogle || !payloadGoogle.email || !payloadGoogle.email_verified) {
      return res.status(401).json({ error: 'La cuenta de Google no tiene el email verificado.' });
    }

    const email = String(payloadGoogle.email).trim().toLowerCase();
    const nombreGoogle = payloadGoogle.name || payloadGoogle.email;

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { fecha, hora } = fechaYHoraActual();
    const cliente = await crearClienteSiNoExiste(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CLIENTES, {
      email, nombre: nombreGoogle, fecha: `${fecha} ${hora}`,
    });

    const exp = Date.now() + config.SESSION_DURACION_HORAS * 60 * 60 * 1000;
    const token = firmarSesionCliente({ email: cliente.email, nombre: cliente.nombre || nombreGoogle, exp });

    res.json({ ok: true, token, email: cliente.email, nombre: cliente.nombre || nombreGoogle, exp });
  } catch (err) {
    console.error('Error en el login de cliente con Google:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar sesión.' });
  }
});

/* Datos de la cuenta del cliente logueado: nombre, cuantos cafes lleva
   y el QR de su codigo de fidelidad (para que el personal del local lo
   escanee). Requiere sesion de cliente. */
app.get('/cliente/mi-cuenta', limiteLecturaPublica, async (req, res) => {
  try {
    const sesion = requiereSesionCliente(req, res);
    if (!sesion) return;

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { cliente } = await buscarClientePorEmail(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CLIENTES, sesion.email);
    if (!cliente) {
      return res.status(404).json({ error: 'No se encontró tu cuenta.' });
    }

    const qrDataUrl = await QRCode.toDataURL(cliente.codigoFidelidad, { width: 220, margin: 1 });

    res.json({
      nombre: cliente.nombre || sesion.nombre,
      email: cliente.email,
      cafesContador: cliente.cafesContador,
      cafesParaGratis: config.CAFES_PARA_GRATIS,
      qrDataUrl,
    });
  } catch (err) {
    console.error('Error leyendo la cuenta del cliente:', err.message);
    res.status(500).json({ error: 'No se pudo cargar tu cuenta.' });
  }
});

/* Consulta (sin modificar nada) los datos de fidelidad de un cliente a
   partir del código escaneado — se usa para mostrarle al admin quién es
   y su progreso ANTES de confirmar cuántos cafés cargarle, así el
   escaneo en sí nunca suma solo. Requiere sesion de admin. */
app.get('/admin/cliente-por-codigo-fidelidad', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereSesion(req, res);
    if (!sesion) return;

    const codigoFidelidad = req.query.codigo;
    if (!codigoFidelidad || !String(codigoFidelidad).trim()) {
      return res.status(400).json({ error: 'Falta el código escaneado.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { cliente } = await buscarClientePorCodigoFidelidad(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CLIENTES, String(codigoFidelidad).trim());
    if (!cliente) {
      return res.status(404).json({ error: 'Ese código no corresponde a ninguna cuenta. Pedile al cliente que abra "Mi cuenta" en LON.' });
    }

    res.json({
      nombre: cliente.nombre,
      cafesContador: cliente.cafesContador,
      cafesParaGratis: config.CAFES_PARA_GRATIS,
    });
  } catch (err) {
    console.error('Error consultando cliente por código de fidelidad:', err.message);
    res.status(500).json({ error: 'No se pudo consultar la cuenta.' });
  }
});

/* El personal del local confirma la cantidad de cafés a cargarle a un
   cliente (después de escanear su QR y ver quién es con el endpoint de
   arriba) — la cantidad la elige el admin a mano, el escaneo en sí NO
   suma solo, para que una lectura repetida de casualidad no cargue de
   más. Al llegar a CAFES_PARA_GRATIS el contador queda "esperando" y el
   siguiente café entregado es el regalo (vuelve a 0). Requiere sesion
   de admin (nivel 1 o 2 — es parte del flujo de venta). */
app.post('/admin/cafe-escaneado', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereSesion(req, res);
    if (!sesion) return;

    const { codigoFidelidad, cantidad } = req.body;
    if (!codigoFidelidad || !String(codigoFidelidad).trim()) {
      return res.status(400).json({ error: 'Falta el código escaneado.' });
    }
    const cantidadNum = enteroEnRango(cantidad === undefined ? 1 : cantidad, 1, 20);
    if (cantidadNum === null) {
      return res.status(400).json({ error: 'La cantidad tiene que ser un número entero entre 1 y 20.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const resultado = await registrarCafeCliente(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CLIENTES, String(codigoFidelidad).trim(), cantidadNum);
    if (!resultado) {
      return res.status(404).json({ error: 'Ese código no corresponde a ninguna cuenta. Pedile al cliente que abra "Mi cuenta" en LON.' });
    }

    res.json({
      ok: true,
      nombre: resultado.cliente.nombre,
      cafesContador: resultado.cafesContador,
      cafesParaGratis: config.CAFES_PARA_GRATIS,
      esGratis: resultado.esGratis,
      regalosEntregados: resultado.regalosEntregados,
      regaloDesbloqueado: resultado.regaloDesbloqueado,
    });
  } catch (err) {
    console.error('Error registrando café:', err.message);
    res.status(500).json({ error: 'No se pudo registrar el café.' });
  }
});

function fechaYHoraActual() {
  const now = new Date();
  const fecha = now.toLocaleDateString('es-AR', { timeZone: config.TIMEZONE });
  const hora = now.toLocaleTimeString('es-AR', { timeZone: config.TIMEZONE });
  return { fecha, hora };
}

function generarPedidoId() {
  const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PED-${Date.now()}-${sufijo}`;
}

/* ------------------------------------------------------------
 * CONSULTA PUBLICA DE PRODUCTO (precio, nombre, y stock si hay sesión)
 * ------------------------------------------------------------ */
app.get('/producto/:sku', limiteLecturaPublica, async (req, res) => {
  try {
    const { sku } = req.params;
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ error: 'SKU vacío.' });
    }

    const skuEscaneado = String(sku).trim();
    const sheetsClient = google.sheets({ version: 'v4', auth });

    // El precio SIEMPRE sale del catálogo (Productos), así queda
    // actualizado automáticamente si lo cambiás ahí. La hoja PRECIOS
    // queda solo como registro histórico de a qué precio se generó
    // cada unidad, y ya no la usa la app para mostrar precios.
    const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);

    let skuGeneral = extraerSkuGeneral(skuEscaneado);
    let productoCatalogo = catalogo.find((p) => p.skuGeneral.toUpperCase() === skuGeneral.toUpperCase());
    let skuResuelto = skuEscaneado; // caso normal: QR interno, el mismo codigo escaneado es el SKU a usar
    let esCodigoBarraExterno = false;

    // extraerSkuGeneral SIEMPRE saca el último bloque separado por "-",
    // sin mirar si es un número de serie de verdad — si lo que llegó ya
    // era el SKU general tal cual (por ejemplo, "Vender" desde Catálogo
    // completo en el admin, que busca el producto en vez de escanear una
    // unidad puntual), esa resta de más lo deja sin coincidir con nada.
    // Antes de asumir que es un código de barras, probamos el valor
    // crudo directo contra el catálogo.
    if (!productoCatalogo) {
      const directo = catalogo.find((p) => p.skuGeneral.toUpperCase() === skuEscaneado.toUpperCase());
      if (directo) {
        productoCatalogo = directo;
        skuGeneral = skuEscaneado;
      }
    }

    if (!productoCatalogo) {
      // No es un SKU interno reconocido: puede ser el código de barras
      // ORIGINAL del producto (ISBN, EAN, etc — el mismo en todas las
      // copias), si ya fue asociado desde el modo "Código de barras".
      const { asociacion } = await buscarAsociacionCodigoBarra(
        sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CODIGOS_BARRA, skuEscaneado,
      );
      if (asociacion) {
        skuGeneral = asociacion.skuGeneral;
        productoCatalogo = catalogo.find((p) => p.skuGeneral.toUpperCase() === skuGeneral.toUpperCase());
        esCodigoBarraExterno = true;
      }
    }

    if (!productoCatalogo) {
      return res.status(404).json({ error: 'SKU no encontrado en el catálogo de productos.' });
    }

    // No identifica una unidad física puntual (falta el bloque de serie)
    // cuando: es un código de barras externo (siempre le falta), o
    // cuando lo que llegó ya ES el SKU general tal cual — por ejemplo
    // desde "Catálogo completo" en el admin, donde se vende buscando el
    // producto en vez de escaneando una unidad concreta. En los dos
    // casos hace falta asignar automáticamente la próxima unidad ya
    // generada y todavía no vendida.
    const esSkuGeneralDirecto = !esCodigoBarraExterno && skuEscaneado.toUpperCase() === skuGeneral.toUpperCase();
    if (esCodigoBarraExterno || esSkuGeneralDirecto) {
      const disponible = await buscarSkuCompletoDisponible(
        sheetsClient, config.SHEET_ID_PRODUCTOS, config.SHEET_ID_VENTAS, skuGeneral,
      );
      if (!disponible) {
        return res.status(409).json({
          error: `No hay unidades generadas sin vender de "${productoCatalogo.producto}" (${skuGeneral}). Generá más unidades antes de vender.`,
          skuGeneral,
        });
      }
      skuResuelto = disponible;
    }

    const producto = {
      precio: productoCatalogo.precio !== '' ? productoCatalogo.precio : null,
      nombre: productoCatalogo.producto || null,
      foto: productoCatalogo.foto || null,
      ultimaModificacionPrecio: productoCatalogo.ultimaModificacionPrecio || null,
      skuResuelto,
      esCodigoBarraExterno,
    };

    // El stock solo se muestra si viene con una sesión de admin válida
    // (cualquier nivel — nivel 1 lo necesita para vender). Acá no
    // usamos requiereSesion() porque este endpoint es público (el
    // catálogo lo consulta sin login): si no hay sesión, seguimos de
    // largo devolviendo el resto de los datos igual.
    if (verificarSesionAdmin(tokenDeLaRequest(req))) {
      const stock = await getStockPorSkuGeneral(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_STOCK, skuGeneral);
      producto.stock = stock;
    }

    res.json(producto);
  } catch (err) {
    console.error('Error buscando el producto:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el producto.' });
  }
});

/* ------------------------------------------------------------
 * CONSULTA DE CLIENTE (sin login admin)
 * ------------------------------------------------------------ */
app.post('/consulta', limiteEscrituraPublica, async (req, res) => {
  try {
    const { sku, nombre, email, telefono } = req.body;
    // El SKU puede venir vacio: es el caso de "Dejanos tu contacto" sin
    // haber escaneado nada todavia (contacto general).
    const skuLimpio = sanitizarTexto(sku, 80) || '(contacto general)';
    const nombreLimpio = sanitizarTexto(nombre, 120);
    const telefonoLimpio = sanitizarTelefono(telefono);

    if (email && !esEmailValido(email)) {
      return res.status(400).json({ error: 'El email no tiene un formato válido.' });
    }
    const emailLimpio = email ? sanitizarTexto(email, 254) : '';

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { fecha, hora } = fechaYHoraActual();

    await appendRow(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_CONSULTAS, [
      skuLimpio, nombreLimpio, emailLimpio, telefonoLimpio, fecha, hora,
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Error registrando la consulta:', err.message);
    res.status(500).json({ error: 'No se pudo registrar la consulta.' });
  }
});

/* ============================================================
 *  SECCION ADMIN 1: ESCANEAR
 * ============================================================ */

/* Guarda el escaneo como venta. Requiere contraseña en cada llamada
   (no hay sesion persistente). */
/* Verifica si un SKU completo ya fue marcado "Vendido" antes en VENTAS,
   para poder avisarle al admin antes de contarlo de nuevo (evita doble
   conteo si se escanea por error el mismo codigo dos veces). */
app.get('/admin/verificar-vendido', limiteAdmin, async (req, res) => {
  try {
    const { sku } = req.query;
    const sesion = requiereSesion(req, res);
    if (!sesion) return;
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ error: 'SKU vacío.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID_VENTAS,
      range: `${config.HOJA_VENTAS}!A:D`,
    });

    const rows = response.data.values || [];
    const skuNormalizado = String(sku).trim().toLowerCase();
    let yaVendido = false;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const skuFila = row[0] ? String(row[0]).trim().toLowerCase() : '';
      const marca = row[3] ? String(row[3]).trim() : '';
      if (skuFila === skuNormalizado && marca.indexOf('Vendido') === 0) {
        yaVendido = true;
        break;
      }
    }

    res.json({ yaVendido });
  } catch (err) {
    console.error('Error verificando si ya estaba vendido:', err.message);
    res.status(500).json({ error: 'No se pudo verificar el estado del SKU.' });
  }
});

app.post('/scan', limiteAdmin, async (req, res) => {
  try {
    const { sku, precioManual } = req.body;

    const sesion = requiereSesion(req, res);
    if (!sesion) return;
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ error: 'El código escaneado está vacío.' });
    }
    if (precioManual !== undefined && precioManual !== null && precioManual !== '' && Number.isNaN(Number(precioManual))) {
      return res.status(400).json({ error: 'El precio manual tiene que ser un número.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { fecha, hora } = fechaYHoraActual();

    // Columnas: A=SKU, B=Fecha, C=Hora, D=Marca (la completa el procesador
    // automático), E=Precio Venta (idem), F=Precio Manual (opcional, lo
    // carga el admin al momento de vender si el precio final fue distinto
    // al de catálogo — el procesador lo usa en vez del precio de Productos),
    // G=numero de pedido (no aplica acá, vacio), H=Vendedor (el email sale
    // de la sesion ya verificada, nunca de lo que mande el navegador).
    const precioManualLimpio = precioManual !== undefined && precioManual !== null && precioManual !== '' ? Number(precioManual) : '';
    await appendRow(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_VENTAS, [sku, fecha, hora, '', '', precioManualLimpio, '', sesion.email]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando la hoja de cálculo:', err.message);
    res.status(500).json({ error: 'No se pudo guardar en la hoja. Revisá la terminal para más detalle.' });
  }
});

/* ============================================================
 *  SECCION ADMIN 2: GENERAR UNIDADES (+ generar etiquetas)
 * ============================================================ */

/* Devuelve el catalogo completo de productos (para armar los filtros
   de categoria/subcategoria + buscador en el frontend). Requiere admin. */
app.get('/admin/catalogo', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;


    const sheetsClient = google.sheets({ version: 'v4', auth });
    const productos = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);

    res.json({ productos });
  } catch (err) {
    console.error('Error leyendo el catálogo:', err.message);
    res.status(500).json({ error: 'No se pudo leer el catálogo de productos.' });
  }
});

/* Rellena la columna K de la hoja Productos con el link al producto en
   el catalogo publico, para poder revisarlos desde la planilla. Los
   productos nuevos ya nacen con su link; esto es para completar los que
   ya estaban cargados de antes. Requiere admin nivel 2. */
app.post('/admin/actualizar-links-catalogo', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    if (!config.PUBLIC_URL) {
      return res.status(400).json({
        error: 'Falta configurar PUBLIC_URL (la dirección pública de la app) para poder armar los links.',
      });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { actualizados } = await actualizarLinksCatalogoProductos(
      sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS,
    );

    res.json({ ok: true, actualizados });
  } catch (err) {
    console.error('Error actualizando los links del catálogo:', err.message);
    res.status(500).json({ error: 'No se pudieron actualizar los links en la planilla.' });
  }
});

/* Devuelve las categorias/subcategorias/prefijos de SKU (hoja Config),
   para armar el formulario de "crear producto nuevo". Requiere admin. */
app.get('/admin/config-categorias', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;


    const sheetsClient = google.sheets({ version: 'v4', auth });
    const categorias = await getConfigCategorias(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CONFIG);

    res.json({ categorias });
  } catch (err) {
    console.error('Error leyendo Config:', err.message);
    res.status(500).json({ error: 'No se pudo leer la hoja Config.' });
  }
});

/* Agrega una categoria/subcategoria nueva a la hoja Config (con su
   codigo y prefijo de SKU), para que quede disponible al crear
   productos nuevos. Requiere admin. */
app.post('/admin/crear-config-categoria', limiteAdmin, async (req, res) => {
  try {
    const { categoria, codigoCategoria, subcategoria, codigoSubcategoria } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!categoria || !String(categoria).trim()) {
      return res.status(400).json({ error: 'Falta el nombre de la categoría.' });
    }
    if (!codigoCategoria || !String(codigoCategoria).trim()) {
      return res.status(400).json({ error: 'Falta el código de categoría (ej: LIB).' });
    }
    if (!subcategoria || !String(subcategoria).trim()) {
      return res.status(400).json({ error: 'Falta el nombre de la subcategoría.' });
    }
    if (!codigoSubcategoria || !String(codigoSubcategoria).trim()) {
      return res.status(400).json({ error: 'Falta el código de subcategoría (ej: INF).' });
    }
    // Los códigos van directo al prefijo del SKU (ej "LIB-INF-0007"):
    // solo letras y números, para no romper el formato ni el parseo de
    // SKU en el resto de la app.
    const REGEX_CODIGO = /^[a-zA-Z0-9]{1,10}$/;
    if (!REGEX_CODIGO.test(String(codigoCategoria).trim())) {
      return res.status(400).json({ error: 'El código de categoría solo puede tener letras y números (máx. 10 caracteres).' });
    }
    if (!REGEX_CODIGO.test(String(codigoSubcategoria).trim())) {
      return res.status(400).json({ error: 'El código de subcategoría solo puede tener letras y números (máx. 10 caracteres).' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });

    const nueva = await crearCategoriaConfig(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CONFIG, {
      categoria: sanitizarTexto(categoria, 80),
      codigoCategoria: String(codigoCategoria).trim().toUpperCase(),
      subcategoria: sanitizarTexto(subcategoria, 80),
      codigoSubcategoria: String(codigoSubcategoria).trim().toUpperCase(),
    });

    res.json({ ok: true, categoria: nueva });
  } catch (err) {
    console.error('Error creando la categoría en Config:', err.message);
    res.status(500).json({ error: 'No se pudo crear la categoría.' });
  }
});

/* Crea un producto nuevo en la hoja Productos (cuando el producto que se
   quiere generar todavia no existe en el catalogo). Calcula el siguiente
   numero de producto libre para el prefijo de SKU elegido. */
app.post('/admin/crear-producto', limiteAdmin, async (req, res) => {
  try {
    const { producto, categoria, subcategoria, prefijoSku, precio, proveedor } = req.body;

    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!producto || !String(producto).trim()) {
      return res.status(400).json({ error: 'Falta el nombre del producto.' });
    }
    if (!prefijoSku || !String(prefijoSku).trim()) {
      return res.status(400).json({ error: 'Falta la categoría/subcategoría (prefijo de SKU).' });
    }
    let precioLimpio = '';
    if (precio !== undefined && precio !== null && precio !== '') {
      const precioNum = Number(precio);
      if (!Number.isFinite(precioNum) || precioNum < 0) {
        return res.status(400).json({ error: 'El precio tiene que ser un número mayor o igual a 0.' });
      }
      precioLimpio = precioNum;
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });

    const productoCreado = await crearProductoNuevo(sheetsClient, {
      spreadsheetId: config.SHEET_ID_PRODUCTOS,
      sheetNameProductos: config.HOJA_PRODUCTOS,
      producto: sanitizarTexto(producto, 200),
      categoria: sanitizarTexto(categoria, 80),
      subcategoria: sanitizarTexto(subcategoria, 80),
      prefijoSku: String(prefijoSku).trim().toUpperCase(),
      precio: precioLimpio,
      proveedor: sanitizarTexto(proveedor || '', 120),
    });

    res.json({ ok: true, producto: productoCreado });
  } catch (err) {
    console.error('Error creando el producto:', err.message);
    res.status(500).json({ error: 'No se pudo crear el producto.' });
  }
});

/* Genera N unidades (SKUs completos correlativos) para un SKU general,
   actualiza CONTADOR_UNIDADES y agrega filas a HISTORICO_SKU e IMPRIMIR APP. */
/* Busca si un codigo de barras externo (el que ya trae el producto de
   fabrica, ej ISBN/EAN de un libro) ya esta asociado a un SKU interno.
   Se usa desde el modo "Asociar código de barras" del escáner. Requiere
   admin. */
app.get('/admin/codigo-barra/:codigo', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;


    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { asociacion } = await buscarAsociacionCodigoBarra(
      sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CODIGOS_BARRA, req.params.codigo,
    );

    res.json({ asociado: !!asociacion, asociacion });
  } catch (err) {
    console.error('Error buscando la asociación de código de barras:', err.message);
    res.status(500).json({ error: 'No se pudo buscar la asociación.' });
  }
});

/* Crea o actualiza la asociacion entre un codigo de barras externo y un
   SKU interno del catalogo. Requiere admin. */
app.post('/admin/codigo-barra', limiteAdmin, async (req, res) => {
  try {
    const { codigoBarra, skuGeneral } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!codigoBarra || !String(codigoBarra).trim()) {
      return res.status(400).json({ error: 'Falta el código de barras.' });
    }
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU interno a asociar.' });
    }
    // Códigos de barra reales (ISBN/EAN/UPC) son numéricos; permitimos
    // letras también por si algún código interno viejo las tiene, pero
    // topeamos el largo para no aceptar texto libre disfrazado de código.
    const codigoBarraLimpio = String(codigoBarra).trim().slice(0, 40);

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);
    const producto = catalogo.find((p) => p.skuGeneral.toLowerCase() === String(skuGeneral).trim().toLowerCase());
    if (!producto) {
      return res.status(404).json({ error: 'No se encontró ese SKU interno en el catálogo.' });
    }

    const { fecha, hora } = fechaYHoraActual();
    await asociarCodigoBarra(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CODIGOS_BARRA, {
      codigoBarra: codigoBarraLimpio,
      skuGeneral: producto.skuGeneral,
      producto: producto.producto,
      fecha: `${fecha} ${hora}`,
    });

    res.json({ ok: true, producto: producto.producto, skuGeneral: producto.skuGeneral });
  } catch (err) {
    console.error('Error asociando el código de barras:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la asociación.' });
  }
});

app.post('/admin/generar-unidades', limiteAdmin, async (req, res) => {
  try {
    const { skuGeneral, producto, categoria, subcategoria, precio, proveedor, cantidad } = req.body;

    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU general del producto.' });
    }
    const cantidadNum = Number(cantidad);
    if (!Number.isInteger(cantidadNum) || cantidadNum <= 0) {
      return res.status(400).json({ error: 'La cantidad tiene que ser un número entero mayor a 0.' });
    }
    if (cantidadNum > 5000) {
      return res.status(400).json({ error: 'Cantidad demasiado grande (máximo 5000 por vez).' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { fecha } = fechaYHoraActual();
    const skuGeneralLimpio = String(skuGeneral).trim();

    const [skusGenerados] = await Promise.all([
      generarUnidades(sheetsClient, {
        spreadsheetId: config.SHEET_ID_PRODUCTOS,
        skuGeneral: skuGeneralLimpio,
        producto: producto || '',
        categoria: categoria || '',
        subcategoria: subcategoria || '',
        precio: precio || '',
        cantidad: cantidadNum,
        // El email de quien genera queda registrado en HISTORICO_SKU
        // (columna H) tomado SIEMPRE de la sesión verificada en el
        // servidor, nunca de un valor que mande el navegador.
        generadoPor: sesion.email,
        fecha,
      }),
      // Si desde "Generar unidades" se edito el precio del producto ya
      // existente, lo actualizamos tambien en la ficha maestra (hoja
      // Productos) para que el catalogo quede con el precio nuevo.
      precio !== undefined && precio !== null && String(precio).trim() !== ''
        ? actualizarPrecioProducto(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS, skuGeneralLimpio, precio)
        : Promise.resolve(),
      // Mismo criterio para el proveedor: dato interno, nunca se mezcla
      // con el nombre del producto ni se muestra en el catalogo publico.
      proveedor !== undefined && proveedor !== null
        ? actualizarProveedorProducto(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS, skuGeneralLimpio, sanitizarTexto(proveedor, 120))
        : Promise.resolve(),
    ]);

    res.json({ ok: true, skusGenerados });
  } catch (err) {
    console.error('Error generando unidades:', err.message);
    res.status(500).json({ error: 'No se pudieron generar las unidades. Revisá los logs del servidor.' });
  }
});

/* Borra todos los datos de la hoja IMPRIMIR APP (deja la fila 1 de
   encabezado intacta). Se usa despues de imprimir, para arrancar de cero. */
app.post('/admin/vaciar-imprimir-app', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;


    const sheetsClient = google.sheets({ version: 'v4', auth });

    await sheetsClient.spreadsheets.values.clear({
      spreadsheetId: config.SHEET_ID_PRODUCTOS,
      range: `${config.HOJA_IMPRIMIR_APP}!A2:Z`,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Error vaciando IMPRIMIR APP:', err.message);
    res.status(500).json({ error: 'No se pudo vaciar la hoja IMPRIMIR APP.' });
  }
});

/* Arma la lista de productos con nombre, categoria (interna y la que ven
   los clientes), foto, stock y precio de referencia, cruzando la hoja
   STOCK (planilla de VENTAS) con Productos y Config (planilla de
   PRODUCTOS). Con soloConStock=true (catálogo público) se descartan los
   productos sin unidades disponibles; con false (catálogo del admin) se
   devuelven todos, con la cantidad real. */
async function construirCatalogoConStock(sheetsClient, { soloConStock, incluirProveedor = false }) {
  const stockResp = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: config.SHEET_ID_VENTAS,
    range: `${config.HOJA_STOCK}!A:F`,
  });
  const [catalogoProductos, nombresVisiblesCategorias] = await Promise.all([
    getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS),
    getNombresVisiblesCategorias(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CONFIG),
  ]);

  const stockRows = stockResp.data.values || [];

  // Precio y foto de referencia por SKU general, tomados de la hoja
  // Productos (fuente autoritativa/actualizada, no PRECIOS que guarda
  // precio por unidad individual y puede quedar viejo).
  const precioPorSkuGeneral = {};
  const fotoPorSkuGeneral = {};
  const fotosPorSkuGeneral = {};
  const descripcionPorSkuGeneral = {};
  const proveedorPorSkuGeneral = {};
  const subcategoriaPorSkuGeneral = {};
  catalogoProductos.forEach((p) => {
    if (p.skuGeneral && p.precio !== '' && p.precio !== undefined) {
      precioPorSkuGeneral[p.skuGeneral] = p.precio;
    }
    if (p.skuGeneral && p.foto) {
      fotoPorSkuGeneral[p.skuGeneral] = p.foto;
    }
    if (p.skuGeneral) {
      fotosPorSkuGeneral[p.skuGeneral] = p.fotos || [];
      descripcionPorSkuGeneral[p.skuGeneral] = p.descripcion || '';
      proveedorPorSkuGeneral[p.skuGeneral] = p.proveedor || '';
      subcategoriaPorSkuGeneral[p.skuGeneral] = p.subcategoria || '';
    }
  });

  const cols = config.COLUMNAS_STOCK;
  const productos = [];
  for (let i = 1; i < stockRows.length; i++) {
    const row = stockRows[i];
    const skuGeneral = row[cols.skuGeneral] ? String(row[cols.skuGeneral]).trim() : '';
    if (!skuGeneral) continue;

    const nombre = row[cols.nombre] ? String(row[cols.nombre]).trim() : '';
    const categoria = row[cols.categoria] ? String(row[cols.categoria]).trim() : '';
    const cantidadActual = Number(row[cols.cantidadActual]) || 0;

    // El catálogo público solo debe mostrar productos con stock
    // disponible — si no hay unidades, ni siquiera lo listamos. El
    // catálogo del admin (soloConStock=false) los quiere ver igual.
    if (soloConStock && cantidadActual <= 0) continue;

    productos.push({
      skuGeneral,
      nombre: nombre || '(sin nombre)',
      categoria,
      subcategoria: subcategoriaPorSkuGeneral[skuGeneral] || '',
      categoriaVisible: nombresVisiblesCategorias[categoria.toUpperCase()] || categoria,
      disponible: cantidadActual > 0,
      cantidad: cantidadActual,
      precio: precioPorSkuGeneral[skuGeneral] || null,
      foto: fotoPorSkuGeneral[skuGeneral] || null,
      fotos: fotosPorSkuGeneral[skuGeneral] || [],
      descripcion: descripcionPorSkuGeneral[skuGeneral] || '',
      // Dato interno (compras/reposicion) — solo se agrega cuando lo
      // pide explicitamente un llamador admin (incluirProveedor:true),
      // nunca en el catalogo publico.
      ...(incluirProveedor ? { proveedor: proveedorPorSkuGeneral[skuGeneral] || '' } : {}),
    });
  }

  return productos;
}

/* Catalogo PUBLICO (sin contraseña): lista de productos con nombre,
   categoria, foto, si hay stock disponible y un precio de referencia
   (tomado de la hoja Productos). Se usa para la vista de "Catálogo". */
app.get('/catalogo-publico', limiteLecturaPublica, async (req, res) => {
  try {
    const sheetsClient = google.sheets({ version: 'v4', auth });
    const productos = await construirCatalogoConStock(sheetsClient, { soloConStock: true });
    res.json({ productos });
  } catch (err) {
    console.error('Error leyendo el catálogo público:', err.message);
    res.status(500).json({ error: 'No se pudo cargar el catálogo.' });
  }
});

/* Suma 1 visita a un producto — se llama cada vez que alguien abre el
   detalle de un producto en el catalogo publico. Se usa para armar
   "Destacados: mas visitados". Sin login, con rate-limit anti-abuso. */
app.post('/producto-visita', limiteEscrituraPublica, async (req, res) => {
  try {
    const { skuGeneral } = req.body;
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU general del producto.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { fecha } = fechaYHoraActual();
    await registrarVisitaProducto(
      sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_VISITAS,
      String(skuGeneral).trim(), fecha,
    );

    res.json({ ok: true });
  } catch (err) {
    // No es grave si esto falla — no bloqueamos ni avisamos al cliente,
    // el catalogo tiene que seguir funcionando igual sin esta metrica.
    console.error('Error registrando la visita:', err.message);
    res.status(500).json({ error: 'No se pudo registrar la visita.' });
  }
});

/* Top de productos "mas consultados" (hoja Consultas) y "mas visitados"
   (hoja VISITAS) para la seccion "Destacados" del catalogo publico. Solo
   incluye productos con stock disponible (los mismos que ya se pueden
   ver/comprar en el catalogo). Sin login. */
app.get('/catalogo-destacados', limiteLecturaPublica, async (req, res) => {
  try {
    const sheetsClient = google.sheets({ version: 'v4', auth });
    const TOP_N = 8;

    const [productos, consultasPorSku, visitasPorSku] = await Promise.all([
      construirCatalogoConStock(sheetsClient, { soloConStock: true }),
      getConsultasPorSkuGeneral(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_CONSULTAS),
      getVisitasPorSkuGeneral(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_VISITAS),
    ]);

    function topPorConteo(mapaConteo) {
      return productos
        .map((p) => ({ producto: p, conteo: mapaConteo[p.skuGeneral.toUpperCase()] || 0 }))
        .filter((item) => item.conteo > 0)
        .sort((a, b) => b.conteo - a.conteo)
        .slice(0, TOP_N)
        .map((item) => ({ ...item.producto, conteo: item.conteo }));
    }

    res.json({
      masConsultados: topPorConteo(consultasPorSku),
      masVisitados: topPorConteo(visitasPorSku),
    });
  } catch (err) {
    console.error('Error armando destacados:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los destacados.' });
  }
});

/* Tabla de costos estimados de envío a domicilio por provincia, para
   mostrar una estimación en el checkout público. Es una tabla fija
   cargada a mano (no una cotización real por API todavía). */
app.get('/tarifas-envio', limiteLecturaPublica, async (req, res) => {
  try {
    const sheetsClient = google.sheets({ version: 'v4', auth });
    const tarifas = await getTarifasEnvio(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_ENVIOS);
    res.json({ tarifas });
  } catch (err) {
    console.error('Error leyendo tarifas de envío:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las tarifas de envío.' });
  }
});

/* Catalogo COMPLETO para el panel admin: mismo shape que el público,
   pero incluye los productos sin stock (con su cantidad real) para que
   se pueda ver y auditar todo el catálogo desde "Editar catálogo".
   Requiere admin nivel 2. */
app.get('/admin/catalogo-completo', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const productos = await construirCatalogoConStock(sheetsClient, { soloConStock: false, incluirProveedor: true });
    res.json({ productos });
  } catch (err) {
    console.error('Error leyendo el catálogo completo (admin):', err.message);
    res.status(500).json({ error: 'No se pudo cargar el catálogo.' });
  }
});

/* Nombres de categorias tal como estan en el catalogo (union de lo que
   aparece en STOCK/Productos), junto con el nombre visible para
   clientes ya cargado en Config (si hay). Se usa para armar la lista de
   "Editar catálogo" > nombres de categorías. Requiere admin nivel 2. */
app.get('/admin/categorias-nombres', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const [productos, nombresVisibles] = await Promise.all([
      construirCatalogoConStock(sheetsClient, { soloConStock: false }),
      getNombresVisiblesCategorias(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CONFIG),
    ]);

    const categoriasUnicas = new Map();
    productos.forEach((p) => {
      if (!p.categoria) return;
      const clave = p.categoria.toUpperCase();
      if (!categoriasUnicas.has(clave)) {
        categoriasUnicas.set(clave, {
          categoria: p.categoria,
          nombreVisible: nombresVisibles[clave] || '',
        });
      }
    });

    res.json({ categorias: Array.from(categoriasUnicas.values()).sort((a, b) => a.categoria.localeCompare(b.categoria)) });
  } catch (err) {
    console.error('Error leyendo nombres de categorías:', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las categorías.' });
  }
});

/* Actualiza el nombre que ven los clientes para una categoría (hoja
   Config, columna G). No cambia la categoría interna (la que usan los
   SKU y los filtros del admin), solo cómo se muestra en el catálogo
   público. Requiere admin nivel 2. */
app.post('/admin/categoria-nombre-visible', limiteAdmin, async (req, res) => {
  try {
    const { categoria, nombreVisible } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!categoria || !String(categoria).trim()) {
      return res.status(400).json({ error: 'Falta la categoría a renombrar.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    await actualizarNombreVisibleCategoria(
      sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CONFIG,
      String(categoria).trim(), sanitizarTexto(nombreVisible || '', 80),
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando nombre visible de categoría:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el nombre.' });
  }
});

/* Misma tabla de tarifas de envío que /tarifas-envio, pero para el panel
   admin (requiere nivel 2), usada en "Editar catálogo" para cargarlas. */
app.get('/admin/tarifas-envio', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const tarifas = await getTarifasEnvio(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_ENVIOS);
    res.json({ tarifas });
  } catch (err) {
    console.error('Error leyendo tarifas de envío (admin):', err.message);
    res.status(500).json({ error: 'No se pudieron cargar las tarifas.' });
  }
});

/* Actualiza el costo estimado de envío a domicilio de una provincia
   (hoja Envios). Requiere admin nivel 2. */
app.post('/admin/tarifa-envio', limiteAdmin, async (req, res) => {
  try {
    const { provincia, costo } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!provincia || !String(provincia).trim()) {
      return res.status(400).json({ error: 'Falta la provincia.' });
    }
    const costoNumerico = enteroEnRango(costo, 0, 10000000);
    if (costoNumerico === null) {
      return res.status(400).json({ error: 'El costo tiene que ser un número válido.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    await actualizarTarifaEnvio(
      sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_ENVIOS,
      String(provincia).trim(), costoNumerico,
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando tarifa de envío:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la tarifa.' });
  }
});

/* Actualiza el precio de un producto existente por SKU general, sin
   pasar por "Generar unidades" (no genera stock nuevo). Se usa desde
   "Catálogo completo" en la pestaña Catálogo del admin, para poder
   corregir precios de productos con o sin stock. Requiere admin nivel 2. */
app.post('/admin/producto-precio', limiteAdmin, async (req, res) => {
  try {
    const { skuGeneral, precio } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU general del producto.' });
    }
    const precioNum = Number(precio);
    if (!Number.isFinite(precioNum) || precioNum < 0) {
      return res.status(400).json({ error: 'El precio tiene que ser un número mayor o igual a 0.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const encontrado = await actualizarPrecioProducto(
      sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS,
      String(skuGeneral).trim(), precioNum,
    );
    if (!encontrado) {
      return res.status(404).json({ error: 'No se encontró ese producto en el catálogo.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando el precio del producto:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el precio.' });
  }
});

/* Actualiza el proveedor (dato interno) de un producto existente por SKU
   general, desde "Catálogo completo". Requiere admin nivel 2. */
app.post('/admin/producto-proveedor', limiteAdmin, async (req, res) => {
  try {
    const { skuGeneral, proveedor } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU general del producto.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const encontrado = await actualizarProveedorProducto(
      sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS,
      String(skuGeneral).trim(), sanitizarTexto(proveedor || '', 120),
    );
    if (!encontrado) {
      return res.status(404).json({ error: 'No se encontró ese producto en el catálogo.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando el proveedor del producto:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el proveedor.' });
  }
});

/* Borra un producto POR COMPLETO: su fila en Productos, su(s) fila(s)
   de STOCK, y cualquier asociación de código de barras que apunte a él
   — pensado para arreglar un producto que se cargó mal (duplicado,
   SKU equivocado, etc), no para "descatalogar" algo que ya se vendió.
   Deliberadamente NO borra VENTAS/HISTORICO_SKU/PEDIDOS (esos quedan
   como registro histórico). Requiere admin nivel 2 — es destructivo e
   irreversible. */
app.post('/admin/borrar-producto', limiteAdmin, async (req, res) => {
  try {
    const { skuGeneral } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU general del producto.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const resultado = await eliminarProductoCompleto(sheetsClient, {
      spreadsheetIdProductos: config.SHEET_ID_PRODUCTOS,
      spreadsheetIdVentas: config.SHEET_ID_VENTAS,
      hojaProductos: config.HOJA_PRODUCTOS,
      hojaStock: config.HOJA_STOCK,
      hojaCodigosBarra: config.HOJA_CODIGOS_BARRA,
    }, String(skuGeneral).trim());

    if (resultado.borradosProductos === 0) {
      return res.status(404).json({ error: 'No se encontró ese producto en el catálogo.' });
    }

    res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('Error borrando el producto:', err.message);
    res.status(500).json({ error: 'No se pudo borrar el producto.' });
  }
});

/* Config publica minima que necesita el frontend (nada sensible): el
   numero de WhatsApp para el boton flotante del catalogo, y el ID de
   cliente de Google OAuth (es publico por diseño, lo pide el botón
   "Iniciar sesión con Google" del panel admin). */
app.get('/config-publico', limiteLecturaPublica, (req, res) => {
  res.json({
    whatsappNumero: config.WHATSAPP_NUMERO_CONTACTO || '',
    transferencia: {
      alias: config.TRANSFERENCIA_ALIAS || '',
      titular: config.TRANSFERENCIA_TITULAR || '',
      cbu: config.TRANSFERENCIA_CBU || '',
      banco: config.TRANSFERENCIA_BANCO || '',
    },
    googleClientId: config.GOOGLE_OAUTH_CLIENT_ID || '',
  });
});

/* Chat embebido en la web: reutiliza EXACTAMENTE la misma logica del
   chatbot de WhatsApp (generarRespuesta), asi las dos vias de contacto
   responden igual (palabra clave + Claude si esta configurado), sin
   necesidad de tener WhatsApp instalado. */
app.post('/chat-web', limiteEscrituraPublica, async (req, res) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje || !String(mensaje).trim()) {
      return res.status(400).json({ error: 'Mensaje vacío.' });
    }
    // Tope de largo: sin esto, alguien podría mandar un mensaje enorme y
    // hacer que cada request le cueste mucho más caro a la llamada de la
    // API de Claude (si está configurada). Un mensaje de chat real nunca
    // necesita más que esto.
    const mensajeLimpio = String(mensaje).trim().slice(0, 1000);
    const sheetsClient = google.sheets({ version: 'v4', auth });
    const respuesta = await whatsapp.generarRespuesta(sheetsClient, mensajeLimpio, '(chat web)');
    res.json({ respuesta });
  } catch (err) {
    console.error('Error en el chat web:', err.message);
    res.status(500).json({ error: 'No se pudo procesar el mensaje.' });
  }
});

/* Devuelve un resumen de las unidades generadas desde ESTA app (hoja
   IMPRIMIR APP), agrupado por producto: cuantas unidades se generaron de
   cada uno. Se usa para mostrar el contador/lista de productos nuevos en
   el panel de "Generar unidades". */
app.get('/admin/imprimir-app-resumen', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;


    const sheetsClient = google.sheets({ version: 'v4', auth });
    const filas = await getFilasImprimir(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_IMPRIMIR_APP);

    const conteoPorProducto = {};
    filas.forEach((fila) => {
      const clave = fila.producto || '(sin nombre)';
      conteoPorProducto[clave] = (conteoPorProducto[clave] || 0) + 1;
    });

    const productos = Object.entries(conteoPorProducto)
      .map(([producto, cantidad]) => ({ producto, cantidad }))
      .sort((a, b) => a.producto.localeCompare(b.producto));

    res.json({
      productos,
      totalProductos: productos.length,
      totalUnidades: filas.length,
    });
  } catch (err) {
    console.error('Error leyendo el resumen de IMPRIMIR APP:', err.message);
    res.status(500).json({ error: 'No se pudo leer el resumen de unidades generadas.' });
  }
});

/* Genera el PDF de etiquetas QR/codigo de barras a partir de la hoja
   IMPRIMIR (de la planilla de PRODUCTOS) y lo manda como descarga directa. */
app.get('/admin/etiquetas-qr', limiteAdmin, async (req, res) => {
  try {
    const { tipo } = req.query;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    const tipoElegido = tipo === 'barras' ? 'barras' : 'qr';

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const filasSinTipo = await getFilasImprimir(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_IMPRIMIR);

    if (filasSinTipo.length === 0) {
      return res.status(404).send('No hay filas cargadas todavia en la hoja IMPRIMIR.');
    }

    const filas = filasSinTipo.map((fila) => ({ ...fila, tipo: tipoElegido }));

    const pdfBuffer = await generarPdfEtiquetas(filas, {
      anchoMM: 480,
      altoMM: 320,
      margenMM: 10,
      qrMM: 10,
      barrasAnchoMM: 40,
      barrasAltoMM: 15,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Etiquetas_QR.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generando el PDF de etiquetas:', err.message);
    res.status(500).send('No se pudo generar el PDF. Revisá los logs del servidor.');
  }
});

/* Igual que /admin/etiquetas-qr, pero usa la hoja IMPRIMIR APP: solo
   contiene unidades generadas desde ESTA app web (ver generarUnidades),
   separado de lo que genera el script del lado de Google Sheets. */
app.get('/admin/etiquetas-qr-app', limiteAdmin, async (req, res) => {
  try {
    const { tipo } = req.query;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    const tipoElegido = tipo === 'barras' ? 'barras' : 'qr';

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const filasSinTipo = await getFilasImprimir(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_IMPRIMIR_APP);

    if (filasSinTipo.length === 0) {
      return res.status(404).send('Todavía no generaste ninguna unidad desde la app (hoja IMPRIMIR APP vacía).');
    }

    const filas = filasSinTipo.map((fila) => ({ ...fila, tipo: tipoElegido }));

    const pdfBuffer = await generarPdfEtiquetas(filas, {
      anchoMM: 480,
      altoMM: 320,
      margenMM: 10,
      qrMM: 10,
      barrasAnchoMM: 40,
      barrasAltoMM: 15,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Etiquetas_QR_App.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generando el PDF de etiquetas (app):', err.message);
    res.status(500).send('No se pudo generar el PDF. Revisá los logs del servidor.');
  }
});

/* ============================================================
 *  SECCION ADMIN 3: FOTOS DE PRODUCTOS
 * ============================================================
 * Las fotos se guardan en disco (public/uploads/productos) y la URL
 * relativa se anota en la hoja Productos (columna Foto). OJO: en hostings
 * con disco efímero (ej. Render free) los archivos subidos se pierden en
 * cada redeploy — para algo permanente conviene un servicio externo tipo
 * Cloudinary o un disco persistente (ver README).
 * ============================================================ */

const CARPETA_UPLOADS = path.join(__dirname, 'public', 'uploads', 'productos');
fs.mkdirSync(CARPETA_UPLOADS, { recursive: true });

const storageFotos = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CARPETA_UPLOADS),
  filename: (req, file, cb) => {
    const skuGeneral = (req.body.skuGeneral || 'producto').replace(/[^a-zA-Z0-9-]/g, '_');
    const extension = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `${skuGeneral}-${Date.now()}${extension}`);
  },
});

const uploadFoto = multer({
  storage: storageFotos,
  limits: { fileSize: config.FOTO_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(file.mimetype)) {
      return cb(new Error('Formato de imagen no soportado. Usá JPG, PNG o WEBP.'));
    }
    cb(null, true);
  },
});

app.post('/admin/producto/foto', limiteAdmin, (req, res) => {
  uploadFoto.single('foto')(req, res, async (errorSubida) => {
    try {
      const { skuGeneral } = req.body;
      const sesion = requiereNivel2(req, res);
      if (!sesion) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return;
      }
      if (errorSubida) {
        return res.status(400).json({ error: errorSubida.message || 'No se pudo subir la imagen.' });
      }
      if (!skuGeneral || !String(skuGeneral).trim()) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Falta el SKU general del producto.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
      }

      // Reescribimos la imagen a WEBP en dos tamaños (grande + miniatura)
      // y nos quedamos con el nombre del archivo grande, que es el que va
      // a la hoja Productos. Ver imagenes.js.
      const nombreFinal = await imagenes.optimizarFotoSubida(req.file.path);
      const fotoUrl = `/uploads/productos/${nombreFinal}`;

      const sheetsClient = google.sheets({ version: 'v4', auth });
      const resultado = await agregarFotoProducto(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS, String(skuGeneral).trim(), fotoUrl);

      if (!resultado.encontrado) {
        imagenes.borrarFotoYMiniatura(CARPETA_UPLOADS, nombreFinal);
        return res.status(404).json({ error: `No se encontró el producto con SKU general "${skuGeneral}".` });
      }

      if (resultado.limiteAlcanzado) {
        imagenes.borrarFotoYMiniatura(CARPETA_UPLOADS, nombreFinal);
        return res.status(400).json({ error: 'Este producto ya tiene el máximo de 4 fotos. Borrá una antes de subir otra.' });
      }

      res.json({ ok: true, foto: fotoUrl, fotos: resultado.fotos });
    } catch (err) {
      console.error('Error subiendo la foto del producto:', err.message);
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: 'No se pudo guardar la foto.' });
    }
  });
});

/* ------------------------------------------------------------
 * RECONOCER PRODUCTO POR FOTO (comparación simple imagen-contra-imagen,
 * ver imagenes.js). Arma una vez la "huella" de cada foto ya cargada en
 * el catálogo y la cachea unos minutos, para no recalcularla en cada
 * escaneo — se recalcula sola cuando vence el cache.
 * ------------------------------------------------------------ */
const TTL_INDICE_HASHES_MS = 5 * 60 * 1000;
let indiceHashesCache = { items: [], vence: 0 };

async function obtenerIndiceHashesFotos(sheetsClient) {
  if (Date.now() < indiceHashesCache.vence) return indiceHashesCache.items;

  const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);
  const items = [];

  for (const p of catalogo) {
    const fotos = (p.fotos && p.fotos.length) ? p.fotos : (p.foto ? [p.foto] : []);
    for (const fotoUrl of fotos) {
      // Solo podemos comparar contra fotos que están guardadas en este
      // servidor (no una URL externa que no tenemos en disco).
      if (!fotoUrl || !fotoUrl.startsWith('/uploads/productos/')) continue;
      const rutaLocal = path.join(CARPETA_UPLOADS, path.basename(fotoUrl));
      if (!fs.existsSync(rutaLocal)) continue;

      const hash = await imagenes.calcularHashImagen(rutaLocal);
      if (!hash) continue;
      items.push({
        skuGeneral: p.skuGeneral, nombre: p.producto, categoria: p.categoria,
        precio: p.precio, foto: fotoUrl, hash,
      });
    }
  }

  indiceHashesCache = { items, vence: Date.now() + TTL_INDICE_HASHES_MS };
  return items;
}

const uploadFotoTemporal = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.FOTO_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!tiposPermitidos.includes(file.mimetype)) {
      return cb(new Error('Formato de imagen no soportado. Usá JPG, PNG o WEBP.'));
    }
    cb(null, true);
  },
});

/* Compara la foto que manda el celular contra las fotos YA CARGADAS de
   cada producto (solo esas — si un producto no tiene foto, nunca puede
   salir como resultado) y devuelve los mejores candidatos, cada uno
   con el SKU completo de una unidad sin vender ya lista para el modal
   de "vender" (mismo flujo que escanear un QR). No hace falta nivel 2:
   esto es parte del flujo de venta, igual que escanear. */
app.post('/admin/reconocer-producto', limiteAdmin, (req, res) => {
  uploadFotoTemporal.single('foto')(req, res, async (errorSubida) => {
    try {
      const sesion = requiereSesion(req, res);
      if (!sesion) return;
      if (errorSubida) {
        return res.status(400).json({ error: errorSubida.message || 'No se pudo procesar la imagen.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
      }

      const sheetsClient = google.sheets({ version: 'v4', auth });
      const indice = await obtenerIndiceHashesFotos(sheetsClient);

      if (indice.length === 0) {
        return res.json({ candidatos: [], aviso: 'Todavía no hay ningún producto con foto cargada para comparar.' });
      }

      const hashCapturado = await imagenes.calcularHashImagen(req.file.buffer);
      if (!hashCapturado) {
        return res.status(500).json({ error: 'No se pudo procesar la foto sacada.' });
      }

      // Nos quedamos con la mejor foto por SKU general (si un producto
      // tiene varias, no lo queremos repetido en los resultados), y
      // ordenamos de más parecida a menos.
      const mejorPorSku = new Map();
      for (const item of indice) {
        const distancia = imagenes.distanciaHamming(hashCapturado, item.hash);
        const actual = mejorPorSku.get(item.skuGeneral);
        if (!actual || distancia < actual.distancia) {
          mejorPorSku.set(item.skuGeneral, { ...item, distancia });
        }
      }

      const ordenados = Array.from(mejorPorSku.values()).sort((a, b) => a.distancia - b.distancia);

      // De 64 bits totales, mas de 28 distintos ya es una foto bastante
      // distinta — no tiene sentido ofrecerla como candidato.
      const UMBRAL_MAXIMO = 28;
      const mejores = ordenados.filter((c) => c.distancia <= UMBRAL_MAXIMO).slice(0, 3);

      // Para los candidatos que vamos a mostrar, resolvemos ya mismo una
      // unidad sin vender de cada uno (mismo mecanismo que el código de
      // barras externo), así tocar "Vender" abre directo el modal normal.
      const candidatos = await Promise.all(mejores.map(async (c) => {
        const skuCompletoDisponible = await buscarSkuCompletoDisponible(
          sheetsClient, config.SHEET_ID_PRODUCTOS, config.SHEET_ID_VENTAS, c.skuGeneral,
        );
        return {
          skuGeneral: c.skuGeneral,
          nombre: c.nombre,
          categoria: c.categoria,
          precio: c.precio,
          foto: c.foto,
          distancia: c.distancia,
          skuCompletoDisponible,
        };
      }));

      res.json({ candidatos });
    } catch (err) {
      console.error('Error reconociendo el producto por foto:', err.message);
      res.status(500).json({ error: 'No se pudo comparar la foto.' });
    }
  });
});

/* Saca una foto puntual (por indice, 0 a 3) de la galeria de un producto.
   Si la foto era un archivo subido a este servidor (/uploads/productos/...),
   tambien lo borra del disco. Requiere admin. */
app.post('/admin/producto/foto/eliminar', limiteAdmin, async (req, res) => {
  try {
    const { skuGeneral, indice } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU general del producto.' });
    }
    const indiceNumerico = Number(indice);
    if (Number.isNaN(indiceNumerico) || indiceNumerico < 0) {
      return res.status(400).json({ error: 'Índice de foto inválido.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const resultado = await eliminarFotoProducto(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS, String(skuGeneral).trim(), indiceNumerico);

    if (!resultado.encontrado) {
      return res.status(404).json({ error: `No se encontró el producto con SKU general "${skuGeneral}".` });
    }

    if (resultado.fotoEliminada && resultado.fotoEliminada.startsWith('/uploads/productos/')) {
      // Borra la grande y su miniatura; si alguna no existe, no pasa nada.
      imagenes.borrarFotoYMiniatura(CARPETA_UPLOADS, path.basename(resultado.fotoEliminada));
    }

    res.json({ ok: true, fotos: resultado.fotos });
  } catch (err) {
    console.error('Error borrando la foto del producto:', err.message);
    res.status(500).json({ error: 'No se pudo borrar la foto.' });
  }
});

/* Genera las miniaturas que falten para las fotos subidas ANTES de que
   existiera la optimizacion automatica. Se corre una sola vez desde el
   panel admin; despues cada foto nueva ya sale optimizada sola. No toca
   las fotos grandes ni sus URLs, asi que es seguro repetirlo. */
app.post('/admin/fotos/optimizar', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;


    const resumen = await imagenes.generarMiniaturasFaltantes(CARPETA_UPLOADS);

    if (!resumen.sharpDisponible) {
      return res.status(500).json({ error: 'El servidor no tiene disponible el optimizador de imágenes (sharp). Revisá los logs del deploy.' });
    }

    res.json({ ok: true, ...resumen });
  } catch (err) {
    console.error('Error optimizando las fotos existentes:', err.message);
    res.status(500).json({ error: 'No se pudieron optimizar las fotos.' });
  }
});

/* Actualiza la descripcion (texto libre) de un producto, mostrada en la
   pagina de detalle del catalogo publico. Requiere admin. */
app.post('/admin/producto/descripcion', limiteAdmin, async (req, res) => {
  try {
    const { skuGeneral, descripcion } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU general del producto.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const descripcionLimpia = sanitizarTexto(descripcion, 2000);
    const encontrado = await actualizarDescripcionProducto(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS, String(skuGeneral).trim(), descripcionLimpia);

    if (!encontrado) {
      return res.status(404).json({ error: `No se encontró el producto con SKU general "${skuGeneral}".` });
    }

    res.json({ ok: true, descripcion: descripcionLimpia });
  } catch (err) {
    console.error('Error actualizando la descripción del producto:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la descripción.' });
  }
});

/* ============================================================
 *  SECCION PAGOS: PAYWAY (checkout hospedado) + TRANSFERENCIA BANCARIA
 * ============================================================
 * El catalogo publico ofrece DOS metodos de pago (metodoPago en el
 * body): 'payway' o 'transferencia'. En ambos casos primero creamos el
 * Pedido en la hoja PEDIDOS con estado "Pendiente de pago".
 *
 * - payway: creamos un link de pago hospedado en Payway (el comprador
 *   carga la tarjeta en una pagina de Payway, nunca en la nuestra) y
 *   redirigimos ahi. El identificador que devuelve Payway se guarda
 *   como pagoExternoId ANTES de que el comprador pague (es la unica
 *   forma de rastrear el pedido despues). Cuando el pago se resuelve,
 *   Payway llama a /webhook/payway -> buscamos el pedido por ese
 *   pagoExternoId y actualizamos el estado. Como respaldo (por si el
 *   webhook no esta bien configurado todavia, o tarda),
 *   /verificar-pago-payway/:pedidoId permite reconciliar a demanda —
 *   la pagina de exito la llama automaticamente al volver de Payway.
 *
 * - transferencia: no hay nada que crear del lado del proveedor de
 *   pago. Le mostramos al comprador el alias/CBU del local para que
 *   transfiera por su cuenta, con el numero de pedido como referencia.
 *   El pedido queda "Pendiente de pago" hasta que un admin confirma a
 *   mano (desde el panel, igual que cualquier otro pedido) que la plata
 *   llego.
 * ============================================================ */

/* ------------------------------------------------------------
 * RESERVA DE STOCK DE PEDIDOS ONLINE
 * ------------------------------------------------------------
 * Un pedido web se hace contra el SKU general (el comprador elige un
 * producto, no un ejemplar puntual), asi que no podemos descontar una
 * unidad fisica concreta hasta que alguien la agarre de la estanteria.
 * Pero si esperamos hasta ese momento para tocar STOCK, el catalogo
 * sigue ofreciendo online algo que ya esta vendido.
 *
 * Solucion: cuando el pedido pasa a un estado "comprometido" (pago
 * confirmado en adelante) descontamos su cantidad de STOCK y marcamos
 * el pedido con stockReservado = "SI". Si despues se cancela o se
 * rechaza el pago, devolvemos esas unidades. Y cuando finalmente se
 * escanea el ejemplar que sale del local, la fila de VENTAS lleva el
 * numero de pedido en la columna G para que el procesador NO vuelva a
 * descontar (ver procesarVentasNuevas en googleSheets.js).
 * ------------------------------------------------------------ */

function estadoReservaStock(estado) {
  return config.ESTADOS_PEDIDO_CON_STOCK_RESERVADO.includes(String(estado || '').trim());
}

function tieneStockReservado(pedido) {
  return String(pedido && pedido.stockReservado ? pedido.stockReservado : '').trim().toUpperCase() === 'SI';
}

/**
 * Compara el estado que tenia el pedido contra el que va a tener y
 * ajusta STOCK si hace falta. Devuelve { campos, aviso }: `campos` son
 * los campos extra a guardar en la fila del pedido (stockReservado), y
 * `aviso` un texto para mostrarle al admin si algo quedo raro.
 */
async function sincronizarStockPedido(sheetsClient, pedido, nuevoEstado) {
  const debeReservar = estadoReservaStock(nuevoEstado);
  const yaReservado = tieneStockReservado(pedido);

  if (debeReservar === yaReservado) return { campos: {}, aviso: null };

  const cantidad = Number(pedido.cantidad) || 1;
  const skuGeneral = String(pedido.skuGeneral || '').trim();
  if (!skuGeneral) {
    return { campos: {}, aviso: 'El pedido no tiene SKU general, no se pudo tocar el stock.' };
  }

  const delta = debeReservar ? -cantidad : cantidad;
  await ajustarStockCantidad(
    sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_STOCK,
    skuGeneral, delta, pedido.producto || '',
  );

  if (debeReservar) {
    return {
      campos: { stockReservado: 'SI' },
      aviso: `Se reservaron ${cantidad} unidad(es) de ${skuGeneral}: ya no figuran disponibles en el catálogo.`,
    };
  }

  // Se liberan las unidades. Si el ejemplar ya se habia escaneado como
  // despachado, ese SKU de unidad quedo marcado "Vendido" en VENTAS y hay
  // que revisarlo a mano (el sistema no puede saber si el ejemplar volvio).
  const yaDespachado = String(pedido.skuUnidad || '').trim() !== '';
  return {
    campos: { stockReservado: '' },
    aviso: yaDespachado
      ? `Se devolvieron ${cantidad} unidad(es) de ${skuGeneral} al stock. OJO: este pedido ya tenía la unidad ${pedido.skuUnidad} escaneada como despachada — esa fila sigue marcada como vendida en VENTAS, revisala a mano si el ejemplar volvió.`
      : `Se devolvieron ${cantidad} unidad(es) de ${skuGeneral} al stock.`,
  };
}

app.post('/crear-pago', limiteEscrituraPublica, async (req, res) => {
  try {
    const {
      skuGeneral, cantidad, nombre, email, telefono,
      direccion, ciudad, provincia, codigoPostal, metodoEnvio, notas,
      metodoPago,
    } = req.body;

    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el producto a comprar.' });
    }
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'Falta el nombre del comprador.' });
    }
    if (!email || !esEmailValido(email)) {
      return res.status(400).json({ error: 'Ingresá un email válido (lo necesitamos para mandarte la confirmación del pedido).' });
    }
    // Tope razonable: evita pedidos absurdos por error de tipeo o por un
    // script automatizado, sin restringir compras normales de verdad.
    let cantidadNum = 1;
    if (cantidad !== undefined && cantidad !== null && cantidad !== '') {
      cantidadNum = enteroEnRango(cantidad, 1, 100);
      if (cantidadNum === null) {
        return res.status(400).json({ error: 'La cantidad tiene que ser un número entero entre 1 y 100.' });
      }
    }
    if (metodoEnvio === 'Envio a domicilio' && (!direccion || !ciudad)) {
      return res.status(400).json({ error: 'Para envio a domicilio hace falta al menos direccion y ciudad.' });
    }
    if (metodoPago !== 'payway' && metodoPago !== 'transferencia') {
      return res.status(400).json({ error: 'Elegi un metodo de pago valido (Payway o transferencia).' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const catalogo = await construirCatalogoConStock(sheetsClient, { soloConStock: false });
    const producto = catalogo.find((p) => p.skuGeneral.toLowerCase() === String(skuGeneral).trim().toLowerCase());

    if (!producto) {
      return res.status(404).json({ error: 'No se encontro el producto.' });
    }
    const precioNum = Number(producto.precio);
    if (!precioNum || precioNum <= 0) {
      return res.status(400).json({ error: 'Este producto todavia no tiene precio cargado, no se puede comprar online.' });
    }
    // El stock recien se descuenta cuando se confirma el pago (mas abajo
    // se anota vacio en stockReservado), pero igual hay que validar ACA
    // que haya unidades suficientes: sin esto, cualquiera podia pedir
    // una cantidad mayor al stock real (ej. comprar 7 con 1 en stock).
    if (cantidadNum > producto.cantidad) {
      return res.status(400).json({
        error: producto.cantidad > 0
          ? `Solo quedan ${producto.cantidad} unidad${producto.cantidad === 1 ? '' : 'es'} disponibles de este producto.`
          : 'Este producto ya no tiene stock disponible.',
      });
    }

    const pedidoId = generarPedidoId();
    const { fecha, hora } = fechaYHoraActual();
    const total = precioNum * cantidadNum;

    await crearPedido(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, {
      pedidoId,
      fecha: `${fecha} ${hora}`,
      skuGeneral: producto.skuGeneral,
      producto: producto.nombre,
      precio: precioNum,
      cantidad: cantidadNum,
      total,
      nombreCliente: sanitizarTexto(nombre, 150),
      emailCliente: sanitizarTexto(email, 254),
      telefonoCliente: sanitizarTelefono(telefono),
      direccion: sanitizarTexto(direccion, 250),
      ciudad: sanitizarTexto(ciudad, 100),
      provincia: sanitizarTexto(provincia, 100),
      codigoPostal: sanitizarCodigoPostal(codigoPostal),
      metodoEnvio: metodoEnvio || 'Retiro en el local',
      estado: 'Pendiente de pago',
      transportista: '',
      numeroSeguimiento: '',
      pagoExternoId: '',
      notas: sanitizarTexto(notas, 500),
      metodoPago: metodoPago === 'payway' ? 'Payway' : 'Transferencia',
      // El stock se reserva recien cuando el pago se confirma, no al
      // iniciar el checkout (si no, un carrito abandonado congelaria
      // unidades para siempre).
      stockReservado: '',
      skuUnidad: '',
    });

    if (metodoPago === 'payway') {
      const link = await payway.crearLinkDePago({
        pedidoId,
        titulo: producto.nombre,
        precioUnitario: precioNum,
        cantidad: cantidadNum,
      });

      // Guardamos el id que nos dio Payway ANTES de mandar al comprador a
      // pagar: es la unica forma de encontrar despues este pedido cuando
      // llegue el webhook (que no conoce nuestro pedidoId).
      await actualizarPedido(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, pedidoId, { pagoExternoId: link.id });

      return res.json({ ok: true, pedidoId, redirectUrl: link.url });
    }

    // metodoPago === 'transferencia': no hay redirect, el front muestra
    // los datos para transferir. Ademas mandamos un mail con esos mismos
    // datos + el numero de pedido, para que el comprador lo tenga a mano
    // aunque cierre la pestaña. No esperamos (await) el envio ni
    // interrumpimos la respuesta si falla — el pedido ya esta creado y
    // el front igual muestra los datos en pantalla.
    const datosTransferencia = {
      alias: config.TRANSFERENCIA_ALIAS,
      titular: config.TRANSFERENCIA_TITULAR,
      cbu: config.TRANSFERENCIA_CBU,
      banco: config.TRANSFERENCIA_BANCO,
      monto: total,
    };

    emailService.enviarEmailTransferencia({
      destinatario: email,
      nombreCliente: nombre,
      pedidoId,
      producto: producto.nombre,
      cantidad: cantidadNum,
      monto: total,
      transferencia: datosTransferencia,
    }).catch((err) => console.error('Error en el envío de mail (no bloquea el pedido):', err.message));

    res.json({ ok: true, pedidoId, transferencia: datosTransferencia });
  } catch (err) {
    console.error('Error creando el pago:', err.message);
    res.status(500).json({ error: err.message || 'No se pudo iniciar el pago.' });
  }
});

/* Crea un pedido a partir de un carrito con varios productos a la vez.
   Genera UNA fila en PEDIDOS por producto (mismo esquema que /crear-pago,
   una fila = un producto = un pedidoId propio), pero valida TODOS los
   items antes de crear ninguno (si uno falla, no se crea nada) y las
   agrupa con una referencia de carrito compartida en las notas, para
   que el admin las vea relacionadas. El monto a transferir es la suma
   de todos los items. Por ahora solo admite transferencia (Payway con
   un solo link de pago no tiene forma limpia de cobrar varios pedidos
   a la vez, y todavía ni está habilitado). */
app.post('/crear-pago-carrito', limiteEscrituraPublica, async (req, res) => {
  try {
    const {
      items, nombre, email, telefono,
      direccion, ciudad, provincia, codigoPostal, metodoEnvio, notas,
      metodoPago,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío.' });
    }
    if (items.length > 20) {
      return res.status(400).json({ error: 'Demasiados productos distintos en un mismo pedido (máximo 20).' });
    }
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'Falta el nombre del comprador.' });
    }
    if (!email || !esEmailValido(email)) {
      return res.status(400).json({ error: 'Ingresá un email válido (lo necesitamos para mandarte la confirmación del pedido).' });
    }
    if (metodoEnvio === 'Envio a domicilio' && (!direccion || !ciudad)) {
      return res.status(400).json({ error: 'Para envio a domicilio hace falta al menos direccion y ciudad.' });
    }
    if (metodoPago !== 'transferencia') {
      return res.status(400).json({ error: 'Por ahora el carrito solo admite pago por transferencia.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const catalogo = await construirCatalogoConStock(sheetsClient, { soloConStock: false });

    const itemsValidados = [];
    for (const item of (items || [])) {
      const skuGeneral = item && item.skuGeneral ? String(item.skuGeneral).trim() : '';
      if (!skuGeneral) {
        return res.status(400).json({ error: 'Uno de los productos del carrito no tiene SKU.' });
      }

      const cantidadNum = enteroEnRango(item.cantidad, 1, 100);
      if (cantidadNum === null) {
        return res.status(400).json({ error: `Cantidad inválida para ${skuGeneral}.` });
      }

      const producto = catalogo.find((p) => p.skuGeneral.toLowerCase() === skuGeneral.toLowerCase());
      if (!producto) {
        return res.status(404).json({ error: `No se encontró el producto ${skuGeneral}.` });
      }

      const precioNum = Number(producto.precio);
      if (!precioNum || precioNum <= 0) {
        return res.status(400).json({ error: `"${producto.nombre}" todavía no tiene precio cargado, no se puede comprar online.` });
      }
      if (cantidadNum > producto.cantidad) {
        return res.status(400).json({
          error: producto.cantidad > 0
            ? `Solo quedan ${producto.cantidad} unidad${producto.cantidad === 1 ? '' : 'es'} de "${producto.nombre}".`
            : `"${producto.nombre}" ya no tiene stock disponible.`,
        });
      }

      itemsValidados.push({ producto, cantidad: cantidadNum, precio: precioNum });
    }

    const totalCarrito = itemsValidados.reduce((acc, it) => acc + it.precio * it.cantidad, 0);
    const grupoCarritoId = `CARR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const { fecha, hora } = fechaYHoraActual();
    const pedidoIds = [];

    for (let i = 0; i < itemsValidados.length; i++) {
      const it = itemsValidados[i];
      const pedidoId = generarPedidoId();
      pedidoIds.push(pedidoId);

      const notaCarrito = `Carrito ${grupoCarritoId} (${i + 1}/${itemsValidados.length})`;
      const notasCompletas = notas && String(notas).trim() ? `${String(notas).trim()} — ${notaCarrito}` : notaCarrito;

      await crearPedido(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, {
        pedidoId,
        fecha: `${fecha} ${hora}`,
        skuGeneral: it.producto.skuGeneral,
        producto: it.producto.nombre,
        precio: it.precio,
        cantidad: it.cantidad,
        total: it.precio * it.cantidad,
        nombreCliente: sanitizarTexto(nombre, 150),
        emailCliente: sanitizarTexto(email, 254),
        telefonoCliente: sanitizarTelefono(telefono),
        direccion: sanitizarTexto(direccion, 250),
        ciudad: sanitizarTexto(ciudad, 100),
        provincia: sanitizarTexto(provincia, 100),
        codigoPostal: sanitizarCodigoPostal(codigoPostal),
        metodoEnvio: metodoEnvio || 'Retiro en el local',
        estado: 'Pendiente de pago',
        transportista: '',
        numeroSeguimiento: '',
        pagoExternoId: '',
        notas: sanitizarTexto(notasCompletas, 500),
        metodoPago: 'Transferencia',
        stockReservado: '',
        skuUnidad: '',
      });
    }

    const datosTransferencia = {
      alias: config.TRANSFERENCIA_ALIAS,
      titular: config.TRANSFERENCIA_TITULAR,
      cbu: config.TRANSFERENCIA_CBU,
      banco: config.TRANSFERENCIA_BANCO,
      monto: totalCarrito,
    };

    emailService.enviarEmailTransferenciaCarrito({
      destinatario: email,
      nombreCliente: nombre,
      pedidoIds,
      items: itemsValidados.map((it) => ({ producto: it.producto.nombre, cantidad: it.cantidad })),
      monto: totalCarrito,
      transferencia: datosTransferencia,
    }).catch((err) => console.error('Error en el envío de mail de carrito (no bloquea el pedido):', err.message));

    res.json({ ok: true, pedidoIds, transferencia: datosTransferencia });
  } catch (err) {
    console.error('Error creando pedido de carrito:', err.message);
    res.status(500).json({ error: 'No se pudo procesar el pedido.' });
  }
});

/* Reconcilia un pedido contra el estado real del pago en Payway,
   buscandolo por pagoExternoId (no por pedidoId, porque el webhook y la
   pagina de exito solo tienen el id que asigno Payway). */
async function reconciliarPagoPayway(pagoExternoId) {
  const pago = await payway.consultarPago(pagoExternoId);
  if (!pago) return null;

  const nuevoEstado = payway.estadoPedidoSegunStatusPayway(pago.status);
  if (!nuevoEstado) return null; // pendiente/desconocido -> no tocamos nada

  const sheetsClient = google.sheets({ version: 'v4', auth });
  const { numeroFila, pedido } = await getPedidoPorPagoExternoId(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, pagoExternoId);
  if (!numeroFila) return null;

  const { campos } = await sincronizarStockPedido(sheetsClient, pedido, nuevoEstado);

  await actualizarPedido(
    sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, pedido.pedidoId,
    { estado: nuevoEstado, ...campos },
  );
  return { pedidoId: pedido.pedidoId, estado: nuevoEstado };
}

/* Notificacion asincronica de Payway (notifications_url). Siempre
   respondemos 200 para que Payway no reintente indefinidamente, incluso
   si algo interno falla (el error queda solo en los logs). El formato
   exacto del payload no esta 100% confirmado, asi que probamos varios
   nombres de campo posibles para el identificador del pago. */
app.post('/webhook/payway', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body || {};
    const pagoId = body.id || body.payment_id || req.query.id
      || (body.data && (body.data.id || body.data.payment_id));

    if (!pagoId) return;

    await reconciliarPagoPayway(String(pagoId));
  } catch (err) {
    console.error('Error procesando webhook de Payway:', err.message);
  }
});

/* Endpoint de respaldo: la pagina de exito la llama al cargar para
   reconciliar el estado del pedido al toque, sin depender unicamente
   del webhook (util tambien para probar en sandbox sin tener el webhook
   configurado todavia). */
app.get('/verificar-pago-payway/:pedidoId', async (req, res) => {
  try {
    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { pedido } = await getPedidoPorId(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, req.params.pedidoId);

    if (!pedido || !pedido.pagoExternoId) {
      return res.json({ ok: true, actualizado: false, estado: pedido ? pedido.estado : null });
    }

    const resultado = await reconciliarPagoPayway(pedido.pagoExternoId);
    res.json({ ok: true, actualizado: !!resultado, estado: resultado ? resultado.estado : pedido.estado });
  } catch (err) {
    console.error('Error verificando pago de Payway:', err.message);
    res.status(500).json({ error: err.message || 'No se pudo verificar el pago.' });
  }
});

app.get('/admin/pedidos', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereSesion(req, res);
    if (!sesion) return;


    const sheetsClient = google.sheets({ version: 'v4', auth });
    const pedidos = await getPedidos(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS);

    res.json({ pedidos });
  } catch (err) {
    console.error('Error leyendo los pedidos:', err.message);
    res.status(500).json({ error: 'No se pudieron leer los pedidos.' });
  }
});

/* Actualiza el estado de envio de un pedido (coordinar envio, marcar
   enviado con transportista + numero de seguimiento, entregado, etc). */
app.post('/admin/pedidos/actualizar', limiteAdmin, async (req, res) => {
  try {
    const { pedidoId, estado, transportista, numeroSeguimiento, notas } = req.body;
    const sesion = requiereSesion(req, res);
    if (!sesion) return;
    if (!pedidoId || !String(pedidoId).trim()) {
      return res.status(400).json({ error: 'Falta el número de pedido.' });
    }
    if (estado !== undefined && !config.ESTADOS_PEDIDO.includes(estado)) {
      return res.status(400).json({ error: 'Ese estado de pedido no es válido.' });
    }

    const camposActualizar = {};
    if (estado !== undefined) camposActualizar.estado = estado;
    if (transportista !== undefined) camposActualizar.transportista = sanitizarTexto(transportista, 100);
    if (numeroSeguimiento !== undefined) camposActualizar.numeroSeguimiento = sanitizarTexto(numeroSeguimiento, 100);
    if (notas !== undefined) camposActualizar.notas = sanitizarTexto(notas, 500);

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { pedido } = await getPedidoPorId(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, String(pedidoId).trim());
    if (!pedido) {
      return res.status(404).json({ error: 'No se encontró ese pedido.' });
    }

    // Si cambia el estado, puede haber que reservar o devolver stock.
    let aviso = null;
    if (estado !== undefined) {
      const resultado = await sincronizarStockPedido(sheetsClient, pedido, estado);
      Object.assign(camposActualizar, resultado.campos);
      aviso = resultado.aviso;
    }

    const encontrado = await actualizarPedido(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, String(pedidoId).trim(), camposActualizar);

    if (!encontrado) {
      return res.status(404).json({ error: 'No se encontró ese pedido.' });
    }

    res.json({
      ok: true,
      aviso,
      stockReservado: camposActualizar.stockReservado !== undefined
        ? camposActualizar.stockReservado
        : (pedido.stockReservado || ''),
    });
  } catch (err) {
    console.error('Error actualizando el pedido:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el pedido.' });
  }
});

/* Registra la unidad fisica concreta que sale del local para un pedido
   online: se escanea el QR del ejemplar (SKU completo con numero de
   serie) y esto (1) valida que el ejemplar sea del producto que se
   compró, (2) valida que no se haya vendido ya, (3) lo anota en VENTAS
   con el numero de pedido en la columna G — asi el procesador lo marca
   como vendido pero NO descuenta stock, porque ya se descontó al
   reservar — y (4) guarda el SKU de la unidad en la fila del pedido.

   Si el pedido todavia no tenia stock reservado (caso tipico: una
   transferencia que se despacha sin haber marcado antes "Pagado"), se
   reserva en este momento, para que la unidad no quede sin descontar. */
app.post('/admin/pedidos/registrar-unidad', limiteAdmin, async (req, res) => {
  try {
    const { pedidoId, sku } = req.body;
    const sesion = requiereSesion(req, res);
    if (!sesion) return;
    if (!pedidoId || !String(pedidoId).trim()) {
      return res.status(400).json({ error: 'Falta el número de pedido.' });
    }
    if (!sku || !String(sku).trim()) {
      return res.status(400).json({ error: 'Falta el SKU de la unidad.' });
    }

    const skuLimpio = String(sku).trim();
    const sheetsClient = google.sheets({ version: 'v4', auth });

    const { pedido } = await getPedidoPorId(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, String(pedidoId).trim());
    if (!pedido) {
      return res.status(404).json({ error: 'No se encontró ese pedido.' });
    }

    // 1) El ejemplar escaneado tiene que ser del producto comprado.
    const skuGeneralEscaneado = extraerSkuGeneral(skuLimpio).toUpperCase();
    const skuGeneralPedido = String(pedido.skuGeneral || '').trim().toUpperCase();
    if (skuGeneralEscaneado !== skuGeneralPedido) {
      return res.status(400).json({
        error: `Ese ejemplar es de otro producto: escaneaste ${skuGeneralEscaneado} y el pedido es de ${skuGeneralPedido} (${pedido.producto || ''}).`,
      });
    }

    // 2) Que no se haya vendido ya (ni en el local ni en otro pedido).
    const ventasResp = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID_VENTAS,
      range: `${config.HOJA_VENTAS}!A:G`,
    });
    const colsVentas = config.COLUMNAS_VENTAS;
    const filasVentas = ventasResp.data.values || [];
    const skuNormalizado = skuLimpio.toLowerCase();
    for (let i = 1; i < filasVentas.length; i++) {
      const filaSku = filasVentas[i][colsVentas.skuCompleto]
        ? String(filasVentas[i][colsVentas.skuCompleto]).trim().toLowerCase() : '';
      if (filaSku !== skuNormalizado) continue;
      const marca = filasVentas[i][colsVentas.marca] ? String(filasVentas[i][colsVentas.marca]).trim() : '';
      const pedidoDeLaFila = filasVentas[i][colsVentas.pedidoId] ? String(filasVentas[i][colsVentas.pedidoId]).trim() : '';
      if (marca.indexOf('Vendido') === 0 || pedidoDeLaFila) {
        return res.status(400).json({
          error: `Ese ejemplar (${skuLimpio}) ya figura vendido${pedidoDeLaFila ? ` en el pedido ${pedidoDeLaFila}` : ' en el local'}. Escaneá otro ejemplar del mismo producto.`,
        });
      }
    }

    // 3) Si el pedido no tenia stock reservado, lo reservamos ahora.
    const camposActualizar = {};
    let aviso = null;
    if (!tieneStockReservado(pedido)) {
      await ajustarStockCantidad(
        sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_STOCK,
        pedido.skuGeneral, -(Number(pedido.cantidad) || 1), pedido.producto || '',
      );
      camposActualizar.stockReservado = 'SI';
      aviso = 'Este pedido no tenía el stock reservado (nunca se marcó como pagado), así que se descontó ahora.';
    }

    // 4) Anotamos la salida en VENTAS con el numero de pedido (columna G)
    // y quien registro el despacho (columna H).
    const { fecha, hora } = fechaYHoraActual();
    await appendRow(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_VENTAS, [
      skuLimpio, fecha, hora, '', '', '', String(pedidoId).trim(), sesion.email,
    ]);

    // 5) Y lo dejamos asentado en la fila del pedido.
    const unidadesPrevias = String(pedido.skuUnidad || '').trim();
    camposActualizar.skuUnidad = unidadesPrevias ? `${unidadesPrevias} | ${skuLimpio}` : skuLimpio;

    await actualizarPedido(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, String(pedidoId).trim(), camposActualizar);

    res.json({ ok: true, skuUnidad: camposActualizar.skuUnidad, aviso });
  } catch (err) {
    console.error('Error registrando la unidad del pedido:', err.message);
    res.status(500).json({ error: 'No se pudo registrar la unidad.' });
  }
});

/* ============================================================
 *  SECCION ADMIN 4: USUARIOS DEL PANEL (solo nivel 2)
 * ============================================================
 * Alta, edición de nivel y baja de las cuentas de Google autorizadas a
 * entrar al panel admin. Todo esto es exclusivo de nivel 2 — un nivel 1
 * ni siquiera ve esta sección en la interfaz, y el servidor la rechaza
 * igual si alguien intentara llamarla directo.
 * ============================================================ */

app.get('/admin/usuarios', limiteAdmin, async (req, res) => {
  try {
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const usuarios = await getAdminUsers(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_ADMIN_USERS);

    res.json({ usuarios, emailPropio: sesion.email });
  } catch (err) {
    console.error('Error leyendo los usuarios del panel:', err.message);
    res.status(500).json({ error: 'No se pudieron leer los usuarios.' });
  }
});

/* Alta o edición de nivel de un usuario. Upsert por email: si ya existe,
   actualiza el nivel; si no, lo agrega. */
app.post('/admin/usuarios/crear', limiteAdmin, async (req, res) => {
  try {
    const { email, nivel } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    const emailLimpio = String(email || '').trim().toLowerCase();
    if (!emailLimpio || emailLimpio.indexOf('@') === -1) {
      return res.status(400).json({ error: 'Ingresá un email válido.' });
    }
    const nivelNum = Number(nivel);
    if (nivelNum !== 1 && nivelNum !== 2) {
      return res.status(400).json({ error: 'El nivel tiene que ser 1 o 2.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { fecha, hora } = fechaYHoraActual();
    const usuario = await crearOActualizarAdminUser(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_ADMIN_USERS, {
      email: emailLimpio,
      nivel: nivelNum,
      fecha: `${fecha} ${hora}`,
      agregadoPor: sesion.email,
    });

    res.json({ ok: true, usuario });
  } catch (err) {
    console.error('Error guardando el usuario:', err.message);
    res.status(500).json({ error: 'No se pudo guardar el usuario.' });
  }
});

/* Quita el acceso de un usuario. No se puede auto-eliminar (para no
   dejar la app sin ningún nivel 2 por accidente); si hace falta,
   primero hay que darle nivel 2 a otra cuenta. */
app.post('/admin/usuarios/eliminar', limiteAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    const sesion = requiereNivel2(req, res);
    if (!sesion) return;

    const emailLimpio = String(email || '').trim().toLowerCase();
    if (!emailLimpio) {
      return res.status(400).json({ error: 'Falta el email del usuario a quitar.' });
    }
    if (emailLimpio === sesion.email) {
      return res.status(400).json({ error: 'No podés quitarte el acceso a vos mismo. Pedile a otro nivel 2 que lo haga.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const encontrado = await eliminarAdminUser(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_ADMIN_USERS, emailLimpio);

    if (!encontrado) {
      return res.status(404).json({ error: 'No se encontró ese usuario.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error quitando el usuario:', err.message);
    res.status(500).json({ error: 'No se pudo quitar el usuario.' });
  }
});

/* ============================================================
 *  SECCION CHATBOT: WHATSAPP CLOUD API
 * ============================================================ */

// Verificacion del webhook (Meta hace un GET una sola vez, al configurarlo).
app.get('/webhook/whatsapp', (req, res) => {
  const challenge = whatsapp.verificarWebhook(req.query);
  if (challenge !== null) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Mensajes entrantes. Respondemos 200 de inmediato (Meta espera una
// respuesta rapida) y procesamos el mensaje despues, en segundo plano.
app.post('/webhook/whatsapp', async (req, res) => {
  // Verificamos que el request realmente venga de Meta ANTES de hacer
  // nada con el contenido — si no, cualquiera que conozca esta URL
  // podría hacerse pasar por un mensaje de WhatsApp entrante (gastando
  // cuota de la API de Claude si está configurada, o disparando
  // respuestas automáticas desde tu número de WhatsApp Business hacia
  // quien sea). Ver whatsapp.js -> verificarFirmaWebhook.
  const firmaValida = whatsapp.verificarFirmaWebhook(req.rawBody, req.get('X-Hub-Signature-256'));
  if (!firmaValida) {
    console.warn('⚠️  Webhook de WhatsApp descartado: firma inválida o ausente.');
    return res.sendStatus(403);
  }

  res.sendStatus(200);

  try {
    const sheetsClient = google.sheets({ version: 'v4', auth });
    await whatsapp.procesarEventoEntrante(sheetsClient, req.body || {});
  } catch (err) {
    console.error('Error procesando el webhook de WhatsApp:', err.message);
  }
});

/* ============================================================
 *  404 Y MANEJADOR DE ERRORES GENÉRICO
 * ============================================================
 * Van al final, después de todas las rutas: Express los usa como
 * último recurso.
 *
 *  - El 404 evita la página de error HTML por defecto de Express para
 *    rutas que no existen (que en algunas versiones expone detalles del
 *    stack/versión).
 *  - El manejador de errores atrapa cualquier excepción que se haya
 *    escapado de un `try/catch` de una ruta (o de un middleware, como
 *    multer): sin esto, Express devolvería el mensaje y stack trace
 *    real del error directo al navegador, lo cual puede filtrar detalles
 *    internos (rutas de archivos, nombres de variables, etc) a
 *    cualquiera que logre provocar un error.
 * ============================================================ */
app.use((req, res) => {
  res.status(404).json({ error: 'No encontrado.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err && err.message ? err.message : err);
  if (res.headersSent) return next(err);
  res.status(err && err.status ? err.status : 500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

app.listen(config.PORT, () => {
  console.log(`✅ Servidor corriendo en el puerto ${config.PORT}`);
});

/* ============================================================
 *  PROCESADOR AUTOMATICO DE VENTAS (cada 10 segundos)
 * ============================================================
 * Reemplaza al time-driven trigger de Apps Script (que solo permite
 * minimo 1 minuto entre corridas). Si dejaste ese trigger activo en el
 * Sheet, desactivalo para evitar que los dos procesen la misma fila a
 * la vez (menu "Control de Stock" en la planilla de VENTAS).
 */
let procesandoVentas = false;

setInterval(async () => {
  if (procesandoVentas) return; // evita superposicion si una corrida tarda mas de 10s
  procesandoVentas = true;
  try {
    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { procesadas, duplicadas } = await procesarVentasNuevas(sheetsClient, config.SHEET_ID_VENTAS);
    if (procesadas > 0 || duplicadas > 0) {
      console.log(`Procesador de ventas: ${procesadas} nueva(s), ${duplicadas} duplicada(s).`);
    }
  } catch (err) {
    console.error('Error en el procesador automático de ventas:', err.message);
  } finally {
    procesandoVentas = false;
  }
}, 10000);
