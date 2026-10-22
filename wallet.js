/* ============================================================
 *  wallet.js — tarjeta de fidelidad en Google Wallet (opcional).
 *  Sin GOOGLE_WALLET_ISSUER_ID o sin credenciales, habilitado() es false
 *  y el resto de la app ignora este modulo. Autochequeo: `node wallet.js`.
 *  Hoja de Sheets = fuente de verdad: si Google falla, solo se loguea.
 * ============================================================ */
const crypto = require('crypto');
const config = require('./config');

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

let _cred; // undefined = sin leer; null = invalida/ausente
function credenciales() {
  if (_cred !== undefined) return _cred;
  try {
    const c = JSON.parse(config.GOOGLE_WALLET_CREDENTIALS_JSON);
    _cred = c && c.client_email && c.private_key ? c : null;
  } catch (e) { _cred = null; }
  return _cred;
}

function habilitado() {
  return Boolean(config.GOOGLE_WALLET_ISSUER_ID && credenciales());
}

const sanear = (s) => String(s).replace(/[^A-Za-z0-9._-]/g, '_');
const idClase = (issuer) => `${issuer}.lon_cafe`;
const idObjeto = (issuer, codigo) => `${issuer}.cafe_${sanear(codigo)}`;

function armarClase(issuer, urlBase) {
  return {
    id: idClase(issuer),
    issuerName: 'LON Philosophy',
    programName: 'LON Philosophy — Café',
    programLogo: { sourceUri: { uri: `${urlBase}/logo-catalogo.png` }, contentDescription: { defaultValue: { language: 'es', value: 'LON Philosophy' } } },
    hexBackgroundColor: '#5E1E2B',
    reviewStatus: 'UNDER_REVIEW',
  };
}

function armarObjeto(issuer, { codigoFidelidad, nombre, cafesContador }, objetivo) {
  const n = Number(cafesContador) || 0;
  return {
    id: idObjeto(issuer, codigoFidelidad),
    classId: idClase(issuer),
    state: 'ACTIVE',
    accountId: codigoFidelidad,
    accountName: nombre || '',
    loyaltyPoints: { label: 'Cafés', balance: { int: n } },
    textModulesData: [{ id: 'cafes', header: 'Cafés', body: n >= objetivo ? `${n} de ${objetivo} · ¡Tu próximo café es gratis!` : `${n} de ${objetivo}` }],
    barcode: { type: 'QR_CODE', value: codigoFidelidad, alternateText: codigoFidelidad },
  };
}

function firmarJwt(cred, payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const cuerpo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}`;
  const firma = crypto.createSign('RSA-SHA256').update(cuerpo).sign(cred.private_key).toString('base64url');
  return `${cuerpo}.${firma}`;
}

/** Link "Guardar en Google Wallet" (null si Wallet no esta activo). Local, sin red. */
function urlGuardar(cliente, urlBase = config.PUBLIC_URL || config.SITIO_URL) {
  if (!habilitado() || !cliente || !cliente.codigoFidelidad) return null;
  const issuer = config.GOOGLE_WALLET_ISSUER_ID;
  const jwt = firmarJwt(credenciales(), {
    iss: credenciales().client_email,
    aud: 'google',
    typ: 'savetowallet',
    origins: [urlBase],
    payload: {
      loyaltyClasses: [armarClase(issuer, urlBase)],
      loyaltyObjects: [armarObjeto(issuer, cliente, config.CAFES_PARA_GRATIS)],
    },
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

let _cliente;
async function pedir(method, url, data) {
  if (!_cliente) {
    const { google } = require('googleapis');
    _cliente = await new google.auth.GoogleAuth({ credentials: credenciales(), scopes: [SCOPE] }).getClient();
  }
  return _cliente.request({ method, url, data });
}

let _claseLista; // promesa: se crea/actualiza una vez por proceso
function asegurarClase() {
  if (!_claseLista) {
    const clase = armarClase(config.GOOGLE_WALLET_ISSUER_ID, config.PUBLIC_URL || config.SITIO_URL);
    _claseLista = pedir('POST', `${API}/loyaltyClass`, clase)
      .catch((err) => {
        if (err.response && err.response.status === 409) return pedir('PATCH', `${API}/loyaltyClass/${encodeURIComponent(clase.id)}`, clase);
        throw err;
      })
      .catch((err) => { _claseLista = null; throw err; });
  }
  return _claseLista;
}

/** PATCH del objeto en segundo plano. Nunca lanza ni se espera. */
function actualizarEnSegundoPlano(cliente, cafesContador) {
  if (!habilitado() || !cliente || !cliente.codigoFidelidad) return;
  const obj = armarObjeto(config.GOOGLE_WALLET_ISSUER_ID, { ...cliente, cafesContador }, config.CAFES_PARA_GRATIS);
  asegurarClase()
    .then(() => pedir('PATCH', `${API}/loyaltyObject/${encodeURIComponent(obj.id)}`, obj))
    .catch((err) => {
      // 404 = el cliente todavia no guardo la tarjeta: no es un error.
      if (err.response && err.response.status === 404) return;
      console.error('Google Wallet: no se pudo actualizar la tarjeta:', err.message);
    });
}

function demo() {
  const assert = require('assert');
  assert.strictEqual(idObjeto('3388.1', 'LON-AB 12/x'), '3388.1.cafe_LON-AB_12_x');
  assert.strictEqual(idClase('3388.1'), '3388.1.lon_cafe');
  const o = armarObjeto('I', { codigoFidelidad: 'LON-AB', nombre: 'Ana', cafesContador: 2 }, 3);
  assert.strictEqual(o.barcode.value, 'LON-AB');
  assert.strictEqual(o.textModulesData[0].body, '2 de 3');
  assert.ok(armarObjeto('I', { codigoFidelidad: 'X', cafesContador: 3 }, 3).textModulesData[0].body.includes('gratis'));

  // JWT RS256 verificable con la publica
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = firmarJwt({ private_key: pem }, { iss: 'a@b', typ: 'savetowallet' });
  const [h, p, s] = jwt.split('.');
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url')));
  assert.strictEqual(JSON.parse(Buffer.from(h, 'base64url')).alg, 'RS256');
  assert.strictEqual(JSON.parse(Buffer.from(p, 'base64url')).typ, 'savetowallet');

  // sin config no hay link
  assert.strictEqual(urlGuardar({ codigoFidelidad: 'X' }), null);
  console.log('wallet.js: autochequeo OK');
}

if (require.main === module) demo();

module.exports = { habilitado, urlGuardar, actualizarEnSegundoPlano };
