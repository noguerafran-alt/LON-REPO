/* ============================================================
 *  email.js
 *  Envio de mails transaccionales (confirmacion de pedido pagado por
 *  transferencia bancaria, con los datos para transferir y el numero
 *  de pedido como referencia) usando Gmail SMTP via nodemailer.
 *
 *  Como conseguir EMAIL_USER / EMAIL_APP_PASSWORD:
 *  1. Entra a la cuenta de Gmail desde la que querés enviar los mails
 *     (puede ser una cuenta nueva creada para el negocio, ej.
 *     pedidos@gmail.com, o la que ya uses).
 *  2. Activa la verificacion en 2 pasos: myaccount.google.com/security
 *     -> "Verificacion en 2 pasos".
 *  3. Una vez activada, andá a myaccount.google.com/apppasswords y
 *     generá una "contraseña de aplicacion" (16 caracteres, sin
 *     espacios). Ojo: NO es la contraseña normal de la cuenta.
 *  4. EMAIL_USER = la direccion de Gmail completa.
 *     EMAIL_APP_PASSWORD = la contraseña de aplicacion generada.
 *  5. Cargalas como variables de entorno (ver .env.example).
 *
 *  Gmail limita el envio a ~500 mails/dia por cuenta, de sobra para
 *  confirmaciones de pedido de un comercio chico/mediano.
 * ============================================================ */

const nodemailer = require('nodemailer');
const config = require('./config');

let transporterCache = null;

function getTransporter() {
  if (transporterCache) return transporterCache;
  if (!config.EMAIL_USER || !config.EMAIL_APP_PASSWORD) return null;

  transporterCache = nodemailer.createTransport({
    host: config.EMAIL_HOST,
    port: config.EMAIL_PORT,
    secure: config.EMAIL_PORT === 465,
    auth: {
      user: config.EMAIL_USER,
      pass: config.EMAIL_APP_PASSWORD,
    },
  });

  return transporterCache;
}

function escapeHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Manda el mail de confirmacion de un pedido pagado por transferencia,
 * con los datos bancarios y el numero de pedido como referencia.
 * Nunca tira excepcion hacia afuera (solo loguea el error) para no
 * romper la creacion del pedido si el mail falla.
 *
 * datos = {
 *   destinatario, nombreCliente, pedidoId, producto, cantidad, monto,
 *   transferencia: { alias, titular, cbu, banco },
 * }
 */
async function enviarEmailTransferencia(datos) {
  const {
    destinatario, nombreCliente, pedidoId, producto, cantidad, monto, transferencia = {},
  } = datos;

  if (!destinatario) return false;

  const transporter = getTransporter();
  if (!transporter) {
    console.warn('No se configuraron EMAIL_USER / EMAIL_APP_PASSWORD — no se pudo enviar el mail de confirmación del pedido', pedidoId);
    return false;
  }

  const lineasDatos = [
    transferencia.alias ? `Alias: ${transferencia.alias}` : '',
    transferencia.cbu ? `CBU: ${transferencia.cbu}` : '',
    transferencia.titular ? `Titular: ${transferencia.titular}` : '',
    transferencia.banco ? `Banco: ${transferencia.banco}` : '',
  ].filter(Boolean);

  const cantidadTexto = Number(cantidad) > 1 ? ` x${cantidad}` : '';

  const texto = `Hola ${nombreCliente || ''}!

Gracias por tu compra. Estos son los datos para transferir:

${lineasDatos.join('\n')}
Monto: $${monto}

Guardá este número de pedido como referencia: ${pedidoId}
Producto: ${producto}${cantidadTexto}

Apenas confirmemos que llegó el pago, coordinamos la entrega.

LON Philosophy`;

  const html = `
    <p>Hola ${escapeHtml(nombreCliente || '')}!</p>
    <p>Gracias por tu compra. Estos son los datos para transferir:</p>
    <p style="font-family:monospace; white-space:pre-line; background:#f4f0e8; padding:12px 14px; border-radius:4px;">${escapeHtml(lineasDatos.join('\n'))}
Monto: $${escapeHtml(String(monto))}</p>
    <p>Guardá este número de pedido como referencia: <strong>${escapeHtml(pedidoId)}</strong><br>
    Producto: ${escapeHtml(producto)}${escapeHtml(cantidadTexto)}</p>
    <p>Apenas confirmemos que llegó el pago, coordinamos la entrega.</p>
    <p>LON Philosophy</p>
  `;

  try {
    await transporter.sendMail({
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_USER}>`,
      to: destinatario,
      subject: `Tu pedido ${pedidoId} — datos para transferir`,
      text: texto,
      html,
    });
    return true;
  } catch (err) {
    console.error(`Error enviando el mail de confirmación del pedido ${pedidoId}:`, err.message);
    return false;
  }
}

/**
 * Igual que enviarEmailTransferencia pero para un pedido con varios
 * productos a la vez (carrito): en vez de un producto/cantidad, lista
 * cada item con su cantidad, y en vez de un pedidoId lista todos los
 * generados (uno por producto).
 *
 * datos = {
 *   destinatario, nombreCliente, pedidoIds: [...], items: [{producto, cantidad}],
 *   monto, transferencia: { alias, titular, cbu, banco },
 * }
 */
async function enviarEmailTransferenciaCarrito(datos) {
  const {
    destinatario, nombreCliente, pedidoIds = [], items = [], monto, transferencia = {},
  } = datos;

  if (!destinatario) return false;

  const transporter = getTransporter();
  if (!transporter) {
    console.warn('No se configuraron EMAIL_USER / EMAIL_APP_PASSWORD — no se pudo enviar el mail de confirmación del pedido', pedidoIds.join(', '));
    return false;
  }

  const lineasDatos = [
    transferencia.alias ? `Alias: ${transferencia.alias}` : '',
    transferencia.cbu ? `CBU: ${transferencia.cbu}` : '',
    transferencia.titular ? `Titular: ${transferencia.titular}` : '',
    transferencia.banco ? `Banco: ${transferencia.banco}` : '',
  ].filter(Boolean);

  const lineasItems = items.map((it) => `- ${it.producto}${Number(it.cantidad) > 1 ? ` x${it.cantidad}` : ''}`);

  const texto = `Hola ${nombreCliente || ''}!

Gracias por tu compra. Estos son los datos para transferir:

${lineasDatos.join('\n')}
Monto: $${monto}

Guardá estos números de pedido como referencia: ${pedidoIds.join(', ')}
Productos:
${lineasItems.join('\n')}

Apenas confirmemos que llegó el pago, coordinamos la entrega.

LON Philosophy`;

  const html = `
    <p>Hola ${escapeHtml(nombreCliente || '')}!</p>
    <p>Gracias por tu compra. Estos son los datos para transferir:</p>
    <p style="font-family:monospace; white-space:pre-line; background:#f4f0e8; padding:12px 14px; border-radius:4px;">${escapeHtml(lineasDatos.join('\n'))}
Monto: $${escapeHtml(String(monto))}</p>
    <p>Guardá estos números de pedido como referencia: <strong>${escapeHtml(pedidoIds.join(', '))}</strong></p>
    <p>Productos:<br>${lineasItems.map((l) => escapeHtml(l)).join('<br>')}</p>
    <p>Apenas confirmemos que llegó el pago, coordinamos la entrega.</p>
    <p>LON Philosophy</p>
  `;

  try {
    await transporter.sendMail({
      from: `"${config.EMAIL_FROM_NAME}" <${config.EMAIL_USER}>`,
      to: destinatario,
      subject: `Tu pedido (${pedidoIds.length} productos) — datos para transferir`,
      text: texto,
      html,
    });
    return true;
  } catch (err) {
    console.error('Error enviando el mail de confirmación del pedido de carrito:', err.message);
    return false;
  }
}

module.exports = { enviarEmailTransferencia, enviarEmailTransferenciaCarrito };
