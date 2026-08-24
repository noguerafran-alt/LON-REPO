/* ============================================================
 *  ticketCierre.js
 *  Parser del ticket de cierre del POS del local.
 *
 *  Corre en el servidor (require) y en el navegador (script src).
 *
 *  Cómo se detecta una categoría (las que en el papel van en negrita):
 *  no se usa el aspecto, el OCR no lo ve. Se usa que los productos de
 *  una categoría SUMAN el monto de esa categoría.
 * ============================================================ */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.TicketCierre = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REGEX_PALABRA_TOTAL = /[t7i1][o0qc][t7i1][a4@][li1|!]/i;
  const MAX_PRODUCTOS_POR_CATEGORIA = 15;
  const MAX_CATEGORIAS = 40;

  function parseMontoOcr(bruto) {
    const limpio = String(bruto).replace(/\s/g, '').replace(/[^\d.,]/g, '').replace(/[.,]+$/, '');
    if (!/\d/.test(limpio)) return 0;

    const ultimoSeparador = Math.max(limpio.lastIndexOf('.'), limpio.lastIndexOf(','));
    const soloDigitos = limpio.replace(/[.,]/g, '');
    if (ultimoSeparador === -1) return Math.round(Number(soloDigitos)) || 0;

    const decimales = limpio.length - ultimoSeparador - 1;
    if (decimales === 1 || decimales === 2) {
      const entero = limpio.slice(0, ultimoSeparador).replace(/[.,]/g, '');
      return Math.round(Number(entero + '.' + limpio.slice(ultimoSeparador + 1))) || 0;
    }
    return Math.round(Number(soloDigitos)) || 0;
  }

  function mayorMontoDeTexto(texto) {
    let mayor = null;
    for (const bruto of String(texto).match(/\d[\d.,\s]*\d|\d/g) || []) {
      const monto = parseMontoOcr(bruto);
      if (monto <= 0) continue;
      if (mayor === null || monto > mayor) mayor = monto;
    }
    return mayor;
  }

  function buscarTotalEnTicket(texto) {
    const lineas = String(texto || '').split(/\r?\n/);
    let mejorFuerte = null;
    let mejorSimple = null;

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      if (!REGEX_PALABRA_TOTAL.test(linea)) continue;
      if (/(cantidad|unidades|items|art[iI]culos|iva|descuento|anulad)/i.test(linea)) continue;

      let monto = mayorMontoDeTexto(linea);
      if (monto === null) monto = mayorMontoDeTexto(lineas[i + 1] || '');
      if (monto === null) continue;

      const esFuerte = /(vendido|general|del d[iI]a|venta)/i.test(linea);
      if (esFuerte && (mejorFuerte === null || monto > mejorFuerte)) mejorFuerte = monto;
      if (mejorSimple === null || monto > mejorSimple) mejorSimple = monto;
    }
    return mejorFuerte !== null ? mejorFuerte : mejorSimple;
  }

  function montosCandidatosDelTicket(texto, yaElegido) {
    const vistos = new Map();
    for (const linea of String(texto || '').split(/\r?\n/)) {
      for (const bruto of linea.match(/\d[\d.,\s]*\d|\d/g) || []) {
        const monto = parseMontoOcr(bruto);
        if (monto < 1000) continue;
        if (monto === yaElegido) continue;
        if (!vistos.has(monto)) vistos.set(monto, linea.trim());
      }
    }
    return [...vistos.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, 8)
      .map(([monto, linea]) => ({ monto, linea }));
  }

  function extraerMontosDeLinea(linea) {
    const re = /([$Ss5]\s*)?(-?\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d{2})?|-?\d{4,}(?:[.,]\d{2})?)/g;
    const found = [];
    let m;
    while ((m = re.exec(String(linea)))) {
      const monto = parseMontoOcr(m[2]) * (/-/.test(m[2]) ? -1 : 1);
      if (monto === 0) continue;
      found.push({ monto, index: m.index, end: m.index + m[0].length });
    }
    return found;
  }

  function extraerItemDeLinea(linea) {
    if (!linea) return null;
    const cruda = String(linea).replace(/\u00a0/g, ' ');
    const corteTotal = cruda.search(/total\s+vendido/i);
    const usable = corteTotal > 0 ? cruda.slice(0, corteTotal) : cruda;
    if (corteTotal === 0) return null;
    if (REGEX_PALABRA_TOTAL.test(usable) && /vendido/i.test(usable)) return null;

    const montos = extraerMontosDeLinea(usable);
    if (!montos.length) return null;
    const usado = montos[0];
    const izquierda = usable.slice(0, usado.index).trimEnd();
    const mCabeza = izquierda.match(/^(\s*)(\d{1,4})\s+(.+?)\s*$/);
    if (!mCabeza) return null;
    let nombre = mCabeza[3].replace(/[\s.|·$]+$/g, '').replace(/\s+/g, ' ').trim();
    nombre = nombre.replace(/\s*[$Ss5]\s*-?\d[\d.,]*$/g, '').trim();
    if (!nombre || nombre.length < 2) return null;
    if (REGEX_PALABRA_TOTAL.test(nombre)) return null;
    if (/[$]/.test(nombre)) return null;
    if (/^(otros|retiros|depositos|dep[oó]sitos|cobros)/i.test(nombre)) return null;
    return { sangria: mCabeza[1].length, cantidad: Number(mCabeza[2]), nombre, monto: usado.monto };
  }

  function renglonesConMontoDelDetalle(texto) {
    const todas = String(texto || '').split(/\r?\n/);
    let desde = 0;
    let hasta = todas.length;

    for (let i = 0; i < todas.length; i++) {
      if (/detalle\s+de\s+productos/i.test(todas[i])) desde = i + 1;
      else if (i > desde && /(otros\s+movimientos|retiros)/i.test(todas[i])) { hasta = i; break; }
      else if (i > desde && /^\s*total\s+vendido/i.test(todas[i])) { hasta = i; break; }
    }

    const items = [];
    const recorte = todas.slice(desde, hasta);
    for (let i = 0; i < recorte.length; i++) {
      let linea = recorte[i];
      const idxTotal = linea.search(/total\s+vendido/i);
      if (idxTotal === 0) break;
      if (idxTotal > 0) linea = linea.slice(0, idxTotal);

      let item = extraerItemDeLinea(linea);
      if (!item) {
        const cabeza = linea.match(/^(\s*)(\d{1,4})\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9/].+?)\s*$/);
        const cola = extraerItemDeLinea('1 X $ ' + String(recorte[i + 1] || '').trim());
        if (cabeza && cola && cola.monto) {
          const nombre = cabeza[3].replace(/[\s.|$]+$/, '').trim();
          if (nombre && !REGEX_PALABRA_TOTAL.test(nombre) && !/[$]/.test(nombre)) {
            item = { sangria: cabeza[1].length, cantidad: Number(cabeza[2]), nombre, monto: cola.monto };
            i += 1;
          }
        }
      }
      if (item) items.push(item);
      if (idxTotal > 0) break;
    }
    return items;
  }

  function cuantosProductosCierran(items, i) {
    const objetivo = items[i].monto;
    if (objetivo <= 0) return 0;
    let suma = 0;
    const tope = Math.min(items.length - 1, i + MAX_PRODUCTOS_POR_CATEGORIA);
    for (let k = i + 1; k <= tope; k++) {
      suma += items[k].monto;
      if (suma === objetivo) return k - i;
      if (suma > objetivo) return 0;
    }
    return 0;
  }

  function pareceEncabezadoCategoria(item) {
    const letras = item.nombre.replace(/[^A-Za-z\u00C0-\u017F]/g, '');
    if (letras.length < 3) return false;
    const minusculas = letras.length - letras.replace(/[a-z\u00E0-\u00FF]/g, '').length;
    return minusculas <= 1 && item.sangria <= 2;
  }

  function extraerCategoriasDelTicket(texto) {
    const items = renglonesConMontoDelDetalle(texto);
    if (!items.length) return [];
    const total = buscarTotalEnTicket(texto);

    const categorias = [];
    let i = 0;
    while (i < items.length) {
      const actual = items[i];
      if (total && (actual.monto === total || actual.monto > total)) {
        i += 1;
        continue;
      }
      const cierre = cuantosProductosCierran(items, i);

      if (cierre > 0) {
        categorias.push({
          nombre: actual.nombre,
          cantidad: actual.cantidad,
          monto: actual.monto,
          productos: cierre,
        });
        i += cierre + 1;
        continue;
      }
      if (pareceEncabezadoCategoria(actual)) {
        categorias.push({
          nombre: actual.nombre,
          cantidad: actual.cantidad,
          monto: actual.monto,
          productos: 0,
        });
      }
      i += 1;
    }
    return filtrarCategorias(categorias, total);
  }

  function sumaCategorias(categorias) {
    return (categorias || []).reduce((acc, cat) => acc + (Number(cat.monto) || 0), 0);
  }

  function categoriasCierranConProductos(categorias) {
    const lista = categorias || [];
    if (lista.length < 2) return false;
    return lista.every((cat) => cat.monto <= 0 || (Number(cat.productos) || 0) > 0);
  }

  function sanitizarCategorias(crudo) {
    if (!Array.isArray(crudo)) return [];
    const limpio = [];
    for (const item of crudo.slice(0, MAX_CATEGORIAS)) {
      if (!item || typeof item !== 'object') continue;
      const crudoNombre = String(item.nombre || '');
      if (/[$]/.test(crudoNombre)) continue;
      let nombre = crudoNombre.replace(/\s+/g, ' ').trim();
      nombre = nombre.replace(/[\s.|·]+$/g, '').trim().slice(0, 80);
      const monto = Math.round(Number(item.monto));
      const cantidad = Math.round(Number(item.cantidad));
      if (!nombre || !Number.isFinite(monto) || monto === 0) continue;
      if (/[$]/.test(nombre)) continue;
      if (REGEX_PALABRA_TOTAL.test(nombre)) continue;
      limpio.push({
        nombre,
        monto,
        cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
        productos: Math.max(0, Math.round(Number(item.productos) || 0)),
      });
    }
    return limpio;
  }

  function filtrarCategorias(cats, total) {
    const t = Number(total);
    const hayTotal = Number.isFinite(t) && t > 0;
    return sanitizarCategorias(cats).filter((c) => {
      if (hayTotal && (c.monto === t || c.monto > t)) return false;
      return true;
    });
  }

  function textoCategoriasParaHoja(categorias) {
    return sanitizarCategorias(categorias)
      .map((cat) => cat.cantidad + ' ' + cat.nombre + ' $' + cat.monto.toLocaleString('es-AR'))
      .join(' | ');
  }

  function puntuarInterpretacion(lectura) {
    if (!lectura) return -1;
    const total = lectura.totalVendido === null || lectura.totalVendido === undefined
      ? null
      : Number(lectura.totalVendido);
    const cats = filtrarCategorias(lectura.categorias || [], total);
    const suma = sumaCategorias(cats);
    let puntaje = cats.length * 10;
    puntaje += cats.filter((c) => (c.productos || 0) > 0).length * 5;
    if (cats.some((c) => /[$]/.test(c.nombre))) puntaje -= 50;
    if (cats.length >= 2 && total !== null && suma === total) puntaje += 100;
    if (categoriasCierranConProductos(cats)) puntaje += 15;
    return puntaje;
  }

  function elegirMejorLectura(lecturas) {
    if (!lecturas || !lecturas.length) return { texto: '', total: null, categorias: [] };
    let mejor = lecturas[0];
    let mejorPuntaje = -1;
    for (const lectura of lecturas) {
      const puntaje = puntuarInterpretacion({
        categorias: lectura.categorias,
        totalVendido: lectura.total !== undefined ? lectura.total : lectura.totalVendido,
      }) + (String(lectura.texto || '').length > 80 ? 1 : 0);
      if (puntaje > mejorPuntaje) {
        mejorPuntaje = puntaje;
        mejor = lectura;
      }
    }
    return mejor;
  }

  return {
    REGEX_PALABRA_TOTAL,
    parseMontoOcr,
    mayorMontoDeTexto,
    buscarTotalEnTicket,
    montosCandidatosDelTicket,
    extraerCategoriasDelTicket,
    sumaCategorias,
    categoriasCierranConProductos,
    sanitizarCategorias,
    filtrarCategorias,
    textoCategoriasParaHoja,
    puntuarInterpretacion,
    elegirMejorLectura,
  };
});
