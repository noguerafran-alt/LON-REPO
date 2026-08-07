/* ============================================================
 *  payway.js
 *  Integracion con Payway (ex Decidir) usando el "Formulario de pago" /
 *  Checkout hospedado: el comprador carga los datos de la tarjeta en una
 *  pagina de Payway (developers.decidir.com / live.decidir.com), nunca
 *  en la nuestra. A nuestro servidor solo le llega el resultado.
 *
 *  Flujo:
 *  1. crearLinkDePago() -> POST al endpoint de checkout de Payway con los
 *     datos del pedido -> Payway devuelve un identificador de pago.
 *  2. Guardamos ese identificador como pagoExternoId del pedido ANTES de
 *     mandar al comprador a pagar (es la unica forma de rastrear el
 *     pedido despues, porque este endpoint no acepta un
 *     site_transaction_id propio).
 *  3. Redirigimos al comprador a `${webCheckoutUrl}/${identificador}`.
 *  4. Cuando paga, Payway llama a notifications_url (webhook) y/o
 *     redirige de vuelta via success_url/redirect_url. En ambos casos
 *     reconciliamos consultando el estado real con consultarPago().
 *
 *  ------------------------------------------------------------------
 *  DE DONDE SALIÓ ESTO
 *  ------------------------------------------------------------------
 *  El primer intento (POST a developers.decidir.com/api/checkout/) dio
 *  404 — ese endpoint no es el real. Estos valores salen de revisar el
 *  código fuente de un SDK de Node de Payway más reciente (no solo la
 *  documentación en texto), que muestra la construcción exacta de la
 *  URL y confirma que el checkout hospedado vive en un host y path
 *  DISTINTOS a los de la API de pagos normal (/api/v2):
 *    - Sandbox:    https://developers.decidir.com/api/orchestrator/checkout
 *    - Producción: https://ventasonline.payway.com.ar/api/checkout/payments
 *  A ambos se les agrega el sufijo "/payments/link" para el POST que
 *  crea el link. La página donde el comprador carga la tarjeta es un
 *  host distinto: developers.decidir.com (sandbox) / live.decidir.com
 *  (producción), con la forma /web/checkout/{id}.
 *
 *  Si en sandbox este endpoint también fallara, lo más seguro es
 *  revisar el mail de alta de la cuenta de Payway o escribir a
 *  integraciones-ventasonline@payway.com.ar pidiendo confirmación del
 *  endpoint — los valores de PROD en particular no están tan probados
 *  como los de sandbox.
 *
 *  (Nota: un intento anterior usó "dev.decidir.com" como host de sandbox
 *  — tomado de ese mismo SDK — y dio error de conexión ("fetch failed"),
 *  no un rechazo de Payway. Ese dominio no aparece en ninguna otra
 *  fuente, así que probablemente sea un error del paquete; se corrigió
 *  a "developers.decidir.com", que sí está confirmado en todos lados.)
 *
 *  Como conseguir las credenciales:
 *  1. Entra a https://www.payway.com.ar/vender-online y abrí una cuenta
 *     de "Ventas Online" (o pedí acceso a integraciones-ventasonline@payway.com.ar).
 *  2. Payway te manda la API key privada, la pública y tu "site" (ID de
 *     comercio).
 *  3. Cargalos como variables de entorno (ver .env.example).
 * ============================================================ */

const config = require('./config');

function esProduccion() {
  return String(config.PAYWAY_ENV || 'sandbox').toLowerCase() === 'production';
}

function baseCheckout() {
  return esProduccion() ? config.PAYWAY_CHECKOUT_BASE_URL_PROD : config.PAYWAY_CHECKOUT_BASE_URL_SANDBOX;
}

function baseWebCheckout() {
  return esProduccion() ? config.PAYWAY_WEB_CHECKOUT_URL_PROD : config.PAYWAY_WEB_CHECKOUT_URL_SANDBOX;
}

function baseApiPagos() {
  return esProduccion() ? config.PAYWAY_API_BASE_URL_PROD : config.PAYWAY_API_BASE_URL_SANDBOX;
}

function verificarConfigurado() {
  if (!config.PAYWAY_PRIVATE_API_KEY) {
    throw new Error('Falta configurar PAYWAY_PRIVATE_API_KEY (Payway) en las variables de entorno.');
  }
  if (!config.PAYWAY_PUBLIC_API_KEY) {
    throw new Error('Falta configurar PAYWAY_PUBLIC_API_KEY (Payway) en las variables de entorno.');
  }
  if (!config.PAYWAY_SITE_ID) {
    throw new Error('Falta configurar PAYWAY_SITE_ID (Payway) en las variables de entorno.');
  }
}

/**
 * Crea un link de pago hospedado en Payway para un pedido y devuelve la
 * URL a la que hay que redirigir al comprador.
 *
 * datos = {
 *   pedidoId, titulo, precioUnitario, cantidad,
 * }
 */
async function crearLinkDePago(datos) {
  verificarConfigurado();

  if (!config.PUBLIC_URL) {
    throw new Error('Falta configurar PUBLIC_URL para poder armar las URLs de retorno y notificación de Payway.');
  }

  const {
    pedidoId, titulo, precioUnitario, cantidad,
  } = datos;

  const cantidadNum = Number(cantidad) || 1;
  const precioNum = Number(precioUnitario) || 0;
  const totalPrice = precioNum * cantidadNum;

  const body = {
    origin_platform: 'QRControl',
    currency: config.PAYWAY_CURRENCY,
    products: [{
      id: 1,
      value: precioNum,
      description: (titulo || 'Producto').slice(0, 250),
      quantity: cantidadNum,
    }],
    total_price: totalPrice,
    site: config.PAYWAY_SITE_ID,
    success_url: `${config.PUBLIC_URL}/checkout-exito.html?pedido=${encodeURIComponent(pedidoId)}`,
    redirect_url: `${config.PUBLIC_URL}/checkout-exito.html?pedido=${encodeURIComponent(pedidoId)}`,
    cancel_url: `${config.PUBLIC_URL}/checkout-error.html?pedido=${encodeURIComponent(pedidoId)}`,
    notifications_url: `${config.PUBLIC_URL}/webhook/payway`,
    template_id: 1, // 1 = sin Cybersource (antifraude)
    installments: Array.from({ length: Math.max(1, config.PAYWAY_INSTALLMENTS_MAX) }, (_, i) => i + 1),
    plan_gobierno: false,
    public_apikey: config.PAYWAY_PUBLIC_API_KEY,
    auth_3ds: false,
    life_time: Math.max(1, config.PAYWAY_LIFE_TIME_SEGUNDOS),
  };

  const res = await fetch(`${baseCheckout()}/payments/link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.PAYWAY_PRIVATE_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = data && (data.message || data.error) ? (data.message || data.error) : JSON.stringify(data);
    throw new Error(`Payway rechazó la creación del link de pago: ${detalle}`);
  }

  // El nombre exacto del campo con el identificador no está 100%
  // confirmado — probamos los más probables. Si esto falla, el log de
  // abajo muestra la respuesta cruda para ajustar rápido.
  const identificador = data.id || data.payment_id || data.hash;
  if (!identificador) {
    console.error('Respuesta de Payway sin id/payment_id/hash reconocible:', JSON.stringify(data));
    throw new Error('Payway no devolvió un identificador de link de pago (revisar los logs del servidor).');
  }

  return { url: `${baseWebCheckout()}/${identificador}`, id: String(identificador), raw: data };
}

/**
 * Consulta el estado real de un pago por su identificador (el que
 * devolvió crearLinkDePago, guardado como pagoExternoId del pedido).
 * Devuelve el objeto de pago completo de Payway, o null si Payway no lo
 * encuentra (por ejemplo, todavía no se completó el pago).
 */
async function consultarPago(pagoId) {
  if (!config.PAYWAY_PRIVATE_API_KEY) {
    throw new Error('Falta configurar PAYWAY_PRIVATE_API_KEY (Payway) en las variables de entorno.');
  }

  const res = await fetch(`${baseApiPagos()}/payments/${encodeURIComponent(pagoId)}`, {
    headers: { apikey: config.PAYWAY_PRIVATE_API_KEY },
  });

  if (res.status === 404) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = data && (data.message || data.error) ? (data.message || data.error) : JSON.stringify(data);
    throw new Error(`No se pudo consultar el pago ${pagoId}: ${detalle}`);
  }

  return data;
}

/**
 * Traduce el status que devuelve Payway a uno de nuestros estados de
 * pedido. Coincidencia parcial (case-insensitive) porque el
 * casing/nombre preciso del status no está 100% confirmado en la
 * documentación pública.
 */
function estadoPedidoSegunStatusPayway(statusPayway) {
  const s = String(statusPayway || '').toLowerCase();
  if (s.includes('approv')) return 'Pagado - Coordinar envío';
  if (s.includes('reject') || s.includes('declin')) return 'Pago rechazado';
  if (s.includes('cancel')) return 'Cancelado';
  return null; // pendiente / preaprobado / desconocido -> no tocamos el estado
}

module.exports = {
  crearLinkDePago,
  consultarPago,
  estadoPedidoSegunStatusPayway,
};
