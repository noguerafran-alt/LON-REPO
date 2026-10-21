/* Estilo editable de los textos de la landing (Admin › Contenido), mismo modelo
   que PROA (footer.js / PROAFuente). Cada bloque de texto tiene, opcionales:
     <clave>_fuente     → font-family (de la lista del admin); vacío = la de la página
     <clave>_alineacion → left|center|right|justify; vacío = la de siempre
     <clave>_tamano     → px (6–120); vacío = el de siempre
     <clave>_estilo     → normal|bold|italic|bolditalic; vacío = el de siempre
     <clave>_mayusculas → uppercase|lowercase|capitalize; vacío = tal cual se escribe
     <clave>_interlineado → line-height, número sin unidad (1–3); vacío = el del CSS
     <clave>_espaciado  → letter-spacing en em (-0.05–0.5); vacío = el del CSS
   Sin control de color a propósito (decisión del dueño).
   Todo se valida con lista blanca y se escribe en un único <style> propio con
   !important, para ganarle a los clamp()/media queries de la página. Nunca se
   reescribe el dato guardado: se corrige al renderizar. */
(function () {
  'use strict';

  /* Un valor de fuente con comillas rotas (ej. «Fraunces', Georgia, serif») es CSS
     inválido: dentro de var(--x) deja la propiedad inválida y el navegador cae a
     Times. Se re-arma la lista: cada familia sin comillas sueltas y re-entrecomillada
     salvo las genéricas. Si no queda una lista válida → '' (default de la página). */
  var GENERICAS = {
    'serif': 1, 'sans-serif': 1, 'monospace': 1, 'cursive': 1, 'fantasy': 1,
    'system-ui': 1, 'ui-serif': 1, 'ui-sans-serif': 1, 'ui-monospace': 1,
    'ui-rounded': 1, 'math': 1, 'emoji': 1, 'fangsong': 1,
    '-apple-system': 1, 'blinkmacsystemfont': 1,
  };
  function sanitizarFuente(valor) {
    var v = String(valor == null ? '' : valor).trim();
    if (!v) return '';
    var familias = v.split(',').map(function (f) {
      return f.trim().replace(/^["'\s]+|["'\s]+$/g, '');
    }).filter(Boolean);
    if (!familias.length) return '';
    for (var i = 0; i < familias.length; i++) {
      if (/["';{}()<>\\]/.test(familias[i])) return '';
      if (!GENERICAS[familias[i].toLowerCase()]) familias[i] = "'" + familias[i] + "'";
    }
    var css = familias.join(', ');
    if (window.CSS && typeof CSS.supports === 'function' && !CSS.supports('font-family', css)) return '';
    return css;
  }

  var ALINEACIONES = { left: 1, center: 1, right: 1, justify: 1 };
  function sanitizarAlineacion(valor) {
    var v = String(valor == null ? '' : valor).trim().toLowerCase();
    return ALINEACIONES[v] ? v : '';
  }

  var TAM_MIN = 6, TAM_MAX = 120;
  function sanitizarTamano(valor) {
    var m = /^(\d+(?:\.\d+)?)\s*(?:px)?$/.exec(String(valor == null ? '' : valor).trim().toLowerCase().replace(',', '.'));
    if (!m) return null;
    return Math.min(TAM_MAX, Math.max(TAM_MIN, parseFloat(m[1])));
  }

  var ESTILOS = {
    normal: 'font-weight: 400 !important; font-style: normal !important;',
    bold: 'font-weight: 700 !important;',
    italic: 'font-style: italic !important;',
    bolditalic: 'font-weight: 700 !important; font-style: italic !important;',
  };
  function sanitizarEstilo(valor) {
    var v = String(valor == null ? '' : valor).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(ESTILOS, v) ? v : '';
  }

  var MAYUSCULAS = { uppercase: 1, lowercase: 1, capitalize: 1 };
  function sanitizarMayusculas(valor) {
    var v = String(valor == null ? '' : valor).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(MAYUSCULAS, v) ? v : '';
  }

  /* Número dentro de [min, max] o null: fuera de rango se ignora (no se recorta),
     para que un 15 de interlineado no quede como un 3 que nadie pidió. */
  function sanitizarRango(valor, min, max) {
    var m = /^(-?\d+(?:\.\d+)?)$/.exec(String(valor == null ? '' : valor).trim().replace(',', '.'));
    if (!m) return null;
    var n = parseFloat(m[1]);
    return n >= min && n <= max ? n : null;
  }
  function sanitizarInterlineado(valor) { return sanitizarRango(valor, 1, 3); }
  function sanitizarEspaciado(valor) { return sanitizarRango(valor, -0.05, 0.5); }

  var hoja = null;
  function escribirReglas(reglas) {
    if (!hoja) {
      hoja = document.createElement('style');
      hoja.setAttribute('data-lon-contenido', '');
      document.head.appendChild(hoja);
    }
    hoja.textContent = reglas.join('\n');
  }

  /* bloques = { clave: 'selector CSS' }; variables = { clave: '--var-css' } */
  function aplicar(contenido, bloques, variables) {
    if (!contenido || typeof contenido !== 'object') return;
    Object.keys(variables || {}).forEach(function (clave) {
      var f = sanitizarFuente(contenido[clave]);
      if (f) document.documentElement.style.setProperty(variables[clave], f);
      else document.documentElement.style.removeProperty(variables[clave]);
    });
    var reglas = [];
    Object.keys(bloques || {}).forEach(function (clave) {
      var sel = bloques[clave];
      var decl = '';
      var f = sanitizarFuente(contenido[clave + '_fuente']);
      if (f) decl += 'font-family: ' + f + ' !important; ';
      var a = sanitizarAlineacion(contenido[clave + '_alineacion']);
      if (a) decl += 'text-align: ' + a + ' !important; ';
      var t = sanitizarTamano(contenido[clave + '_tamano']);
      if (t != null) decl += 'font-size: ' + t + 'px !important; ';
      var e = sanitizarEstilo(contenido[clave + '_estilo']);
      if (e) decl += ESTILOS[e];
      var m = sanitizarMayusculas(contenido[clave + '_mayusculas']);
      if (m) decl += 'text-transform: ' + m + ' !important; ';
      var li = sanitizarInterlineado(contenido[clave + '_interlineado']);
      if (li != null) decl += 'line-height: ' + li + ' !important; ';
      var es = sanitizarEspaciado(contenido[clave + '_espaciado']);
      if (es != null) decl += 'letter-spacing: ' + es + 'em !important; ';
      if (decl) reglas.push(sel + ' { ' + decl + '}');
    });
    escribirReglas(reglas);
  }

  window.LONContenido = {
    sanitizarFuente: sanitizarFuente,
    sanitizarAlineacion: sanitizarAlineacion,
    sanitizarTamano: sanitizarTamano,
    sanitizarEstilo: sanitizarEstilo,
    sanitizarMayusculas: sanitizarMayusculas,
    sanitizarInterlineado: sanitizarInterlineado,
    sanitizarEspaciado: sanitizarEspaciado,
    aplicar: aplicar,
  };
})();
