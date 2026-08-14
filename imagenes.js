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

/* Quitar el fondo corre 100% local (un modelo de IA que viaja adentro
   del paquete, sin mandar la foto a ningun servicio externo ni pagar
   por imagen) — por eso pesa bastante y tarda unos segundos por foto,
   a cambio de no depender de una API paga. Si el paquete no esta
   instalado o falla en tiempo de ejecucion, seguimos subiendo la foto
   tal cual (igual que con sharp). */
let quitarFondoLib = null;
try {
  quitarFondoLib = require('@imgly/background-removal-node');
} catch (err) {
  console.warn('⚠️  No se pudo cargar el removedor de fondo — las fotos de producto se suben sin ese paso. Detalle:', err.message);
}

/* Medidas de salida. Se pueden ajustar por variable de entorno sin tocar
   el codigo. El ancho grande esta pensado para que se vea nitido en una
   pantalla retina de escritorio; el thumb, para la grilla del catalogo. */
const ANCHO_MAX_GRANDE = Number(process.env.FOTO_ANCHO_MAX || 1600);
const CALIDAD_GRANDE = Number(process.env.FOTO_CALIDAD || 80);
const ANCHO_MAX_THUMB = Number(process.env.FOTO_THUMB_ANCHO || 600);
const CALIDAD_THUMB = Number(process.env.FOTO_THUMB_CALIDAD || 70);

const SUFIJO_THUMB = '-thumb';

/* Modelo de segmentacion: 'small' es el mas liviano y rapido (el que
   usamos por default, pensado para un servidor con recursos
   limitados); 'medium'/'large' recortan mejor pero tardan mas y usan
   mas memoria. Se puede subir por variable de entorno si hace falta
   mas calidad y el servidor aguanta. */
const MODELO_QUITAR_FONDO = process.env.FOTO_MODELO_QUITAR_FONDO || 'small';
// Aire blanco alrededor del producto, como fraccion del lado del
// lienzo final (0.14 = 14% de margen de cada lado).
const MARGEN_QUITAR_FONDO = Number(process.env.FOTO_MARGEN_QUITAR_FONDO || 0.14);

function mimePorExtension(ruta) {
  const ext = path.extname(ruta).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

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

function estaDisponibleQuitarFondo() {
  return Boolean(sharp && quitarFondoLib);
}

/**
 * Le saca el fondo a una foto de producto con un modelo de IA que corre
 * en el propio servidor (sin mandar la imagen a ningun servicio
 * externo), recorta el resultado al contorno real del producto (le saca
 * el margen transparente que deja el modelo) y lo centra sobre un
 * fondo blanco cuadrado, con un poco de aire alrededor.
 *
 * Devuelve la ruta de un archivo PNG nuevo (mismo directorio que el
 * original, sufijo "-fondoblanco.png") listo para pasarle a
 * `optimizarFotoSubida`. Si la libreria no esta disponible o algo sale
 * mal (foto rota, memoria insuficiente, etc), devuelve null — el
 * llamador debe seguir con el archivo original tal cual, nunca bloquear
 * la subida por esto.
 */
async function quitarFondoYCentrar(rutaOriginal) {
  if (!estaDisponibleQuitarFondo()) return null;

  try {
    const bufferOriginal = fs.readFileSync(rutaOriginal);
    const blobOriginal = new Blob([bufferOriginal], { type: mimePorExtension(rutaOriginal) });

    const resultado = await quitarFondoLib.removeBackground(blobOriginal, {
      model: MODELO_QUITAR_FONDO,
      output: { format: 'image/png' },
    });
    const bufferSinFondo = Buffer.from(await resultado.arrayBuffer());

    // Recortamos el margen transparente que deja el modelo, así el
    // producto queda con el tamaño real del recorte...
    const recorte = await sharp(bufferSinFondo).trim().toBuffer();
    const { width, height } = await sharp(recorte).metadata();
    if (!width || !height) return null;

    // ...y armamos un lienzo blanco cuadrado, con margen proporcional
    // a su alrededor, para centrarlo ahí.
    const ladoLienzo = Math.round(Math.max(width, height) / (1 - MARGEN_QUITAR_FONDO * 2));
    const rutaSalida = `${rutaOriginal.replace(/\.[^.]+$/, '')}-fondoblanco.png`;

    await sharp({
      create: {
        width: ladoLienzo,
        height: ladoLienzo,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([{ input: recorte, gravity: 'center' }])
      .png()
      .toFile(rutaSalida);

    return rutaSalida;
  } catch (err) {
    console.error('No se pudo quitar el fondo de la foto, se sube tal cual:', err.message);
    return null;
  }
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
  estaDisponibleQuitarFondo,
  optimizarFotoSubida,
  quitarFondoYCentrar,
  generarMiniaturasFaltantes,
  borrarFotoYMiniatura,
  urlMiniatura,
  SUFIJO_THUMB,
};
