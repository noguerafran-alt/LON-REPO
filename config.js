/**
 * ============================================================
 *  CONFIGURACION CENTRAL — TOCAR ACA PARA REPLICAR LA APP
 * ============================================================
 * Todo lo que cambia entre "instalaciones" de esta app (otro negocio,
 * otro Google Sheet, otros nombres de pestaña, etc.) esta centralizado
 * en este archivo. El resto del codigo (server.js, googleSheets.js,
 * generarEtiquetas.js, payway.js, whatsapp.js) NO deberia
 * necesitar tocarse.
 *
 * La mayoria de estos valores se pueden sobreescribir por variable de
 * entorno (Render -> Environment) sin tocar el codigo. Los valores de
 * aca abajo son los que se usan si la variable de entorno no existe.
 * ============================================================
 */

require('dotenv').config();

module.exports = {
  /* ------------------------------------------------------------
   * 1) SPREADSHEETS — dos planillas distintas (pueden ser la misma
   *    si preferis todo junto: en ese caso poné el mismo ID en ambas).
   * ------------------------------------------------------------ */

  // Planilla de VENTAS / ESCANEO (la que usa el lector QR en el local)
  SHEET_ID_VENTAS: process.env.SHEET_ID_VENTAS || '1-avF46T1MPeKsvF3EMKodc1Q_OzX2CvTOhT2-BxzOto',

  // Planilla de CATALOGO / PRODUCTOS (donde se generan los SKU de unidades)
  SHEET_ID_PRODUCTOS: process.env.SHEET_ID_PRODUCTOS || '1-avF46T1MPeKsvF3EMKodc1Q_OzX2CvTOhT2-BxzOto',

  /* ------------------------------------------------------------
   * 2) NOMBRES DE PESTAÑAS (hojas) — deben coincidir EXACTO
   *    (mayusculas, espacios, etc.) con el nombre real de la pestaña.
   * ------------------------------------------------------------ */

  // -- En la planilla de VENTAS --
  HOJA_VENTAS: process.env.GOOGLE_VENTAS_SHEET_NAME || 'VENTAS',           // donde se registra cada escaneo (SKU, fecha, hora, marca, precio de venta)
  HOJA_CONSULTAS: process.env.GOOGLE_CONSULTAS_SHEET_NAME || 'Consultas',  // consultas de clientes (sin login admin)
  HOJA_STOCK: process.env.GOOGLE_STOCK_SHEET_NAME || 'STOCK',              // A=SKU general, D=Cantidad actual
  HOJA_PEDIDOS: process.env.GOOGLE_PEDIDOS_SHEET_NAME || 'PEDIDOS',        // pedidos pagados/por pagar + coordinacion de envio

  // -- En la planilla de PRODUCTOS / CATALOGO --
  HOJA_PRODUCTOS: process.env.GOOGLE_PRODUCTOS_SHEET_NAME || 'Productos',            // catalogo: Producto, Categoria, Subcategoria, SKU general, Precio, Foto
  HOJA_HISTORICO_SKU: process.env.GOOGLE_HISTORICO_SKU_SHEET_NAME || 'HISTORICO_SKU',// log de cada unidad generada
  HOJA_CONTADOR_UNIDADES: process.env.GOOGLE_CONTADOR_UNIDADES_SHEET_NAME || 'CONTADOR_UNIDADES', // A=SKU general, B=ultimo numero de serie usado
  HOJA_IMPRIMIR: process.env.GOOGLE_IMPRIMIR_SHEET_NAME || 'IMPRIMIR',              // usada por el generador de SKU del lado de Google Sheets (no tocar desde la app)
  HOJA_IMPRIMIR_APP: process.env.GOOGLE_IMPRIMIR_APP_SHEET_NAME || 'IMPRIMIR APP',  // usada SOLO por esta app: aca se anota cada unidad generada desde la web, para poder imprimir unicamente lo generado desde aca
  HOJA_CONFIG: process.env.GOOGLE_CONFIG_SHEET_NAME || 'Config',                    // categorias, subcategorias y prefijo de SKU (para crear productos nuevos)
  HOJA_CODIGOS_BARRA: process.env.GOOGLE_CODIGOS_BARRA_SHEET_NAME || 'CODIGOS_BARRA', // asociacion entre codigos de barra externos (ISBN, EAN, etc) y el SKU interno

  /* ------------------------------------------------------------
   * 3) COLUMNAS — en que columna (0 = A, 1 = B, ...) esta cada dato.
   *    Cambialo aca si en tu Sheet el orden de columnas es distinto.
   * ------------------------------------------------------------ */

  COLUMNAS_PRODUCTOS: {
    producto: 0,      // A: nombre del producto
    categoria: 1,      // B
    subcategoria: 2,   // C
    skuGeneral: 3,     // D: SKU general (CAT-SUB-NNNN), SIN el bloque de unidad
    precio: 4,         // E
    // F ("Cantidad a generar") es una columna de uso manual en la
    // planilla, no la escribe ni la lee esta app — se salta a proposito
    // para no pisarla.
    foto: 6,           // G: fotos del producto. Puede tener una URL sola
                        // (/uploads/productos/archivo.jpg) o, si tiene mas
                        // de una, un array JSON de hasta 4 URLs, ej:
                        // ["/uploads/productos/a.jpg","/uploads/productos/b.jpg"]
    // H: fecha/hora de la ultima modificacion del precio. La app NO
    // escribe esta columna (el precio se edita a mano en Sheets, no
    // desde la app) — la completa un trigger onEdit en Apps Script, ver
    // ControlDeStock.gs.js / README.
    ultimaModificacionPrecio: 7,
    descripcion: 8,     // I: descripcion libre del producto (opcional), se muestra en la pagina de detalle del catalogo publico
  },

  COLUMNAS_CONTADOR_UNIDADES: {
    skuGeneral: 0,        // A
    ultimoNumeroSerie: 1, // B
  },

  // Columnas de la hoja STOCK (en la planilla de VENTAS).
  // "Cantidad manual" es la que se suma a mano (o, como en este caso,
  // automaticamente al generar unidades); un trigger del lado de Google
  // Sheets recalcula despues "Cantidad actual" a partir de esta.
  COLUMNAS_STOCK: {
    skuGeneral: 0,                  // A: SKU
    cantidadManual: 1,              // B: Cantidad Manual
    fechaActualizacionManual: 2,    // C: Fecha actualizacion manual
    cantidadActual: 3,              // D: Cantidad actual
    nombre: 4,                      // E: Nombre
    categoria: 5,                   // F: Categoria
  },

  // Columnas de la hoja Config (categoria, subcategoria y su prefijo de SKU).
  // Se usa cuando se crea un PRODUCTO NUEVO desde la app (no existe todavia
  // en la hoja Productos) para saber que prefijo de SKU le corresponde.
  COLUMNAS_CONFIG: {
    categoria: 0,        // A
    codigoCategoria: 1,  // B
    subcategoria: 2,     // C
    codigoSubcategoria: 3, // D
    clave: 4,            // E: "Categoria|Subcategoria" (no se usa desde la app)
    prefijoSku: 5,        // F: ej "LIB-INF"
    // Lista aparte (H, I) que alimenta el desplegable de categorias en
    // Google Sheets. Cuando se crea una categoria nueva, si el nombre
    // todavia no esta en esta lista, se agrega tambien aca.
    listaCategoriaDesplegable: 7,  // H
    listaCodigoDesplegable: 8,     // I
  },

  // Columnas de la hoja CODIGOS_BARRA (planilla de PRODUCTOS). Asocia un
  // codigo de barras externo (el que ya trae el producto de fabrica, ej
  // ISBN/EAN de un libro) a un SKU interno del sistema. Se carga desde
  // el modo "Asociar código de barras" del escáner en el panel admin.
  COLUMNAS_CODIGOS_BARRA: {
    codigoBarra: 0,   // A: numero leido del codigo de barras externo
    skuGeneral: 1,    // B: SKU interno al que corresponde
    producto: 2,      // C: nombre del producto, solo de referencia visual
    fecha: 3,         // D: fecha en que se creo/actualizo la asociacion
  },

  // Columnas de la hoja PEDIDOS (planilla de VENTAS). Un pedido nace
  // cuando alguien inicia un pago (Payway o transferencia) desde el
  // catalogo, y se va actualizando: primero con el resultado del pago,
  // despues con la coordinacion del envio desde el panel admin.
  COLUMNAS_PEDIDOS: {
    pedidoId: 0,            // A: ej PED-1730412345678-AB12
    fecha: 1,                // B
    skuGeneral: 2,           // C
    producto: 3,             // D
    precio: 4,               // E: precio unitario
    cantidad: 5,             // F
    total: 6,                // G
    nombreCliente: 7,        // H
    emailCliente: 8,         // I
    telefonoCliente: 9,      // J
    direccion: 10,           // K
    ciudad: 11,              // L
    provincia: 12,           // M
    codigoPostal: 13,        // N
    metodoEnvio: 14,         // O: "Retiro en el local" | "Envio a domicilio"
    estado: 15,              // P: Pendiente de pago | Pagado - Coordinar envio | Pago rechazado | Enviado | Entregado | Cancelado
    transportista: 16,       // Q: ej Correo Argentino, Andreani, OCA, envio propio
    numeroSeguimiento: 17,   // R
    // Antes se llamaba "mpPaymentId" (Mercado Pago). Se dejo en la misma
    // columna S para no correr los datos ya cargados: ahora guarda el id
    // de pago de Payway (o queda vacio si el pedido se pago por transferencia).
    pagoExternoId: 18,       // S: id del pago en el medio de pago externo (Payway), una vez aprobado
    notas: 19,               // T: notas libres del admin
    // Columna nueva, agregada al final para no correr las columnas ya
    // existentes en Sheets de pedidos viejos.
    metodoPago: 20,          // U: "Payway" | "Transferencia"
  },

  // Largo del bloque "numero de producto" (el NNNN del SKU general,
  // ej "0007" en LIB-INF-0007). Con 4, el numero 7 se transforma en "0007".
  LARGO_NUMERO_PRODUCTO: Number(process.env.LARGO_NUMERO_PRODUCTO || 4),

  // Orden y cantidad de columnas que se escriben en HISTORICO_SKU.
  // Si agregas o sacas columnas aca, tambien hay que ajustar
  // `construirFilaHistorico` en googleSheets.js.
  COLUMNAS_HISTORICO_SKU: [
    'skuCompleto',   // A
    'skuGeneral',    // B
    'producto',      // C
    'categoria',     // D
    'subcategoria',  // E
    'precio',        // F
    'fecha',         // G
    'generadoPor',   // H  (usuario/admin que genero la unidad)
  ],

  /* ------------------------------------------------------------
   * 4) VARIOS
   * ------------------------------------------------------------ */

  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin',

  // Longitud del bloque de numero de serie (unidad) del SKU. Con 6,
  // "1" se transforma en "000001".
  LARGO_NUMERO_SERIE: Number(process.env.LARGO_NUMERO_SERIE || 6),

  TIMEZONE: process.env.TIMEZONE || 'America/Argentina/Buenos_Aires',

  PORT: process.env.PORT || 3000,

  // URL publica de la app (sin barra al final), ej "https://lon-philosophy.onrender.com".
  // La usan Payway (success_url / redirect_url / notifications_url) y el chatbot de WhatsApp
  // (para mandar el link del catalogo). En local podés dejarla vacia, pero los
  // pagos y el webhook de WhatsApp necesitan una URL publica con HTTPS para
  // funcionar (ver README, sección de ngrok).
  PUBLIC_URL: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),

  /* ------------------------------------------------------------
   * 5) PAGOS — dos opciones para el comprador: Payway (link de pago
   *    hospedado — el comprador carga la tarjeta en una pagina de
   *    Payway, nunca en la nuestra) o Transferencia bancaria directa al
   *    alias del local.
   * ------------------------------------------------------------ */

  // -- Payway (Decidir) — Checkout hospedado (link de pago) --
  // 'sandbox' mientras probás, 'production' cuando tengas las credenciales
  // productivas. Te las entrega Payway al abrir la cuenta de "Ventas Online"
  // (soporte@payway.com.ar / integraciones-ventasonline@payway.com.ar).
  PAYWAY_ENV: process.env.PAYWAY_ENV || 'sandbox',
  // Clave PRIVADA — va en el header "apikey" de la request que crea el
  // link de pago. Nunca se manda al navegador.
  PAYWAY_PRIVATE_API_KEY: process.env.PAYWAY_PRIVATE_API_KEY || '',
  // Clave PUBLICA — Payway la pide como campo dentro del body al crear el
  // link (public_apikey), no como header. Es segura de tener en el
  // codigo del servidor igual (no se expone al navegador en este flujo).
  PAYWAY_PUBLIC_API_KEY: process.env.PAYWAY_PUBLIC_API_KEY || '',
  // "site": identificador numerico del comercio en Payway (te lo dan
  // junto con las API keys). Ojo: NO es el "Nro. de establecimiento"
  // (ese varia por marca de tarjeta); "site" es uno solo por cuenta.
  PAYWAY_SITE_ID: process.env.PAYWAY_SITE_ID || '',
  PAYWAY_CURRENCY: process.env.PAYWAY_CURRENCY || 'ARS',
  // Cuanto tiempo (en segundos) queda activo el link de pago antes de vencer.
  PAYWAY_LIFE_TIME_SEGUNDOS: Number(process.env.PAYWAY_LIFE_TIME_SEGUNDOS || 3600),
  // Cantidad maxima de cuotas que se ofrecen al comprador (1 = solo pago contado).
  PAYWAY_INSTALLMENTS_MAX: Number(process.env.PAYWAY_INSTALLMENTS_MAX || 1),

  // URLs de la API de Payway. Confirmadas contra el codigo fuente real de
  // un SDK de Node (no solo documentacion): el checkout hospedado vive en
  // un host y path DISTINTO al de la API de pagos normal (/api/v2).
  // Quedan como variable de entorno por si Payway confirma un valor
  // distinto para tu cuenta puntual.
  PAYWAY_CHECKOUT_BASE_URL_SANDBOX: process.env.PAYWAY_CHECKOUT_BASE_URL_SANDBOX || 'https://developers.decidir.com/api/orchestrator/checkout',
  PAYWAY_CHECKOUT_BASE_URL_PROD: process.env.PAYWAY_CHECKOUT_BASE_URL_PROD || 'https://ventasonline.payway.com.ar/api/checkout/payments',
  // Donde el comprador realmente carga la tarjeta (pagina hospedada por
  // Payway), y donde consultamos el estado de un pago ya creado.
  PAYWAY_WEB_CHECKOUT_URL_SANDBOX: process.env.PAYWAY_WEB_CHECKOUT_URL_SANDBOX || 'https://developers.decidir.com/web/checkout',
  PAYWAY_WEB_CHECKOUT_URL_PROD: process.env.PAYWAY_WEB_CHECKOUT_URL_PROD || 'https://live.decidir.com/web/checkout',
  PAYWAY_API_BASE_URL_SANDBOX: process.env.PAYWAY_API_BASE_URL_SANDBOX || 'https://developers.decidir.com/api/v2',
  PAYWAY_API_BASE_URL_PROD: process.env.PAYWAY_API_BASE_URL_PROD || 'https://live.decidir.com/api/v2',

  // -- Transferencia bancaria directa al alias/CBU del local --
  TRANSFERENCIA_ALIAS: process.env.TRANSFERENCIA_ALIAS || 'RANCHO.FINTA.TRIO',
  TRANSFERENCIA_TITULAR: process.env.TRANSFERENCIA_TITULAR || '',
  TRANSFERENCIA_CBU: process.env.TRANSFERENCIA_CBU || '',
  TRANSFERENCIA_BANCO: process.env.TRANSFERENCIA_BANCO || '',

  /* ------------------------------------------------------------
   * 5.1) EMAIL — mail de confirmacion con los datos de transferencia
   *    (Gmail SMTP via nodemailer, sin sumar un proveedor nuevo).
   * ------------------------------------------------------------ */
  // Cuenta de Gmail que envia los mails. Necesita verificacion en 2 pasos
  // activada y una "contraseña de aplicacion" generada en
  // https://myaccount.google.com/apppasswords (NO la contraseña normal).
  EMAIL_HOST: process.env.EMAIL_HOST || 'smtp.gmail.com',
  EMAIL_PORT: Number(process.env.EMAIL_PORT || 465),
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_APP_PASSWORD: process.env.EMAIL_APP_PASSWORD || '',
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || 'LON Philosophy',

  /* ------------------------------------------------------------
   * 6) SUBIDA DE FOTOS DE PRODUCTOS
   * ------------------------------------------------------------ */
  // Tamaño máximo por foto, en bytes (por defecto 5MB).
  FOTO_MAX_BYTES: Number(process.env.FOTO_MAX_BYTES || 5 * 1024 * 1024),

  /* ------------------------------------------------------------
   * 7) CHATBOT DE WHATSAPP — WhatsApp Cloud API (Meta)
   * ------------------------------------------------------------ */
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || '',               // token de acceso permanente de la app de Meta
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '', // ID del numero de telefono de WhatsApp Business
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || '', // string que vos inventás, se usa para verificar el webhook en Meta
  WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v20.0',

  // Opcional: si cargás una API key de Anthropic (Claude), el chatbot usa a
  // Claude para responder preguntas libres que no matchean ninguna palabra
  // clave conocida (ej "¿tienen algo para regalar a mi mamá?"), siempre
  // basándose únicamente en el catálogo real. Si la dejás vacía, el bot
  // sigue funcionando con las respuestas por palabra clave (sin IA).
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
};
