/* ============================================================
 *  whatsapp.js
 *  Chatbot de WhatsApp usando WhatsApp Cloud API (Meta), vía fetch nativo
 *  (Node 18+). No hace falta ningun SDK para esto.
 *
 *  Como conseguirlo (resumen, ver README para el paso a paso completo):
 *  1. https://developers.facebook.com/ -> Crear app -> tipo "Business".
 *  2. Agregar el producto "WhatsApp".
 *  3. En "Configuración de la API" copiás: el "Token de acceso temporal"
 *     (o generás uno permanente con un System User) y el "ID de número
 *     de teléfono" -> WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID.
 *  4. En "Configuración del webhook" pegás la URL pública
 *     https://TU-DOMINIO/webhook/whatsapp y un "Verify token" inventado
 *     por vos -> tiene que ser el mismo valor que WHATSAPP_VERIFY_TOKEN.
 *  5. Suscribite al campo "messages".
 * ============================================================ */

const crypto = require('crypto');
const config = require('./config');
const {
  getStockPorSkuGeneral,
  getCatalogoProductos,
  getPedidoPorId,
  getPedidosPorTelefono,
  appendRow,
} = require('./googleSheets');

const GRAPH_URL = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}`;

/* ------------------------------------------------------------
 * VERIFICACION DE FIRMA DE MENSAJES ENTRANTES (POST /webhook/whatsapp)
 * Meta firma cada request con HMAC-SHA256 del cuerpo crudo, usando el
 * "App secret" de la app, y lo manda en el header X-Hub-Signature-256
 * como "sha256=<hex>". Sin esto, cualquiera que conozca la URL del
 * webhook podría mandar mensajes falsos: le harían gastar cuota de la
 * API de Claude (si está configurada) o, peor, podrían llegar a
 * disparar respuestas automáticas de tu WhatsApp Business hacia
 * cualquier numero.
 *
 * Devuelve true si la firma es válida, o si WHATSAPP_APP_SECRET no está
 * configurado (caso en que no podemos verificar nada — se deja pasar
 * para no romper instalaciones que todavía no la cargaron, pero
 * conviene configurarla).
 * ------------------------------------------------------------ */
function verificarFirmaWebhook(cuerpoCrudo, headerFirma) {
  if (!config.WHATSAPP_APP_SECRET) return true;
  if (!headerFirma || !cuerpoCrudo) return false;

  const firmaEsperada = 'sha256=' + crypto
    .createHmac('sha256', config.WHATSAPP_APP_SECRET)
    .update(cuerpoCrudo)
    .digest('hex');

  const bufRecibido = Buffer.from(String(headerFirma));
  const bufEsperado = Buffer.from(firmaEsperada);
  if (bufRecibido.length !== bufEsperado.length) return false;
  return crypto.timingSafeEqual(bufRecibido, bufEsperado);
}

/* ------------------------------------------------------------
 * VERIFICACION DEL WEBHOOK (GET /webhook/whatsapp)
 * Meta manda hub.mode, hub.verify_token y hub.challenge para confirmar
 * que el dueño del endpoint es quien dice ser.
 * ------------------------------------------------------------ */
function verificarWebhook(query) {
  const modo = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (modo === 'subscribe' && token && config.WHATSAPP_VERIFY_TOKEN && token === config.WHATSAPP_VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

/* ------------------------------------------------------------
 * ENVIAR MENSAJE
 * ------------------------------------------------------------ */
async function enviarMensajeTexto(numeroDestino, texto) {
  if (!config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('⚠️  WhatsApp no está configurado (falta WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID); no se pudo enviar el mensaje.');
    return;
  }

  const res = await fetch(`${GRAPH_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numeroDestino,
      type: 'text',
      text: { body: texto },
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error('Error mandando mensaje de WhatsApp:', JSON.stringify(data));
  }
}

/* ------------------------------------------------------------
 * DETECCION DE INTENCION (reglas simples por palabra clave)
 * ------------------------------------------------------------ */
const MENU_TEXTO = [
  '¡Hola! 👋 Soy el asistente virtual de *LON Philosophy*.',
  '',
  'Puedo ayudarte con:',
  '• Mandame el *SKU* o el *nombre* de un producto para saber precio y stock.',
  '• Escribí *catálogo* para ver todos los productos.',
  '• Escribí *pedido* o tu número de pedido (ej: PED-...) para ver el estado de tu compra/envío.',
  '• Escribí *hablar con alguien* si preferís que te atienda una persona.',
].join('\n');

function esSaludo(texto) {
  return /^(hola|buenas|buen[oa]s? d[ií]as|buenas tardes|buenas noches|hey|hi)\b/.test(texto);
}

function esPedidoCatalogo(texto) {
  return /cat[aá]logo|productos|que tienen|qué tienen/.test(texto);
}

function esPedidoHumano(texto) {
  return /hablar con (alguien|una persona)|humano|persona real|atenci[oó]n personal|asesor/.test(texto);
}

function esConsultaPedido(texto) {
  return /^ped-/.test(texto) || /\bpedido\b/.test(texto) || /\benv[ií]o\b/.test(texto) || /seguimiento|tracking/.test(texto);
}

// Un SKU (general o completo) siempre tiene al menos un guion y letras+numeros,
// ej "LIB-INF-0007" o "LIB-INF-0007-000012".
function pareceSku(texto) {
  return /^[a-z0-9]+(-[a-z0-9]+){2,3}$/i.test(texto.trim());
}

/* ------------------------------------------------------------
 * BUSQUEDA DE PRODUCTO (SKU completo o SKU general)
 * ------------------------------------------------------------ */
async function buscarProductoParaBot(sheetsClient, skuTexto) {
  const sku = skuTexto.trim().toUpperCase();
  const partes = sku.split('-');
  // Si tiene 4 bloques (CAT-SUB-NNN-NNNNNN) es un SKU completo -> le
  // sacamos el ultimo bloque para quedarnos con el SKU general.
  // Si tiene 3 bloques, ya es un SKU general tal cual.
  const skuGeneral = partes.length >= 4 ? partes.slice(0, -1).join('-') : sku;

  // El precio y el nombre SIEMPRE salen del catálogo (Productos), asi
  // quedan actualizados automaticamente si se cambian ahi. Ya no se usa
  // la hoja PRECIOS para esto (queda solo como registro historico).
  const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);
  const producto = catalogo.find((p) => p.skuGeneral.toUpperCase() === skuGeneral);

  if (!producto) return null;

  const stock = await getStockPorSkuGeneral(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_STOCK, producto.skuGeneral);
  return {
    nombre: producto.producto,
    precio: producto.precio,
    stock,
  };
}

/* ------------------------------------------------------------
 * BUSQUEDA POR NOMBRE (cuando el mensaje no matchea un SKU)
 * ------------------------------------------------------------ */
async function buscarProductosPorNombre(sheetsClient, texto) {
  const busqueda = texto.trim().toLowerCase();
  if (busqueda.length < 3) return []; // evita falsos positivos con textos muy cortos

  const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);
  return catalogo.filter((p) => (p.producto || '').toLowerCase().includes(busqueda));
}

async function responderBusquedaPorNombre(sheetsClient, texto) {
  const productos = await buscarProductosPorNombre(sheetsClient, texto);
  if (productos.length === 0) return null;

  if (productos.length === 1) {
    const p = productos[0];
    const stock = await getStockPorSkuGeneral(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_STOCK, p.skuGeneral);
    const disponibilidad = stock === null || stock === undefined
      ? ''
      : (Number(stock) > 0 ? '\n✅ Hay stock disponible.' : '\n⚠️ Por ahora no tenemos stock de este producto.');
    return `*${p.producto}*\nSKU: ${p.skuGeneral}\nPrecio: $${p.precio || 'consultar'}${disponibilidad}`;
  }

  const limitados = productos.slice(0, 6);
  const lineas = limitados.map((p) => `• ${p.producto} — $${p.precio || 'consultar'} (SKU: ${p.skuGeneral})`);
  let respuesta = `Encontré ${productos.length} producto(s) que coinciden con "${texto.trim()}":\n\n${lineas.join('\n')}`;
  if (productos.length > limitados.length) {
    respuesta += `\n\n(y ${productos.length - limitados.length} más — probá con un nombre más específico)`;
  }
  respuesta += '\n\nMandame el SKU de alguno para ver el detalle completo.';
  return respuesta;
}


function textoEstadoPedido(pedido) {
  const lineas = [
    `📦 Pedido *${pedido.pedidoId}*`,
    `Producto: ${pedido.producto || '-'}`,
    `Estado: *${pedido.estado || 'Pendiente de pago'}*`,
  ];
  if (pedido.transportista) lineas.push(`Transportista: ${pedido.transportista}`);
  if (pedido.numeroSeguimiento) lineas.push(`Número de seguimiento: ${pedido.numeroSeguimiento}`);
  return lineas.join('\n');
}

async function responderConsultaPedido(sheetsClient, texto, telefonoDesde) {
  const matchId = texto.match(/ped-[a-z0-9-]+/i);
  if (matchId) {
    const { pedido } = await getPedidoPorId(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, matchId[0]);
    if (pedido) return textoEstadoPedido(pedido);
    return `No encontré ningún pedido con el número "${matchId[0]}". Revisá que esté completo, tal cual te lo mandamos por email.`;
  }

  const pedidos = await getPedidosPorTelefono(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_PEDIDOS, telefonoDesde);
  if (pedidos.length === 0) {
    return 'No encontré pedidos asociados a este número. Si hiciste la compra con otro teléfono, mandame el número de pedido (empieza con "PED-").';
  }
  return `Tu pedido más reciente:\n\n${textoEstadoPedido(pedidos[0])}`;
}

/* ------------------------------------------------------------
 * DERIVAR A UNA PERSONA
 * ------------------------------------------------------------ */
async function registrarPedidoDeHumano(sheetsClient, telefonoDesde, mensajeOriginal) {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-AR', { timeZone: config.TIMEZONE });
  const hora = ahora.toLocaleTimeString('es-AR', { timeZone: config.TIMEZONE });
  await appendRow(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_CONSULTAS, [
    '(WhatsApp)', '', '', telefonoDesde, fecha, hora, `Pidió hablar con una persona. Último mensaje: "${mensajeOriginal}"`,
  ]);
}

/* ------------------------------------------------------------
 * RESPUESTA LIBRE CON CLAUDE (opcional, solo si hay ANTHROPIC_API_KEY)
 * ------------------------------------------------------------ */
async function responderConClaude(sheetsClient, texto) {
  if (!config.ANTHROPIC_API_KEY) return null;

  try {
    const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);
    const resumenCatalogo = catalogo.slice(0, 40).map((p) => `- ${p.producto} (${p.skuGeneral}) — categoría: ${p.categoria || 'sin categoría'}${p.precio ? `, $${p.precio}` : ''}`).join('\n');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 300,
        system: `Sos el asistente de atención al cliente por WhatsApp de "LON Philosophy". Respondé en español rioplatense, corto (máximo 4 líneas) y amable, usando SOLO la información del catálogo de abajo. Si no sabés algo con certeza, decilo y ofrecé derivar con una persona (sugerí escribir "hablar con alguien"). No inventes precios ni stock que no estén en el catálogo.\n\nCatálogo:\n${resumenCatalogo}`,
        messages: [{ role: 'user', content: texto }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const bloqueTexto = (data.content || []).find((b) => b.type === 'text');
    return bloqueTexto ? bloqueTexto.text : null;
  } catch (err) {
    console.error('Error consultando a Claude para el chatbot de WhatsApp:', err.message);
    return null;
  }
}

/* ------------------------------------------------------------
 * ARMAR LA RESPUESTA PARA UN MENSAJE ENTRANTE
 * ------------------------------------------------------------ */
async function generarRespuesta(sheetsClient, mensajeOriginal, telefonoDesde) {
  const texto = String(mensajeOriginal || '').trim();
  const textoNormalizado = texto.toLowerCase();

  if (!texto) return MENU_TEXTO;

  if (esSaludo(textoNormalizado)) return MENU_TEXTO;

  if (esPedidoHumano(textoNormalizado)) {
    await registrarPedidoDeHumano(sheetsClient, telefonoDesde, texto);
    return '¡Listo! Ya avisamos al equipo y en breve te va a contactar una persona por acá mismo. 🙌';
  }

  if (esPedidoCatalogo(textoNormalizado)) {
    const link = config.PUBLIC_URL ? `${config.PUBLIC_URL}/` : '(pedile el link del catálogo a la tienda)';
    return `Mirá nuestro catálogo completo acá: ${link}\n\nSi ya sabés qué producto querés, mandame su SKU y te digo precio y disponibilidad.`;
  }

  if (esConsultaPedido(textoNormalizado)) {
    return await responderConsultaPedido(sheetsClient, textoNormalizado, telefonoDesde);
  }

  if (pareceSku(texto)) {
    const producto = await buscarProductoParaBot(sheetsClient, texto);
    if (producto) {
      const disponibilidad = producto.stock === null || producto.stock === undefined
        ? ''
        : (Number(producto.stock) > 0 ? '\n✅ Hay stock disponible.' : '\n⚠️ Por ahora no tenemos stock de este producto.');
      return `*${producto.nombre || '(sin nombre)'}*\nSKU: ${texto.toUpperCase()}\nPrecio: $${producto.precio ?? 'consultar'}${disponibilidad}`;
    }
    return `No encontré ningún producto con el código "${texto}". Fijate que esté completo o escribí *catálogo* para ver todos los productos.`;
  }

  const respuestaBusquedaNombre = await responderBusquedaPorNombre(sheetsClient, texto);
  if (respuestaBusquedaNombre) return respuestaBusquedaNombre;

  const respuestaIA = await responderConClaude(sheetsClient, texto);
  if (respuestaIA) return respuestaIA;

  return `No entendí tu mensaje 🙏\n\n${MENU_TEXTO}`;
}

/* ------------------------------------------------------------
 * PROCESAR EL EVENTO QUE MANDA META (POST /webhook/whatsapp)
 * ------------------------------------------------------------ */
async function procesarEventoEntrante(sheetsClient, body) {
  const entradas = body.entry || [];

  for (const entrada of entradas) {
    const cambios = entrada.changes || [];
    for (const cambio of cambios) {
      const valor = cambio.value || {};
      const mensajes = valor.messages || [];

      for (const mensaje of mensajes) {
        if (mensaje.type !== 'text') continue; // por ahora solo respondemos texto
        const desde = mensaje.from;
        const texto = mensaje.text ? mensaje.text.body : '';

        try {
          const respuesta = await generarRespuesta(sheetsClient, texto, desde);
          await enviarMensajeTexto(desde, respuesta);
        } catch (err) {
          console.error('Error procesando mensaje de WhatsApp:', err.message);
          await enviarMensajeTexto(desde, 'Uy, tuvimos un problema procesando tu mensaje. Probá de nuevo en un rato, por favor 🙏').catch(() => {});
        }
      }
    }
  }
}

module.exports = {
  verificarWebhook,
  verificarFirmaWebhook,
  procesarEventoEntrante,
  enviarMensajeTexto,
  generarRespuesta,
};
