/* ============================================================
 *  imagenes.js — optimizacion de las fotos de producto
 * ============================================================
 * Las camaras de celular sacan fotos de 3 a 8 MB y 4000px de ancho.
 * Mostrar eso tal cual en el catalogo hace que la grilla tarde una
 * eternidad en cargar (sobre todo con datos moviles), aunque en pantalla
 * la foto ocupe 300px.
 *
 * Por cada foto que se sube generamos DOS archivos:
 *
 *   LIB-ADU-0001-1730412345678.webp        -> grande (detalle del producto)
 *   LIB-ADU-0001-1730412345678-thumb.webp  -> miniatura (grilla del catalogo)
 *
 * En la hoja Productos se guarda SOLO la URL de la grande (asi no cambia
 * nada del esquema ni de las fotos viejas). La miniatura se deduce del
 * nombre, con `urlMiniatura()`, tanto en el server como en el frontend.
 * Si la miniatura no existe (fotos subidas antes de este cambio), el
 * navegador cae automaticamente a la grande via el onerror de la <img>.
 *
 * Todo esto depende de `sharp`. Si por lo que sea sharp no esta
 * disponible en el entorno, la app sigue funcionando igual: guarda la
 * foto original sin tocarla (que es exactamente lo que hacia antes).
 * ============================================================ */

const fs = require('fs');
const path = require('path');

let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('⚠️  No se pudo cargar sharp — las fotos se van a guardar sin optimizar. Detalle:', err.message);
}

/* Medidas de salida. Se pueden ajustar por variable de entorno sin tocar
   el codigo. El ancho grande esta pensado para que se vea nitido en una
   pantalla retina de escritorio; el thumb, para la grilla del catalogo. */
const ANCHO_MAX_GRANDE = Number(process.env.FOTO_ANCHO_MAX || 1600);
const CALIDAD_GRANDE = Number(process.env.FOTO_CALIDAD || 80);
const ANCHO_MAX_THUMB = Number(process.env.FOTO_THUMB_ANCHO || 600);
const CALIDAD_THUMB = Number(process.env.FOTO_THUMB_CALIDAD || 70);

const SUFIJO_THUMB = '-thumb';

/**
 * Dada la URL/nombre de la foto grande, devuelve la de su miniatura.
 * `/uploads/productos/algo.webp` -> `/uploads/productos/algo-thumb.webp`
 * Esta misma funcion esta duplicada (en JS de navegador) en index.html:
 * si cambia el criterio de nombres, hay que cambiarla en los dos lados.
 */
function urlMiniatura(url) {
  const texto = String(url || '');
  if (!texto) return '';
  // Solo aplica a fotos subidas a este servidor; una URL externa se
  // devuelve tal cual (no tenemos miniatura de algo que no procesamos).
  if (!texto.includes('/uploads/productos/')) return texto;
  if (texto.includes(SUFIJO_THUMB)) return texto;

  const puntoFinal = texto.lastIndexOf('.');
  if (puntoFinal <= 0) return texto;
  return `${texto.slice(0, puntoFinal)}${SUFIJO_THUMB}${texto.slice(puntoFinal)}`;
}

function estaDisponible() {
  return Boolean(sharp);
}

/* ------------------------------------------------------------
 * RECONOCER PRODUCTO POR FOTO: comparacion simple imagen-contra-imagen
 * (hash perceptual "dHash"), sin IA ni servicios externos. Se usa para
 * identificar un producto sacandole una foto y comparandola SOLO
 * contra las fotos que ya estan cargadas en el catalogo — no reconoce
 * nada de un producto que no tenga foto.
 *
 * dHash: achica la imagen a 9x8 en escala de grises y para cada fila
 * compara cada pixel con el de al lado (mas claro u oscuro), armando
 * una huella de 64 bits. Dos fotos parecidas (mismo encuadre/luz)
 * generan huellas casi iguales — se compara contando cuantos bits
 * difieren (distancia de Hamming): 0 = identicas, mas alto = mas
 * distintas. Es liviano (una imagen chica en escala de grises) y no
 * agrega ninguna dependencia nueva, pero al ser una comparacion
 * directa de pixeles (no semantica) funciona mejor cuanto mas parecido
 * el encuadre/luz de la foto nueva a la del catalogo.
 * ------------------------------------------------------------ */
const ANCHO_HASH = 9;
const ALTO_HASH = 8;

async function calcularHashImagen(rutaOArchivo) {
  if (!sharp) return null;
  try {
    const { data } = await sharp(rutaOArchivo, { failOn: 'none' })
      .rotate()
      .resize(ANCHO_HASH, ALTO_HASH, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let bits = '';
    for (let fila = 0; fila < ALTO_HASH; fila++) {
      for (let col = 0; col < ANCHO_HASH - 1; col++) {
        const izquierda = data[fila * ANCHO_HASH + col];
        const derecha = data[fila * ANCHO_HASH + col + 1];
        bits += izquierda < derecha ? '1' : '0';
      }
    }
    return BigInt('0b' + bits).toString(16).padStart(16, '0');
  } catch (err) {
    console.error('No se pudo calcular el hash de la imagen:', err.message);
    return null;
  }
}

/** Cuenta cuantos bits difieren entre dos hashes (hex de 64 bits). 0 =
    imagenes practicamente identicas; a partir de ~20 ya son bastante
    distintas (de 64 bits totales). */
function distanciaHamming(hashA, hashB) {
  if (!hashA || !hashB) return Infinity;
  let xor = BigInt('0x' + hashA) ^ BigInt('0x' + hashB);
  let distancia = 0;
  while (xor > 0n) {
    distancia += Number(xor & 1n);
    xor >>= 1n;
  }
  return distancia;
}

/**
 * Procesa un archivo recien subido: genera la version grande y la
 * miniatura (ambas .webp) y borra el archivo original.
 *
 * Devuelve el nombre del archivo GRANDE (el que se guarda en la hoja).
 * Si sharp no esta disponible o la imagen esta rota, devuelve el nombre
 * del archivo original sin tocar nada.
 */
async function optimizarFotoSubida(rutaOriginal) {
  const carpeta = path.dirname(rutaOriginal);
  const nombreOriginal = path.basename(rutaOriginal);

  if (!sharp) return nombreOriginal;

  const nombreSinExtension = nombreOriginal.replace(/\.[^.]+$/, '');
  const nombreGrande = `${nombreSinExtension}.webp`;
  const nombreThumb = `${nombreSinExtension}${SUFIJO_THUMB}.webp`;

  try {
    // `rotate()` sin argumentos aplica la orientacion EXIF: sin esto, las
    // fotos sacadas con el celular de costado salen giradas, porque al
    // reescribirlas se pierde el metadato que las enderezaba.
    const entrada = sharp(rutaOriginal, { failOn: 'none' }).rotate();

    await Promise.all([
      entrada.clone()
        .resize({ width: ANCHO_MAX_GRANDE, height: ANCHO_MAX_GRANDE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: CALIDAD_GRANDE })
        .toFile(path.join(carpeta, nombreGrande)),
      entrada.clone()
        .resize({ width: ANCHO_MAX_THUMB, height: ANCHO_MAX_THUMB, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: CALIDAD_THUMB })
        .toFile(path.join(carpeta, nombreThumb)),
    ]);

    // El original ya no hace falta. Si el nombre coincidia (subieron un
    // .webp), no lo borramos: seria borrar la version nueva.
    if (nombreOriginal !== nombreGrande) {
      fs.unlink(rutaOriginal, () => {});
    }

    return nombreGrande;
  } catch (err) {
    console.error('No se pudo optimizar la foto, se guarda el original:', err.message);
    return nombreOriginal;
  }
}

/**
 * Recorre la carpeta de fotos y genera la miniatura que falte para cada
 * imagen ya subida (las de antes de este cambio). No toca las grandes ni
 * cambia sus nombres, asi que las URLs guardadas en la hoja Productos
 * siguen siendo validas. Devuelve un resumen para mostrarle al admin.
 */
async function generarMiniaturasFaltantes(carpeta) {
  if (!sharp) return { generadas: 0, yaEstaban: 0, errores: 0, sharpDisponible: false };

  let archivos = [];
  try {
    archivos = fs.readdirSync(carpeta);
  } catch (err) {
    return { generadas: 0, yaEstaban: 0, errores: 0, sharpDisponible: true };
  }

  const imagenes = archivos.filter((nombre) => /\.(jpe?g|png|webp)$/i.test(nombre) && !nombre.includes(SUFIJO_THUMB));

  let generadas = 0;
  let yaEstaban = 0;
  let errores = 0;

  for (const nombre of imagenes) {
    const nombreThumb = `${nombre.replace(/\.[^.]+$/, '')}${SUFIJO_THUMB}.webp`;
    const rutaThumb = path.join(carpeta, nombreThumb);

    if (fs.existsSync(rutaThumb)) { yaEstaban++; continue; }

    try {
      await sharp(path.join(carpeta, nombre), { failOn: 'none' })
        .rotate()
        .resize({ width: ANCHO_MAX_THUMB, height: ANCHO_MAX_THUMB, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: CALIDAD_THUMB })
        .toFile(rutaThumb);
      generadas++;
    } catch (err) {
      console.error(`No se pudo generar la miniatura de ${nombre}:`, err.message);
      errores++;
    }
  }

  return { generadas, yaEstaban, errores, sharpDisponible: true };
}

/**
 * Borra del disco una foto y su miniatura (si existen). Se usa cuando se
 * saca una foto de la galeria de un producto.
 */
function borrarFotoYMiniatura(carpeta, nombreArchivo) {
  if (!nombreArchivo) return;
  const nombreThumb = `${nombreArchivo.replace(/\.[^.]+$/, '')}${SUFIJO_THUMB}.webp`;
  fs.unlink(path.join(carpeta, nombreArchivo), () => {});
  fs.unlink(path.join(carpeta, nombreThumb), () => {});
}

module.exports = {
  estaDisponible,
  optimizarFotoSubida,
  calcularHashImagen,
  distanciaHamming,
  generarMiniaturasFaltantes,
  borrarFotoYMiniatura,
  urlMiniatura,
  SUFIJO_THUMB,
};
