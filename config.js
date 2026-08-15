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
  HOJA_VISITAS: process.env.GOOGLE_VISITAS_SHEET_NAME || 'VISITAS', // A=SKU general, B=cantidad de visitas, C=ultima fecha — para "Destacados: mas visitados" en el catalogo publico
  HOJA_ADMIN_USERS: process.env.GOOGLE_ADMIN_USERS_SHEET_NAME || 'AdminUsers',    // usuarios autorizados a entrar al panel admin (login con Google), con su nivel de acceso
  HOJA_ENVIOS: process.env.GOOGLE_ENVIOS_SHEET_NAME || 'Envios', // A=Provincia, B=Costo estimado de envio a domicilio — tabla fija mientras no esta la cotizacion real por API
  HOJA_CLIENTES: process.env.GOOGLE_CLIENTES_SHEET_NAME || 'Clientes', // cuentas de clientes (login con Google) — A=email, B=nombre, C=fecha de alta

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
    proveedor: 9,       // J: proveedor del producto (opcional, uso interno — nunca se muestra en el catalogo publico)
    // K: link directo al producto en el catalogo publico, para poder
    // revisarlo desde la planilla. Lo escribe la app (al crear un
    // producto y desde el boton "Actualizar links" del panel admin).
    // Ojo: el catalogo publico solo lista productos CON stock, asi que
    // el link de un producto sin unidades no va a abrir nada.
    linkCatalogo: 10,
  },

  COLUMNAS_CONTADOR_UNIDADES: {
    skuGeneral: 0,        // A
    ultimoNumeroSerie: 1, // B
  },

  // Columnas de la hoja VENTAS (planilla de VENTAS). Cada fila es un
  // escaneo de una unidad fisica que sale del local.
  //
  // La columna G (pedidoId) es la clave del sistema de reserva de stock:
  // si tiene un numero de pedido, significa que esa unidad sale por una
  // compra online cuyo stock YA se descontó al confirmarse el pago. En
  // ese caso el procesador de ventas marca la fila como vendida pero NO
  // vuelve a descontar (si no, se descontaria dos veces).
  COLUMNAS_VENTAS: {
    skuCompleto: 0,   // A: SKU de la unidad escaneada
    fecha: 1,         // B
    hora: 2,          // C
    marca: 3,         // D: la completa el procesador ("Vendido ..." / "Duplicado, no contado")
    precioVenta: 4,   // E: la completa el procesador
    precioManual: 5,  // F: opcional, lo carga el admin al vender si el precio final fue distinto al de catalogo — el procesador lo usa en vez del precio de Productos para llenar E
    pedidoId: 6,      // G: numero de pedido online, si esta unidad sale por un pedido web
    vendedor: 7,      // H: email de la cuenta admin logueada que registro la venta (o el despacho del pedido) — nunca lo manda el navegador, sale de la sesion verificada en el servidor
    precioCatalogoAlVender: 8, // I: precio que tenia el catalogo (Productos) en el momento de procesar la venta, SIEMPRE (haya habido precio manual o no) — para poder comparar contra E/F y ver si el precio de catalogo cambio despues
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
    nombreVisibleCategoria: 6, // G: nombre que ven los clientes en el catalogo (opcional; si esta vacio se usa la categoria tal cual)
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

  // Columnas de la hoja VISITAS (planilla de PRODUCTOS). Una fila por SKU
  // general; se suma 1 cada vez que alguien abre el detalle de ese
  // producto en el catalogo publico.
  COLUMNAS_VISITAS: {
    skuGeneral: 0,    // A
    visitas: 1,       // B
    ultimaFecha: 2,   // C
  },

  // Columnas de la hoja Envios (planilla de PRODUCTOS). Una fila por
  // provincia con el costo estimado de envio a domicilio. Tabla fija que
  // se usa en el checkout mientras no este integrada la cotizacion real
  // por API (MiCorreo).
  COLUMNAS_ENVIOS: {
    provincia: 0, // A
    costo: 1,     // B
  },

  // Columnas de la hoja Clientes (planilla de PRODUCTOS). Cuentas de
  // clientes del catálogo público, dadas de alta automáticamente la
  // primera vez que inician sesión con Google (a diferencia de
  // AdminUsers, acá no hace falta whitelist previa).
  //   codigoFidelidad: codigo unico (no es el email, para no exponerlo
  //     en el QR) que se muestra como QR en "Mi cuenta" y el personal
  //     del local escanea al vender un cafe.
  //   cafesContador: cuantos cafes lleva desde el ultimo gratis (0-3).
  //     Al llegar a 4 ese cafe es gratis y vuelve a 0.
  COLUMNAS_CLIENTES: {
    email: 0,           // A
    nombre: 1,           // B
    fechaAlta: 2,         // C
    codigoFidelidad: 3,   // D
    cafesContador: 4,     // E
  },

  // Columnas de la hoja AdminUsers (planilla de PRODUCTOS). Lista blanca
  // de cuentas de Google que pueden entrar al panel admin, con su nivel
  // de acceso:
  //   Nivel 1: solo "Escanear" (vender) y "Pedidos". No puede entrar a
  //            "Productos" (generar unidades, asociar codigos de barra,
  //            fotos, categorias, etiquetas) — ni por la interfaz ni
  //            llamando a esos endpoints directamente, se valida en el
  //            servidor.
  //   Nivel 2: acceso total, incluida la gestion de usuarios (agregar,
  //            cambiar de nivel o quitar acceso a otras cuentas).
  COLUMNAS_ADMIN_USERS: {
    email: 0,       // A: cuenta de Google autorizada (en minuscula)
    nivel: 1,       // B: 1 o 2
    nombre: 2,      // C: nombre visible (lo trae Google al iniciar sesion la primera vez)
    fechaAlta: 3,   // D
    agregadoPor: 4, // E: email del nivel 2 que dio de alta esta cuenta ("(automatico)" para el owner inicial)
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
    // Reserva de stock: se pone "SI" cuando el pedido descontó su
    // cantidad de la hoja STOCK (al confirmarse el pago), y se vacia si
    // el pedido se cancela/rechaza y hay que devolver las unidades.
    stockReservado: 21,      // V: "SI" | vacio
    // SKU(s) de la unidad fisica concreta que se despachó para este
    // pedido, cargados al escanear el ejemplar antes de que salga del
    // local. Si el pedido es de mas de una unidad, van separados por " | ".
    skuUnidad: 22,           // W
  },

  // Todos los estados válidos de un pedido. El servidor valida contra
  // esta lista antes de guardar (evita que se cargue un texto cualquiera
  // por error, o por un pedido HTTP armado a mano). Los textos tienen
  // que coincidir EXACTO con el desplegable del panel admin.
  ESTADOS_PEDIDO: [
    'Pendiente de pago',
    'Pagado - Coordinar envío',
    'Pago rechazado',
    'Enviado',
    'Entregado',
    'Cancelado',
  ],

  // Estados de pedido en los que las unidades ya estan comprometidas y
  // por lo tanto tienen que estar descontadas de STOCK. Al pasar a
  // cualquiera de estos, la app reserva el stock; al salir de todos
  // ellos (Cancelado, Pago rechazado, vuelta a Pendiente de pago), lo
  // devuelve. Los textos tienen que coincidir EXACTO con los que usa el
  // desplegable de estados en el panel admin y payway.js.
  ESTADOS_PEDIDO_CON_STOCK_RESERVADO: [
    'Pagado - Coordinar envío',
    'Enviado',
    'Entregado',
  ],

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

  // ADMIN_PASSWORD queda solo como variable heredada, ya NO se usa para
  // entrar al panel admin (reemplazada por Google OAuth + AdminUsers,
  // ver seccion siguiente). No hace falta configurarla en instalaciones
  // nuevas.
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',

  /* ------------------------------------------------------------
   * LOGIN ADMIN CON GOOGLE (reemplaza la contraseña compartida)
   * ------------------------------------------------------------
   * El panel admin (/admin) ahora se entra con "Iniciar sesión con
   * Google". El servidor verifica el token que devuelve Google, busca el
   * email en la hoja AdminUsers para saber el nivel (1 o 2), y si esta
   * autorizado le entrega una sesion propia (un token firmado, no la
   * contraseña de Google) que el navegador manda en cada pedido.
   * ------------------------------------------------------------ */

  // ID de cliente OAuth de Google Cloud Console (tipo "Aplicacion web").
  // Se pide una sola vez por instalacion, es publico (va al navegador),
  // asi que no hace falta mantenerlo en secreto. Hay que agregar el
  // dominio de la app (ej https://lon-philosophy.onrender.com) a
  // "Origenes de JavaScript autorizados" en la config de ese cliente.
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID || '',

  // Cuenta de Google que SIEMPRE entra como nivel 2, exista o no todavia
  // en la hoja AdminUsers. Es el "no te quedes afuera de tu propia app":
  // la primera vez que este email inicia sesion, se agrega solo a
  // AdminUsers como nivel 2 (asi despues aparece en la lista para
  // gestionar como cualquier otro usuario).
  ADMIN_SEED_EMAIL: (process.env.ADMIN_SEED_EMAIL || '').trim().toLowerCase(),

  // Clave con la que se firman las sesiones del panel admin (HMAC, no
  // es una contraseña que alguien escriba). IMPORTANTE: en produccion
  // configurala en Render con un valor propio y secreto (por ejemplo
  // corriendo `openssl rand -hex 32`) — si se queda con el valor por
  // defecto, cualquiera que lea este archivo podria firmar sesiones
  // falsas. Si cambia este valor, todas las sesiones activas se
  // invalidan (todos tienen que volver a iniciar sesion).
  SESSION_SECRET: process.env.SESSION_SECRET || 'CAMBIAR_ESTO_EN_RENDER',

  // Cuanto dura una sesion del panel admin antes de pedir iniciar sesion
  // de nuevo.
  SESSION_DURACION_HORAS: Number(process.env.SESSION_DURACION_HORAS || 24 * 30),

  // Programa de fidelidad de cafe: cuantos cafes PAGOS (escaneados) hacen
  // falta para desbloquear el regalo. Al llegar al objetivo (3), el
  // contador queda "esperando" (no se resetea todavia) — el 4to escaneo
  // (en la proxima visita) es el que entrega el regalo y recien ahi
  // vuelve a 0. Ver registrarCafeCliente() en googleSheets.js.
  CAFES_PARA_GRATIS: Number(process.env.CAFES_PARA_GRATIS || 3),

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
  // "App secret" de la app de Meta (Configuración básica de la app -> "Clave
  // secreta"). Con esto se valida que cada mensaje entrante al webhook
  // realmente viene de Meta (firma HMAC-SHA256 en el header
  // X-Hub-Signature-256) y no de cualquiera que le pegue a la URL. Si se
  // deja vacío, el webhook sigue funcionando pero SIN esa verificación
  // (no recomendado para producción).
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || '',
  WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v20.0',

  // Opcional: si cargás una API key de Anthropic (Claude), el chatbot usa a
  // Claude para responder preguntas libres que no matchean ninguna palabra
  // clave conocida (ej "¿tienen algo para regalar a mi mamá?"), siempre
  // basándose únicamente en el catálogo real. Si la dejás vacía, el bot
  // sigue funcionando con las respuestas por palabra clave (sin IA).
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
};
