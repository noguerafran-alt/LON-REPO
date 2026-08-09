/* ============================================================
 *  validacion.js — saneo y validación de todo lo que entra por HTTP
 *  antes de que llegue a Google Sheets o a otro servicio externo.
 * ============================================================
 * Dos problemas distintos que esto resuelve:
 *
 * 1) INYECCIÓN DE FÓRMULAS EN SHEETS (a veces llamada "CSV injection").
 *    Si un texto que viene de un formulario público (nombre, dirección,
 *    notas...) empieza con "=", "+", "-" o "@", Google Sheets/Excel lo
 *    puede interpretar como el inicio de una fórmula al abrir la
 *    planilla. Alguien podría cargar como "nombre" algo como
 *    `=HYPERLINK("http://evil.com","click")` o peor, una fórmula que
 *    intente filtrar datos de la hoja. `sanitizarTexto()` neutraliza
 *    esto anteponiendo un apóstrofo cuando hace falta, que es la
 *    mitigación estándar (recomendada por OWASP).
 *
 * 2) DATOS con formato incorrecto o desmedidos (emails inválidos,
 *    strings gigantes que inflan la hoja o el costo de un mail/llamada
 *    a la API de Claude, cantidades absurdas, etc).
 * ============================================================ */

/** Caracteres que Sheets/Excel puede interpretar como inicio de fórmula. */
const CARACTERES_FORMULA = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Recorta un texto a `maxLargo` y, si empieza con un caracter que
 * Sheets podría leer como fórmula, le antepone un apóstrofo para que
 * quede forzado como texto plano. Sirve para CUALQUIER valor que se
 * vaya a escribir en una celda y que haya sido tipeado por alguien
 * (cliente o admin) sin pasar antes por una validación más específica.
 */
function sanitizarTexto(valor, maxLargo = 500) {
  let texto = String(valor === undefined || valor === null ? '' : valor).trim();
  if (texto.length > maxLargo) texto = texto.slice(0, maxLargo);
  if (texto && CARACTERES_FORMULA.includes(texto[0])) texto = `'${texto}`;
  return texto;
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esEmailValido(valor) {
  const texto = String(valor || '').trim();
  return texto.length > 0 && texto.length <= 254 && REGEX_EMAIL.test(texto);
}

/** Deja solo dígitos, espacios, "+" y guiones; corta a un largo razonable. */
function sanitizarTelefono(valor, maxLargo = 30) {
  return String(valor || '').trim().replace(/[^\d\s+\-()]/g, '').slice(0, maxLargo);
}

/** Código postal: alfanumérico simple, sin símbolos raros. */
function sanitizarCodigoPostal(valor, maxLargo = 12) {
  return String(valor || '').trim().replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, maxLargo);
}

/** Entero dentro de un rango, o null si no es válido. */
function enteroEnRango(valor, min, max) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < min || numero > max) return null;
  return numero;
}

module.exports = {
  sanitizarTexto,
  esEmailValido,
  sanitizarTelefono,
  sanitizarCodigoPostal,
  enteroEnRango,
};
