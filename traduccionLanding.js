/* Traducción automática de los textos de la landing (es -> en/fr/pt-BR). Separado de server.js
   para poder probar el parseo de la respuesta del modelo sin levantar nada. */
const MAX_TEXTOS = 80;
const MAX_LARGO_ES = 1500;

const PROMPT_SISTEMA = `Traducís textos de la web de LON Philosophy, una casa de libros, objetos de diseño y café en Buenos Aires.
Del español a inglés (en), francés (fr) y portugués de Brasil (pt).
Registro natural y cálido, no literal. Conservá mayúsculas/minúsculas del original, los saltos de línea, los nombres propios y de marca (LON, LON Philosophy), los emojis y cualquier {variable} tal cual.
Recibís un JSON { "clave": "texto en español" }. Respondé SOLO JSON válido, sin markdown, con la forma { "clave": { "en": "...", "fr": "...", "pt": "..." } } y exactamente las mismas claves.`;

// Devuelve { traducciones } o { error }. Nunca devuelve algo parcial ni con claves ajenas.
function validarTraducciones(crudo, textos) {
  const match = String(crudo || '').match(/\{[\s\S]*\}/);
  if (!match) return { error: 'El modelo no devolvió JSON.' };
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) { return { error: 'El modelo devolvió un JSON roto.' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'Respuesta del modelo inválida.' };
  const pedidas = Object.keys(textos);
  const extra = Object.keys(parsed).filter((k) => !pedidas.includes(k));
  if (extra.length) return { error: 'El modelo devolvió claves que no se pidieron.' };
  const traducciones = {};
  for (const k of pedidas) {
    const t = parsed[k];
    if (!t || typeof t !== 'object') return { error: 'Falta la traducción de «' + k + '».' };
    traducciones[k] = {};
    for (const idioma of ['en', 'fr', 'pt']) {
      const v = t[idioma];
      if (typeof v !== 'string' || !v.trim()) return { error: 'Traducción inválida en «' + k + '» (' + idioma + ').' };
      if (v.length > textos[k].length * 4 + 200) return { error: 'Traducción demasiado larga en «' + k + '».' };
      traducciones[k][idioma] = v.trim();
    }
  }
  return { traducciones };
}

// Limpia el body: solo claves string con texto no vacío y largo razonable.
function validarPedido(textos) {
  if (!textos || typeof textos !== 'object' || Array.isArray(textos)) return null;
  const limpio = {};
  for (const [k, v] of Object.entries(textos)) {
    if (!/^[a-z0-9_]{1,60}$/i.test(k) || typeof v !== 'string' || !v.trim()) continue;
    if (v.length > MAX_LARGO_ES) return null;
    limpio[k] = v;
  }
  const n = Object.keys(limpio).length;
  return n && n <= MAX_TEXTOS ? limpio : null;
}

module.exports = { PROMPT_SISTEMA, validarTraducciones, validarPedido };

if (require.main === module) {
  const assert = require('assert');
  const t = { a: 'Hola', b: 'Ver piezas' };
  const ok = '```json\n{"a":{"en":"Hello","fr":"Salut","pt":"Olá"},"b":{"en":"See pieces","fr":"Voir","pt":"Ver peças"}}\n```';
  assert.strictEqual(validarTraducciones(ok, t).traducciones.b.pt, 'Ver peças');
  assert(validarTraducciones('{"a":{"en":"x"', t).error);
  assert(validarTraducciones('nada', t).error);
  assert(validarTraducciones('{"a":{"en":"H","fr":"S","pt":"O"},"b":{"en":"H","fr":"S","pt":"O"},"z":{}}', t).error);
  assert(validarTraducciones('{"a":{"en":"H","fr":"S","pt":3},"b":{"en":"H","fr":"S","pt":"O"}}', t).error);
  assert(validarTraducciones('{"a":{"en":"H","fr":"S","pt":"O"}}', t).error);
  assert(validarPedido({ a: 'x', b: '  ', c: 5 }).a && !validarPedido({ b: ' ' }));
  console.log('traduccionLanding: ok');
}
