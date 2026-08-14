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
const config = require('./config');

let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('⚠️  No se pudo cargar sharp — las fotos se van a guardar sin optimizar. Detalle:', err.message);
}

let GoogleGenAI = null;
try {
  ({ GoogleGenAI } = require('@google/genai'));
} catch (err) {
  // No pasa nada si no esta instalado: quitar el fondo es opcional, ver
  // quitarFondoConGemini() mas abajo.
}

const MIME_POR_EXTENSION = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
};

/**
 * Le pide a Gemini (edicion de imagen, corre en la nube de Google — no
 * consume RAM del servidor) que ponga el producto de la foto sobre un
 * fondo blanco liso, centrado y sin sombras, sin tocar el producto en
 * si. Devuelve un Buffer con la imagen editada, o null si no hay API key
 * configurada, la librería no está instalada, o algo falla — en
 * cualquiera de esos casos el llamador sigue con la foto original tal
 * cual (nunca bloquea la subida).
 */
async function quitarFondoConGemini(rutaOriginal) {
  if (!GoogleGenAI || !config.GEMINI_API_KEY) return null;

  try {
    const extension = path.extname(rutaOriginal).toLowerCase();
    const mimeType = MIME_POR_EXTENSION[extension] || 'image/jpeg';
    const datosBase64 = fs.readFileSync(rutaOriginal).toString('base64');

    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    const respuesta = await ai.models.generateContent({
      model: config.GEMINI_IMAGE_MODEL,
      contents: [
        {
          text: 'Edit this product photo: place the product on a solid pure white background (#FFFFFF), centered in the frame, with no shadows, gradients or reflections behind it. Do not change the product itself in any way (same shape, colors, proportions, details) — only replace and clean up the background. Output only the edited image, same aspect ratio as the input.',
        },
        { inlineData: { mimeType, data: datosBase64 } },
      ],
    });

    const partes = respuesta.candidates && respuesta.candidates[0] && respuesta.candidates[0].content
      ? respuesta.candidates[0].content.parts || []
      : [];
    const parteImagen = partes.find((p) => p.inlineData && p.inlineData.data);
    if (!parteImagen) return null;

    return Buffer.from(parteImagen.inlineData.data, 'base64');
  } catch (err) {
    console.error('No se pudo quitar el fondo con Gemini, se usa la foto original:', err.message);
    return null;
  }
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
    // Si hay API key de Gemini configurada, primero le sacamos el fondo
    // (queda blanco, centrado, sin sombras) antes de optimizar — si algo
    // falla, seguimos con el archivo original tal cual venia.
    const sinFondo = await quitarFondoConGemini(rutaOriginal);

    // `rotate()` sin argumentos aplica la orientacion EXIF: sin esto, las
    // fotos sacadas con el celular de costado salen giradas, porque al
    // reescribirlas se pierde el metadato que las enderezaba. La imagen
    // que devuelve Gemini ya viene sin ese metadato (es una imagen nueva
    // generada, no la original con su EXIF), así que rotate() en ese
    // caso no hace nada — no rompe nada tenerlo igual.
    const entrada = sinFondo
      ? sharp(sinFondo, { failOn: 'none' }).rotate()
      : sharp(rutaOriginal, { failOn: 'none' }).rotate();

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
  generarMiniaturasFaltantes,
  borrarFotoYMiniatura,
  urlMiniatura,
  SUFIJO_THUMB,
};
