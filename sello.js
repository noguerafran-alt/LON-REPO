/* ============================================================
 *  sello.js — logica PURA del sellado NFC (sin red ni Sheets).
 *  Autochequeo: `node sello.js`.
 * ============================================================ */
const crypto = require('crypto');

// Fija a proposito (igual que arca.js): el "dia" del tope diario no
// depende de la zona del proceso (Render corre en UTC).
const ZONA = 'America/Argentina/Buenos_Aires';

function diaAR(fecha) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

/** Comparacion en tiempo constante. Sin token esperado, todo pasa. */
function tokenValido(recibido, esperado) {
  if (!esperado) return true;
  if (typeof recibido !== 'string' || !recibido) return false;
  const a = crypto.createHash('sha256').update(recibido).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

const CANTIDAD_MAX = 3;

/**
 * UNICA regla del contador (la usan el escaneo del personal y el NFC).
 * Aplica "cantidad" cafes en secuencia: por debajo del objetivo cada uno
 * suma 1 (al llegar queda EN el objetivo = gratis pendiente); con el
 * contador ya en el objetivo el siguiente es la entrega del regalo y
 * vuelve a 0.
 */
function avanzarContador(contador, objetivo, cantidad) {
  let regalosEntregados = 0;
  let regaloDesbloqueado = false;
  for (let i = 0; i < cantidad; i++) {
    if (contador >= objetivo) {
      contador = 0;
      regalosEntregados += 1;
      regaloDesbloqueado = false;
    } else {
      contador += 1;
      regaloDesbloqueado = contador >= objetivo;
    }
  }
  return { contador, regalosEntregados, regaloDesbloqueado };
}

/**
 * Decide que hacer con un toque de la tarjeta que pide "cantidad" cafes
 * (1 a CANTIDAD_MAX). El NFC nunca canjea el gratis: suma como mucho hasta
 * el objetivo ("pendiente") y el resto lo resuelve el personal con el QR.
 * Devuelve { accion: 'sumar'|'pendiente'|'frenado'|'invalido', ... } con
 * `sumados` (cafes que entraron) y `sobrantes` (pagos que siguen al gratis,
 * que el personal suma al canjear). El tope diario cuenta cafes sumados.
 */
function decidirSello({ contador, objetivo, cantidad = 1, ultimoSello, selloDia, ahora, minutosEntre, maxPorDia }) {
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > CANTIDAD_MAX) return { accion: 'invalido' };

  // Con el gratis ya pendiente uno de los cafes pedidos es ese gratis.
  if (contador >= objetivo) return { accion: 'pendiente', sumados: 0, sobrantes: cantidad - 1 };

  const dia = diaAR(ahora);
  const [diaGuardado, n] = String(selloDia || '').split('|');
  const cafesHoy = diaGuardado === dia && Number.isFinite(Number(n)) ? Number(n) : 0;

  const previo = Date.parse(ultimoSello || '');
  if (Number.isFinite(previo) && ahora.getTime() - previo < minutosEntre * 60000) {
    return { accion: 'frenado', motivo: 'intervalo', puedeVolverEn: new Date(previo + minutosEntre * 60000).toISOString() };
  }
  const restantesHoy = maxPorDia - cafesHoy;
  if (restantesHoy <= 0) return { accion: 'frenado', motivo: 'dia', puedeVolverEn: null };

  const sumados = Math.min(cantidad, restantesHoy, objetivo - contador);
  const nuevo = avanzarContador(contador, objetivo, sumados).contador;
  const pendiente = nuevo >= objetivo;
  return {
    accion: 'sumar',
    contador: nuevo,
    sumados,
    // Pendiente: el gratis ocupa un cafe y los demas van tras el.
    sobrantes: pendiente ? Math.max(0, cantidad - sumados - 1) : 0,
    pendiente,
    topeParcial: sumados < cantidad && sumados === restantesHoy,
    ultimoSello: ahora.toISOString(),
    selloDia: `${dia}|${cafesHoy + sumados}`,
  };
}

function demo() {
  const assert = require('assert');
  const base = { contador: 1, objetivo: 3, ultimoSello: '', selloDia: '', minutosEntre: 30, maxPorDia: 3 };
  const t = (iso) => new Date(iso);

  // token
  assert.strictEqual(tokenValido('x', ''), true);
  assert.strictEqual(tokenValido('abc', 'abc'), true);
  assert.strictEqual(tokenValido('abd', 'abc'), false);
  assert.strictEqual(tokenValido('', 'abc'), false);
  assert.strictEqual(tokenValido(undefined, 'abc'), false);
  assert.strictEqual(tokenValido(['abc'], 'abc'), false);

  // suma
  let r = decidirSello({ ...base, ahora: t('2026-10-22T15:00:00Z') });
  assert.deepStrictEqual([r.accion, r.contador, r.selloDia], ['sumar', 2, '2026-10-22|1']);

  // pendiente no suma aunque haya pasado todo el tiempo
  assert.strictEqual(decidirSello({ ...base, contador: 3, ahora: t('2026-10-22T15:00:00Z') }).accion, 'pendiente');

  // intervalo
  r = decidirSello({ ...base, ultimoSello: '2026-10-22T14:45:00Z', selloDia: '2026-10-22|1', ahora: t('2026-10-22T15:00:00Z') });
  assert.deepStrictEqual([r.accion, r.motivo, r.puedeVolverEn], ['frenado', 'intervalo', '2026-10-22T15:15:00.000Z']);
  r = decidirSello({ ...base, ultimoSello: '2026-10-22T14:30:00Z', selloDia: '2026-10-22|1', ahora: t('2026-10-22T15:00:00Z') });
  assert.strictEqual(r.accion, 'sumar'); // justo 30 min

  // tope diario
  r = decidirSello({ ...base, ultimoSello: '2026-10-22T10:00:00Z', selloDia: '2026-10-22|3', ahora: t('2026-10-22T15:00:00Z') });
  assert.deepStrictEqual([r.accion, r.motivo], ['frenado', 'dia']);

  // cambio de dia en zona AR: 02:30Z del 23 todavia es 22 en Argentina (23:30)...
  r = decidirSello({ ...base, ultimoSello: '2026-10-22T20:00:00Z', selloDia: '2026-10-22|3', ahora: t('2026-10-23T02:30:00Z') });
  assert.strictEqual(r.motivo, 'dia');
  // ...y 03:10Z ya es el 23 en Argentina: el conteo arranca de cero
  r = decidirSello({ ...base, ultimoSello: '2026-10-22T20:00:00Z', selloDia: '2026-10-22|3', ahora: t('2026-10-23T03:10:00Z') });
  assert.deepStrictEqual([r.accion, r.selloDia], ['sumar', '2026-10-23|1']);

  // basura en las columnas no rompe
  r = decidirSello({ ...base, ultimoSello: 'x', selloDia: 'y|z', ahora: t('2026-10-22T15:00:00Z') });
  assert.strictEqual(r.accion, 'sumar');

  // cantidad 1/2/3 (objetivo 5 para que ninguna cruce)
  const ahora = t('2026-10-22T15:00:00Z');
  const b5 = { ...base, contador: 0, objetivo: 5, ahora };
  for (const c of [1, 2, 3]) {
    r = decidirSello({ ...b5, cantidad: c });
    assert.deepStrictEqual([r.accion, r.contador, r.sumados, r.sobrantes, r.pendiente, r.topeParcial, r.selloDia], ['sumar', c, c, 0, false, false, `2026-10-22|${c}`]);
  }

  // tope diario parcial: lleva 2 hoy, le queda 1, pide 3 -> suma 1
  r = decidirSello({ ...b5, cantidad: 3, ultimoSello: '2026-10-22T10:00:00Z', selloDia: '2026-10-22|2' });
  assert.deepStrictEqual([r.accion, r.sumados, r.contador, r.topeParcial, r.selloDia], ['sumar', 1, 1, true, '2026-10-22|3']);

  // cruce del gratis: contador 2 de 3, pide 3 -> suma 1, pendiente, sobran 1 pago tras el gratis
  r = decidirSello({ ...base, contador: 2, cantidad: 3, ahora });
  assert.deepStrictEqual([r.accion, r.contador, r.sumados, r.pendiente, r.sobrantes], ['sumar', 3, 1, true, 1]);
  // ya pendiente (3), pide 2 -> no suma, el gratis es uno y sobra 1
  r = decidirSello({ ...base, contador: 3, cantidad: 2, ahora });
  assert.deepStrictEqual([r.accion, r.sumados, r.sobrantes], ['pendiente', 0, 1]);
  // contador 0, pide 3 -> queda pendiente justo, sin sobrantes
  r = decidirSello({ ...base, contador: 0, cantidad: 3, ahora });
  assert.deepStrictEqual([r.accion, r.contador, r.pendiente, r.sobrantes], ['sumar', 3, true, 0]);
  // contador 1, pide 3 -> suma 2 y el tercero es el gratis
  r = decidirSello({ ...base, contador: 1, cantidad: 3, ahora });
  assert.deepStrictEqual([r.contador, r.sumados, r.sobrantes], [3, 2, 0]);

  // intervalo corre entre toques, aunque el toque anterior haya sumado 3
  r = decidirSello({ ...b5, cantidad: 2, ultimoSello: '2026-10-22T14:40:00Z', selloDia: '2026-10-22|1' });
  assert.deepStrictEqual([r.accion, r.motivo], ['frenado', 'intervalo']);

  // cambio de dia AR con cantidad: 03:10Z del 23 reinicia el conteo
  r = decidirSello({ ...b5, cantidad: 3, ultimoSello: '2026-10-22T20:00:00Z', selloDia: '2026-10-22|3', ahora: t('2026-10-23T03:10:00Z') });
  assert.deepStrictEqual([r.accion, r.sumados, r.selloDia], ['sumar', 3, '2026-10-23|3']);

  // cantidad invalida
  for (const c of [0, 4, -1, 1.5, '2', null, NaN]) assert.strictEqual(decidirSello({ ...b5, cantidad: c }).accion, 'invalido');

  // avanzarContador == for viejo de registrarCafeCliente
  const av = (c, n) => { const r = avanzarContador(c, 3, n); return [r.contador, r.regalosEntregados, r.regaloDesbloqueado]; };
  assert.deepStrictEqual(av(0, 1), [1, 0, false]);
  assert.deepStrictEqual(av(2, 1), [3, 0, true]);
  assert.deepStrictEqual(av(3, 1), [0, 1, false]);   // canje
  assert.deepStrictEqual(av(2, 2), [0, 1, false]);   // cruza el regalo
  assert.deepStrictEqual(av(2, 3), [1, 1, false]);
  assert.deepStrictEqual(av(3, 4), [3, 1, true]);    // canje y vuelve a llenar
  assert.deepStrictEqual(av(1, 0), [1, 0, false]);

  console.log('sello.js: autochequeo OK');
}

if (require.main === module) demo();

module.exports = { diaAR, tokenValido, decidirSello, avanzarContador, CANTIDAD_MAX };
