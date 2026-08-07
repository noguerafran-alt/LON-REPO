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

  return data;
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

module.exports = {
  crearPreferencia,
  obtenerPago,
};
