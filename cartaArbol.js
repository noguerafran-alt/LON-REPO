/* ============================================================
 *  cartaArbol.js — logica PURA de la carta del cafe (sin red ni Sheets).
 *  Valida el arbol que manda el editor, lo pasa a filas de la hoja Carta
 *  (y de vuelta) y poda lo inactivo para la carta publica.
 *  Autochequeo: `node cartaArbol.js`.
 *
 *  Arbol: { secciones: [ { id, nombre, activo, categorias: [ { id, nombre, activo,
 *    formato: 'uno'|'tres', estilo: 'filas'|'puntos'|'detalle', marca, rotulos: [3],
 *    hijos: [ item | { tipo:'subgrupo', id, nombre, activo, items: [item] } ] } ] } ] }
 *  item: { tipo:'item', id, nombre, descripcion, precio, precio_s, precio_m, precio_l,
 *    sin_tacc, foto, activo }; nombre/descripcion son { es, en, fr, pt }.
 *  El orden es la posicion en cada array: la columna `orden` se deriva al guardar.
 * ============================================================ */
const { COLUMNAS_CARTA: C } = require('./config');

const IDIOMAS = ['es', 'en', 'fr', 'pt'];
const FORMATOS = ['uno', 'tres'];
const ESTILOS = ['filas', 'puntos', 'detalle'];
const LIM = { elementos: 400, nombre: 120, descripcion: 600, rotulo: 20, foto: 300 };
const ANCHO = Object.keys(C).length;
const ENCABEZADOS = Object.keys(C).sort((a, b) => C[a] - C[b]);

class ErrorCarta extends Error {}
const fallar = (mensaje) => { throw new ErrorCarta(mensaje); };

const esObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);
const limpiar = (v) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();

function textos(v, max, ref, { obligatorioEs, campo }) {
  const entrada = v == null ? {} : v;
  if (!esObjeto(entrada)) fallar(`${campo} de ${ref}: formato inválido.`);
  const salida = {};
  for (const i of IDIOMAS) {
    if (entrada[i] != null && typeof entrada[i] !== 'string') fallar(`${campo} (${i}) de ${ref}: tiene que ser texto.`);
    salida[i] = limpiar(entrada[i]);
    if (salida[i].length > max) fallar(`${campo} (${i}) de ${ref} supera los ${max} caracteres.`);
  }
  if (obligatorioEs && !salida.es) fallar(`Falta el ${campo.toLowerCase()} en español de ${ref}.`);
  return salida;
}

function precioValido(v, ref) {
  const s = limpiar(v);
  if (s === '-') return s;
  if (/^\d{1,7}$/.test(s)) return String(Number(s));
  return fallar(`Precio inválido en «${ref}»: usá un número entero (sin $ ni puntos) o «-» si no se vende.`);
}

function fotoValida(v, ref) {
  const s = limpiar(v);
  if (!s) return '';
  if (s.length > LIM.foto || !/^(\/uploads\/[\w\-./]+|https:\/\/[^\s"'<>]+)$/.test(s) || s.includes('..')) {
    fallar(`La foto de «${ref}» tiene que ser una imagen subida desde el editor o un link https.`);
  }
  return s;
}

const activoDe = (v) => v !== false && v !== 'NO';

function normalizar(entrada) {
  if (!esObjeto(entrada) || !Array.isArray(entrada.secciones)) fallar('Mandá { arbol: { secciones: [...] } }.');
  const ids = new Set();
  let total = 0;
  const registrar = (id, ref) => {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,60}$/.test(id)) fallar(`Id inválido en «${ref}».`);
    if (ids.has(id)) fallar(`Id repetido: «${id}».`);
    ids.add(id);
    if (++total > LIM.elementos) fallar(`La carta no puede tener más de ${LIM.elementos} elementos.`);
  };
  const lista = (v, ref) => (Array.isArray(v) ? v : fallar(`${ref}: tiene que ser una lista.`));

  function item(it, formato, padreRef) {
    if (!esObjeto(it) || it.tipo !== 'item') fallar(`En «${padreRef}» hay un elemento que no es un producto.`);
    const nombre = textos(it.nombre, LIM.nombre, 'un producto', { obligatorioEs: true, campo: 'Nombre' });
    const ref = nombre.es;
    registrar(it.id, ref);
    const o = {
      tipo: 'item', id: it.id, nombre,
      descripcion: textos(it.descripcion, LIM.descripcion, ref, { campo: 'Descripción' }),
      precio: '', precio_s: '', precio_m: '', precio_l: '',
      sin_tacc: it.sin_tacc === true, foto: fotoValida(it.foto, ref), activo: activoDe(it.activo),
    };
    if (formato === 'uno') o.precio = precioValido(it.precio, ref);
    else { o.precio_s = precioValido(it.precio_s, ref); o.precio_m = precioValido(it.precio_m, ref); o.precio_l = precioValido(it.precio_l, ref); }
    return o;
  }

  const secciones = lista(entrada.secciones, 'secciones').map((s) => {
    if (!esObjeto(s)) fallar('Una sección tiene formato inválido.');
    const nombre = textos(s.nombre, LIM.nombre, 'una sección', { obligatorioEs: true, campo: 'Nombre' });
    registrar(s.id, nombre.es);
    const categorias = lista(s.categorias, `Categorías de «${nombre.es}»`).map((c) => {
      if (!esObjeto(c)) fallar(`Una categoría de «${nombre.es}» tiene formato inválido.`);
      const cn = textos(c.nombre, LIM.nombre, 'una categoría', { campo: 'Nombre' });
      const cref = cn.es || `(sin título en ${nombre.es})`;
      registrar(c.id, cref);
      if (!FORMATOS.includes(c.formato)) fallar(`Formato de precio inválido en «${cref}».`);
      if (c.formato === 'uno' && !ESTILOS.includes(c.estilo)) fallar(`Estilo inválido en «${cref}».`);
      const rotulos = Array.isArray(c.rotulos) ? c.rotulos : [];
      const rot = [0, 1, 2].map((i) => {
        const r = limpiar(rotulos[i]);
        if (r.length > LIM.rotulo) fallar(`Un rótulo de «${cref}» supera los ${LIM.rotulo} caracteres.`);
        return r;
      });
      if (c.formato === 'tres' && rot.some((r) => !r)) fallar(`Los tres rótulos de «${cref}» (ej. Small, Medium, Large) son obligatorios.`);
      const hijos = lista(c.hijos, `Contenido de «${cref}»`).map((h) => {
        if (esObjeto(h) && h.tipo === 'subgrupo') {
          const gn = textos(h.nombre, LIM.nombre, 'un subgrupo', { obligatorioEs: true, campo: 'Nombre' });
          registrar(h.id, gn.es);
          return {
            tipo: 'subgrupo', id: h.id, nombre: gn, activo: activoDe(h.activo),
            items: lista(h.items, `Productos de «${gn.es}»`).map((it) => item(it, c.formato, gn.es)),
          };
        }
        return item(h, c.formato, cref);
      });
      return {
        id: c.id, nombre: cn, activo: activoDe(c.activo), formato: c.formato,
        estilo: c.formato === 'uno' ? c.estilo : 'filas', marca: c.marca === true,
        rotulos: rot, hijos,
      };
    });
    return { id: s.id, nombre, activo: activoDe(s.activo), categorias };
  });
  // Una carta vacia se confundiria con la hoja sin sembrar y se volveria a sembrar sola.
  if (!secciones.length) fallar('La carta tiene que tener al menos una sección.');
  return { secciones };
}

function validarArbol(entrada) {
  try { return { arbol: normalizar(entrada) }; } catch (e) {
    if (e instanceof ErrorCarta) return { error: e.message };
    throw e;
  }
}

/* ---------- arbol <-> filas de la hoja ---------- */
const SI_NO = (b) => (b ? 'SI' : 'NO');

function filasDeArbol(arbol) {
  const filas = [];
  const poner = (datos) => {
    const f = new Array(ANCHO).fill('');
    for (const [k, v] of Object.entries(datos)) f[C[k]] = v;
    filas.push(f);
  };
  const nombres = (n, d) => ({
    nombre_es: n.es, nombre_en: n.en, nombre_fr: n.fr, nombre_pt: n.pt,
    ...(d ? { descripcion_es: d.es, descripcion_en: d.en, descripcion_fr: d.fr, descripcion_pt: d.pt } : {}),
  });
  const poneItem = (it, padre, orden) => poner({
    tipo: 'item', id: it.id, padre, orden, ...nombres(it.nombre, it.descripcion),
    precio: it.precio, precio_s: it.precio_s, precio_m: it.precio_m, precio_l: it.precio_l,
    sin_tacc: it.sin_tacc ? 'SI' : '', foto: it.foto, activo: SI_NO(it.activo),
  });
  arbol.secciones.forEach((s, i) => {
    poner({ tipo: 'seccion', id: s.id, orden: i, ...nombres(s.nombre), activo: SI_NO(s.activo) });
    s.categorias.forEach((c, j) => {
      poner({
        tipo: 'categoria', id: c.id, padre: s.id, orden: j, ...nombres(c.nombre),
        formato: c.formato, estilo: c.estilo, marca: c.marca ? 'SI' : '',
        rotulo_1: c.rotulos[0], rotulo_2: c.rotulos[1], rotulo_3: c.rotulos[2], activo: SI_NO(c.activo),
      });
      c.hijos.forEach((h, k) => {
        if (h.tipo === 'subgrupo') {
          poner({ tipo: 'subgrupo', id: h.id, padre: c.id, orden: k, ...nombres(h.nombre), activo: SI_NO(h.activo) });
          h.items.forEach((it, m) => poneItem(it, h.id, m));
        } else poneItem(h, c.id, k);
      });
    });
  });
  return filas;
}

/* Tolerante: la hoja la puede tocar el dueño a mano. Lo huérfano o repetido se ignora. */
function arbolDeFilas(filas) {
  const objs = [];
  const vistos = new Set();
  for (const f of filas) {
    const o = {};
    for (const k of ENCABEZADOS) o[k] = String(f[C[k]] == null ? '' : f[C[k]]).trim();
    if (!o.id || vistos.has(o.id)) continue;
    vistos.add(o.id);
    objs.push(o);
  }
  const hijosDe = (padre, tipos) => objs
    .filter((o) => o.padre === padre && tipos.includes(o.tipo))
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
  const nom = (o, p) => ({ es: o[p + '_es'], en: o[p + '_en'], fr: o[p + '_fr'], pt: o[p + '_pt'] });
  const act = (o) => o.activo.toUpperCase() !== 'NO';
  const item = (o) => ({
    tipo: 'item', id: o.id, nombre: nom(o, 'nombre'), descripcion: nom(o, 'descripcion'),
    precio: o.precio, precio_s: o.precio_s, precio_m: o.precio_m, precio_l: o.precio_l,
    sin_tacc: o.sin_tacc.toUpperCase() === 'SI', foto: o.foto, activo: act(o),
  });
  const secciones = objs.filter((o) => o.tipo === 'seccion')
    .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0))
    .map((s) => ({
      id: s.id, nombre: nom(s, 'nombre'), activo: act(s),
      categorias: hijosDe(s.id, ['categoria']).map((c) => ({
        id: c.id, nombre: nom(c, 'nombre'), activo: act(c),
        formato: c.formato === 'tres' ? 'tres' : 'uno',
        estilo: ESTILOS.includes(c.estilo) ? c.estilo : 'filas',
        marca: c.marca.toUpperCase() === 'SI',
        rotulos: [c.rotulo_1, c.rotulo_2, c.rotulo_3],
        hijos: hijosDe(c.id, ['item', 'subgrupo']).map((h) => (h.tipo === 'subgrupo'
          ? { tipo: 'subgrupo', id: h.id, nombre: nom(h, 'nombre'), activo: act(h), items: hijosDe(h.id, ['item']).map(item) }
          : item(h))),
      })),
    }));
  return { secciones };
}

/* Carta publica: solo lo activo, y sin cajas ni secciones que quedarían vacías. */
function soloActivo(arbol) {
  const secciones = [];
  for (const s of arbol.secciones) {
    if (!s.activo) continue;
    const categorias = [];
    for (const c of s.categorias) {
      if (!c.activo) continue;
      const hijos = [];
      for (const h of c.hijos) {
        if (!h.activo) continue;
        if (h.tipo === 'subgrupo') {
          const items = h.items.filter((it) => it.activo);
          if (items.length) hijos.push({ ...h, items });
        } else hijos.push(h);
      }
      if (hijos.length) categorias.push({ ...c, hijos });
    }
    if (categorias.length) secciones.push({ ...s, categorias });
  }
  return { secciones };
}

/* Fotos que el dueño ya había cargado en la hoja Landing (carta_foto_<id>): solo completa vacías. */
function aplicarFotos(arbol, fotosPorId) {
  const poner = (it) => { if (!it.foto && fotosPorId[it.id]) it.foto = fotosPorId[it.id]; };
  arbol.secciones.forEach((s) => s.categorias.forEach((c) => c.hijos.forEach((h) => {
    if (h.tipo === 'subgrupo') h.items.forEach(poner); else poner(h);
  })));
  return arbol;
}

function contarItems(arbol) {
  let n = 0;
  arbol.secciones.forEach((s) => s.categorias.forEach((c) => c.hijos.forEach((h) => { n += h.tipo === 'subgrupo' ? h.items.length : 1; })));
  return n;
}

module.exports = { validarArbol, filasDeArbol, arbolDeFilas, soloActivo, aplicarFotos, contarItems, ENCABEZADOS, ANCHO, LIM };

if (require.main === module) {
  const assert = require('assert');
  const n = (es) => ({ es, en: '', fr: '', pt: '' });
  const it = (id, es, extra) => ({ tipo: 'item', id, nombre: n(es), descripcion: n(''), precio: '100', precio_s: '', precio_m: '', precio_l: '', sin_tacc: false, foto: '', activo: true, ...extra });
  const base = () => ({
    secciones: [{
      id: 's1', nombre: n('Café'), activo: true,
      categorias: [
        { id: 'c1', nombre: n('Clásicos'), activo: true, formato: 'tres', estilo: 'filas', marca: true, rotulos: ['Small', 'Medium', 'Large'], hijos: [it('i1', 'Espresso', { precio_s: '5700', precio_m: '-', precio_l: '-' })] },
        { id: 'c2', nombre: n(''), activo: true, formato: 'uno', estilo: 'puntos', marca: false, rotulos: ['', '', ''], hijos: [
          { tipo: 'subgrupo', id: 'g1', nombre: n('Hot'), activo: true, items: [it('i2', 'Chai', { sin_tacc: true, foto: '/uploads/landing/a.jpg' }), it('i3', 'Oculto', { activo: false })] },
          it('i4', 'Agua', { precio: '04900' }),
        ] },
        { id: 'c3', nombre: n('Vacía'), activo: true, formato: 'uno', estilo: 'filas', marca: false, rotulos: ['', '', ''], hijos: [] },
      ],
    }],
  });
  const ok = validarArbol(base());
  assert(ok.arbol, ok.error);
  assert.strictEqual(ok.arbol.secciones[0].categorias[1].hijos[1].precio, '4900');
  assert.strictEqual(ok.arbol.secciones[0].categorias[0].hijos[0].precio, '');

  // ida y vuelta por filas (9 filas de 25 columnas) sin perder nada
  const filas = filasDeArbol(ok.arbol);
  assert.strictEqual(filas.length, 9);
  assert(filas.every((f) => f.length === ANCHO));
  assert.deepStrictEqual(arbolDeFilas(filas), ok.arbol);
  // huérfanos y ids repetidos de una hoja tocada a mano se ignoran
  const rota = filas.concat([filas[3].slice(), filas[4].map((v, i) => (i === C.id ? 'zz' : i === C.padre ? 'noexiste' : v))]);
  assert.deepStrictEqual(arbolDeFilas(rota), ok.arbol);

  // poda pública: oculto afuera, categoría vacía afuera
  const pub = soloActivo(ok.arbol);
  assert.deepStrictEqual(pub.secciones[0].categorias.map((c) => c.id), ['c1', 'c2']);
  assert.strictEqual(pub.secciones[0].categorias[1].hijos[0].items.length, 1);
  assert.strictEqual(contarItems(ok.arbol), 4);

  const roto = (f) => { const a = base(); f(a); return validarArbol(a).error; };
  const cat0 = (a) => a.secciones[0].categorias[0];
  assert(roto((a) => { cat0(a).hijos[0].id = 'c1'; }), 'id repetido');
  assert(roto((a) => { cat0(a).hijos[0].id = 'Con Espacio'; }), 'id inválido');
  assert(/Precio inválido/.test(roto((a) => { cat0(a).hijos[0].precio_s = '5.700'; })));
  assert(/Precio inválido/.test(roto((a) => { cat0(a).hijos[0].precio_m = '-3'; })));
  assert(/Precio inválido/.test(roto((a) => { cat0(a).hijos[0].precio_l = ''; })));
  assert(/Precio inválido/.test(roto((a) => { a.secciones[0].categorias[1].hijos[1].precio = 'gratis'; })));
  assert(/supera/.test(roto((a) => { cat0(a).hijos[0].nombre.es = 'x'.repeat(121); })));
  assert(/supera/.test(roto((a) => { cat0(a).hijos[0].descripcion.en = 'x'.repeat(601); })));
  assert(/Falta el nombre/.test(roto((a) => { cat0(a).hijos[0].nombre.es = '  '; })));
  assert(/Formato/.test(roto((a) => { cat0(a).formato = 'dos'; })));
  assert(/Estilo/.test(roto((a) => { a.secciones[0].categorias[1].estilo = 'x'; })));
  assert(/rótulos/.test(roto((a) => { cat0(a).rotulos[2] = ''; })));
  assert(/foto/.test(roto((a) => { cat0(a).hijos[0].foto = 'javascript:alert(1)'; })));
  assert(/no es un producto/.test(roto((a) => { cat0(a).hijos[0].tipo = 'categoria'; })));
  assert(/más de/.test(roto((a) => { for (let i = 0; i < 400; i++) cat0(a).hijos.push(it('x' + i, 'P' + i, { precio_s: '1', precio_m: '1', precio_l: '1' })); })));
  assert(validarArbol(null).error && validarArbol({ secciones: 'x' }).error);
  assert(/al menos una/.test(validarArbol({ secciones: [] }).error));

  // fotos migradas desde Landing: completa solo vacías
  const conFotos = aplicarFotos(validarArbol(base()).arbol, { i1: '/uploads/landing/e.jpg', i2: '/uploads/landing/otra.jpg' });
  assert.strictEqual(conFotos.secciones[0].categorias[0].hijos[0].foto, '/uploads/landing/e.jpg');
  assert.strictEqual(conFotos.secciones[0].categorias[1].hijos[0].items[0].foto, '/uploads/landing/a.jpg');
  console.log('cartaArbol: ok');
}
