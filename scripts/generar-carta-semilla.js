/* Genera public/carta-semilla.json a partir de la carta ORIGINAL hardcodeada.
 * Uso: node scripts/generar-carta-semilla.js
 *
 * Las fuentes son copias congeladas de lo que había antes del editor
 * (scripts/semilla/carta-original.html e idioma-original.js): public/carta.html
 * ya no trae el contenido. La semilla se commitea; regenerarla solo hace falta
 * para rehacer ese punto de partida. Al final corre sus propios asserts. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { validarArbol, contarItems } = require('../cartaArbol');

const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'semilla', 'carta-original.html'), 'utf8');

// idioma.js es un IIFE de navegador: se evalúa con un window de mentira para sacar los diccionarios.
const ctx = { window: {}, document: { readyState: 'loading', addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} } };
ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'semilla', 'idioma-original.js'), 'utf8'), ctx);
const DIC = ctx.LONi18n.diccionarios;

const decodificar = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&times;/g, '×').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const plano = (s) => decodificar(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const slug = (s) => plano(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/* Texto de un fragmento en un idioma: cada <span data-i18n="k"> (o la clave del propio contenedor)
 * se reemplaza por el diccionario; si no hay clave, queda el español ('' en otros idiomas). */
function traducir(inner, claveExterna, lang) {
  if (lang === 'es') return plano(inner.replace(/<svg[\s\S]*?<\/svg>/g, ''));
  if (claveExterna) return DIC[lang][claveExterna] || '';
  let hay = false;
  const t = inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<span data-i18n="([^"]+)">([\s\S]*?)<\/span>/g, (m, k, es) => {
    if (DIC[lang][k]) hay = true;
    return DIC[lang][k] || es;
  });
  return hay ? plano(t) : '';
}
const nombres = (inner, clave) => Object.fromEntries(['es', 'en', 'fr', 'pt'].map((l) => [l, traducir(inner, clave, l)]));
const clave = (attrs) => (/data-i18n="([^"]+)"/.exec(attrs || '') || [])[1];

const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
const RE = new RegExp([
  '<h2 class="seccion">([\\s\\S]*?)</h2>',                                            // 1 sección
  '<section class="caja( marca)?"([^>]*)>',                                           // 2,3 categoría
  '<h3 id="[^"]*"([^>]*)>([\\s\\S]*?)</h3>',                                           // 4,5 título
  '<h4>([\\s\\S]*?)</h4>',                                                            // 6 subgrupo
  '<div class="fila( uno)? enc">([\\s\\S]*?)</div>',                                  // 7,8 encabezado
  '<div class="fila( uno)?"(?: data-foto="([^"]+)")?>([\\s\\S]*?)</div>',            // 9,10,11 fila
  '<div class="item" data-foto="([^"]+)"><div class="linea">([\\s\\S]*?)</div>((?:\\s*<span class="desc[^"]*"[^>]*>[\\s\\S]*?</span>)+)\\s*</div>', // 12,13,14
  '<li data-foto="([^"]+)">([\\s\\S]*?)</li>',                                        // 15,16
].join('|'), 'g');

const nombreRe = /<span class="nombre"([^>]*)>([\s\S]*?)<\/span>(?=(?:<i><\/i>)?<span class="precio">)/;
const precios = (s) => [...s.matchAll(/<span class="precio">([\s\S]*?)<\/span>/g)].map((m) => plano(m[1]));
const usados = new Set();
const unico = (base) => { let id = base || 'x'; for (let i = 2; usados.has(id); i++) id = base + '_' + i; usados.add(id); return id; };

const arbol = { secciones: [] };
let sec, cat, subgrupo;
const nuevoItem = (slugFoto, linea, descripciones) => {
  const m = nombreRe.exec(linea);
  if (!m) throw new Error('Producto sin nombre: ' + linea.slice(0, 80));
  const p = precios(linea);
  const nombre = nombres(m[2], clave(m[1]));
  cat.formato = p.length === 3 ? 'tres' : 'uno';
  const it = {
    tipo: 'item', id: unico(slugFoto || (slug(cat.nombre.es || sec.nombre.es) + '_' + slug(nombre.es))), nombre,
    descripcion: { es: '', en: '', fr: '', pt: '' },
    precio: p.length === 1 ? p[0] : '', precio_s: p.length === 3 ? p[0] : '', precio_m: p.length === 3 ? p[1] : '', precio_l: p.length === 3 ? p[2] : '',
    sin_tacc: /class="sintacc"/.test(m[2]), foto: '', activo: true,
  };
  if (descripciones) {
    const ds = [...descripciones.matchAll(/<span class="desc[^"]*"([^>]*)>([\s\S]*?)<\/span>/g)];
    for (const l of ['es', 'en', 'fr', 'pt']) {
      const partes = ds.map((d) => traducir(d[2], clave(d[1]), l));
      it.descripcion[l] = partes.some((x) => !x) ? '' : partes.join('\n');
    }
  }
  (subgrupo ? subgrupo.items : cat.hijos).push(it);
};

for (let m; (m = RE.exec(main));) {
  if (m[1] !== undefined) {
    sec = { id: unico('s_' + slug(m[1])), nombre: nombres(m[1]), activo: true, categorias: [] };
    arbol.secciones.push(sec);
  } else if (m[2] !== undefined || m[3] !== undefined || /^<section/.test(m[0])) {
    const aria = (/aria-label="([^"]+)"/.exec(m[3]) || [])[1];
    cat = { id: '', nombre: { es: '', en: '', fr: '', pt: '' }, activo: true, formato: 'uno', estilo: 'filas', marca: !!m[2], rotulos: ['', '', ''], hijos: [], _aria: aria };
    subgrupo = null;
    sec.categorias.push(cat);
  } else if (m[5] !== undefined) {
    cat.nombre = nombres(m[5], clave(m[4]));
  } else if (m[6] !== undefined) {
    subgrupo = { tipo: 'subgrupo', id: unico('g_' + slug(cat.nombre.es) + '_' + slug(m[6])), nombre: nombres(m[6]), activo: true, items: [] };
    cat.hijos.push(subgrupo);
  } else if (m[8] !== undefined) {
    const rot = [...m[8].matchAll(/<span>([\s\S]*?)<\/span>/g)].map((x) => plano(x[1])).slice(1);
    cat.rotulos = [rot[0] || '', rot[1] || '', rot[2] || ''];
  } else if (m[11] !== undefined) {
    nuevoItem(m[10], m[11]);
  } else if (m[12] !== undefined) {
    cat.estilo = 'detalle';
    nuevoItem(m[12], m[13], m[14]);
  } else if (m[15] !== undefined) {
    cat.estilo = 'puntos';
    nuevoItem(m[15], m[16]);
  }
}
// Ids de categoría: del título (o, sin título, del aria-label); y se quitan los campos auxiliares.
arbol.secciones.forEach((s) => s.categorias.forEach((c) => {
  c.id = unico('c_' + slug(c.nombre.es || c._aria || s.nombre.es));
  delete c._aria;
}));

const v = validarArbol(arbol);
if (v.error) throw new Error('La semilla no valida: ' + v.error);

const SLUGS_FOTO = ('espresso doppio macchiato americano capuccino flat_white latte lagrima coffee_chai organic_mocca iced_latte '
  + 'espresso_tonic affogato orange_coffe caramel_macchiato leche_almendras leche_avena extra_shot matcha_latte golden_milk chai_latte '
  + 'matcha_orange jugo_naranja limonada_clasica limonada_frutos_rojos limonada_hibiscus agua_gas bromelia irupe palta_toast toast_forest '
  + 'chipa_setas chipa_tomates handroll_verdura handroll_bondiola florentinos bocadito_almendra mini_alfajor_pistacho mini_alfajor_avellanas '
  + 'macaron datil_relleno medialunas pain_au_chocolat chipa budin_frutos_rojos cookie_mani_chocolate cookie_frutos_rojos alfajor_pistacho '
  + 'alfajor_avellanas brownie_chocolate').split(' ');

// Autochequeo del parser contra la carta impresa transcripta.
const assert = require('assert');
const items = {};
v.arbol.secciones.forEach((s) => s.categorias.forEach((c) => c.hijos.forEach((h) => {
  (h.tipo === 'subgrupo' ? h.items : [h]).forEach((it) => { items[it.id] = { it, c }; });
})));
assert.strictEqual(contarItems(v.arbol), 52, 'la carta tiene 52 renglones (50 con foto + 2 de Take Away)');
assert.deepStrictEqual(SLUGS_FOTO.filter((s) => !items[s]), [], 'faltan slugs');
assert.strictEqual(SLUGS_FOTO.length, 50);
assert.deepStrictEqual(v.arbol.secciones.map((s) => s.nombre.es), ['Coffee Menu', 'Non - Coffee', 'Brunch', 'Sweet Bites · Bakery · Patisserie']);
const p = (id) => { const x = items[id].it; return items[id].c.formato === 'tres' ? [x.precio_s, x.precio_m, x.precio_l].join('/') : x.precio; };
assert.strictEqual(p('espresso'), '5700/-/-');
assert.strictEqual(p('americano'), '5700/6300/-');
assert.strictEqual(p('lagrima'), '-/5900/6400');
assert.strictEqual(p('affogato'), '8700');
assert.strictEqual(p('toast_forest'), '18500');
assert.strictEqual(p('brownie_chocolate'), '8200');
assert.strictEqual(p('take_away_medium'), '7200');
assert.strictEqual(items.toast_forest.it.nombre.es, 'TOAST FOREST (SIN TACC)');
assert.strictEqual(items.toast_forest.it.nombre.en, 'FOREST TOAST (GLUTEN-FREE)');
assert.strictEqual(items.budin_frutos_rojos.it.sin_tacc, true);
assert.strictEqual(items.bromelia.it.nombre.pt, 'BROMELIA · INSPIRADO NA AMÉRICA CENTRAL');
assert.strictEqual(items.palta_toast.it.descripcion.es.split('\n').length, 2);
assert.strictEqual(items.orange_coffe.it.nombre.es, 'ORANGE COFFE', 'las erratas del impreso se conservan');
assert.strictEqual(items.leche_avena.it.nombre.fr, 'LAIT D\'AVOINE');
assert.deepStrictEqual(v.arbol.secciones[0].categorias.map((c) => [c.nombre.es, c.formato, c.estilo, c.marca]), [
  ['The Classics', 'tres', 'filas', true], ['The Specials', 'uno', 'filas', true], ['Adicionales', 'uno', 'filas', false], ['Take Away', 'uno', 'filas', false],
]);
assert.deepStrictEqual(v.arbol.secciones[0].categorias[0].rotulos, ['Small', 'Medium', 'Large']);
assert.deepStrictEqual(v.arbol.secciones[0].categorias[1].rotulos, ['Medium', '', '']);
assert.deepStrictEqual(v.arbol.secciones[0].categorias[1].hijos.map((h) => h.tipo), ['subgrupo', 'subgrupo']);

fs.writeFileSync(path.join(RAIZ, 'public', 'carta-semilla.json'), JSON.stringify(v.arbol, null, 1) + '\n');
console.log('carta-semilla.json: ok (' + contarItems(v.arbol) + ' renglones)');
