/* Formato único de precios de /tienda. Los precios son SIEMPRE pesos argentinos;
   en EN/FR/PT se muestran convertidos a US$ solo para mirar (el cobro lo
   calcula el servidor en pesos). Sin cotización válida, siempre pesos.
   Autochequeo: node public/precio-lon.js */
(function (raiz) {
  var LOCALES = { es: 'es-AR', en: 'en-US', fr: 'fr-FR', pt: 'pt-BR' };

  function numero(n, locale, decimales) {
    // useGrouping 'always': es-AR por defecto no agrupa los de 4 cifras ("9500").
    return new Intl.NumberFormat(locale, {
      useGrouping: 'always', minimumFractionDigits: decimales, maximumFractionDigits: decimales
    }).format(n);
  }

  // idioma: es|en|fr|pt. venta: cotización blue (pesos por US$) o null.
  // US$ >= 10 se redondea hacia arriba al entero; menores de 10 hacia arriba al centavo.
  function formatear(pesos, idioma, venta) {
    var p = Number(pesos);
    if (!isFinite(p) || p < 0) p = 0;
    var v = Number(venta);
    if (idioma && idioma !== 'es' && LOCALES[idioma] && isFinite(v) && v > 0) {
      var usd = p / v;
      var chico = usd < 10;
      var redondeado = chico ? Math.ceil(usd * 100 - 1e-9) / 100 : Math.ceil(usd - 1e-9);
      return 'US$ ' + numero(redondeado, LOCALES[idioma], chico ? 2 : 0);
    }
    return '$ ' + numero(Math.round(p), LOCALES.es, 0);
  }

  var API = { formatear: formatear, locale: function (i) { return LOCALES[i] || LOCALES.es; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else raiz.LONPrecio = API;

  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    var a = require('assert');
    a.strictEqual(formatear(46000, 'es'), '$ 46.000');
    a.strictEqual(formatear(9500, 'es'), '$ 9.500');
    a.strictEqual(formatear(1234567, 'es', 1400), '$ 1.234.567');
    a.strictEqual(formatear(46000, 'en', 1400), 'US$ 33');
    a.strictEqual(formatear(46001, 'en', 1400), 'US$ 33');
    a.strictEqual(formatear(14000, 'en', 1400), 'US$ 10');
    a.strictEqual(formatear(14001, 'en', 1400), 'US$ 11');
    a.strictEqual(formatear(7000, 'en', 1400), 'US$ 5.00');
    a.strictEqual(formatear(7001, 'en', 1400), 'US$ 5.01');
    a.strictEqual(formatear(46000, 'pt', 1000), 'US$ 46');
    a.ok(/^US\$ 1[.\s  ]?234$/.test(formatear(1234000, 'fr', 1000)));
    a.strictEqual(formatear(46000, 'en', null), '$ 46.000');
    a.strictEqual(formatear(46000, 'en', 0), '$ 46.000');
    a.strictEqual(formatear(46000, 'fr', NaN), '$ 46.000');
    a.strictEqual(formatear(0, 'es'), '$ 0');
    a.strictEqual(formatear('x', 'es'), '$ 0');
    a.strictEqual(formatear(-5, 'es'), '$ 0');
    console.log('precio-lon: ok');
  }
})(typeof window !== 'undefined' ? window : globalThis);
