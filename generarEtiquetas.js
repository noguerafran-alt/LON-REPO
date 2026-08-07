const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');

const MM_A_PT = 2.83464567; // 1mm en puntos (unidad que usa PDFKit)

/**
 * Saca el numero de producto (tercer bloque) de un SKU completo.
 * Ej: "LIB-INF-001-000001" -> "001"
 */
function extraerNumeroProducto(skuCompleto) {
  const partes = String(skuCompleto).split('-');
  return partes.length >= 3 ? partes[2] : skuCompleto;
}

/**
 * Genera el buffer PNG de un QR o de un codigo de barras Code128, segun el tipo.
 */
async function generarImagenEtiqueta(skuCompleto, tipo) {
  if (tipo === 'barras') {
    return bwipjs.toBuffer({
      bcid: 'code128',      // Code 128: soporta letras y numeros, ideal para un SKU alfanumerico
      text: skuCompleto,
      scale: 3,
      height: 10,           // alto del dibujo del codigo en mm (aprox, bwip usa su propia escala interna)
      includetext: false,   // el SKU ya lo mostramos como texto aparte, arriba de la imagen
      backgroundcolor: 'FFFFFF',
    });
  }

  return QRCode.toBuffer(skuCompleto, { width: 300, margin: 1 });
}

/**
 * Genera el PDF de etiquetas a partir de un array de filas:
 * [{ skuCompleto, categoria, tipo }, ...]  (tipo: 'qr' o 'barras')
 *
 * Devuelve una Promise<Buffer> con el PDF ya armado.
 */
async function generarPdfEtiquetas(filas, opciones = {}) {
  const anchoMM = opciones.anchoMM || 480;
  const altoMM = opciones.altoMM || 320;
  const margenMM = opciones.margenMM || 10; // 1cm

  const qrMM = opciones.qrMM || 10;             // QR: 1x1cm
  const barrasAnchoMM = opciones.barrasAnchoMM || 20; // Codigo de barras: 2cm de ancho
  const barrasAltoMM = opciones.barrasAltoMM || 10;   // Codigo de barras: 1cm de alto

  const gapMM = opciones.gapMM || 3; // espacio entre etiquetas

  // El "casillero" de la grilla tiene que ser lo bastante ancho para el
  // elemento mas ancho de los dos tipos (el codigo de barras, si es mas
  // ancho que el QR), para que ningun tipo se superponga con el siguiente.
  const anchoMaximoElemento = Math.max(qrMM, barrasAnchoMM);
  const anchoSlotMM = anchoMaximoElemento + gapMM;

  const anchoPt = anchoMM * MM_A_PT;
  const altoPt = altoMM * MM_A_PT;
  const margenPt = margenMM * MM_A_PT;
  const qrPt = qrMM * MM_A_PT;
  const barrasAnchoPt = barrasAnchoMM * MM_A_PT;
  const barrasAltoPt = barrasAltoMM * MM_A_PT;
  const anchoSlot = anchoSlotMM * MM_A_PT;

  const anchoUtil = anchoPt - margenPt * 2;
  const columnas = opciones.columnas || Math.max(1, Math.floor(anchoUtil / anchoSlot));

  const espacioTexto = opciones.espacioTextoPt || 9;
  const skuFontSize = opciones.skuFontSize || 5;
  const espacioEntreFilas = 10;
  const altoImagenMaxPt = Math.max(qrPt, barrasAltoPt);
  const altoSlot = altoImagenMaxPt + espacioTexto + espacioEntreFilas;

  const porCategoria = new Map();
  for (const fila of filas) {
    const categoria = fila.categoria || '(Sin categoria)';
    if (!porCategoria.has(categoria)) porCategoria.set(categoria, new Map());
    const porNumero = porCategoria.get(categoria);

    const numero = extraerNumeroProducto(fila.skuCompleto);
    if (!porNumero.has(numero)) porNumero.set(numero, []);
    porNumero.get(numero).push(fila);
  }

  const doc = new PDFDocument({ size: [anchoPt, altoPt], margin: margenPt, autoFirstPage: false });
  const partes = [];
  doc.on('data', (chunk) => partes.push(chunk));
  const finalizado = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(partes))));

  for (const [categoria, porNumero] of porCategoria) {
    doc.addPage();

    doc.fontSize(16).font('Helvetica-Bold').fillColor('black')
      .text(categoria, margenPt, margenPt, { width: anchoUtil });

    let y = margenPt + 30;
    let x = margenPt;
    let col = 0;

    const numerosOrdenados = Array.from(porNumero.keys()).sort();

    for (const numero of numerosOrdenados) {
      const items = porNumero.get(numero);

      for (const item of items) {
        if (y + altoSlot > altoPt - margenPt) {
          doc.addPage();
          y = margenPt;
          x = margenPt;
          col = 0;
        }

        if (col === columnas) {
          col = 0;
          x = margenPt;
          y += altoSlot;

          if (y + altoSlot > altoPt - margenPt) {
            doc.addPage();
            y = margenPt;
            x = margenPt;
          }
        }

        const tipo = item.tipo === 'barras' ? 'barras' : 'qr';
        // eslint-disable-next-line no-await-in-loop
        const imagenBuffer = await generarImagenEtiqueta(item.skuCompleto, tipo);

        doc.fontSize(skuFontSize).font('Helvetica-Bold').fillColor('black')
          .text(item.skuCompleto, x, y, { width: anchoSlot - gapMM * MM_A_PT, align: 'center' });

        const anchoImagenPt = tipo === 'barras' ? barrasAnchoPt : qrPt;
        const altoImagenPt = tipo === 'barras' ? barrasAltoPt : qrPt;

        const imagenX = x + (anchoSlot - gapMM * MM_A_PT - anchoImagenPt) / 2;
        const imagenY = y + espacioTexto + 2;

        doc.image(imagenBuffer, imagenX, imagenY, { width: anchoImagenPt, height: altoImagenPt });

        doc.lineWidth(0.5).strokeColor('black');
        const alturaCaja = espacioTexto + altoImagenMaxPt + 2;
        const anchoCaja = anchoSlot - gapMM * MM_A_PT;
        doc.moveTo(x, y).lineTo(x, y + alturaCaja).stroke();
        doc.moveTo(x, y).lineTo(x + anchoCaja, y).stroke();
        doc.moveTo(x, y + alturaCaja).lineTo(x + anchoCaja, y + alturaCaja).stroke();

        x += anchoSlot;
        col++;
      }
    }
  }

  doc.end();
  return finalizado;
}

module.exports = { generarPdfEtiquetas };
