/* ============================================================
 *  SEO — meta tags dinamicos por producto + sitemap
 * ============================================================
 * El catalogo es una sola pagina (public/index.html) que arma los
 * productos con JavaScript, y refleja el producto abierto en la URL
 * (?producto=slug-del-nombre). Eso funciona perfecto para una persona,
 * pero NO para Google: el buscador pide la URL al servidor y recibe
 * siempre el mismo HTML, con el mismo <title>, la misma descripcion y
 * el mismo canonical apuntando a la home. Resultado: ningun producto
 * puede rankear por su nombre, y el canonical llega a pedirle a Google
 * que ignore todas las URLs de producto.
 *
 * Este modulo resuelve eso sin tocar el frontend: intercepta la home
 * ANTES de express.static y, si la URL trae ?producto=, reemplaza el
 * bloque de meta tags del HTML (delimitado por los comentarios
 * SEO:INICIO / SEO:FIN) por uno especifico de ese producto, con su
 * titulo, descripcion, canonical, imagen para compartir y el schema
 * Product (precio y stock) que Google usa para los resultados ricos.
 *
 * El JavaScript del catalogo sigue funcionando igual: lee ?producto=
 * y abre el detalle como siempre. Lo unico que cambia es lo que ve un
 * buscador (o WhatsApp/Instagram al generar la vista previa del link).
 * ============================================================ */

const fs = require('fs');
const path = require('path');

const RUTA_INDEX = path.join(__dirname, 'public', 'index.html');

// Los comentarios que delimitan el bloque de meta tags dentro de
// index.html. Todo lo que este entre estas dos marcas se reemplaza
// cuando la URL corresponde a un producto.
const MARCA_INICIO = '<!-- SEO:INICIO -->';
const MARCA_FIN = '<!-- SEO:FIN -->';

const NOMBRE_NEGOCIO = 'LON Philosophy';

/* ------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------ */

/* Escapa texto para meterlo dentro de un atributo HTML (content="...").
   Sin esto, un nombre o descripcion de producto con comillas romperia
   el meta tag — y los datos vienen de una planilla que edita una
   persona, asi que hay que asumir cualquier caracter. */
function escaparAtributo(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Escapa texto para meterlo dentro de un <script type="application/ld+json">.
   JSON.stringify ya se encarga de las comillas y los saltos de linea;
   lo unico que falta es cortar un "</script>" incrustado en el texto,
   que cerraria la etiqueta antes de tiempo. */
function jsonSeguro(valor) {
  return JSON.stringify(valor).replace(/</g, '\\u003c');
}

/* MISMA logica de slug que usa el frontend en public/index.html
   (funcion slugProducto). Tienen que coincidir exactamente: el
   navegador arma la URL con una y el servidor la resuelve con la otra.
   Si cambia una, hay que cambiar la otra. */
function slugProducto(producto) {
  const base = String(producto.nombre || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || producto.skuGeneral;
}

/* Busca el producto que corresponde al valor de ?producto=, igual que
   el frontend: primero por slug del nombre y, si no matchea, por SKU
   (los links viejos que se compartieron llevaban el SKU directo). */
function buscarProductoPorValorUrl(productos, valor) {
  if (!valor) return null;
  return productos.find((p) => slugProducto(p) === valor)
    || productos.find((p) => p.skuGeneral === valor)
    || null;
}

/* Convierte una ruta de imagen del catalogo (normalmente relativa,
   tipo "/uploads/BUD-123.jpg") en una URL absoluta. Las previsualizaciones
   de WhatsApp/Facebook y el schema de Google descartan las relativas. */
function urlAbsoluta(urlBase, recurso) {
  if (!recurso) return '';
  if (/^https?:\/\//i.test(recurso)) return recurso;
  return `${urlBase}${recurso.startsWith('/') ? '' : '/'}${recurso}`;
}

/* Recorta un texto a un largo maximo cortando en la ultima palabra
   entera, para que la meta description no quede truncada a la mitad de
   una palabra si la descripcion del producto es larga. */
function recortar(texto, maximo) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  if (limpio.length <= maximo) return limpio;
  const cortado = limpio.slice(0, maximo);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  return `${(ultimoEspacio > 40 ? cortado.slice(0, ultimoEspacio) : cortado).trim()}…`;
}

/* ------------------------------------------------------------
 * Cache del catalogo
 * ------------------------------------------------------------
 * Tanto los meta tags como el sitemap necesitan la lista de productos,
 * que sale de Google Sheets. Sin cache, cada visita de un bot (y son
 * muchas y seguidas) gastaria cuota de la API de Sheets — que es
 * compartida por toda la app, asi que agotarla rompe el catalogo, el
 * checkout y el panel admin. Con un cache corto alcanza: el catalogo
 * no cambia de un segundo al otro.
 * ------------------------------------------------------------ */

const CACHE_MS = 5 * 60 * 1000; // 5 minutos
let cacheProductos = null;
let cacheVence = 0;

function crearCargadorCacheado(cargarProductos) {
  return async function obtenerProductos() {
    const ahora = Date.now();
    if (cacheProductos && ahora < cacheVence) return cacheProductos;
    try {
      const productos = await cargarProductos();
      cacheProductos = Array.isArray(productos) ? productos : [];
      cacheVence = ahora + CACHE_MS;
      return cacheProductos;
    } catch (err) {
      console.error('SEO: no se pudo leer el catálogo:', err.message);
      // Si Sheets falla, devolvemos lo ultimo que si funciono (aunque
      // este vencido) antes que nada: para el SEO, meta tags un poco
      // viejos son mucho mejores que ninguno.
      return cacheProductos || [];
    }
  };
}

/* ------------------------------------------------------------
 * index.html en memoria
 * ------------------------------------------------------------ */

let indexCache = null;
let indexMtime = 0;

/* Lee public/index.html desde disco, pero solo si cambio desde la
   ultima vez (comparando la fecha de modificacion). Asi no leemos un
   archivo de ~100 KB en cada request, pero tampoco hace falta reiniciar
   el servidor para ver un cambio en el HTML. */
function leerIndex() {
  const stat = fs.statSync(RUTA_INDEX);
  if (!indexCache || stat.mtimeMs !== indexMtime) {
    indexCache = fs.readFileSync(RUTA_INDEX, 'utf8');
    indexMtime = stat.mtimeMs;
  }
  return indexCache;
}

/* ------------------------------------------------------------
 * Armado de los meta tags
 * ------------------------------------------------------------ */

/* Bloque de meta tags para un producto concreto. Incluye el schema
   Product con precio y disponibilidad, que es lo que le permite a
   Google mostrar el precio y el "En stock" directo en el resultado de
   busqueda. */
function metaTagsProducto(producto, urlBase) {
  const nombre = producto.nombre || '';
  const url = `${urlBase}/?producto=${encodeURIComponent(slugProducto(producto))}`;
  const titulo = `${nombre} | ${NOMBRE_NEGOCIO}`;

  // Preferimos la descripcion real cargada en la planilla; si no hay,
  // armamos una con los datos que si tenemos (categoria y precio) en
  // vez de dejar el meta vacio.
  const categoria = producto.categoriaVisible || producto.categoria || '';
  const descripcion = recortar(
    producto.descripcion
      || `${nombre}${categoria ? `. ${categoria}` : ''}. Elaborado artesanalmente por ${NOMBRE_NEGOCIO}.`
        + `${producto.precio ? ` $${producto.precio}.` : ''}`
        + ' Pedilo online y coordinamos la entrega por WhatsApp.',
    155,
  );

  const foto = urlAbsoluta(urlBase, producto.foto || (producto.fotos && producto.fotos[0]) || '/logo.png');

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: nombre,
    description: descripcion,
    image: foto,
    url,
    sku: producto.skuGeneral || undefined,
    category: categoria || undefined,
    brand: { '@type': 'Brand', name: NOMBRE_NEGOCIO },
  };

  // El bloque de oferta solo tiene sentido si hay un precio cargado —
  // un Product con offers sin price es un error de validacion en Google
  // Search Console, peor que no mandar la oferta.
  if (producto.precio) {
    schema.offers = {
      '@type': 'Offer',
      price: String(producto.precio),
      priceCurrency: 'ARS',
      availability: producto.disponible
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url,
      seller: { '@type': 'Organization', name: NOMBRE_NEGOCIO },
    };
  }

  return `<title>${escaparAtributo(titulo)}</title>
<meta name="description" content="${escaparAtributo(descripcion)}">
<link rel="canonical" href="${escaparAtributo(url)}">
<meta name="robots" content="index, follow">

<meta property="og:type" content="product">
<meta property="og:site_name" content="${NOMBRE_NEGOCIO}">
<meta property="og:title" content="${escaparAtributo(titulo)}">
<meta property="og:description" content="${escaparAtributo(descripcion)}">
<meta property="og:url" content="${escaparAtributo(url)}">
<meta property="og:image" content="${escaparAtributo(foto)}">
<meta property="og:locale" content="es_AR">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escaparAtributo(titulo)}">
<meta name="twitter:description" content="${escaparAtributo(descripcion)}">
<meta name="twitter:image" content="${escaparAtributo(foto)}">

<script type="application/ld+json">
${jsonSeguro(schema)}
</script>`;
}

/* Bloque para una URL de producto que ya no existe (se agoto el stock,
   se oculto o se borro de la planilla). La pagina sigue abriendo el
   catalogo normal — no le rompemos la navegacion a nadie que tenga el
   link guardado — pero le decimos a Google que no la indexe y que la
   version buena es la home. Sin esto, cada producto discontinuado deja
   una URL fantasma compitiendo en el buscador. */
function metaTagsProductoInexistente(urlBase) {
  return `<title>Catálogo de LON Philosophy</title>
<meta name="description" content="Libros, velas y objetos artesanales en fieltro y lata. Hacé tu pedido online y coordiná la entrega por WhatsApp.">
<link rel="canonical" href="${escaparAtributo(`${urlBase}/`)}">
<meta name="robots" content="noindex, follow">`;
}

/* ------------------------------------------------------------
 * Rutas
 * ------------------------------------------------------------ */

/* Monta las rutas de SEO. Tiene que llamarse ANTES de
   app.use(express.static(...)) — si no, express.static contesta la home
   con el index.html crudo y nunca llegamos a inyectar nada.

   deps.cargarProductos: funcion async que devuelve el catalogo publico
   (los mismos productos que /catalogo-publico).
   deps.urlBase: URL publica del sitio, sin barra final. */
function montarRutasSeo(app, { cargarProductos, urlBase }) {
  const base = String(urlBase || '').replace(/\/+$/, '');
  const obtenerProductos = crearCargadorCacheado(cargarProductos);

  /* Home + detalle de producto. */
  app.get('/', async (req, res, next) => {
    let html;
    try {
      html = leerIndex();
    } catch (err) {
      console.error('SEO: no se pudo leer index.html:', err.message);
      return next(); // que lo resuelva express.static como antes
    }

    const valorProducto = req.query.producto;

    // Sin ?producto= es la home: el HTML ya trae sus propios meta tags
    // (los de la home) entre las marcas, no hay nada que reemplazar.
    if (!valorProducto || typeof valorProducto !== 'string') {
      return res.type('html').send(html);
    }

    const productos = await obtenerProductos();
    const producto = buscarProductoPorValorUrl(productos, valorProducto);

    const inicio = html.indexOf(MARCA_INICIO);
    const fin = html.indexOf(MARCA_FIN);
    if (inicio === -1 || fin === -1 || fin < inicio) {
      // Alguien saco las marcas del HTML. No es fatal: servimos la
      // pagina tal cual (funciona igual para el usuario) y dejamos
      // constancia para poder arreglarlo.
      console.warn('SEO: no encontré las marcas SEO:INICIO / SEO:FIN en index.html.');
      return res.type('html').send(html);
    }

    const bloque = producto
      ? metaTagsProducto(producto, base)
      : metaTagsProductoInexistente(base);

    const htmlFinal = html.slice(0, inicio + MARCA_INICIO.length)
      + '\n' + bloque + '\n'
      + html.slice(fin);

    return res.type('html').send(htmlFinal);
  });

  /* Sitemap generado en el momento: la home, las paginas legales y una
     entrada por cada producto con stock. Se regenera solo a medida que
     entran y salen productos del catalogo, sin que nadie tenga que
     acordarse de editar un XML a mano. */
  app.get('/sitemap.xml', async (req, res) => {
    const productos = await obtenerProductos();

    const urls = [
      { loc: `${base}/`, priority: '1.0', changefreq: 'daily' },
      ...productos.map((p) => ({
        loc: `${base}/?producto=${encodeURIComponent(slugProducto(p))}`,
        priority: '0.8',
        changefreq: 'weekly',
      })),
      { loc: `${base}/privacidad.html`, priority: '0.3', changefreq: 'yearly' },
      { loc: `${base}/terminos.html`, priority: '0.3', changefreq: 'yearly' },
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${escaparAtributo(u.loc)}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

    res.type('application/xml').send(xml);
  });
}

module.exports = { montarRutasSeo, slugProducto };
