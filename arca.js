/* ============================================================
 *  arca.js
 *  Factura electronica de ARCA (ex AFIP) para LON Philosophy.
 *
 *  LON es MONOTRIBUTO, asi que emite SIEMPRE Factura C: el IVA no se
 *  discrimina, el neto es igual al total y no va el array de IVA. Por eso
 *  este modulo no sabe calcular IVA — si algun dia LON pasa a responsable
 *  inscripto, esto NO alcanza (habria que sumar Factura A y B con su
 *  desglose de alicuotas).
 *
 *  Hay UN SOLO punto de venta para el local y la tienda online. OJO: eso
 *  no quiere decir una sola secuencia de numeros. La numeracion es por
 *  (punto de venta, TIPO de comprobante): la Factura C, la nota de credito
 *  y la nota de debito llevan cada una la suya. FECompUltimoAutorizado se
 *  consulta con los dos datos, y como el punto de venta es uno solo, las
 *  emisiones del mismo tipo no se pueden paralelizar.
 *
 *  ESTE ARCHIVO NO HABLA CON LA RED TODAVIA. Arma y valida el comprobante,
 *  que es la parte donde se mete la plata y donde un error se paga caro (un
 *  CAE emitido no se borra: se anula con nota de credito). El cliente
 *  WSAA/WSFE se agrega cuando haya certificado de homologacion.
 *
 *  Como conseguir el certificado (lo hace el titular del CUIT):
 *  1. Homologacion (testing): entrar con Clave Fiscal al servicio WSASS,
 *     crear un alias, subir el CSR y bajar el .crt.
 *  2. Produccion: servicio "Administracion de Certificados Digitales",
 *     con Clave Fiscal nivel 3 o superior. El certificado de homologacion
 *     NO sirve en produccion.
 *  3. Autorizar el servicio "wsfe" para ese alias (en WSASS para testing,
 *     en "Administrador de Relaciones" para produccion).
 *  4. Dar de alta un punto de venta para WEB SERVICES en "Administracion de
 *     Puntos de Venta y Domicilios" -> "Factura electronica - Monotributo -
 *     Webservices". Un punto de venta de "Comprobantes en linea" NO sirve.
 *  5. El CSR y la clave privada se generan con openssl; la clave privada no
 *     se sube a ningun lado y no se puede recuperar.
 * ============================================================ */

// Codigos de tipo de comprobante del web service. Solo los de monotributo.
const COMPROBANTE = {
  FACTURA_C: 11,
  NOTA_CREDITO_C: 13, // devoluciones: un libro o una joya que vuelven
  NOTA_DEBITO_C: 12,
};

// Las notas tienen que decir a que comprobante corrigen.
const NOTAS = [COMPROBANTE.NOTA_CREDITO_C, COMPROBANTE.NOTA_DEBITO_C];

// Tipo de documento del comprador.
const DOCUMENTO = {
  CUIT: 80,
  DNI: 96,
  CONSUMIDOR_FINAL: 99, // sin identificar; va con numero 0
};

// Condicion del receptor frente al IVA (RG 5616/2024), obligatoria en el
// request. Los ids se confirman con FEParamGetCondicionIvaReceptor: estos
// salen de fuentes secundarias.
const CONDICION_IVA = {
  CONSUMIDOR_FINAL: 5,
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  MONOTRIBUTO: 6,
};

const CONCEPTO_PRODUCTOS = 1; // LON vende cosas, no servicios

/* Desde este importe hay que identificar al comprador: no se puede emitir
   a consumidor final sin datos. El valor sale de la RG 5700/2025 segun
   fuentes secundarias (no se pudo abrir el texto oficial), asi que esta
   aca arriba y suelto a proposito: si cambia, se toca un numero. */
const TOPE_SIN_IDENTIFICAR = 10000000;

/* Techo de cordura, no un limite fiscal: en una casa de libros, velas y
   joyas un comprobante de mas de esto es un cero de mas tipeado en el
   mostrador. Un CAE no se borra, asi que preferimos frenar y que alguien
   mire. Si alguna vez hay una venta legitima mas grande, se sube este
   numero. */
const TOPE_POR_COMPROBANTE = 50000000;

/* La fecha de un comprobante fiscal argentino va SIEMPRE en hora de
   Argentina, pase lo que pase con la zona del proceso o con la variable
   TIMEZONE (que existe para los textos de la app, no para esto). Si se
   usara config.TIMEZONE y alguien la pusiera en UTC, una venta de la noche
   se facturaria al dia siguiente sin que nadie se entere. */
const ZONA_FISCAL = 'America/Argentina/Buenos_Aires';

// Prefijos de CUIT/CUIL que asigna ARCA: 20/23/24/25/26/27 para personas,
// 30/33/34 para empresas. Confirmar contra ARCA si aparece alguno nuevo.
const PREFIJOS_CUIT = ['20', '23', '24', '25', '26', '27', '30', '33', '34'];

/* Redondeo a 2 decimales, que es lo que toma ARCA.
   El toPrecision(15) no es decoracion: Math.round(1.005 * 100) da 100 y no
   101, porque 1.005 en binario queda un pelo por debajo. Sin esto, un
   precio manual con 3 decimales se factura un centavo mas barato. */
function redondearPeso(importe) {
  return Math.round(Number((importe * 100).toPrecision(15))) / 100;
}

/* ARCA quiere la fecha del comprobante como AAAAMMDD.
   Va SIEMPRE en hora de Argentina, no la del proceso: Render corre en UTC,
   asi que una venta del 31/10 a las 21:30 de acá sale con fecha del 1/11 si
   se usa getFullYear/getMonth/getDate. ARCA la acepta igual (tolera unos
   dias para productos), asi que el error pasaria en silencio y despues solo
   se arregla con nota de credito. */
function fechaComprobante(fecha, zona) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zona || ZONA_FISCAL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha).replace(/-/g, '');
}

/* El numero sale SIEMPRE de preguntarle a ARCA el ultimo autorizado
   (FECompUltimoAutorizado) PARA ESE punto de venta Y ESE tipo de
   comprobante, y sumarle uno. Nunca de un contador propio: la secuencia es
   de ARCA, y si mandamos otro numero rechaza y se traba lo que sigue. */
function proximoNumero(ultimoAutorizado) {
  const ultimo = Number(ultimoAutorizado);
  if (!Number.isInteger(ultimo) || ultimo < 0) {
    throw new Error('El ultimo comprobante autorizado tiene que ser un entero >= 0.');
  }
  return ultimo + 1;
}

/* Digito verificador de CUIT por modulo 11. Un CUIT con un digito mal
   tipeado factura al comprador equivocado, y eso solo se arregla con nota
   de credito: conviene no dejarlo pasar. */
function cuitValido(cuit) {
  if (typeof cuit !== 'number' && typeof cuit !== 'string') return false;
  const digitos = String(cuit);
  if (!/^\d{11}$/.test(digitos)) return false;
  // Sin esto, cualquier numero de 11 digitos cuyo verificador cierre pasa
  // (uno de cada once inventados al azar).
  if (!PREFIJOS_CUIT.includes(digitos.slice(0, 2))) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += Number(digitos[i]) * pesos[i];

  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(digitos[10]);
}

/* Entero positivo de verdad: nada de true, "0x10", 1.5 ni strings. */
function esEnteroPositivo(valor) {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0;
}

function esUnoDe(valor, catalogo) {
  return typeof valor === 'number' && Object.values(catalogo).includes(valor);
}

/**
 * Arma la cabecera y el detalle de UN comprobante para FECAESolicitar.
 *
 * Devuelve {cabecera, detalle} separados a proposito: PtoVta y CbteTipo van
 * en FeCabReq y NO en el detalle. Si se mezclan, el SOAP se cae por un
 * elemento desconocido.
 *
 * @param {number} importe      total cobrado, en pesos. TIENE que ser number:
 *                              ver la validacion de abajo.
 * @param {number} puntoVenta   punto de venta habilitado para web services
 * @param {number} numero       numero de comprobante (ver proximoNumero)
 * @param {Date}   fecha        fecha del comprobante
 * @param {number} tipo         COMPROBANTE.* (default Factura C)
 * @param {number} docTipo      DOCUMENTO.* (default consumidor final)
 * @param {number} docNro       documento del comprador (0 si no se identifica)
 * @param {number} condicionIva CONDICION_IVA.* del comprador
 * @param {object} cbteAsoc     {tipo, puntoVenta, numero} del comprobante que
 *                              corrige. Obligatorio en notas de credito/debito.
 */
function armarComprobanteC({
  importe,
  puntoVenta,
  numero,
  fecha,
  tipo = COMPROBANTE.FACTURA_C,
  docTipo = DOCUMENTO.CONSUMIDOR_FINAL,
  docNro = 0,
  condicionIva = CONDICION_IVA.CONSUMIDOR_FINAL,
  cbteAsoc = null,
}) {
  /* El importe se exige como number y no se intenta parsear un string.
     "15.000" es quince mil para cualquiera de acá y 15 para Number(): si lo
     aceptaramos, una venta de $15.000 se facturaria por $15 sin que nadie se
     entere. El que llama (que sabe de donde salio el dato) convierte. */
  if (typeof importe !== 'number' || !Number.isFinite(importe)) {
    throw new Error(`El importe a facturar tiene que ser un numero (llego: ${JSON.stringify(importe)}).`);
  }

  const total = redondearPeso(importe);
  if (total <= 0) {
    throw new Error(`El importe a facturar tiene que ser mayor a 0 (llego: ${importe}).`);
  }
  // importe * 100 desborda a Infinity pasados ~1.8e306, y un Infinity no lo
  // atrapa el `total <= 0` de arriba: saldria ImpTotal nulo en el SOAP.
  if (!Number.isFinite(total)) {
    throw new Error(`El importe a facturar se fue de rango (llego: ${importe}).`);
  }
  if (total > TOPE_POR_COMPROBANTE) {
    throw new Error(
      `Un comprobante de $${total} supera el techo de $${TOPE_POR_COMPROBANTE}: ` +
      `revisa que no sea un cero de mas antes de emitirlo.`
    );
  }
  if (!esEnteroPositivo(puntoVenta)) {
    throw new Error('El punto de venta tiene que ser un entero positivo.');
  }
  if (!esEnteroPositivo(numero)) {
    throw new Error('El numero de comprobante tiene que ser un entero positivo.');
  }
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
    throw new Error('La fecha del comprobante no es valida.');
  }
  if (!esUnoDe(tipo, COMPROBANTE)) {
    throw new Error(`Tipo de comprobante desconocido: ${JSON.stringify(tipo)}. Este modulo solo emite los de monotributo.`);
  }
  if (!esUnoDe(docTipo, DOCUMENTO)) {
    throw new Error(`Tipo de documento desconocido: ${JSON.stringify(docTipo)}.`);
  }
  if (!esUnoDe(condicionIva, CONDICION_IVA)) {
    throw new Error(`Condicion de IVA del receptor desconocida: ${JSON.stringify(condicionIva)}.`);
  }

  // A partir del tope hay que saber a quien se le vendio. Preferimos no
  // emitir antes que emitir mal.
  if (total >= TOPE_SIN_IDENTIFICAR && docTipo === DOCUMENTO.CONSUMIDOR_FINAL) {
    throw new Error(
      `Una venta de $${total} necesita identificar al comprador (CUIT o DNI): ` +
      `el tope para consumidor final sin datos es $${TOPE_SIN_IDENTIFICAR}.`
    );
  }

  if (docTipo === DOCUMENTO.CONSUMIDOR_FINAL) {
    if (docNro !== 0) throw new Error('Consumidor final sin identificar va con numero de documento 0.');
  } else if (!esEnteroPositivo(docNro)) {
    throw new Error('Si se identifica al comprador hace falta el numero de documento.');
  } else if (docTipo === DOCUMENTO.CUIT && !cuitValido(docNro)) {
    throw new Error(`El CUIT ${docNro} no es valido (son 11 digitos y el ultimo es el verificador).`);
  } else if (docTipo === DOCUMENTO.DNI && !/^\d{7,8}$/.test(String(docNro))) {
    throw new Error(`El DNI ${docNro} no es valido (son 7 u 8 digitos).`);
  }

  // Una nota de credito suelta no dice que esta corrigiendo: ARCA la
  // rechaza, y sin ella la devolucion de un libro no se puede anular.
  const detalle = {
    Concepto: CONCEPTO_PRODUCTOS,
    DocTipo: docTipo,
    DocNro: docNro,
    CbteDesde: numero,
    CbteHasta: numero, // de a un comprobante por vez, no por lote
    CbteFch: fechaComprobante(fecha),
    ImpTotal: total,
    ImpTotConc: 0, // no gravado
    ImpNeto: total, // en Factura C el neto es el total: el IVA no se discrimina
    ImpOpEx: 0, // exento
    ImpIVA: 0,
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: condicionIva,
    // Sin array Iva a proposito: en Factura C no corresponde informarlo.
  };

  if (NOTAS.includes(tipo)) {
    if (!cbteAsoc || !esUnoDe(cbteAsoc.tipo, COMPROBANTE)
      || !esEnteroPositivo(cbteAsoc.puntoVenta) || !esEnteroPositivo(cbteAsoc.numero)) {
      throw new Error('Una nota de credito o debito necesita el comprobante asociado {tipo, puntoVenta, numero}.');
    }
    // Una nota corrige una FACTURA, no otra nota.
    if (NOTAS.includes(cbteAsoc.tipo)) {
      throw new Error('El comprobante asociado de una nota tiene que ser una factura, no otra nota.');
    }
    detalle.CbtesAsoc = [{
      Tipo: cbteAsoc.tipo,
      PtoVta: cbteAsoc.puntoVenta,
      Nro: cbteAsoc.numero,
    }];
  } else if (cbteAsoc) {
    throw new Error('Solo las notas de credito o debito llevan comprobante asociado.');
  }

  return {
    cabecera: { CantReg: 1, PtoVta: puntoVenta, CbteTipo: tipo },
    detalle,
  };
}

/* Autochequeo: `node arca.js`. Cubre lo que cuesta plata — los importes de
   la Factura C y, sobre todo, los casos en que NO hay que emitir. */
function demo() {
  const assert = require('assert');
  const fecha = new Date('2026-10-20T15:00:00-03:00');

  const { cabecera, detalle } = armarComprobanteC({ importe: 15000, puntoVenta: 3, numero: 1, fecha });
  assert.strictEqual(detalle.ImpTotal, 15000);
  assert.strictEqual(detalle.ImpNeto, 15000, 'en Factura C el neto es el total');
  assert.strictEqual(detalle.ImpIVA, 0, 'en Factura C no se discrimina IVA');
  assert.strictEqual(detalle.Iva, undefined, 'Factura C no lleva array de IVA');
  assert.strictEqual(detalle.CbteFch, '20261020');
  assert.strictEqual(detalle.DocTipo, 99);
  assert.strictEqual(detalle.DocNro, 0);
  assert.strictEqual(detalle.CondicionIVAReceptorId, 5);
  assert.strictEqual(detalle.CbteDesde, detalle.CbteHasta);
  assert.strictEqual(cabecera.CbteTipo, 11);
  assert.strictEqual(cabecera.PtoVta, 3);
  assert.strictEqual(detalle.PtoVta, undefined, 'PtoVta va en la cabecera, no en el detalle');

  // La fecha va en hora de Argentina aunque el server corra en UTC: una
  // venta del 31/10 21:30 de acá es del 31, no del 1/11.
  assert.strictEqual(fechaComprobante(new Date('2026-10-31T21:30:00-03:00')), '20261031');
  assert.strictEqual(fechaComprobante(new Date('2026-01-01T00:30:00-03:00')), '20260101');

  // Redondeo: el caso que se escapa con Math.round(x*100)/100 pelado.
  assert.strictEqual(redondearPeso(1.005), 1.01);
  assert.strictEqual(redondearPeso(10.075), 10.08);
  assert.strictEqual(armarComprobanteC({ importe: 1234.567, puntoVenta: 3, numero: 2, fecha }).detalle.ImpTotal, 1234.57);

  // Nota de credito por una devolucion: necesita decir que corrige.
  const nc = armarComprobanteC({
    importe: 15000, puntoVenta: 3, numero: 1, fecha, tipo: COMPROBANTE.NOTA_CREDITO_C,
    cbteAsoc: { tipo: COMPROBANTE.FACTURA_C, puntoVenta: 3, numero: 417 },
  });
  assert.strictEqual(nc.cabecera.CbteTipo, 13);
  assert.deepStrictEqual(nc.detalle.CbtesAsoc, [{ Tipo: 11, PtoVta: 3, Nro: 417 }]);
  assert.throws(
    () => armarComprobanteC({ importe: 15000, puntoVenta: 3, numero: 1, fecha, tipo: COMPROBANTE.NOTA_CREDITO_C }),
    /comprobante asociado/,
    'una nota de credito sin asociado no se emite'
  );

  // Comprador identificado con CUIT valido.
  const conCuit = armarComprobanteC({
    importe: 15000, puntoVenta: 3, numero: 3, fecha,
    docTipo: DOCUMENTO.CUIT, docNro: 20000000001, condicionIva: CONDICION_IVA.RESPONSABLE_INSCRIPTO,
  });
  assert.strictEqual(conCuit.detalle.DocNro, 20000000001);
  assert.strictEqual(conCuit.detalle.CondicionIVAReceptorId, 1);

  // Lo que NO se debe poder emitir.
  const base = { puntoVenta: 3, numero: 1, fecha };
  assert.throws(() => armarComprobanteC({ ...base, importe: 0 }), /mayor a 0/);
  assert.throws(() => armarComprobanteC({ ...base, importe: -5 }), /mayor a 0/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 0.001 }), /mayor a 0/);
  assert.throws(() => armarComprobanteC({ ...base, importe: NaN }), /tiene que ser un numero/);
  assert.throws(() => armarComprobanteC({ ...base, importe: Infinity }), /tiene que ser un numero/);
  // "15.000" es quince mil para una persona y 15 para Number(): no se acepta.
  assert.throws(() => armarComprobanteC({ ...base, importe: '15.000' }), /tiene que ser un numero/);
  assert.throws(() => armarComprobanteC({ ...base, importe: true }), /tiene que ser un numero/);
  assert.throws(() => armarComprobanteC({ ...base, importe: [5] }), /tiene que ser un numero/);

  // El tope no se saltea mandando el tipo de documento como string.
  assert.throws(
    () => armarComprobanteC({ ...base, importe: 50000000, docTipo: '99', docNro: 1 }),
    /Tipo de documento desconocido/,
    'docTipo "99" no es 99'
  );
  assert.throws(() => armarComprobanteC({ ...base, importe: TOPE_SIN_IDENTIFICAR }), /identificar al comprador/);

  // Documentos invalidos.
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, docTipo: 7777, docNro: 1 }), /Tipo de documento desconocido/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, docTipo: DOCUMENTO.DNI, docNro: 0 }), /numero de documento/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, docTipo: DOCUMENTO.CUIT, docNro: -5 }), /numero de documento/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, docTipo: DOCUMENTO.CUIT, docNro: 1 }), /no es valido/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, docTipo: DOCUMENTO.CUIT, docNro: 20000000002 }), /no es valido/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, docTipo: DOCUMENTO.DNI, docNro: 123 }), /no es valido/);
  assert.strictEqual(cuitValido(20000000001), true);
  assert.strictEqual(cuitValido(20000000002), false);

  // Tipo de comprobante y condicion de IVA fuera de catalogo.
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, tipo: 1 }), /Tipo de comprobante desconocido/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, condicionIva: null }), /Condicion de IVA/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, condicionIva: 99 }), /Condicion de IVA/);

  // Punto de venta y numero.
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, puntoVenta: 0 }), /punto de venta/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, numero: 1.5 }), /numero de comprobante/);
  assert.throws(() => armarComprobanteC({ ...base, importe: 100, fecha: new Date('nada') }), /fecha/);

  // La numeracion sale de ARCA, no de un contador propio.
  assert.strictEqual(proximoNumero(0), 1);
  assert.strictEqual(proximoNumero(417), 418);
  assert.throws(() => proximoNumero(-1), /entero/);
  assert.throws(() => proximoNumero('ultimo'), /entero/);

  // Importes fuera de rango: Infinity no lo atrapa el "mayor a 0", y el
  // cero de mas tipeado en el mostrador tampoco.
  assert.throws(
    () => armarComprobanteC({ ...base, importe: 1e307, docTipo: DOCUMENTO.CUIT, docNro: 20000000001 }),
    /se fue de rango/,
    'importe * 100 desborda a Infinity'
  );
  assert.throws(
    () => armarComprobanteC({ ...base, importe: 1500000000000, docTipo: DOCUMENTO.CUIT, docNro: 20000000001 }),
    /supera el techo/,
    'un cero de mas no se emite'
  );
  // Justo en el techo si se emite, pero pasado el tope de identificacion
  // hay que decir a quien: por eso va con CUIT.
  assert.strictEqual(
    armarComprobanteC({
      ...base, importe: TOPE_POR_COMPROBANTE,
      docTipo: DOCUMENTO.CUIT, docNro: 20000000001, condicionIva: CONDICION_IVA.RESPONSABLE_INSCRIPTO,
    }).detalle.ImpTotal,
    TOPE_POR_COMPROBANTE
  );

  // El prefijo del CUIT tambien cuenta: con solo el verificador, uno de
  // cada once numeros inventados pasaria.
  assert.strictEqual(cuitValido(99000000007), false, 'prefijo 99 no existe');
  assert.strictEqual(cuitValido([20000000001]), false, 'un array no es un CUIT');
  assert.strictEqual(cuitValido(null), false);
  assert.throws(
    () => armarComprobanteC({ ...base, importe: 100, docTipo: DOCUMENTO.CUIT, docNro: 99000000007 }),
    /no es valido/
  );

  // Una nota corrige una factura, no otra nota.
  assert.throws(
    () => armarComprobanteC({
      ...base, importe: 100, tipo: COMPROBANTE.NOTA_CREDITO_C,
      cbteAsoc: { tipo: COMPROBANTE.NOTA_CREDITO_C, puntoVenta: 3, numero: 1 },
    }),
    /tiene que ser una factura/
  );

  // La fecha fiscal no depende de la zona del proceso ni de TIMEZONE.
  assert.strictEqual(fechaComprobante(new Date('2026-10-31T21:30:00-03:00'), 'UTC'), '20261101');
  assert.strictEqual(fechaComprobante(new Date('2026-10-31T21:30:00-03:00')), '20261031');

  console.log('arca.js: autochequeo OK');
}

if (require.main === module) demo();

module.exports = {
  COMPROBANTE,
  DOCUMENTO,
  CONDICION_IVA,
  TOPE_SIN_IDENTIFICAR,
  armarComprobanteC,
  proximoNumero,
  redondearPeso,
  fechaComprobante,
  cuitValido,
};
