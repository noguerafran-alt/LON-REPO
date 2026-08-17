/* ============================================================
 *  mercadopago.js
 *  Integracion con Mercado Pago (Checkout Pro) usando la API REST
 *  directamente con fetch nativo de Node (no hace falta el SDK oficial,
 *  asi evitamos una dependencia mas). Requiere Node 18+.
 *
 *  Como conseguir MP_ACCESS_TOKEN:
 *  1. Entra a https://www.mercadopago.com.ar/developers/panel
 *  2. Creá una aplicación (o usá una existente).
 *  3. "Credenciales de producción" (o "de prueba" para testear) -> copiá
 *     el "Access Token".
 *  4. Pegalo en la variable de entorno MP_ACCESS_TOKEN (ver .env.example).
 * ============================================================ */

const config = require('./config');

const BASE_URL = 'https://api.mercadopago.com';

function verificarConfigurado() {
  if (!config.MP_ACCESS_TOKEN) {
    throw new Error('Falta configurar MP_ACCESS_TOKEN (Mercado Pago) en las variables de entorno.');
  }
}

/**
 * Crea una preferencia de pago (Checkout Pro) para un solo item y devuelve
 * la respuesta completa de Mercado Pago (incluye `id` e `init_point`, que
 * es la URL a la que hay que redirigir a la persona para que pague).
 *
 * datos = {
 *   pedidoId, titulo, precioUnitario, cantidad,
 *   nombreComprador, emailComprador,
 * }
 */
async function crearPreferencia(datos) {
  verificarConfigurado();

  const {
    pedidoId, titulo, precioUnitario, cantidad,
    nombreComprador, emailComprador,
  } = datos;

  if (!config.PUBLIC_URL) {
    throw new Error('Falta configurar PUBLIC_URL para poder armar las URLs de retorno y notificación de Mercado Pago.');
  }

  const body = {
    items: [{
      title: titulo || 'Producto',
      quantity: Number(cantidad) || 1,
      currency_id: config.MP_CURRENCY_ID,
      unit_price: Number(precioUnitario) || 0,
    }],
    payer: {
      name: nombreComprador || undefined,
      email: emailComprador || undefined,
    },
    external_reference: pedidoId,
    back_urls: {
      success: `${config.PUBLIC_URL}/checkout-exito.html?pedido=${encodeURIComponent(pedidoId)}`,
      pending: `${config.PUBLIC_URL}/checkout-pendiente.html?pedido=${encodeURIComponent(pedidoId)}`,
      failure: `${config.PUBLIC_URL}/checkout-error.html?pedido=${encodeURIComponent(pedidoId)}`,
    },
    auto_return: 'approved',
    notification_url: `${config.PUBLIC_URL}/webhook/mercadopago`,
    statement_descriptor: 'LON PHILOSOPHY',
  };

  const res = await fetch(`${BASE_URL}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.MP_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const detalle = data && (data.message || data.error) ? (data.message || data.error) : JSON.stringify(data);
    throw new Error(`Mercado Pago rechazó la preferencia: ${detalle}`);
  }

  // Con un access token de prueba ("TEST-...") hay que mandar al
  // comprador a sandbox_init_point (el checkout de prueba, con tarjetas
  // de test) en vez de init_point (el real) — si no, Mercado Pago
  // rechaza el pago de prueba. Con un token de producción ("APP_USR-...")
  // sandbox_init_point ni siquiera viene en la respuesta.
  const esTest = String(config.MP_ACCESS_TOKEN || '').startsWith('TEST-');
  const initPoint = (esTest && data.sandbox_init_point) ? data.sandbox_init_point : data.init_point;

  return { id: data.id, initPoint, raw: data };
}

/**
 * Consulta el estado de un pago por su ID (el que manda Mercado Pago en
 * la notificación del webhook). Devuelve el objeto de pago completo:
 * status ('approved' | 'rejected' | 'pending' | ...), external_reference
 * (nuestro pedidoId), transaction_amount, etc.
 */
async function obtenerPago(paymentId) {
  verificarConfigurado();

  const res = await fetch(`${BASE_URL}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${config.MP_ACCESS_TOKEN}` },
  });

  const data = await res.json();
  if (!res.ok) {
    const detalle = data && (data.message || data.error) ? (data.message || data.error) : JSON.stringify(data);
    throw new Error(`No se pudo consultar el pago ${paymentId}: ${detalle}`);
  }

  return data;
}

/**
 * Busca el pago mas reciente asociado a un pedido nuestro (por
 * external_reference = pedidoId). Se usa como respaldo en la pagina de
 * éxito/pendiente, para reconciliar el estado del pedido por si el
 * webhook todavía no llegó — a diferencia del webhook (que ya trae el
 * ID del pago), acá partimos solo del pedidoId. Devuelve null si
 * todavía no hay ningún pago para ese pedido.
 */
async function buscarPagoPorReferenciaExterna(pedidoId) {
  verificarConfigurado();

  const res = await fetch(`${BASE_URL}/v1/payments/search?external_reference=${encodeURIComponent(pedidoId)}`, {
    headers: { Authorization: `Bearer ${config.MP_ACCESS_TOKEN}` },
  });

  const data = await res.json();
  if (!res.ok) {
    const detalle = data && (data.message || data.error) ? (data.message || data.error) : JSON.stringify(data);
    throw new Error(`No se pudo buscar el pago del pedido ${pedidoId}: ${detalle}`);
  }

  const resultados = data.results || [];
  if (resultados.length === 0) return null;

  // Si hubo mas de un intento de pago para el mismo pedido (ej. la
  // tarjeta rechazo y probo de nuevo), nos quedamos con el mas reciente.
  resultados.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
  return resultados[0];
}

/**
 * Traduce el status que devuelve Mercado Pago a uno de nuestros estados
 * de pedido. Los valores posibles de MP son: approved, pending,
 * authorized, in_process, in_mediation, rejected, cancelled, refunded,
 * charged_back.
 */
function estadoPedidoSegunStatusMP(statusMP) {
  const s = String(statusMP || '').toLowerCase();
  if (s === 'approved') return 'Pagado - Coordinar envío';
  if (s === 'rejected') return 'Pago rechazado';
  if (s === 'cancelled' || s === 'refunded' || s === 'charged_back') return 'Cancelado';
  return null; // pendiente / en proceso / desconocido -> no tocamos el estado
}

module.exports = {
  crearPreferencia,
  obtenerPago,
  buscarPagoPorReferenciaExterna,
  estadoPedidoSegunStatusMP,
};
