/* ============================================================
 *  server.js
 *  Para cambiar nombres de hoja, IDs de spreadsheet, columnas, etc.
 *  editar config.js — este archivo no deberia necesitar tocarse
 *  para "instalar" la app en otro negocio.
 * ============================================================ */

const fs = require('fs');
const path = require('path');
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
  crearProductoNuevo,
  agregarFotoProducto,
  eliminarFotoProducto,
  actualizarDescripcionProducto,
  buscarAsociacionCodigoBarra,
  asociarCodigoBarra,
  buscarSkuCompletoDisponible,
  procesarVentasNuevas,
  crearPedido,
  getPedidos,
  getPedidoPorId,
  getPedidoPorPagoExternoId,
  actualizarPedido,
} = require('./googleSheets');
const { generarPdfEtiquetas } = require('./generarEtiquetas');
const payway = require('./payway');
const emailService = require('./email');
const whatsapp = require('./whatsapp');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rutas amigables (sin ".html") ademas del acceso directo a los archivos.
app.get('/cliente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cliente.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));


if (!config.SHEET_ID_VENTAS || config.SHEET_ID_VENTAS.startsWith('PONE_ACA')) {
  console.warn('⚠️  Falta configurar SHEET_ID_VENTAS en config.js o en la variable de entorno.');
}
if (!config.SHEET_ID_PRODUCTOS || config.SHEET_ID_PRODUCTOS.startsWith('PONE_ACA')) {
  console.warn('⚠️  Falta configurar SHEET_ID_PRODUCTOS en config.js o en la variable de entorno.');
}
if (!config.ADMIN_PASSWORD) {
  console.warn('⚠️  No configuraste ADMIN_PASSWORD — el modo admin no va a funcionar hasta que lo agregues.');
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

function checkAdmin(password) {
  return Boolean(config.ADMIN_PASSWORD) && password === config.ADMIN_PASSWORD;
}

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
 * LOGIN ADMIN
 * ------------------------------------------------------------ */
app.post('/admin-login', (req, res) => {
  const { password } = req.body;
  if (!config.ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: 'El servidor no tiene configurada ADMIN_PASSWORD.' });
  }
  if (checkAdmin(password)) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Contraseña incorrecta.' });
});

/* ------------------------------------------------------------
 * CONSULTA PUBLICA DE PRODUCTO (precio, nombre, y stock si es admin)
 * ------------------------------------------------------------ */
app.get('/producto/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const { password } = req.query;
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

    if (esCodigoBarraExterno) {
      // El código de barras original es igual en todas las copias, no
      // identifica una unidad física puntual — le asignamos
      // automáticamente la próxima unidad ya generada y todavía no
      // vendida de este producto.
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

    if (checkAdmin(password)) {
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
app.post('/consulta', async (req, res) => {
  try {
    const { sku, nombre, email, telefono } = req.body;
    // El SKU puede venir vacio: es el caso de "Dejanos tu contacto" sin
    // haber escaneado nada todavia (contacto general).
    const skuLimpio = sku ? String(sku).trim() : '';

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const { fecha, hora } = fechaYHoraActual();

    await appendRow(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_CONSULTAS, [
      skuLimpio || '(contacto general)', nombre || '', email || '', telefono || '', fecha, hora,
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
app.get('/admin/verificar-vendido', async (req, res) => {
  try {
    const { sku, password } = req.query;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
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

app.post('/scan', async (req, res) => {
  try {
    const { sku, password, precioManual } = req.body;

    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado. Esta acción es solo para admin.' });
    }
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
    // al de catálogo — el procesador lo usa en vez del precio de Productos).
    const precioManualLimpio = precioManual !== undefined && precioManual !== null && precioManual !== '' ? Number(precioManual) : '';
    await appendRow(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_VENTAS, [sku, fecha, hora, '', '', precioManualLimpio]);

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
app.get('/admin/catalogo', async (req, res) => {
  try {
    const { password } = req.query;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const productos = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);

    res.json({ productos });
  } catch (err) {
    console.error('Error leyendo el catálogo:', err.message);
    res.status(500).json({ error: 'No se pudo leer el catálogo de productos.' });
  }
});

/* Devuelve las categorias/subcategorias/prefijos de SKU (hoja Config),
   para armar el formulario de "crear producto nuevo". Requiere admin. */
app.get('/admin/config-categorias', async (req, res) => {
  try {
    const { password } = req.query;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

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
app.post('/admin/crear-config-categoria', async (req, res) => {
  try {
    const { password, categoria, codigoCategoria, subcategoria, codigoSubcategoria } = req.body;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
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

    const sheetsClient = google.sheets({ version: 'v4', auth });

    const nueva = await crearCategoriaConfig(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CONFIG, {
      categoria: String(categoria).trim(),
      codigoCategoria: String(codigoCategoria).trim(),
      subcategoria: String(subcategoria).trim(),
      codigoSubcategoria: String(codigoSubcategoria).trim(),
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
app.post('/admin/crear-producto', async (req, res) => {
  try {
    const { password, producto, categoria, subcategoria, prefijoSku, precio } = req.body;

    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    if (!producto || !String(producto).trim()) {
      return res.status(400).json({ error: 'Falta el nombre del producto.' });
    }
    if (!prefijoSku || !String(prefijoSku).trim()) {
      return res.status(400).json({ error: 'Falta la categoría/subcategoría (prefijo de SKU).' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });

    const productoCreado = await crearProductoNuevo(sheetsClient, {
      spreadsheetId: config.SHEET_ID_PRODUCTOS,
      sheetNameProductos: config.HOJA_PRODUCTOS,
      producto: String(producto).trim(),
      categoria: categoria || '',
      subcategoria: subcategoria || '',
      prefijoSku: String(prefijoSku).trim(),
      precio: precio || '',
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
app.get('/admin/codigo-barra/:codigo', async (req, res) => {
  try {
    const { password } = req.query;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

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
app.post('/admin/codigo-barra', async (req, res) => {
  try {
    const { password, codigoBarra, skuGeneral } = req.body;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    if (!codigoBarra || !String(codigoBarra).trim()) {
      return res.status(400).json({ error: 'Falta el código de barras.' });
    }
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU interno a asociar.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);
    const producto = catalogo.find((p) => p.skuGeneral.toLowerCase() === String(skuGeneral).trim().toLowerCase());
    if (!producto) {
      return res.status(404).json({ error: 'No se encontró ese SKU interno en el catálogo.' });
    }

    const { fecha, hora } = fechaYHoraActual();
    await asociarCodigoBarra(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_CODIGOS_BARRA, {
      codigoBarra: String(codigoBarra).trim(),
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

app.post('/admin/generar-unidades', async (req, res) => {
  try {
    const { password, skuGeneral, producto, categoria, subcategoria, precio, cantidad, generadoPor } = req.body;

    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
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

    const skusGenerados = await generarUnidades(sheetsClient, {
      spreadsheetId: config.SHEET_ID_PRODUCTOS,
      skuGeneral: String(skuGeneral).trim(),
      producto: producto || '',
      categoria: categoria || '',
      subcategoria: subcategoria || '',
      precio: precio || '',
      cantidad: cantidadNum,
      generadoPor: generadoPor || '',
      fecha,
    });

    res.json({ ok: true, skusGenerados });
  } catch (err) {
    console.error('Error generando unidades:', err.message);
    res.status(500).json({ error: 'No se pudieron generar las unidades. Revisá los logs del servidor.' });
  }
});

/* Borra todos los datos de la hoja IMPRIMIR APP (deja la fila 1 de
   encabezado intacta). Se usa despues de imprimir, para arrancar de cero. */
app.post('/admin/vaciar-imprimir-app', async (req, res) => {
  try {
    const { password } = req.body;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

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

/* Catalogo PUBLICO (sin contraseña): lista de productos con nombre,
   categoria, foto, si hay stock disponible y un precio de referencia
   (tomado de la hoja Productos). Se usa para la vista de "Catálogo". */
app.get('/catalogo-publico', async (req, res) => {
  try {
    const sheetsClient = google.sheets({ version: 'v4', auth });

    const stockResp = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: config.SHEET_ID_VENTAS,
      range: `${config.HOJA_STOCK}!A:F`,
    });
    const catalogoProductos = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);

    const stockRows = stockResp.data.values || [];

    // Precio y foto de referencia por SKU general, tomados de la hoja
    // Productos (fuente autoritativa/actualizada, no PRECIOS que guarda
    // precio por unidad individual y puede quedar viejo).
    const precioPorSkuGeneral = {};
    const fotoPorSkuGeneral = {};
    const fotosPorSkuGeneral = {};
    const descripcionPorSkuGeneral = {};
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

      productos.push({
        skuGeneral,
        nombre: nombre || '(sin nombre)',
        categoria,
        disponible: cantidadActual > 0,
        precio: precioPorSkuGeneral[skuGeneral] || null,
        foto: fotoPorSkuGeneral[skuGeneral] || null,
        fotos: fotosPorSkuGeneral[skuGeneral] || [],
        descripcion: descripcionPorSkuGeneral[skuGeneral] || '',
      });
    }

    res.json({ productos });
  } catch (err) {
    console.error('Error leyendo el catálogo público:', err.message);
    res.status(500).json({ error: 'No se pudo cargar el catálogo.' });
  }
});

/* Config publica minima que necesita el frontend del catálogo (nada
   sensible): el numero de WhatsApp para armar el link del boton flotante. */
app.get('/config-publico', (req, res) => {
  res.json({
    whatsappNumero: config.WHATSAPP_NUMERO_CONTACTO || '',
    transferencia: {
      alias: config.TRANSFERENCIA_ALIAS || '',
      titular: config.TRANSFERENCIA_TITULAR || '',
      cbu: config.TRANSFERENCIA_CBU || '',
      banco: config.TRANSFERENCIA_BANCO || '',
    },
  });
});

/* Chat embebido en la web: reutiliza EXACTAMENTE la misma logica del
   chatbot de WhatsApp (generarRespuesta), asi las dos vias de contacto
   responden igual (palabra clave + Claude si esta configurado), sin
   necesidad de tener WhatsApp instalado. */
app.post('/chat-web', async (req, res) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje || !String(mensaje).trim()) {
      return res.status(400).json({ error: 'Mensaje vacío.' });
    }
    const sheetsClient = google.sheets({ version: 'v4', auth });
    const respuesta = await whatsapp.generarRespuesta(sheetsClient, String(mensaje).trim(), '(chat web)');
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
app.get('/admin/imprimir-app-resumen', async (req, res) => {
  try {
    const { password } = req.query;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

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
app.get('/admin/etiquetas-qr', async (req, res) => {
  try {
    const { password, tipo } = req.query;
    if (!checkAdmin(password)) {
      return res.status(401).send('No autorizado.');
    }

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
app.get('/admin/etiquetas-qr-app', async (req, res) => {
  try {
    const { password, tipo } = req.query;
    if (!checkAdmin(password)) {
      return res.status(401).send('No autorizado.');
    }

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

app.post('/admin/producto/foto', (req, res) => {
  uploadFoto.single('foto')(req, res, async (errorSubida) => {
    try {
      const { password, skuGeneral } = req.body;
      if (!checkAdmin(password)) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(401).json({ error: 'No autorizado.' });
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

      const fotoUrl = `/uploads/productos/${req.file.filename}`;
      const sheetsClient = google.sheets({ version: 'v4', auth });
      const resultado = await agregarFotoProducto(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS, String(skuGeneral).trim(), fotoUrl);

      if (!resultado.encontrado) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: `No se encontró el producto con SKU general "${skuGeneral}".` });
      }

      if (resultado.limiteAlcanzado) {
        fs.unlink(req.file.path, () => {});
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

/* Saca una foto puntual (por indice, 0 a 3) de la galeria de un producto.
   Si la foto era un archivo subido a este servidor (/uploads/productos/...),
   tambien lo borra del disco. Requiere admin. */
app.post('/admin/producto/foto/eliminar', async (req, res) => {
  try {
    const { password, skuGeneral, indice } = req.body;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
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
      const rutaArchivo = path.join(__dirname, 'public', resultado.fotoEliminada);
      fs.unlink(rutaArchivo, () => {}); // si no existe o falla, no pasa nada grave
    }

    res.json({ ok: true, fotos: resultado.fotos });
  } catch (err) {
    console.error('Error borrando la foto del producto:', err.message);
    res.status(500).json({ error: 'No se pudo borrar la foto.' });
  }
});

/* Actualiza la descripcion (texto libre) de un producto, mostrada en la
   pagina de detalle del catalogo publico. Requiere admin. */
app.post('/admin/producto/descripcion', async (req, res) => {
  try {
    const { password, skuGeneral, descripcion } = req.body;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    if (!skuGeneral || !String(skuGeneral).trim()) {
      return res.status(400).json({ error: 'Falta el SKU general del producto.' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const encontrado = await actualizarDescripcionProducto(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS, String(skuGeneral).trim(), String(descripcion || '').trim());

    if (!encontrado) {
      return res.status(404).json({ error: `No se encontró el producto con SKU general "${skuGeneral}".` });
    }

    res.json({ ok: true, descripcion: String(descripcion || '').trim() });
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

app.post('/crear-pago', async (req, res) => {
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
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Falta el email del comprador (lo necesitamos para mandarte la confirmación del pedido).' });
    }
    const cantidadNum = Number(cantidad) || 1;
    if (!Number.isInteger(cantidadNum) || cantidadNum <= 0) {
      return res.status(400).json({ error: 'Cantidad invalida.' });
    }
    if (metodoEnvio === 'Envio a domicilio' && (!direccion || !ciudad)) {
      return res.status(400).json({ error: 'Para envio a domicilio hace falta al menos direccion y ciudad.' });
    }
    if (metodoPago !== 'payway' && metodoPago !== 'transferencia') {
      return res.status(400).json({ error: 'Elegi un metodo de pago valido (Payway o transferencia).' });
    }

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);
    const producto = catalogo.find((p) => p.skuGeneral.toLowerCase() === String(skuGeneral).trim().toLowerCase());

    if (!producto) {
      return res.status(404).json({ error: 'No se encontro el producto.' });
    }
    const precioNum = Number(producto.precio);
    if (!precioNum || precioNum <= 0) {
      return res.status(400).json({ error: 'Este producto todavia no tiene precio cargado, no se puede comprar online.' });
    }

    const pedidoId = generarPedidoId();
    const { fecha, hora } = fechaYHoraActual();
    const total = precioNum * cantidadNum;

    await crearPedido(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, {
      pedidoId,
      fecha: `${fecha} ${hora}`,
      skuGeneral: producto.skuGeneral,
      producto: producto.producto,
      precio: precioNum,
      cantidad: cantidadNum,
      total,
      nombreCliente: nombre,
      emailCliente: email || '',
      telefonoCliente: telefono || '',
      direccion: direccion || '',
      ciudad: ciudad || '',
      provincia: provincia || '',
      codigoPostal: codigoPostal || '',
      metodoEnvio: metodoEnvio || 'Retiro en el local',
      estado: 'Pendiente de pago',
      transportista: '',
      numeroSeguimiento: '',
      pagoExternoId: '',
      notas: notas || '',
      metodoPago: metodoPago === 'payway' ? 'Payway' : 'Transferencia',
    });

    if (metodoPago === 'payway') {
      const link = await payway.crearLinkDePago({
        pedidoId,
        titulo: producto.producto,
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
      producto: producto.producto,
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

  await actualizarPedido(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, pedido.pedidoId, { estado: nuevoEstado });
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

app.get('/admin/pedidos', async (req, res) => {
  try {
    const { password } = req.query;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

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
app.post('/admin/pedidos/actualizar', async (req, res) => {
  try {
    const { password, pedidoId, estado, transportista, numeroSeguimiento, notas } = req.body;
    if (!checkAdmin(password)) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    if (!pedidoId || !String(pedidoId).trim()) {
      return res.status(400).json({ error: 'Falta el número de pedido.' });
    }

    const camposActualizar = {};
    if (estado !== undefined) camposActualizar.estado = estado;
    if (transportista !== undefined) camposActualizar.transportista = transportista;
    if (numeroSeguimiento !== undefined) camposActualizar.numeroSeguimiento = numeroSeguimiento;
    if (notas !== undefined) camposActualizar.notas = notas;

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const encontrado = await actualizarPedido(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, String(pedidoId).trim(), camposActualizar);

    if (!encontrado) {
      return res.status(404).json({ error: 'No se encontró ese pedido.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error actualizando el pedido:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el pedido.' });
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
  res.sendStatus(200);

  try {
    const sheetsClient = google.sheets({ version: 'v4', auth });
    await whatsapp.procesarEventoEntrante(sheetsClient, req.body || {});
  } catch (err) {
    console.error('Error procesando el webhook de WhatsApp:', err.message);
  }
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
