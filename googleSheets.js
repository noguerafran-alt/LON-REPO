/* ============================================================
 *  googleSheets.js
 *  Funciones de lectura/escritura sobre las Google Sheets.
 *  Los nombres de hoja y columnas se toman de config.js — si algo
 *  cambia de lugar en la planilla, se ajusta ahi, no aca.
 * ============================================================ */

const crypto = require('crypto');
const config = require('./config');

/**
 * Se fija cuantas filas tiene la GRILLA de una pestaña (no cuantas filas
 * tienen datos, sino el tamaño fisico de la hoja) y, si hace falta escribir
 * mas alla de eso, la expande. Esto es necesario porque `values.update`
 * (a diferencia de `values.append`) NO expande el sheet solo: si la hoja
 * tiene 172 filas creadas y tratamos de escribir en la fila 173, Google
 * responde "Range ... exceeds grid limits".
 */
async function asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, filaNecesaria) {
  const metadata = await sheetsClient.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,gridProperties))',
  });

  const hoja = (metadata.data.sheets || []).find((s) => s.properties.title === sheetName);
  if (!hoja) return; // si no la encontramos por nombre, dejamos que el error real salga mas adelante

  const filasActuales = hoja.properties.gridProperties.rowCount;
  if (filaNecesaria <= filasActuales) return;

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        appendDimension: {
          sheetId: hoja.properties.sheetId,
          dimension: 'ROWS',
          length: (filaNecesaria - filasActuales) + 200, // dejamos margen extra para las proximas escrituras
        },
      }],
    },
  });
}

/**
 * Agrega una fila nueva al final de una pestaña (hoja) de un Google Sheet.
 *
 * OJO: no usamos spreadsheets.values.append con un rango abierto (A:Z),
 * porque la API intenta "adivinar" donde empieza la tabla mirando los datos
 * existentes, y si hay celdas vacias en el medio de una fila (ej. email o
 * telefono sin completar), puede alinear mal las filas siguientes.
 * En vez de eso, calculamos nosotros mismos cual es la proxima fila vacia
 * (mirando la columna A) y escribimos ahi con un rango exacto.
 */
async function appendRow(sheetsClient, spreadsheetId, sheetName, values, valueInputOption) {
  const columnaControl = `${sheetName}!A:A`;

  const respuestaActual = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: columnaControl,
  });

  const filasExistentes = (respuestaActual.data.values || []).length;
  const proximaFila = filasExistentes + 1;

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, proximaFila);

  const letraColumnaFinal = columnaALetra(values.length - 1);
  const range = `${sheetName}!A${proximaFila}:${letraColumnaFinal}${proximaFila}`;

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: valueInputOption || 'USER_ENTERED',
    requestBody: {
      values: [values],
    },
  });
}

/**
 * Agrega VARIAS filas de una sola vez al final de una pestaña (mas
 * eficiente que llamar appendRow en loop cuando se generan N unidades).
 */
async function appendRows(sheetsClient, spreadsheetId, sheetName, filasDeValores) {
  if (filasDeValores.length === 0) return;

  const columnaControl = `${sheetName}!A:A`;

  const respuestaActual = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: columnaControl,
  });

  const filasExistentes = (respuestaActual.data.values || []).length;
  const primeraFilaNueva = filasExistentes + 1;
  const ultimaFilaNueva = primeraFilaNueva + filasDeValores.length - 1;

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, ultimaFilaNueva);

  const cantidadColumnas = Math.max(...filasDeValores.map((f) => f.length));
  const letraColumnaFinal = columnaALetra(cantidadColumnas - 1);
  const range = `${sheetName}!A${primeraFilaNueva}:${letraColumnaFinal}${ultimaFilaNueva}`;

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: filasDeValores,
    },
  });
}

/**
 * Convierte un indice de columna (0-based) a letra de columna estilo
 * Google Sheets. Soporta mas de 26 columnas (AA, AB, ...), a diferencia
 * de la version anterior que asumia <=26.
 */
function columnaALetra(indiceCero) {
  let n = indiceCero + 1;
  let letra = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/**
 * Busca el SKU GENERAL (columna A) en la hoja STOCK y devuelve la
 * "Cantidad actual" (columna D). Devuelve null si no lo encuentra.
 */
async function getStockPorSkuGeneral(sheetsClient, spreadsheetId, sheetName, skuGeneral) {
  const range = `${sheetName}!A:D`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const skuNormalizado = String(skuGeneral).trim().toLowerCase();

  for (const row of rows) {
    const filaSku = row[0] ? String(row[0]).trim().toLowerCase() : '';
    if (filaSku === skuNormalizado) {
      return row[3] !== undefined ? row[3] : null; // columna D: Cantidad actual
    }
  }

  return null;
}

/**
 * Saca el SKU general a partir del SKU completo, quitandole el ultimo
 * bloque de N digitos (ej "LIB-INF-001-000001" -> "LIB-INF-001").
 */
function extraerSkuGeneral(skuCompleto) {
  const partes = String(skuCompleto).split('-');
  if (partes.length <= 1) return skuCompleto;
  partes.pop();
  return partes.join('-');
}

/**
 * Lee todas las filas de la hoja HISTORICO_SKU y devuelve un array de
 * objetos con los campos definidos en config.COLUMNAS_HISTORICO_SKU.
 */
async function getHistoricoSku(sheetsClient, spreadsheetId, sheetName) {
  const columnas = config.COLUMNAS_HISTORICO_SKU;
  const ultimaLetra = columnaALetra(columnas.length - 1);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const filas = [];

  // Saltamos la fila 1 (encabezado)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const skuCompleto = row[0] ? String(row[0]).trim() : '';
    if (skuCompleto === '') continue;

    const fila = {};
    columnas.forEach((nombreCampo, indice) => {
      fila[nombreCampo] = row[indice] !== undefined ? row[indice] : '';
    });
    filas.push(fila);
  }

  return filas;
}

/**
 * Arma el array de valores (en el orden correcto) para una fila de
 * HISTORICO_SKU, usando config.COLUMNAS_HISTORICO_SKU como fuente de
 * verdad del orden de columnas.
 */
function construirFilaHistorico(datos) {
  return config.COLUMNAS_HISTORICO_SKU.map((nombreCampo) => datos[nombreCampo] ?? '');
}

/**
 * Lee la hoja IMPRIMIR (columnas A=Producto, B=Categoria, C=Subcategoria, D=SKU)
 * y devuelve un array de objetos { producto, categoria, subcategoria, skuCompleto }.
 */
async function getFilasImprimir(sheetsClient, spreadsheetId, sheetName) {
  const range = `${sheetName}!A:D`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const filas = [];

  // Saltamos la fila 1 (encabezado)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const skuCompleto = row[3] ? String(row[3]).trim() : '';
    if (skuCompleto === '') continue;

    filas.push({
      producto: row[0] ? String(row[0]).trim() : '',
      categoria: row[1] ? String(row[1]).trim() : '',
      subcategoria: row[2] ? String(row[2]).trim() : '',
      skuCompleto,
    });
  }

  return filas;
}

/**
 * Interpreta el valor crudo de la columna de fotos (columna G de
 * Productos). Puede venir vacio, con una URL suelta (formato viejo, un
 * solo producto = una sola foto) o con un array JSON de hasta 4 URLs
 * (formato nuevo, galeria). Siempre devuelve un array (posiblemente
 * vacio), recortado a 4 elementos por las dudas.
 */
function parsearFotos(valorCrudo) {
  const valor = valorCrudo ? String(valorCrudo).trim() : '';
  if (!valor) return [];
  if (valor.startsWith('[')) {
    try {
      const arr = JSON.parse(valor);
      if (Array.isArray(arr)) return arr.filter(Boolean).map((f) => String(f).trim()).slice(0, 4);
    } catch (e) {
      // No era un JSON valido (dato viejo raro) — lo tratamos como URL suelta abajo.
    }
  }
  return [valor];
}

/**
 * Lee la hoja de catalogo (config.HOJA_PRODUCTOS) y devuelve un array de
 * objetos { producto, categoria, subcategoria, skuGeneral, precio, foto,
 * fotos, descripcion }.
 * Usa config.COLUMNAS_PRODUCTOS para saber en que columna esta cada dato.
 */
async function getCatalogoProductos(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const maxIndice = Math.max(cols.producto, cols.categoria, cols.subcategoria, cols.skuGeneral, cols.precio, cols.foto, cols.ultimaModificacionPrecio, cols.descripcion, cols.proveedor, cols.visiblePublico);
  const ultimaLetra = columnaALetra(maxIndice);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const productos = [];

  // Saltamos la fila 1 (encabezado)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const skuGeneral = row[cols.skuGeneral] ? String(row[cols.skuGeneral]).trim() : '';
    if (skuGeneral === '') continue;

    const fotos = parsearFotos(row[cols.foto]);

    productos.push({
      producto: row[cols.producto] ? String(row[cols.producto]).trim() : '',
      categoria: row[cols.categoria] ? String(row[cols.categoria]).trim() : '',
      subcategoria: row[cols.subcategoria] ? String(row[cols.subcategoria]).trim() : '',
      skuGeneral,
      precio: row[cols.precio] !== undefined ? row[cols.precio] : '',
      foto: fotos[0] || '',
      fotos,
      descripcion: row[cols.descripcion] ? String(row[cols.descripcion]).trim() : '',
      ultimaModificacionPrecio: row[cols.ultimaModificacionPrecio] ? String(row[cols.ultimaModificacionPrecio]).trim() : '',
      proveedor: row[cols.proveedor] ? String(row[cols.proveedor]).trim() : '',
      visiblePublico: String(row[cols.visiblePublico] || '').trim().toUpperCase() !== 'NO',
    });
  }

  return productos;
}

/**
 * Busca en CONTADOR_UNIDADES el ultimo numero de serie usado para un
 * SKU general. Devuelve 0 si el SKU general todavia no tiene fila
 * (para que el primer numero generado sea el 1).
 * Tambien devuelve el numero de fila (1-based) por si hay que
 * actualizarla, o null si no existe (hay que crearla).
 */
async function getUltimoNumeroSerie(sheetsClient, spreadsheetId, sheetName, skuGeneral) {
  const cols = config.COLUMNAS_CONTADOR_UNIDADES;
  const range = `${sheetName}!A:B`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const skuNormalizado = String(skuGeneral).trim().toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const filaSku = row[cols.skuGeneral] ? String(row[cols.skuGeneral]).trim().toLowerCase() : '';
    if (filaSku === skuNormalizado) {
      const ultimo = Number(row[cols.ultimoNumeroSerie]) || 0;
      return { ultimoNumeroSerie: ultimo, numeroFila: i + 1 };
    }
  }

  return { ultimoNumeroSerie: 0, numeroFila: null };
}

/**
 * Actualiza (o crea) la fila de CONTADOR_UNIDADES para un SKU general,
 * dejando "ultimo numero de serie usado" en el valor indicado.
 */
async function actualizarContadorUnidades(sheetsClient, spreadsheetId, sheetName, skuGeneral, nuevoUltimoNumero, numeroFilaExistente) {
  if (numeroFilaExistente) {
    const range = `${sheetName}!A${numeroFilaExistente}:B${numeroFilaExistente}`;
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[skuGeneral, nuevoUltimoNumero]],
      },
    });
  } else {
    await appendRow(sheetsClient, spreadsheetId, sheetName, [skuGeneral, nuevoUltimoNumero]);
  }
}

/**
 * Genera `cantidad` SKUs completos correlativos para un SKU general,
 * actualiza CONTADOR_UNIDADES y agrega las filas correspondientes a
 * HISTORICO_SKU. Devuelve el array de SKUs completos generados.
 *
 * Por defecto tambien suma `cantidad` a "Cantidad Manual" en STOCK,
 * porque el caso normal (boton "+ Stock") es literalmente avisar que
 * entro mercaderia nueva al local. Pasar `sumarStock:false` para los
 * casos donde el numero de serie se genera solo por trazabilidad
 * (ej. despachar un pedido que ya tenia el stock descontado al
 * reservarse) y NO representa unidades nuevas — si no, el stock queda
 * duplicado.
 */
async function generarUnidades(sheetsClient, {
  spreadsheetId, skuGeneral, producto, categoria, subcategoria, precio, cantidad, generadoPor, fecha, sumarStock = true,
}) {
  const largo = config.LARGO_NUMERO_SERIE;

  const { ultimoNumeroSerie, numeroFila } = await getUltimoNumeroSerie(
    sheetsClient, spreadsheetId, config.HOJA_CONTADOR_UNIDADES, skuGeneral,
  );

  const skusGenerados = [];
  const filasHistorico = [];

  for (let i = 1; i <= cantidad; i++) {
    const numeroSerie = ultimoNumeroSerie + i;
    const numeroSerieTexto = String(numeroSerie).padStart(largo, '0');
    const skuCompleto = `${skuGeneral}-${numeroSerieTexto}`;

    skusGenerados.push(skuCompleto);
    filasHistorico.push(construirFilaHistorico({
      skuCompleto,
      skuGeneral,
      producto,
      categoria,
      subcategoria,
      precio,
      fecha,
      generadoPor,
    }));
  }

  const nuevoUltimoNumero = ultimoNumeroSerie + cantidad;

  // Estas 4 escrituras van a hojas distintas y ninguna depende del
  // resultado de otra — antes se hacian una atras de la otra (podia
  // sumar varios segundos por cada "generar unidades"), ahora van en
  // paralelo.
  const filasImprimirApp = skusGenerados.map((skuCompleto) => ({
    producto, categoria, subcategoria, skuCompleto,
  }));

  await Promise.all([
    actualizarContadorUnidades(
      sheetsClient, spreadsheetId, config.HOJA_CONTADOR_UNIDADES, skuGeneral, nuevoUltimoNumero, numeroFila,
    ),
    appendRows(sheetsClient, spreadsheetId, config.HOJA_HISTORICO_SKU, filasHistorico),
    // Ademas del historico, registramos estas unidades en IMPRIMIR APP
    // para que se puedan imprimir despues SOLO las generadas desde esta
    // app web (separado de la hoja IMPRIMIR que usa el generador del
    // lado de Sheets).
    appendFilasImprimirApp(sheetsClient, spreadsheetId, config.HOJA_IMPRIMIR_APP, filasImprimirApp),
    // Sumamos la cantidad recien generada a "Cantidad Manual" en STOCK
    // (planilla de VENTAS), con fecha y nombre/categoria, para que el
    // stock fisico quede al dia — salvo que sumarStock:false (ver
    // comentario del JSDoc de la funcion).
    ...(sumarStock ? [sumarCantidadManualStock(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_STOCK, {
      skuGeneral, cantidad, nombre: producto, categoria, fecha,
    })] : []),
  ]);

  return skusGenerados;
}

/**
 * Lee la hoja Config (categoria, subcategoria, prefijo de SKU) y devuelve
 * un array de objetos { categoria, subcategoria, prefijoSku }.
 * Se usa para armar el selector de "producto nuevo" en el panel admin.
 */
async function getConfigCategorias(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_CONFIG;
  const maxIndice = Math.max(cols.categoria, cols.subcategoria, cols.prefijoSku);
  const ultimaLetra = columnaALetra(maxIndice);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const filas = [];

  // Saltamos la fila 1 (encabezado)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const prefijoSku = row[cols.prefijoSku] ? String(row[cols.prefijoSku]).trim() : '';
    if (prefijoSku === '') continue;

    filas.push({
      categoria: row[cols.categoria] ? String(row[cols.categoria]).trim() : '',
      subcategoria: row[cols.subcategoria] ? String(row[cols.subcategoria]).trim() : '',
      prefijoSku,
    });
  }

  return filas;
}

/**
 * Agrega una fila nueva a la hoja Config: Categoria, Codigo Categoria,
 * Subcategoria, Codigo Subcategoria, Clave (Categoria|Subcategoria) y
 * Prefijo SKU (CodigoCategoria-CodigoSubcategoria). Los codigos se
 * normalizan a MAYUSCULAS (asi vienen los prefijos existentes, ej "LIB").
 */
async function crearCategoriaConfig(sheetsClient, spreadsheetId, sheetName, { categoria, codigoCategoria, subcategoria, codigoSubcategoria }) {
  const cols = config.COLUMNAS_CONFIG;
  const codCat = String(codigoCategoria).trim().toUpperCase();
  const codSub = String(codigoSubcategoria).trim().toUpperCase();
  const clave = `${categoria}|${subcategoria}`;
  const prefijoSku = `${codCat}-${codSub}`;

  const cantidadColumnas = Math.max(cols.categoria, cols.codigoCategoria, cols.subcategoria, cols.codigoSubcategoria, cols.clave, cols.prefijoSku) + 1;
  const fila = new Array(cantidadColumnas).fill('');
  fila[cols.categoria] = categoria;
  fila[cols.codigoCategoria] = codCat;
  fila[cols.subcategoria] = subcategoria;
  fila[cols.codigoSubcategoria] = codSub;
  fila[cols.clave] = clave;
  fila[cols.prefijoSku] = prefijoSku;

  await appendRow(sheetsClient, spreadsheetId, sheetName, fila);
  await agregarACategoriaDesplegableSiHaceFalta(sheetsClient, spreadsheetId, sheetName, categoria, codCat);

  return { categoria, subcategoria, prefijoSku };
}

/**
 * La hoja Config tiene, aparte de la tabla principal, una lista corta en
 * las columnas H (categoria) e I (codigo) que alimenta el desplegable de
 * categorias en Google Sheets. Si la categoria nueva todavia no esta ahi,
 * la agrega en la primera fila libre de esa lista.
 */
async function agregarACategoriaDesplegableSiHaceFalta(sheetsClient, spreadsheetId, sheetName, categoria, codigoCategoria) {
  const cols = config.COLUMNAS_CONFIG;
  const letraH = columnaALetra(cols.listaCategoriaDesplegable);
  const letraI = columnaALetra(cols.listaCodigoDesplegable);
  const range = `${sheetName}!${letraH}:${letraI}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const categoriaNormalizada = String(categoria).trim().toLowerCase();

  let filasConDatos = 0;
  for (let i = 1; i < rows.length; i++) { // saltamos fila 1 (encabezado)
    const valorH = rows[i] && rows[i][0] ? String(rows[i][0]).trim() : '';
    if (valorH === '') continue;
    filasConDatos = i + 1; // 1-indexado
    if (valorH.toLowerCase() === categoriaNormalizada) {
      return; // ya estaba en la lista, no hacemos nada
    }
  }

  const proximaFila = filasConDatos > 0 ? filasConDatos + 1 : 2;
  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, proximaFila);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${letraH}${proximaFila}:${letraI}${proximaFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[categoria, codigoCategoria]] },
  });
}

/**
 * Busca, dentro de la hoja Productos, cual es el numero de producto (NNN)
 * mas alto ya usado para un prefijo de SKU dado (ej "LIB-INF") y devuelve
 * el siguiente numero libre (empieza en 1 si no hay ninguno todavia).
 */
async function getSiguienteNumeroProducto(sheetsClient, spreadsheetId, sheetNameProductos, prefijoSku) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const ultimaLetra = columnaALetra(cols.skuGeneral);
  const range = `${sheetNameProductos}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const prefijoNormalizado = String(prefijoSku).trim().toLowerCase();
  let maxNumero = 0;

  for (const row of rows) {
    const skuGeneral = row[cols.skuGeneral] ? String(row[cols.skuGeneral]).trim() : '';
    if (!skuGeneral) continue;

    const partes = skuGeneral.split('-');
    if (partes.length < 3) continue; // esperamos CAT-SUB-NNN

    const numeroTexto = partes[partes.length - 1];
    const prefijoDeEstaFila = partes.slice(0, partes.length - 1).join('-').toLowerCase();

    if (prefijoDeEstaFila === prefijoNormalizado) {
      const numero = Number(numeroTexto);
      if (!Number.isNaN(numero) && numero > maxNumero) maxNumero = numero;
    }
  }

  return maxNumero + 1;
}

/**
 * Lee la hoja Config y arma un mapa CATEGORIA (en mayusculas) -> nombre
 * que ven los clientes en el catalogo publico (columna G, opcional). Si
 * una categoria no tiene nombre visible cargado, no aparece en el mapa
 * — el llamador usa la categoria tal cual como resultado.
 */
async function getNombresVisiblesCategorias(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_CONFIG;
  const ultimaLetra = columnaALetra(cols.nombreVisibleCategoria);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const mapa = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const categoria = row[cols.categoria] ? String(row[cols.categoria]).trim() : '';
    if (!categoria) continue;
    const clave = categoria.toUpperCase();
    const nombreVisible = row[cols.nombreVisibleCategoria] ? String(row[cols.nombreVisibleCategoria]).trim() : '';
    if (nombreVisible && !mapa[clave]) mapa[clave] = nombreVisible;
  }

  return mapa;
}

/**
 * Actualiza el nombre que ven los clientes para una categoria (columna G
 * de la hoja Config). Si ya hay filas con esa categoria (una por cada
 * subcategoria), actualiza la columna G en todas para que quede
 * consistente; si la categoria todavia no tiene ninguna fila en Config,
 * agrega una fila nueva solo con la categoria y el nombre visible.
 */
async function actualizarNombreVisibleCategoria(sheetsClient, spreadsheetId, sheetName, categoria, nombreVisible) {
  const cols = config.COLUMNAS_CONFIG;
  const ultimaLetra = columnaALetra(cols.nombreVisibleCategoria);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const categoriaNormalizada = String(categoria).trim().toUpperCase();
  const letraNombreVisible = columnaALetra(cols.nombreVisibleCategoria);

  const filasAActualizar = [];
  for (let i = 1; i < rows.length; i++) {
    const categoriaFila = rows[i][cols.categoria] ? String(rows[i][cols.categoria]).trim().toUpperCase() : '';
    if (categoriaFila === categoriaNormalizada) filasAActualizar.push(i + 1);
  }

  if (filasAActualizar.length === 0) {
    const fila = new Array(cols.nombreVisibleCategoria + 1).fill('');
    fila[cols.categoria] = String(categoria).trim();
    fila[cols.nombreVisibleCategoria] = nombreVisible;
    await appendRow(sheetsClient, spreadsheetId, sheetName, fila);
    return;
  }

  await Promise.all(filasAActualizar.map((numeroFila) => sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${letraNombreVisible}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[nombreVisible]] },
  })));
}

/**
 * Convierte a numero un valor de celda que puede venir en formato
 * argentino (punto de miles, coma decimal — ej "4.000,00", asi es como
 * Google Sheets lo devuelve si alguien tipeo el numero directo en la
 * planilla y Sheets le aplico formato de moneda/miles) o como numero
 * plano (ej "4000", que es lo que manda el panel admin). Devuelve 0 si
 * no se puede interpretar.
 */
function parseNumeroFormatoArgentino(valorCelda) {
  if (typeof valorCelda === 'number') return Number.isFinite(valorCelda) ? valorCelda : 0;
  if (valorCelda === undefined || valorCelda === null || valorCelda === '') return 0;
  const normalizado = String(valorCelda).trim().replace(/\./g, '').replace(',', '.');
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Lee la hoja Envios y devuelve la tabla de costos estimados de envío a
 * domicilio por provincia: [{ provincia, costo }]. Se usa en el checkout
 * público mientras no está integrada la cotización real por API.
 */
async function getTarifasEnvio(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_ENVIOS;
  const ultimaLetra = columnaALetra(cols.costo);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const tarifas = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const provincia = row[cols.provincia] ? String(row[cols.provincia]).trim() : '';
    if (!provincia) continue;
    tarifas.push({ provincia, costo: parseNumeroFormatoArgentino(row[cols.costo]) });
  }

  return tarifas;
}

/**
 * Actualiza (o crea si no existe) el costo de envío a domicilio de una
 * provincia en la hoja Envios.
 */
async function actualizarTarifaEnvio(sheetsClient, spreadsheetId, sheetName, provincia, costo) {
  const cols = config.COLUMNAS_ENVIOS;
  const ultimaLetra = columnaALetra(cols.costo);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const provinciaNormalizada = String(provincia).trim().toUpperCase();

  let numeroFila = null;
  for (let i = 1; i < rows.length; i++) {
    const provinciaFila = rows[i][cols.provincia] ? String(rows[i][cols.provincia]).trim().toUpperCase() : '';
    if (provinciaFila === provinciaNormalizada) { numeroFila = i + 1; break; }
  }

  if (numeroFila === null) {
    const fila = new Array(cols.costo + 1).fill('');
    fila[cols.provincia] = String(provincia).trim();
    fila[cols.costo] = costo;
    await appendRow(sheetsClient, spreadsheetId, sheetName, fila);
    return;
  }

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${columnaALetra(cols.costo)}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[costo]] },
  });
}

/**
 * Arma el link publico a la ficha de un producto en el catalogo. Es el
 * mismo formato de URL que usa el catalogo para abrir un producto
 * directo (?producto=SKU). Devuelve '' si no hay PUBLIC_URL configurada.
 */
function armarLinkCatalogo(skuGeneral) {
  if (!config.PUBLIC_URL || !skuGeneral) return '';
  return `${config.PUBLIC_URL}/?producto=${encodeURIComponent(skuGeneral)}`;
}

/**
 * Rellena la columna K ("link al catalogo") de TODAS las filas de la hoja
 * Productos, para poder abrir cada producto desde la planilla y revisarlo.
 * Se escribe todo de una sola pasada (un update sobre el rango entero) en
 * vez de fila por fila, que con muchos productos seria lentisimo y comeria
 * la cuota de la API.
 *
 * Ojo: el catalogo publico solo lista productos con stock, asi que el link
 * de un producto sin unidades no va a abrir su ficha.
 */
async function actualizarLinksCatalogoProductos(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const letraLink = columnaALetra(cols.linkCatalogo);

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId, range: `${sheetName}!A:${letraLink}`,
  });
  const rows = response.data.values || [];
  if (rows.length < 2) return { actualizados: 0 };

  let actualizados = 0;
  const valores = [];
  for (let i = 1; i < rows.length; i++) {
    const skuGeneral = rows[i][cols.skuGeneral] ? String(rows[i][cols.skuGeneral]).trim() : '';
    const link = armarLinkCatalogo(skuGeneral);
    if (link) actualizados++;
    valores.push([link]);
  }

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${letraLink}2:${letraLink}${rows.length}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: valores },
  });

  return { actualizados };
}

/**
 * Crea un producto nuevo en la hoja Productos: calcula el siguiente numero
 * de producto libre para el prefijo dado, arma el SKU general, agrega la
 * fila (Producto, Categoria, Subcategoria, SKU general, Precio, Foto) y
 * devuelve los datos del producto recien creado.
 */
async function crearProductoNuevo(sheetsClient, { spreadsheetId, sheetNameProductos, producto, categoria, subcategoria, prefijoSku, precio, proveedor }) {
  const largo = config.LARGO_NUMERO_PRODUCTO;
  const siguienteNumero = await getSiguienteNumeroProducto(sheetsClient, spreadsheetId, sheetNameProductos, prefijoSku);
  const numeroTexto = String(siguienteNumero).padStart(largo, '0');
  const skuGeneral = `${prefijoSku}-${numeroTexto}`;

  const cols = config.COLUMNAS_PRODUCTOS;
  const cantidadColumnas = Math.max(cols.producto, cols.categoria, cols.subcategoria, cols.skuGeneral, cols.precio, cols.foto, cols.proveedor, cols.linkCatalogo) + 1;
  const fila = new Array(cantidadColumnas).fill('');
  fila[cols.producto] = producto;
  fila[cols.categoria] = categoria;
  fila[cols.subcategoria] = subcategoria;
  fila[cols.skuGeneral] = skuGeneral;
  fila[cols.precio] = precio;
  fila[cols.foto] = '';
  fila[cols.proveedor] = proveedor || '';
  fila[cols.linkCatalogo] = armarLinkCatalogo(skuGeneral);

  await appendRow(sheetsClient, spreadsheetId, sheetNameProductos, fila);

  // Tambien creamos la fila en STOCK (planilla de VENTAS) para este SKU
  // general nuevo, arrancando en 0 (todavia no se genero ninguna unidad).
  await asegurarFilaStock(sheetsClient, config.SHEET_ID_VENTAS, config.HOJA_STOCK, {
    skuGeneral, nombre: producto, categoria,
  });

  return { producto, categoria, subcategoria, skuGeneral, precio, foto: '', proveedor: proveedor || '' };
}

/**
 * Busca un producto por SKU general en la hoja Productos y devuelve su
 * numero de fila (1-based) junto con la fila completa de valores, o
 * { numeroFila: null } si no lo encuentra.
 */
async function buscarFilaProductoPorSkuGeneral(sheetsClient, spreadsheetId, sheetName, skuGeneral) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const ultimaLetra = columnaALetra(Math.max(cols.producto, cols.categoria, cols.subcategoria, cols.skuGeneral, cols.precio, cols.foto));
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const skuNormalizado = String(skuGeneral).trim().toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i];
    const skuFila = fila[cols.skuGeneral] ? String(fila[cols.skuGeneral]).trim().toLowerCase() : '';
    if (skuFila === skuNormalizado) {
      return { numeroFila: i + 1, fila };
    }
  }

  return { numeroFila: null, fila: null };
}

/**
 * Agrega una foto a la galeria de un producto (columna Foto de la hoja
 * Productos, que guarda un array JSON de hasta 4 URLs), buscandolo por
 * SKU general. Devuelve { encontrado, fotos, limiteAlcanzado }:
 *  - encontrado=false si el SKU general no existe en la hoja.
 *  - limiteAlcanzado=true si ya tenia 4 fotos y no se agrego ninguna mas.
 */
async function agregarFotoProducto(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral, fotoUrl) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const { numeroFila, fila } = await buscarFilaProductoPorSkuGeneral(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral);
  if (!numeroFila) return { encontrado: false, fotos: [] };

  const fotosActuales = parsearFotos(fila[cols.foto]);
  if (fotosActuales.length >= 4) {
    return { encontrado: true, fotos: fotosActuales, limiteAlcanzado: true };
  }

  const fotosNuevas = [...fotosActuales, fotoUrl];

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetNameProductos, numeroFila);
  const letraFoto = columnaALetra(cols.foto);
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetNameProductos}!${letraFoto}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[JSON.stringify(fotosNuevas)]] },
  });

  return { encontrado: true, fotos: fotosNuevas, limiteAlcanzado: false };
}

/**
 * Saca una foto de la galeria de un producto por indice (0 a 3),
 * buscandolo por SKU general. Devuelve { encontrado, fotos, fotoEliminada }.
 */
async function eliminarFotoProducto(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral, indice) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const { numeroFila, fila } = await buscarFilaProductoPorSkuGeneral(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral);
  if (!numeroFila) return { encontrado: false, fotos: [], fotoEliminada: null };

  const fotosActuales = parsearFotos(fila[cols.foto]);
  const fotoEliminada = fotosActuales[indice] || null;
  const fotosNuevas = fotosActuales.filter((_, i) => i !== indice);

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetNameProductos, numeroFila);
  const letraFoto = columnaALetra(cols.foto);
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetNameProductos}!${letraFoto}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[fotosNuevas.length ? JSON.stringify(fotosNuevas) : '']] },
  });

  return { encontrado: true, fotos: fotosNuevas, fotoEliminada };
}

/**
 * Actualiza la descripcion (columna I) de un producto en la hoja
 * Productos, buscandolo por SKU general. Devuelve true si lo encontro y
 * actualizo, false si el SKU general no existe en la hoja.
 */
async function actualizarDescripcionProducto(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral, descripcion) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const { numeroFila } = await buscarFilaProductoPorSkuGeneral(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral);
  if (!numeroFila) return false;

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetNameProductos, numeroFila);
  const letraDescripcion = columnaALetra(cols.descripcion);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetNameProductos}!${letraDescripcion}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[descripcion || '']] },
  });

  return true;
}

/**
 * Actualiza el precio (columna Precio) de un producto en la hoja
 * Productos, buscandolo por SKU general. Devuelve true si lo encontro y
 * actualizo, false si el SKU general no existe en la hoja.
 * Se usa desde "Generar unidades" cuando se edita el precio de un
 * producto ya existente antes de cargar mas stock.
 */
async function actualizarPrecioProducto(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral, precio) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const { numeroFila } = await buscarFilaProductoPorSkuGeneral(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral);
  if (!numeroFila) return false;

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetNameProductos, numeroFila);
  const letraPrecio = columnaALetra(cols.precio);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetNameProductos}!${letraPrecio}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[precio]] },
  });

  return true;
}

/**
 * Actualiza el proveedor (columna J) de un producto en la hoja
 * Productos, buscandolo por SKU general. Es un dato de uso interno
 * (compras/reposicion) — nunca se muestra en el catalogo publico.
 * Devuelve true si lo encontro y actualizo, false si el SKU general no
 * existe en la hoja.
 */
async function actualizarProveedorProducto(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral, proveedor) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const { numeroFila } = await buscarFilaProductoPorSkuGeneral(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral);
  if (!numeroFila) return false;

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetNameProductos, numeroFila);
  const letraProveedor = columnaALetra(cols.proveedor);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetNameProductos}!${letraProveedor}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[proveedor || '']] },
  });

  return true;
}

/**
 * Muestra u oculta un producto del catalogo publico (columna L de
 * Productos), buscandolo por SKU general. Ocultarlo NO le saca el
 * stock ni impide venderlo desde el admin — solo lo saca del listado
 * que ve el cliente. Devuelve true si lo encontro y actualizo, false
 * si el SKU general no existe en la hoja.
 */
async function actualizarVisibilidadProducto(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral, visible) {
  const cols = config.COLUMNAS_PRODUCTOS;
  const { numeroFila } = await buscarFilaProductoPorSkuGeneral(sheetsClient, spreadsheetId, sheetNameProductos, skuGeneral);
  if (!numeroFila) return false;

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetNameProductos, numeroFila);
  const letraVisible = columnaALetra(cols.visiblePublico);

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetNameProductos}!${letraVisible}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[visible ? '' : 'NO']] },
  });

  return true;
}

/**
 * Borra TODAS las filas de una hoja donde la columna dada (por indice)
 * coincida exactamente (sin importar mayus/minus ni espacios) con el
 * valor buscado. Devuelve cuantas filas borro. Se usa para eliminar un
 * producto "de todos lados" (Productos, STOCK, CODIGOS_BARRA) cuando se
 * cargo mal — NO toca VENTAS/HISTORICO_SKU/PEDIDOS, esos son registros
 * historicos que tienen que sobrevivir aunque el producto se borre.
 */
async function borrarFilasPorValor(sheetsClient, spreadsheetId, sheetName, indiceColumna, valorBuscado) {
  const ultimaLetra = columnaALetra(indiceColumna);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const valorNormalizado = String(valorBuscado).trim().toLowerCase();

  const filasABorrar = [];
  for (let i = 1; i < rows.length; i++) {
    const celda = rows[i][indiceColumna] ? String(rows[i][indiceColumna]).trim().toLowerCase() : '';
    if (celda === valorNormalizado) filasABorrar.push(i + 1);
  }
  if (filasABorrar.length === 0) return 0;

  const metadata = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const hoja = metadata.data.sheets.find((h) => h.properties.title === sheetName);
  if (!hoja) return 0;

  // Se borran de abajo hacia arriba (indices mas altos primero) dentro
  // del mismo batchUpdate: asi cada deleteDimension no corre los indices
  // de los que todavia faltan procesar en este mismo llamado.
  const requests = filasABorrar
    .sort((a, b) => b - a)
    .map((numeroFila) => ({
      deleteDimension: {
        range: { sheetId: hoja.properties.sheetId, dimension: 'ROWS', startIndex: numeroFila - 1, endIndex: numeroFila },
      },
    }));

  await sheetsClient.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  return filasABorrar.length;
}

/**
 * Elimina un producto por completo: su fila en Productos, su(s) fila(s)
 * de STOCK, y cualquier asociacion de codigo de barras que apunte a el.
 * Deliberadamente NO toca VENTAS, HISTORICO_SKU ni PEDIDOS (historial
 * real de ventas/pedidos, tiene que sobrevivir para no perder
 * trazabilidad aunque el producto se haya borrado despues).
 */
async function eliminarProductoCompleto(sheetsClient, {
  spreadsheetIdProductos, spreadsheetIdVentas, hojaProductos, hojaStock, hojaCodigosBarra,
}, skuGeneral) {
  const borradosProductos = await borrarFilasPorValor(
    sheetsClient, spreadsheetIdProductos, hojaProductos, config.COLUMNAS_PRODUCTOS.skuGeneral, skuGeneral,
  );
  const borradosStock = await borrarFilasPorValor(
    sheetsClient, spreadsheetIdVentas, hojaStock, config.COLUMNAS_STOCK.skuGeneral, skuGeneral,
  );
  const borradosCodigos = await borrarFilasPorValor(
    sheetsClient, spreadsheetIdProductos, hojaCodigosBarra, config.COLUMNAS_CODIGOS_BARRA.skuGeneral, skuGeneral,
  );

  return { borradosProductos, borradosStock, borradosCodigos };
}

/**
 * Busca a que SKU interno corresponde un codigo de barras externo (ISBN,
 * EAN, etc), en la hoja CODIGOS_BARRA. Devuelve { numeroFila, asociacion }
 * — asociacion = {codigoBarra, skuGeneral, producto, fecha} — o
 * { numeroFila: null, asociacion: null } si todavia no esta asociado.
 *
 * OJO: Google Sheets interpreta como NUMERO cualquier valor que "parezca"
 * numerico y le saca los ceros a la izquierda (ej "015351" queda
 * guardado como 15351). Los guardamos con valueInputOption RAW (ver
 * asociarCodigoBarra) para que esto no pase mas, pero para reconocer
 * codigos viejos que ya quedaron sin el cero, la comparacion tambien
 * prueba sin ceros a la izquierda.
 */
function normalizarCodigoBarra(valor) {
  return String(valor).trim().replace(/^0+(?=\d)/, '');
}

async function buscarAsociacionCodigoBarra(sheetsClient, spreadsheetId, sheetName, codigoBarra) {
  const cols = config.COLUMNAS_CODIGOS_BARRA;
  const ultimaLetra = columnaALetra(Math.max(...Object.values(cols)));
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const codigoExacto = String(codigoBarra).trim();
  const codigoSinCeros = normalizarCodigoBarra(codigoBarra);

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i];
    const codigoFila = fila[cols.codigoBarra] ? String(fila[cols.codigoBarra]).trim() : '';
    if (codigoFila === '') continue;
    if (codigoFila === codigoExacto || normalizarCodigoBarra(codigoFila) === codigoSinCeros) {
      return {
        numeroFila: i + 1,
        asociacion: {
          codigoBarra: fila[cols.codigoBarra] || '',
          skuGeneral: fila[cols.skuGeneral] || '',
          producto: fila[cols.producto] || '',
          fecha: fila[cols.fecha] || '',
        },
      };
    }
  }

  return { numeroFila: null, asociacion: null };
}

/**
 * Crea o actualiza (upsert) la asociacion entre un codigo de barras
 * externo y un SKU interno. Si el codigo ya estaba asociado a otro SKU,
 * lo reemplaza (permite corregir una asociacion mal hecha).
 *
 * Usa valueInputOption RAW (no USER_ENTERED) para que Sheets guarde el
 * codigo de barras tal cual, como texto, sin intentar interpretarlo como
 * numero y sacarle ceros a la izquierda.
 */
async function asociarCodigoBarra(sheetsClient, spreadsheetId, sheetName, {
  codigoBarra, skuGeneral, producto, fecha,
}) {
  const cols = config.COLUMNAS_CODIGOS_BARRA;
  const { numeroFila } = await buscarAsociacionCodigoBarra(sheetsClient, spreadsheetId, sheetName, codigoBarra);

  const fila = new Array(Math.max(...Object.values(cols)) + 1).fill('');
  fila[cols.codigoBarra] = codigoBarra;
  fila[cols.skuGeneral] = skuGeneral;
  fila[cols.producto] = producto || '';
  fila[cols.fecha] = fecha || '';

  if (numeroFila) {
    await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, numeroFila);
    const letraFinal = columnaALetra(fila.length - 1);
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${numeroFila}:${letraFinal}${numeroFila}`,
      valueInputOption: 'RAW',
      requestBody: { values: [fila] },
    });
  } else {
    await appendRow(sheetsClient, spreadsheetId, sheetName, fila, 'RAW');
  }
}

/**
 * Busca, entre las unidades ya generadas de un skuGeneral (HISTORICO_SKU),
 * la primera que todavia no aparece en VENTAS (ni vendida ni pendiente de
 * procesar). Se usa para poder "vender" escaneando el código de barras
 * ORIGINAL del producto (el mismo en todas las copias: ISBN, EAN, etc):
 * como ese código no identifica una unidad física puntual, en vez de
 * usarlo directamente como SKU vendido (lo que rompería el conteo, ya
 * que la segunda venta del mismo código se marcaría como "duplicado, no
 * contado"), se le asigna automáticamente la próxima unidad con serial
 * disponible. Devuelve el skuCompleto, o null si no queda ninguna unidad
 * generada sin vender para ese skuGeneral.
 */
async function buscarSkuCompletoDisponible(sheetsClient, spreadsheetIdProductos, spreadsheetIdVentas, skuGeneral) {
  const historico = await getHistoricoSku(sheetsClient, spreadsheetIdProductos, config.HOJA_HISTORICO_SKU);
  const skuNormalizado = String(skuGeneral).trim().toLowerCase();
  const generados = historico
    .filter((h) => String(h.skuGeneral).trim().toLowerCase() === skuNormalizado)
    .map((h) => h.skuCompleto);

  if (generados.length === 0) return null;

  const responseVentas = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: spreadsheetIdVentas,
    range: `${config.HOJA_VENTAS}!A:A`,
  });
  const rows = responseVentas.data.values || [];
  const yaEnVentas = new Set(
    rows.slice(1).map((r) => (r[0] ? String(r[0]).trim().toLowerCase() : '')).filter(Boolean),
  );

  for (const skuCompleto of generados) {
    if (!yaEnVentas.has(String(skuCompleto).trim().toLowerCase())) {
      return skuCompleto;
    }
  }

  return null;
}

/**
 * Igual que buscarSkuCompletoDisponible pero devuelve hasta `cantidad`
 * ejemplares sin vender de un SKU general, en vez de uno solo — para
 * despachar pedidos grandes de una vez sin tener que escanear cada
 * unidad individual. Devuelve un array (puede tener menos elementos que
 * `cantidad` si no hay tantos generados/disponibles).
 */
async function buscarSkuCompletosDisponibles(sheetsClient, spreadsheetIdProductos, spreadsheetIdVentas, skuGeneral, cantidad) {
  const historico = await getHistoricoSku(sheetsClient, spreadsheetIdProductos, config.HOJA_HISTORICO_SKU);
  const skuNormalizado = String(skuGeneral).trim().toLowerCase();
  const generados = historico
    .filter((h) => String(h.skuGeneral).trim().toLowerCase() === skuNormalizado)
    .map((h) => h.skuCompleto);

  if (generados.length === 0) return [];

  const responseVentas = await sheetsClient.spreadsheets.values.get({
    spreadsheetId: spreadsheetIdVentas,
    range: `${config.HOJA_VENTAS}!A:A`,
  });
  const rows = responseVentas.data.values || [];
  const yaEnVentas = new Set(
    rows.slice(1).map((r) => (r[0] ? String(r[0]).trim().toLowerCase() : '')).filter(Boolean),
  );

  const disponibles = [];
  for (const skuCompleto of generados) {
    if (disponibles.length >= cantidad) break;
    if (!yaEnVentas.has(String(skuCompleto).trim().toLowerCase())) {
      disponibles.push(skuCompleto);
    }
  }

  return disponibles;
}

/**
 * Agrega filas a la hoja IMPRIMIR APP (solo unidades generadas desde esta
 * app web, separado de la hoja IMPRIMIR que usa el generador del lado de
 * Google Sheets). Formato: Producto, Categoria, Subcategoria, SKU completo
 * — igual al que ya lee `getFilasImprimir`.
 */
async function appendFilasImprimirApp(sheetsClient, spreadsheetId, sheetName, filas) {
  const filasDeValores = filas.map((f) => [f.producto, f.categoria, f.subcategoria, f.skuCompleto]);
  await appendRows(sheetsClient, spreadsheetId, sheetName, filasDeValores);
}

/**
 * Suma `cantidadASumar` a la columna "Cantidad Manual" de STOCK para un
 * SKU general dado, y anota la fecha de esa actualizacion. Si el SKU
 * general todavia no tiene fila en STOCK, la crea completa (con "Cantidad
 * actual" en 0 — el trigger de Google Sheets la recalcula solo a partir
 * de la manual).
 */
async function sumarCantidadManualStock(sheetsClient, spreadsheetId, sheetName, { skuGeneral, cantidad, nombre, categoria, fecha }) {
  const cols = config.COLUMNAS_STOCK;
  const ultimaLetra = columnaALetra(Math.max(cols.skuGeneral, cols.cantidadManual, cols.fechaActualizacionManual, cols.cantidadActual, cols.nombre, cols.categoria));
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const skuNormalizado = String(skuGeneral).trim().toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i];
    const filaSku = fila[cols.skuGeneral] ? String(fila[cols.skuGeneral]).trim().toLowerCase() : '';
    if (filaSku === skuNormalizado) {
      const cantidadManualActual = Number(fila[cols.cantidadManual]) || 0;
      const cantidadActualActual = Number(fila[cols.cantidadActual]) || 0;
      const nuevaCantidadManual = cantidadManualActual + cantidad;
      // OJO: los triggers onEdit de Google Apps Script NO se disparan con
      // ediciones hechas por la API (solo con ediciones manuales de una
      // persona en la interfaz de Sheets). Por eso "Cantidad actual" no se
      // recalcula sola aca — la sumamos nosotros mismos, con el mismo
      // incremento que "Cantidad Manual", imitando lo que haria el trigger.
      const nuevaCantidadActual = cantidadActualActual + cantidad;
      const numeroFila = i + 1;

      await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, numeroFila);

      // Actualizamos Cantidad Manual, Fecha de actualizacion manual y
      // Cantidad actual en un solo pedido (columnas B:D).
      const letraCantidadManual = columnaALetra(cols.cantidadManual);
      const letraCantidadActual = columnaALetra(cols.cantidadActual);
      const letraNombre = columnaALetra(cols.nombre);
      const letraCategoria = columnaALetra(cols.categoria);

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${letraCantidadManual}${numeroFila}:${letraCantidadActual}${numeroFila}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[nuevaCantidadManual, fecha, nuevaCantidadActual]] },
      });

      if (!fila[cols.nombre] && nombre) {
        await sheetsClient.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!${letraNombre}${numeroFila}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[nombre]] },
        });
      }
      if (!fila[cols.categoria] && categoria) {
        await sheetsClient.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!${letraCategoria}${numeroFila}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [[categoria]] },
        });
      }
      return;
    }
  }

  // No existia todavia una fila para este SKU general: la creamos completa.
  // Como es stock recien creado (nada vendido todavia), Cantidad actual
  // arranca directamente en la cantidad generada, no en 0.
  const filaNueva = [];
  filaNueva[cols.skuGeneral] = skuGeneral;
  filaNueva[cols.cantidadManual] = cantidad;
  filaNueva[cols.fechaActualizacionManual] = fecha;
  filaNueva[cols.cantidadActual] = cantidad;
  filaNueva[cols.nombre] = nombre || '';
  filaNueva[cols.categoria] = categoria || '';
  for (let i = 0; i < filaNueva.length; i++) if (filaNueva[i] === undefined) filaNueva[i] = '';

  await appendRow(sheetsClient, spreadsheetId, sheetName, filaNueva);
}

/**
 * Si un SKU general todavia no tiene fila en STOCK, la crea completa
 * (Nombre, Categoria) con "Cantidad manual" y "Cantidad actual" en 0. Se
 * usa al crear un PRODUCTO NUEVO (todavia sin unidades generadas).
 */
async function asegurarFilaStock(sheetsClient, spreadsheetId, sheetName, { skuGeneral, nombre, categoria }) {
  const cols = config.COLUMNAS_STOCK;
  const range = `${sheetName}!A:A`;

  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  const skuNormalizado = String(skuGeneral).trim().toLowerCase();
  const yaExiste = rows.some((row) => row[0] && String(row[0]).trim().toLowerCase() === skuNormalizado);
  if (yaExiste) return;

  const filaNueva = [];
  filaNueva[cols.skuGeneral] = skuGeneral;
  filaNueva[cols.cantidadManual] = 0;
  filaNueva[cols.fechaActualizacionManual] = '';
  filaNueva[cols.cantidadActual] = 0;
  filaNueva[cols.nombre] = nombre || '';
  filaNueva[cols.categoria] = categoria || '';
  for (let i = 0; i < filaNueva.length; i++) if (filaNueva[i] === undefined) filaNueva[i] = '';

  await appendRow(sheetsClient, spreadsheetId, sheetName, filaNueva);
}

/**
 * Agrega filas a la hoja PRECIOS (A=SKU completo, B=Precio, C=Nombre) por
 * cada unidad nueva generada, para que el escaner pueda encontrar precio
 * y nombre apenas se lea el codigo por primera vez.
 */
/* ============================================================
 *  ADMIN USERS (login con Google + niveles de acceso)
 * ============================================================ */

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Lee todos los usuarios autorizados de AdminUsers y los devuelve como
 * array de objetos { numeroFila, email, nivel, nombre, fechaAlta, agregadoPor }.
 * `nivel` se devuelve como numero (1 o 2); una fila con un valor invalido
 * o vacio cae a nivel 1 (el mas restrictivo, nunca abrimos de mas por un
 * dato mal cargado en la hoja).
 */
async function getAdminUsers(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_ADMIN_USERS;
  const ultimaLetra = columnaALetra(Math.max(...Object.values(cols)));
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const usuarios = [];

  // Saltamos la fila 1 (encabezado)
  for (let i = 1; i < rows.length; i++) {
    const fila = rows[i];
    const email = fila[cols.email] ? normalizarEmail(fila[cols.email]) : '';
    if (!email) continue;
    const nivelNumero = Number(fila[cols.nivel]);
    usuarios.push({
      numeroFila: i + 1,
      email,
      nivel: nivelNumero === 2 ? 2 : 1,
      nombre: fila[cols.nombre] ? String(fila[cols.nombre]).trim() : '',
      fechaAlta: fila[cols.fechaAlta] || '',
      agregadoPor: fila[cols.agregadoPor] || '',
    });
  }

  return usuarios;
}

/**
 * Busca un usuario por email (case-insensitive). Devuelve
 * { numeroFila, usuario } o { numeroFila: null, usuario: null }.
 */
async function buscarAdminUserPorEmail(sheetsClient, spreadsheetId, sheetName, email) {
  const usuarios = await getAdminUsers(sheetsClient, spreadsheetId, sheetName);
  const emailNormalizado = normalizarEmail(email);
  const encontrado = usuarios.find((u) => u.email === emailNormalizado);
  return encontrado ? { numeroFila: encontrado.numeroFila, usuario: encontrado } : { numeroFila: null, usuario: null };
}

/**
 * Crea o actualiza (upsert) un usuario del panel admin: si el email ya
 * existe, actualiza nivel/nombre en la misma fila; si no, agrega una
 * fila nueva. Se usa tanto para altas manuales desde el panel (nivel 2
 * agregando a alguien) como para el alta automatica del ADMIN_SEED_EMAIL
 * la primera vez que inicia sesion.
 */
async function crearOActualizarAdminUser(sheetsClient, spreadsheetId, sheetName, {
  email, nivel, nombre, fecha, agregadoPor,
}) {
  const cols = config.COLUMNAS_ADMIN_USERS;
  const emailNormalizado = normalizarEmail(email);
  const { numeroFila, usuario } = await buscarAdminUserPorEmail(sheetsClient, spreadsheetId, sheetName, emailNormalizado);

  const fila = new Array(Math.max(...Object.values(cols)) + 1).fill('');
  fila[cols.email] = emailNormalizado;
  fila[cols.nivel] = nivel === 2 ? 2 : 1;
  // Si ya existia y no nos mandaron nombre nuevo, conservamos el que
  // tenia (Google solo nos da el nombre en el momento del login).
  fila[cols.nombre] = nombre !== undefined && nombre !== null && nombre !== ''
    ? nombre
    : (usuario ? usuario.nombre : '');
  fila[cols.fechaAlta] = usuario ? usuario.fechaAlta : fecha;
  fila[cols.agregadoPor] = usuario ? usuario.agregadoPor : (agregadoPor || '');

  if (numeroFila) {
    await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, numeroFila);
    const ultimaLetra = columnaALetra(Math.max(...Object.values(cols)));
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A${numeroFila}:${ultimaLetra}${numeroFila}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [fila] },
    });
  } else {
    await appendRow(sheetsClient, spreadsheetId, sheetName, fila);
  }

  return { email: emailNormalizado, nivel: fila[cols.nivel], nombre: fila[cols.nombre] };
}

/**
 * Quita el acceso de un usuario (borra su fila de AdminUsers). No borra
 * nada de lo que ese usuario haya generado antes (HISTORICO_SKU, VENTAS,
 * etc quedan con su email tal cual, para no perder trazabilidad).
 * Devuelve true si encontro y borro la fila, false si no existia.
 */
async function eliminarAdminUser(sheetsClient, spreadsheetId, sheetName, email) {
  const { numeroFila } = await buscarAdminUserPorEmail(sheetsClient, spreadsheetId, sheetName, email);
  if (!numeroFila) return false;

  const metadata = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const hoja = metadata.data.sheets.find((h) => h.properties.title === sheetName);
  if (!hoja) return false;

  await sheetsClient.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: hoja.properties.sheetId,
            dimension: 'ROWS',
            startIndex: numeroFila - 1,
            endIndex: numeroFila,
          },
        },
      }],
    },
  });

  return true;
}

/* ============================================================
 *  CLIENTES (login con Google del catalogo publico)
 * ============================================================ */

/** Genera un codigo de fidelidad unico (no es el email, para no
    exponerlo en el QR que el cliente muestra en el local). */
function generarCodigoFidelidad() {
  const azar = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `LON-${azar}`;
}

/**
 * Lee todas las cuentas de clientes y las devuelve como array de
 * objetos { numeroFila, email, nombre, fechaAlta, codigoFidelidad,
 * cafesContador }.
 */
async function getClientes(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_CLIENTES;
  const ultimaLetra = columnaALetra(Math.max(...Object.values(cols)));
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const clientes = [];

  for (let i = 1; i < rows.length; i++) {
    const fila = rows[i];
    const email = fila[cols.email] ? normalizarEmail(fila[cols.email]) : '';
    if (!email) continue;
    const cafesContador = Number(fila[cols.cafesContador]);
    clientes.push({
      numeroFila: i + 1,
      email,
      nombre: fila[cols.nombre] ? String(fila[cols.nombre]).trim() : '',
      fechaAlta: fila[cols.fechaAlta] || '',
      codigoFidelidad: fila[cols.codigoFidelidad] ? String(fila[cols.codigoFidelidad]).trim() : '',
      cafesContador: Number.isFinite(cafesContador) ? cafesContador : 0,
    });
  }

  return clientes;
}

async function buscarClientePorEmail(sheetsClient, spreadsheetId, sheetName, email) {
  const clientes = await getClientes(sheetsClient, spreadsheetId, sheetName);
  const emailNormalizado = normalizarEmail(email);
  const encontrado = clientes.find((c) => c.email === emailNormalizado);
  return encontrado ? { numeroFila: encontrado.numeroFila, cliente: encontrado } : { numeroFila: null, cliente: null };
}

async function buscarClientePorCodigoFidelidad(sheetsClient, spreadsheetId, sheetName, codigo) {
  const clientes = await getClientes(sheetsClient, spreadsheetId, sheetName);
  const codigoNormalizado = String(codigo || '').trim().toUpperCase();
  const encontrado = clientes.find((c) => c.codigoFidelidad.toUpperCase() === codigoNormalizado);
  return encontrado ? { numeroFila: encontrado.numeroFila, cliente: encontrado } : { numeroFila: null, cliente: null };
}

/**
 * Da de alta a un cliente la primera vez que inicia sesión con Google
 * (a diferencia de AdminUsers, no requiere whitelist previa: cualquier
 * cuenta de Google puede ser cliente). Si ya existe, no toca nada —
 * solo devuelve sus datos. Genera su codigo de fidelidad en el alta.
 */
async function crearClienteSiNoExiste(sheetsClient, spreadsheetId, sheetName, { email, nombre, fecha }) {
  const emailNormalizado = normalizarEmail(email);
  const { cliente } = await buscarClientePorEmail(sheetsClient, spreadsheetId, sheetName, emailNormalizado);
  if (cliente) return cliente;

  const cols = config.COLUMNAS_CLIENTES;
  const codigoFidelidad = generarCodigoFidelidad();
  const fila = new Array(Math.max(...Object.values(cols)) + 1).fill('');
  fila[cols.email] = emailNormalizado;
  fila[cols.nombre] = nombre || '';
  fila[cols.fechaAlta] = fecha;
  fila[cols.codigoFidelidad] = codigoFidelidad;
  fila[cols.cafesContador] = 0;
  await appendRow(sheetsClient, spreadsheetId, sheetName, fila);

  return { email: emailNormalizado, nombre: nombre || '', fechaAlta: fecha, codigoFidelidad, cafesContador: 0 };
}

/**
 * Registra "cantidad" cafés cargados a un cliente identificado por su
 * código de fidelidad (el admin confirma la cantidad a mano después de
 * escanear, no se suma sola por cada lectura de cámara — evita que un
 * QR leído varias veces de casualidad cargue de más). El contador tiene
 * dos etapas, aplicadas cantidad veces en secuencia:
 *   1. Mientras cafesContador < CAFES_PARA_GRATIS: cada unidad es un
 *      café pago, suma 1. Al llegar al objetivo (3), el contador queda
 *      EN el objetivo (no se resetea todavía) — el cliente "tiene un
 *      regalo pendiente".
 *   2. La siguiente unidad, como cafesContador ya está en el objetivo,
 *      se interpreta como la entrega del regalo: el contador vuelve a 0
 *      y arranca un ciclo nuevo.
 * Devuelve null si el código no corresponde a ningún cliente.
 */
async function registrarCafeCliente(sheetsClient, spreadsheetId, sheetName, codigoFidelidad, cantidad = 1) {
  const { numeroFila, cliente } = await buscarClientePorCodigoFidelidad(sheetsClient, spreadsheetId, sheetName, codigoFidelidad);
  if (!numeroFila) return null;

  const objetivo = config.CAFES_PARA_GRATIS;
  let contador = cliente.cafesContador;
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
  const nuevoContador = contador;
  const esGratis = regalosEntregados > 0;

  const cols = config.COLUMNAS_CLIENTES;
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${columnaALetra(cols.cafesContador)}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[nuevoContador]] },
  });

  return { cliente, cafesContador: nuevoContador, esGratis, regalosEntregados, regaloDesbloqueado };
}

/* ============================================================
 *  PEDIDOS (pagos con Payway / transferencia + coordinacion de envio)
 * ============================================================ */

/**
 * Arma el array de valores (en el orden correcto) para una fila de
 * PEDIDOS, usando config.COLUMNAS_PEDIDOS como fuente de verdad del
 * orden de columnas.
 */
function construirFilaPedido(datos) {
  const cols = config.COLUMNAS_PEDIDOS;
  const cantidadColumnas = Math.max(...Object.values(cols)) + 1;
  const fila = new Array(cantidadColumnas).fill('');
  Object.entries(cols).forEach(([campo, indice]) => {
    fila[indice] = datos[campo] !== undefined && datos[campo] !== null ? datos[campo] : '';
  });
  return fila;
}

/**
 * Convierte una fila cruda de la hoja PEDIDOS (array de valores) a un
 * objeto { pedidoId, fecha, ... } usando config.COLUMNAS_PEDIDOS.
 */
function filaPedidoAObjeto(fila) {
  const cols = config.COLUMNAS_PEDIDOS;
  const objeto = {};
  Object.entries(cols).forEach(([campo, indice]) => {
    objeto[campo] = fila[indice] !== undefined ? fila[indice] : '';
  });
  return objeto;
}

/**
 * Crea un pedido nuevo en la hoja PEDIDOS. Se llama al iniciar un pago
 * (antes de mandar a la persona a Payway, o antes de mostrarle los datos
 * de transferencia), con estado inicial "Pendiente de pago". El webhook
 * de Payway (o la confirmación manual del admin, si es transferencia)
 * despues actualiza el estado segun el resultado del pago.
 */
async function crearPedido(sheetsClient, spreadsheetId, sheetName, datosPedido) {
  const fila = construirFilaPedido(datosPedido);
  await appendRow(sheetsClient, spreadsheetId, sheetName, fila);
  return datosPedido;
}

/**
 * Lee todos los pedidos de la hoja PEDIDOS y los devuelve como array de
 * objetos, mas recientes primero.
 */
async function getPedidos(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_PEDIDOS;
  const ultimaLetra = columnaALetra(Math.max(...Object.values(cols)));
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const pedidos = [];

  // Saltamos la fila 1 (encabezado)
  for (let i = 1; i < rows.length; i++) {
    const fila = rows[i];
    const pedidoId = fila[cols.pedidoId] ? String(fila[cols.pedidoId]).trim() : '';
    if (!pedidoId) continue;
    pedidos.push(filaPedidoAObjeto(fila));
  }

  return pedidos.reverse();
}

/**
 * Busca un pedido por su ID y devuelve { numeroFila, pedido } o
 * { numeroFila: null, pedido: null } si no existe.
 */
async function getPedidoPorId(sheetsClient, spreadsheetId, sheetName, pedidoId) {
  const cols = config.COLUMNAS_PEDIDOS;
  const ultimaLetra = columnaALetra(Math.max(...Object.values(cols)));
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const idNormalizado = String(pedidoId).trim().toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i];
    const idFila = fila[cols.pedidoId] ? String(fila[cols.pedidoId]).trim().toLowerCase() : '';
    if (idFila === idNormalizado) {
      return { numeroFila: i + 1, pedido: filaPedidoAObjeto(fila) };
    }
  }

  return { numeroFila: null, pedido: null };
}

/**
 * Busca un pedido por su pagoExternoId (el identificador que devolvió
 * Payway al crear el link de pago). Se usa desde el webhook de Payway,
 * que no conoce nuestro pedidoId propio. Devuelve { numeroFila, pedido }
 * o { numeroFila: null, pedido: null } si no existe.
 */
async function getPedidoPorPagoExternoId(sheetsClient, spreadsheetId, sheetName, pagoExternoId) {
  const cols = config.COLUMNAS_PEDIDOS;
  const ultimaLetra = columnaALetra(Math.max(...Object.values(cols)));
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const idNormalizado = String(pagoExternoId).trim().toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i];
    const idFila = fila[cols.pagoExternoId] ? String(fila[cols.pagoExternoId]).trim().toLowerCase() : '';
    if (idFila && idFila === idNormalizado) {
      return { numeroFila: i + 1, pedido: filaPedidoAObjeto(fila) };
    }
  }

  return { numeroFila: null, pedido: null };
}

/**
 * Busca los pedidos hechos por un telefono dado (mismo formato que se
 * guardo al crear el pedido), mas recientes primero. Se usa desde el
 * chatbot de WhatsApp para contestar "¿donde está mi pedido?".
 */
async function getPedidosPorTelefono(sheetsClient, spreadsheetId, sheetName, telefono) {
  const todos = await getPedidos(sheetsClient, spreadsheetId, sheetName);
  const telefonoNormalizado = String(telefono).replace(/\D/g, '');
  if (!telefonoNormalizado) return [];
  return todos.filter((p) => String(p.telefonoCliente || '').replace(/\D/g, '').endsWith(telefonoNormalizado.slice(-8)));
}

/**
 * Actualiza campos puntuales de un pedido (busca la fila por pedidoId,
 * mergea los campos nuevos sobre la fila existente y la reescribe entera).
 * `camposActualizar` es un objeto parcial, ej { estado: 'Enviado', transportista: 'Andreani' }.
 * Devuelve true si encontro y actualizo el pedido, false si no existe.
 */
async function actualizarPedido(sheetsClient, spreadsheetId, sheetName, pedidoId, camposActualizar) {
  const cols = config.COLUMNAS_PEDIDOS;
  const { numeroFila, pedido } = await getPedidoPorId(sheetsClient, spreadsheetId, sheetName, pedidoId);
  if (!numeroFila) return false;

  const pedidoActualizado = { ...pedido, ...camposActualizar };
  const fila = construirFilaPedido(pedidoActualizado);

  await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, numeroFila);
  const ultimaLetra = columnaALetra(Math.max(...Object.values(cols)));

  await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${numeroFila}:${ultimaLetra}${numeroFila}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [fila] },
  });

  return true;
}

/* ============================================================
 *  PROCESADOR DE VENTAS (portado del Apps Script "Control de Stock")
 * ============================================================
 * Antes esto corria como un time-driven trigger de Google Apps Script,
 * pero esos triggers tienen un minimo de 1 minuto entre corridas. Para
 * poder procesar cada 10 segundos, esta misma logica corre aca, llamada
 * por un setInterval en server.js.
 *
 * IMPORTANTE: si dejaste el trigger de Apps Script tambien activo,
 * desactivalo (menu "Control de Stock" -> ya no hace falta, Node se
 * encarga) para evitar que los dos procesen la misma fila a la vez.
 * ============================================================ */

/**
 * Extrae el SKU corto (SKU general) de un SKU completo, con el mismo
 * criterio robusto que el Apps Script: solo le saca el ultimo bloque si
 * hay al menos 4 bloques Y el ultimo es puramente numerico (parece un
 * numero de serie). Si no, asumimos que ya es un SKU general.
 */
function extraerSkuCortoRobusto(skuCompleto) {
  const texto = String(skuCompleto).trim();
  const partes = texto.split('-');
  if (partes.length < 4) return texto;

  const ultimoBloque = partes[partes.length - 1];
  const pareceNumeroDeSerie = /^[0-9]+$/.test(ultimoBloque);
  if (!pareceNumeroDeSerie) return texto;

  partes.pop();
  return partes.join('-');
}

function normalizarSkuTexto(sku) {
  return String(sku).trim().toUpperCase();
}

/**
 * Formatea una fecha como "dd/MM/yyyy HH:mm" en el timezone configurado,
 * igual que el Apps Script (Utilities.formatDate).
 */
function formatearFechaHoraCorta(fecha, timezone) {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: timezone,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(fecha);

  const obtener = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${obtener('day')}/${obtener('month')}/${obtener('year')} ${obtener('hour')}:${obtener('minute')}`;
}

/**
 * Suma `delta` a "Cantidad actual" en STOCK para un SKU corto (general).
 * `delta` negativo descuenta (venta en el local, o reserva de un pedido
 * online al confirmarse el pago) y positivo devuelve unidades (pedido
 * cancelado / pago rechazado). Si no existe fila para ese SKU, crea una
 * nueva con cantidad = delta (igual que hacia el Apps Script),
 * completando Nombre si lo tenemos. Devuelve la cantidad resultante.
 */
async function ajustarStockCantidad(sheetsClient, spreadsheetId, sheetNameStock, skuCorto, delta, nombre) {
  const cols = config.COLUMNAS_STOCK;
  const range = `${sheetNameStock}!A:F`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const skuNormalizado = normalizarSkuTexto(skuCorto);

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i];
    const skuFila = fila[cols.skuGeneral] ? normalizarSkuTexto(fila[cols.skuGeneral]) : '';
    if (skuFila === skuNormalizado) {
      const cantidadActual = Number(fila[cols.cantidadActual]) || 0;
      const nuevaCantidad = cantidadActual + delta;
      const numeroFila = i + 1;
      const letraColumna = columnaALetra(cols.cantidadActual);

      await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetNameStock, numeroFila);
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetNameStock}!${letraColumna}${numeroFila}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[nuevaCantidad]] },
      });
      return nuevaCantidad;
    }
  }

  // No existia: creamos la fila nueva con la cantidad del ajuste (igual
  // que el Apps Script, que creaba la fila en -1 al vender un SKU que
  // todavia no figuraba en STOCK).
  const filaNueva = [];
  filaNueva[cols.skuGeneral] = skuCorto;
  filaNueva[cols.cantidadManual] = 0;
  filaNueva[cols.cantidadActual] = delta;
  if (nombre) filaNueva[cols.nombre] = nombre;
  for (let i = 0; i < filaNueva.length; i++) if (filaNueva[i] === undefined) filaNueva[i] = '';

  await appendRow(sheetsClient, spreadsheetId, sheetNameStock, filaNueva);
  return delta;
}

/**
 * Descuenta 1 a "Cantidad actual" en STOCK para un SKU corto (general).
 * Atajo sobre ajustarStockCantidad; lo usa el procesador de ventas.
 */
async function descontarStockVenta(sheetsClient, spreadsheetId, sheetNameStock, skuCorto, nombre) {
  return ajustarStockCantidad(sheetsClient, spreadsheetId, sheetNameStock, skuCorto, -1, nombre);
}

/**
 * Busca el nombre y el precio del producto para registrar la venta.
 * El precio SIEMPRE sale del catálogo (Productos) por SKU general, así
 * queda registrado el precio vigente al momento de la venta. Si el
 * producto todavía no está en el catálogo, cae a STOCK (columna Nombre)
 * como respaldo solo para el nombre (sin precio).
 */
async function buscarProductoParaVenta(sheetsClient, spreadsheetId, skuCorto) {
  const catalogo = await getCatalogoProductos(sheetsClient, config.SHEET_ID_PRODUCTOS, config.HOJA_PRODUCTOS);
  const skuCortoNormalizado = normalizarSkuTexto(skuCorto);
  const productoCatalogo = catalogo.find((p) => normalizarSkuTexto(p.skuGeneral) === skuCortoNormalizado);

  if (productoCatalogo) {
    return {
      nombre: productoCatalogo.producto || '',
      precio: productoCatalogo.precio !== '' && productoCatalogo.precio !== undefined ? productoCatalogo.precio : null,
    };
  }

  const cols = config.COLUMNAS_STOCK;
  const stockResp = await sheetsClient.spreadsheets.values.get({
    spreadsheetId, range: `${config.HOJA_STOCK}!A:F`,
  });
  const stockRows = stockResp.data.values || [];

  for (const row of stockRows) {
    const skuFila = row[cols.skuGeneral] ? normalizarSkuTexto(row[cols.skuGeneral]) : '';
    if (skuFila === skuCortoNormalizado) {
      return { nombre: row[cols.nombre] ? String(row[cols.nombre]).trim() : '', precio: null };
    }
  }

  return { nombre: '', precio: null };
}

/**
 * Procesa las filas nuevas de VENTAS: para cada SKU sin marcar todavia,
 * lo marca "Vendido dd/MM/yyyy HH:mm - Nombre" y descuenta stock, o
 * "Duplicado, no contado" si ese SKU completo ya se habia vendido antes.
 * Equivalente exacto a procesarVentasNuevas() del Apps Script.
 */
async function procesarVentasNuevas(sheetsClient, spreadsheetId) {
  const sheetName = config.HOJA_VENTAS;
  const colsVentas = config.COLUMNAS_VENTAS;
  const range = `${sheetName}!A:G`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];

  if (rows.length < 2) return { procesadas: 0, duplicadas: 0 };

  // Armamos el set de SKU completos ya marcados "Vendido" en cualquier fila
  const skusYaVendidos = new Set();
  for (let i = 1; i < rows.length; i++) {
    const marcaExistente = rows[i][colsVentas.marca] ? String(rows[i][colsVentas.marca]).trim() : '';
    const skuExistente = rows[i][colsVentas.skuCompleto] ? normalizarSkuTexto(rows[i][colsVentas.skuCompleto]) : '';
    if (marcaExistente.indexOf('Vendido') === 0 && skuExistente !== '') {
      skusYaVendidos.add(skuExistente);
    }
  }

  let procesadas = 0;
  let duplicadas = 0;
  const letraMarca = columnaALetra(colsVentas.marca); // columna D

  for (let i = 1; i < rows.length; i++) {
    const filaReal = i + 1; // 1-indexado para la API
    const skuCompleto = rows[i][colsVentas.skuCompleto] ? String(rows[i][colsVentas.skuCompleto]).trim() : '';
    const skuCompletoNormalizado = skuCompleto ? normalizarSkuTexto(skuCompleto) : '';
    const marca = rows[i][colsVentas.marca] ? String(rows[i][colsVentas.marca]).trim() : '';
    // Si la fila trae numero de pedido, esta unidad sale por una compra
    // online que YA descontó su stock al confirmarse el pago (reserva).
    // La marcamos como vendida igual, pero sin volver a tocar STOCK.
    const pedidoIdFila = rows[i][colsVentas.pedidoId] ? String(rows[i][colsVentas.pedidoId]).trim() : '';

    if (skuCompleto === '') continue; // fila vacia
    if (marca !== '') continue; // ya tiene alguna marca, se ignora para siempre

    if (skusYaVendidos.has(skuCompletoNormalizado)) {
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${letraMarca}${filaReal}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['Duplicado, no contado']] },
      });
      duplicadas++;
      continue;
    }

    const skuCorto = extraerSkuCortoRobusto(skuCompleto);
    const datosProducto = await buscarProductoParaVenta(sheetsClient, spreadsheetId, skuCorto);

    // Si al vender se cargó un precio manual (columna F, ej. porque se
    // vendió más barato), ese precio tiene prioridad sobre el de catálogo.
    const precioManualFila = rows[i][colsVentas.precioManual] !== undefined && rows[i][colsVentas.precioManual] !== ''
      ? rows[i][colsVentas.precioManual]
      : null;
    const precioFinalVenta = precioManualFila !== null ? precioManualFila : datosProducto.precio;

    if (!pedidoIdFila) {
      await descontarStockVenta(sheetsClient, spreadsheetId, config.HOJA_STOCK, skuCorto, datosProducto.nombre);
    }

    let textoMarca = `Vendido ${formatearFechaHoraCorta(new Date(), config.TIMEZONE)}`;
    if (datosProducto.nombre) textoMarca += ` - ${datosProducto.nombre}`;
    if (pedidoIdFila) textoMarca += ` (pedido ${pedidoIdFila}, stock ya reservado)`;

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${letraMarca}${filaReal}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[textoMarca]] },
    });

    // Registramos el precio al que se vendió (columna E): el manual si se
    // cargó uno al vender, o si no el del catálogo (Productos) al momento
    // de procesar la venta.
    const letraPrecioVenta = columnaALetra(colsVentas.precioVenta); // columna E
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${letraPrecioVenta}${filaReal}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[precioFinalVenta !== null ? precioFinalVenta : '']] },
    });

    // Columna I: precio de catálogo en el momento de procesar la venta,
    // SIEMPRE (haya habido precio manual o no) — sirve para comparar
    // contra E/F y ver si el precio de catálogo cambió después de esta
    // venta. A diferencia de E, esta columna nunca usa el precio manual.
    const letraPrecioCatalogo = columnaALetra(colsVentas.precioCatalogoAlVender); // columna I
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${letraPrecioCatalogo}${filaReal}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[datosProducto.precio !== null && datosProducto.precio !== undefined ? datosProducto.precio : '']] },
    });

    // La columna F es un aviso de "se vendió distinto al precio de
    // catálogo" — si no había precio de catálogo con qué compararlo, no
    // es una diferencia real, es el único precio que tenemos. La
    // limpiamos para que no quede el mismo número repetido en E y F.
    if (precioManualFila !== null && (datosProducto.precio === null || datosProducto.precio === undefined)) {
      const letraPrecioManual = columnaALetra(colsVentas.precioManual); // columna F
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${letraPrecioManual}${filaReal}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['']] },
      });
    }

    skusYaVendidos.add(skuCompletoNormalizado);
    procesadas++;
  }

  return { procesadas, duplicadas };
}

/**
 * Suma 1 visita a un producto (columna B de la hoja VISITAS), buscandolo
 * por SKU general. Si todavia no tiene fila, la crea en 1. Se usa cada
 * vez que alguien abre el detalle de un producto en el catalogo publico,
 * para poder armar el ranking de "Destacados: mas visitados".
 */
async function registrarVisitaProducto(sheetsClient, spreadsheetId, sheetName, skuGeneral, fecha) {
  const cols = config.COLUMNAS_VISITAS;
  const ultimaLetra = columnaALetra(cols.ultimaFecha);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const skuNormalizado = String(skuGeneral).trim().toLowerCase();

  for (let i = 0; i < rows.length; i++) {
    const filaSku = rows[i][cols.skuGeneral] ? String(rows[i][cols.skuGeneral]).trim().toLowerCase() : '';
    if (filaSku === skuNormalizado) {
      const visitasActuales = Number(rows[i][cols.visitas]) || 0;
      const numeroFila = i + 1;
      await asegurarFilasSuficientes(sheetsClient, spreadsheetId, sheetName, numeroFila);
      const letraVisitas = columnaALetra(cols.visitas);
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${letraVisitas}${numeroFila}:${ultimaLetra}${numeroFila}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[visitasActuales + 1, fecha || '']] },
      });
      return;
    }
  }

  const filaNueva = new Array(cols.ultimaFecha + 1).fill('');
  filaNueva[cols.skuGeneral] = skuGeneral;
  filaNueva[cols.visitas] = 1;
  filaNueva[cols.ultimaFecha] = fecha || '';
  await appendRow(sheetsClient, spreadsheetId, sheetName, filaNueva);
}

/**
 * Lee la hoja VISITAS entera y devuelve un mapa SKU general (mayusculas)
 * -> cantidad de visitas. Se usa para armar "Destacados: mas visitados".
 */
async function getVisitasPorSkuGeneral(sheetsClient, spreadsheetId, sheetName) {
  const cols = config.COLUMNAS_VISITAS;
  const ultimaLetra = columnaALetra(cols.ultimaFecha);
  const range = `${sheetName}!A:${ultimaLetra}`;

  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const mapa = {};

  for (const fila of rows) {
    const skuGeneral = fila[cols.skuGeneral] ? String(fila[cols.skuGeneral]).trim() : '';
    if (!skuGeneral) continue;
    mapa[skuGeneral.toUpperCase()] = Number(fila[cols.visitas]) || 0;
  }

  return mapa;
}

/**
 * Lee la hoja Consultas entera y devuelve un mapa SKU general (mayusculas)
 * -> cantidad de consultas. El SKU guardado en Consultas puede ser un SKU
 * completo (con numero de serie) o "(contacto general)" — se normaliza
 * con extraerSkuGeneral() y se ignoran las que no correspondan a ningun
 * producto real. Se usa para armar "Destacados: mas consultados".
 */
async function getConsultasPorSkuGeneral(sheetsClient, spreadsheetId, sheetName) {
  const range = `${sheetName}!A:A`;
  const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const mapa = {};

  for (let i = 1; i < rows.length; i++) {
    const skuCrudo = rows[i][0] ? String(rows[i][0]).trim() : '';
    if (!skuCrudo || skuCrudo === '(contacto general)') continue;
    const skuGeneral = extraerSkuGeneral(skuCrudo).toUpperCase();
    mapa[skuGeneral] = (mapa[skuGeneral] || 0) + 1;
  }

  return mapa;
}

module.exports = {
  appendRow,
  appendRows,
  asegurarFilasSuficientes,
  getStockPorSkuGeneral,
  extraerSkuGeneral,
  getHistoricoSku,
  getFilasImprimir,
  getCatalogoProductos,
  getUltimoNumeroSerie,
  actualizarContadorUnidades,
  generarUnidades,
  getConfigCategorias,
  crearCategoriaConfig,
  getNombresVisiblesCategorias,
  actualizarNombreVisibleCategoria,
  getTarifasEnvio,
  actualizarTarifaEnvio,
  getClientes,
  buscarClientePorEmail,
  buscarClientePorCodigoFidelidad,
  crearClienteSiNoExiste,
  registrarCafeCliente,
  getSiguienteNumeroProducto,
  crearProductoNuevo,
  actualizarLinksCatalogoProductos,
  buscarFilaProductoPorSkuGeneral,
  agregarFotoProducto,
  eliminarFotoProducto,
  actualizarDescripcionProducto,
  actualizarPrecioProducto,
  actualizarProveedorProducto,
  actualizarVisibilidadProducto,
  eliminarProductoCompleto,
  buscarAsociacionCodigoBarra,
  asociarCodigoBarra,
  buscarSkuCompletoDisponible,
  buscarSkuCompletosDisponibles,
  appendFilasImprimirApp,
  sumarCantidadManualStock,
  asegurarFilaStock,
  ajustarStockCantidad,
  procesarVentasNuevas,
  registrarVisitaProducto,
  getVisitasPorSkuGeneral,
  getConsultasPorSkuGeneral,

  getAdminUsers,
  buscarAdminUserPorEmail,
  crearOActualizarAdminUser,
  eliminarAdminUser,

  crearPedido,
  getPedidos,
  getPedidoPorId,
  getPedidoPorPagoExternoId,
  getPedidosPorTelefono,
  actualizarPedido,

  columnaALetra,
};
