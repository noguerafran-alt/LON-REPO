/* Selector de idioma (español / inglés) del sitio público: landing, carta y tienda.
   El español vive escrito en el HTML/JS de cada página; acá solo está el inglés.
   - HTML estático: data-i18n="clave" (reemplaza el texto del elemento) y
     data-i18n-attr="atributo:clave,otro:clave" (placeholder, aria-label, title, alt).
   - Textos armados por JS: LONi18n.t(clave, textoEnEspanol, { variables }).
   - Lo que viene de Google Sheets (catálogo, /landing-contenido) NO se traduce.
     Los elementos de la landing que el CMS pisó llevan data-i18n-cms y se saltean. */
(function () {
  'use strict';

  var CLAVE = 'lon_idioma';

  var EN = {
    // Selector
    g_idioma: 'Language',

    // Compartidos (landing + tienda)
    g_escanear: 'Scan',
    g_catalogo: 'Catalog',
    g_cuenta: 'Account',
    g_menu: 'Menu',
    g_menu_categorias: 'Categories menu',
    g_categorias: 'Categories',
    g_cerrar: 'Close',
    g_cat_antiguedades: 'Antiques',
    g_cat_ceramica: 'Ceramics',
    g_cat_joyas: 'Jewelry',
    g_cat_libros: 'Books',
    g_cat_madera: 'Woodwork',
    g_cat_velas: 'Candles',
    g_carta_cafe: 'Café menu',
    g_privacidad: 'Privacy',
    g_terminos: 'Terms',
    g_acceso_admin: 'Admin access →',
    g_acceso_admin_sin_flecha: 'Admin access',

    // Landing (textos de respaldo; si el CMS tiene valor, manda el CMS)
    l_presentacion: 'LON Philosophy introduction',
    l_ubicacion: 'Books, objects and coffee — to be present',
    l_ver_piezas: 'Browse pieces',
    l_instagram: 'Follow us on Instagram',
    l_quienes: 'About us',
    l_sobre_lead: 'We are a concept store that brings reading, objects and coffee together at one pace: look, choose, stay a while.',
    l_sobre_cuerpo: 'LON Philosophy making community. We curate books and pieces with the same care: seeing and appreciating what you are getting is choosing to be present.',
    l_alt_local: 'LON — the shop',
    l_alt_detalle: 'LON — detail',
    l_pilares_titulo: 'What you will find',
    l_pilar1_texto: 'Reads to linger over — book club, new arrivals and shelves chosen with care.',
    l_pilar2_titulo: 'Objects',
    l_pilar2_texto: 'Ceramics, jewelry, candles and pieces that live on the table and on the body.',
    l_pilar3_titulo: 'Café & community',
    l_pilar3_texto: 'A place to meet. Loyalty by the cup, conversation in the shop.',
    l_espacio: 'The space',
    l_alt_espacio: 'The LON space',
    l_caption: 'The shop — light, texture and shelves.',
    l_quote: 'Seeing and appreciating what you are getting is choosing to be present.',
    l_ir_catalogo_aria: 'Go to the catalog',
    l_band_texto: 'Explore the catalog and put your order together online.',
    l_ir_catalogo: 'Go to the catalog',
    l_ver_completo: 'See the full catalog →',

    // Carta
    c_portada: 'Philosophy · Menu',
    c_adicionales: 'Extras',
    c_matcha: 'Green matcha tea drink. Frothed with milk',
    c_golden: 'Drink made with turmeric, cinnamon, nutmeg, honey and black pepper. Frothed with milk',
    c_chai: 'Drink made with black tea, cinnamon, cardamom, coconut flakes, nutmeg, clove, honey and black pepper. Frothed with milk',
    c_infusiones: 'Infusions · Anuá',
    c_inspirado_ca: 'INSPIRED BY CENTRAL AMERICA',
    c_inspirado_lit: 'INSPIRED BY ARGENTINA\'S LITORAL',
    c_bromelia: 'Pineapple, ground vanilla bean, toasted coconut and anise. (sweet notes, vanilla-forward body. Nourishing, carminative and satiating effect)',
    c_irupe: 'Mango, hibiscus, lemongrass and orange blossom. (tart, green and sweet notes. Refreshing, anti-inflammatory, antioxidant and restorative effect)',
    c_palta: '(whole-wheat toast, avocado, confit tomato, cream cheese)',
    c_palta_opc: 'optional: poached egg $2000',
    c_sin_tacc_mayus: 'GLUTEN-FREE',
    c_sin_tacc: 'Gluten-free',
    c_forest: 'House-made bread prepared with cassava starch, corn starch, brown rice flour, chickpea flour, buckwheat flour and a seed mix. Served with almond aioli, fresh avocado and pickled onions.',
    c_chipa_setas: 'Filled with a selection of pine mushrooms, portobellos and button mushrooms sautéed with leek and confit sun-dried tomatoes.',
    c_chipa_tomates: 'Filled with pickled onions and confit tomatoes.',
    c_handroll_verdura: 'Gluten-free premix pancake filled with sautéed spinach, onion and carrot, creamy ricotta and dambo cheese.',
    c_handroll_bondiola: 'Gluten-free premix pancake filled with braised pork shoulder, caramelized onion and melted dambo cheese.',
    c_precios: 'Prices in Argentine pesos.',
    cn_almendra: 'ALMOND MILK',
    cn_avena: 'OAT MILK',
    cn_extra_shot: 'EXTRA SHOT',
    cn_jugo: 'ORANGE JUICE',
    cn_lim_clasica: 'CLASSIC LEMONADE',
    cn_lim_frutos: 'RED BERRY LEMONADE',
    cn_lim_hibiscus: 'HIBISCUS LEMONADE',
    cn_agua_gas: 'SPARKLING WATER',
    cn_palta: 'AVOCADO · TOAST',
    cn_chipa_setas: 'MUSHROOM CHIPA',
    cn_chipa_tomates: 'CONFIT TOMATO CHIPA X2',
    cn_handroll_verdura: 'VEGGIE HANDROLL',
    cn_handroll_bondiola: 'BRAISED PORK SHOULDER HANDROLL',
    cn_florentinos: 'FLORENTINES (X3)',
    cn_bocadito: 'ALMOND BITE (X3)',
    cn_mini_alf_pist: 'MINI PISTACHIO ALFAJOR',
    cn_mini_alf_avel: 'MINI HAZELNUT ALFAJOR',
    cn_datil: 'STUFFED DATE',
    cn_cookie_mani: 'PEANUT & CHOCOLATE COOKIE',
    cn_cookie_frutos: 'RED BERRY COOKIE',
    cn_alf_pist: 'PISTACHIO ALFAJOR',
    cn_alf_avel: 'HAZELNUT ALFAJOR',
    cn_brownie: 'CHOCOLATE BROWNIE',
    cn_budin: 'RED BERRY LOAF CAKE',
    cn_forest: 'FOREST TOAST',

    // Tienda: estático
    t_h1: 'LON Philosophy — Books, candles and design objects, made to order',
    t_volver_catalogo: 'Back to the catalog',
    t_volver: 'Back',
    t_tu_carrito: 'Your cart',
    t_continuar: 'Continue to checkout',
    t_seguir_viendo: 'Keep browsing the catalog',
    t_mi_cuenta: 'My account',
    t_hola: 'Hi,',
    t_cafe_fidelidad: 'Loyalty coffee',
    t_qr_alt: 'Your loyalty QR code',
    t_qr_texto: 'Show this QR at the shop to log your coffee. When you reach 3, your next scan gets you a surprise gift.',
    t_cerrar_sesion: 'Sign out',
    t_login_texto: 'Sign in with your Google account so you do not have to re-enter your details at checkout next time.',
    t_cantidad: 'Quantity',
    t_nombre: 'Full name',
    t_ph_nombre: 'Your name',
    t_telefono: 'Phone',
    t_ph_telefono: 'Your phone number',
    t_entrega: 'Delivery',
    t_retiro: 'Pick up at the shop',
    t_domicilio: 'Home delivery',
    t_direccion: 'Address',
    t_ph_direccion: 'Street and number',
    t_ciudad: 'City',
    t_ph_ciudad: 'City',
    t_provincia: 'Province',
    t_elegi_provincia: 'Choose your province...',
    t_cp: 'Postal code',
    t_notas: 'Notes',
    t_opcional: '(optional)',
    t_ph_notas: 'Anything we should know',
    t_metodo_pago: 'Payment method',
    t_tarjeta: 'Card (Payway)',
    t_transferencia: 'Bank transfer',
    t_transf_intro: 'Transfer the purchase total to:',
    t_transf_nota: 'Use your name as the reference. As soon as we confirm the payment has arrived, we will arrange delivery.',
    t_cargando_datos: 'Loading details...',
    t_escanear_producto: 'Scan a product',
    t_menu_categorias: 'Menu / Categories',
    t_carrito: 'Cart',
    t_ingresar: 'Sign in',
    t_buscar: 'Search',
    t_ph_buscar: 'SEARCH PRODUCT BY NAME...',
    t_whatsapp: 'Chat on WhatsApp',
    t_whatsapp_msg: 'Hi! I have a question about a product.',

    // Tienda: armados por JS
    t_destacados: 'Pieces we look at twice',
    t_en_stock: 'In stock',
    t_sin_stock: 'Out of stock',
    t_agregar: 'Add',
    t_agregado: 'Added ✓',
    t_cargando_catalogo: 'Loading catalog...',
    t_err_catalogo: 'Could not load the catalog: {m}',
    t_err_catalogo_corto: 'Error loading the catalog',
    t_sin_productos: 'There are no products yet.',
    t_sin_resultados: 'We found no products matching "{q}".',
    t_resultados: 'Results for "{q}" ({n})',
    t_todas: 'All',
    t_cat_anteriores: 'See previous categories',
    t_cat_mas: 'See more categories',
    t_ver_anterior: 'Previous',
    t_ver_siguiente: 'Next',
    t_foto_producto: 'Product photo',
    t_foto_n: 'photo {n}',
    t_comprar_ahora: 'Buy now',
    t_agregar_carrito: 'Add to cart',
    t_agregado_carrito: 'Added to cart ✓',
    t_sin_mas_stock: 'There is no more stock of this product.',
    t_sin_precio: 'This item cannot be bought online yet: no price has been set.',
    t_sin_stock_momento: 'Out of stock for now.',
    t_tambien_interesar: 'You might also like',
    t_mas_productos: 'More products',
    t_carrito_vacio: 'Your cart is empty.',
    t_c_u: 'each',
    t_quitar_una: 'Remove one',
    t_agregar_una: 'Add one',
    t_sin_mas_stock_corto: 'No more stock available',
    t_quitar: 'Remove',
    t_total: 'Total',
    t_regalo: 'You have a gift waiting!',
    t_err_tarjeta: 'We could not load your coffee card.',
    t_cargando: 'Loading...',
    t_hola_nombre: 'Hi, {n}',
    t_err_sesion: 'Could not sign in.',
    t_err_google: 'Could not verify the Google account. Check your connection.',
    t_envio_estimado: 'Estimated shipping to {p}: ${c} (just an estimate, paid separately — we will confirm the final cost on WhatsApp)',
    t_envio_sin_costo: 'We do not have a shipping estimate for that province yet. Shipping is paid separately; we will arrange it on WhatsApp.',
    t_finalizar: 'Checkout',
    t_finalizar_carrito: 'Checkout (cart)',
    t_volver_producto: '← Back to the product',
    t_volver_carrito: '← Back to the cart',
    t_recargo_mp: 'The price goes up {p}% if you pay with Mercado Pago: ${a} instead of ${b}.',
    t_btn_transf: 'Confirm order (bank transfer)',
    t_btn_mp: 'Pay with Mercado Pago',
    t_btn_payway: 'Pay with Payway',
    t_sin_datos_transf: 'We have not set up the transfer details yet. Message us on WhatsApp to arrange the payment.',
    t_alias: 'Alias:',
    t_titular: 'Account holder:',
    t_banco: 'Bank:',
    t_monto: 'Amount:',
    t_pocas_unidades: 'Only {n} unit left of this product.',
    t_pocas_unidades_pl: 'Only {n} units left of this product.',
    t_sin_stock_prod: 'This product is no longer in stock.',
    t_falta_nombre: 'Enter your full name.',
    t_falta_email: 'Enter your email — we need it to send you the order confirmation.',
    t_falta_telefono: 'Enter your phone number (digits only).',
    t_falta_direccion: 'Fill in at least the address and city for delivery.',
    t_redir_payway: 'Redirecting to Payway...',
    t_redir_mp: 'Redirecting to Mercado Pago...',
    t_confirmando: 'Confirming order...',
    t_ok_transf: 'All set! Your order number is {id}. Transfer ${m} and keep the order number as a reference. We will arrange delivery as soon as we confirm the payment.',
    t_ok_transf_carrito: 'All set! Your order numbers are {id}. Transfer ${m} to {t} and keep those numbers as a reference.',
    t_cuenta_indicada: 'the account provided',
    t_pedido_creado: 'Order created ✓',
    t_err_pago: 'Could not start the payment: {m}',
    t_err_pedido: 'Could not confirm the order: {m}',
    t_err_desconocido: 'Unknown error',
    t_sin_url_pago: 'No payment URL was returned.'
  };

  var idioma = 'es';
  try {
    if (localStorage.getItem(CLAVE) === 'en') idioma = 'en';
  } catch (e) { /* navegación privada: se sigue en español sin guardar */ }

  function interpolar(texto, vars) {
    return String(texto).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] != null ? vars[k] : m;
    });
  }

  function t(clave, es, vars) {
    var texto = idioma === 'en' && EN[clave] != null ? EN[clave] : es;
    return interpolar(texto, vars);
  }

  /* El español original se guarda la primera vez que se ve el elemento, así
     volver a español restaura exactamente lo que está escrito en el HTML. */
  function aplicarDom() {
    document.documentElement.lang = idioma;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (el.hasAttribute('data-i18n-cms')) return;
      if (el._lonEs === undefined) el._lonEs = el.textContent;
      var en = EN[el.getAttribute('data-i18n')];
      el.textContent = idioma === 'en' && en != null ? en : el._lonEs;
    });

    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      if (el.hasAttribute('data-i18n-cms')) return;
      if (!el._lonEsAttr) el._lonEsAttr = {};
      el.getAttribute('data-i18n-attr').split(',').forEach(function (par) {
        var p = par.split(':');
        var attr = p[0].trim();
        if (!attr || !p[1]) return;
        if (!(attr in el._lonEsAttr)) el._lonEsAttr[attr] = el.getAttribute(attr) || '';
        var en = EN[p[1].trim()];
        el.setAttribute(attr, idioma === 'en' && en != null ? en : el._lonEsAttr[attr]);
      });
    });

    document.querySelectorAll('.lon-idioma').forEach(function (caja) {
      caja.setAttribute('aria-label', t('g_idioma', 'Idioma'));
      caja.querySelectorAll('button[data-lang]').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-lang') === idioma ? 'true' : 'false');
      });
    });
  }

  function fijar(nuevo) {
    if (nuevo !== 'es' && nuevo !== 'en') return;
    var cambio = nuevo !== idioma;
    idioma = nuevo;
    try { localStorage.setItem(CLAVE, nuevo); } catch (e) { /* idem navegación privada */ }
    aplicarDom();
    // Las páginas que arman texto por JS (la tienda) se vuelven a pintar con este evento.
    if (cambio) window.dispatchEvent(new CustomEvent('lon-idioma', { detail: { idioma: nuevo } }));
  }

  /* Banderas en SVG y no emoji: Windows no dibuja las banderas emoji (muestra "AR" / "US"). */
  var BANDERA_AR =
    '<svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true" focusable="false">' +
    '<rect width="24" height="16" fill="#74ACDF"/><rect y="5.33" width="24" height="5.34" fill="#fff"/>' +
    '<circle cx="12" cy="8" r="1.7" fill="#F6B40E"/></svg>';

  function banderaEU() {
    var h = 16 / 13;
    var franjas = '';
    for (var i = 1; i < 13; i += 2) franjas += '<rect y="' + (i * h).toFixed(2) + '" width="24" height="' + h.toFixed(2) + '" fill="#fff"/>';
    var estrellas = '';
    for (var f = 0; f < 3; f++) for (var c = 0; c < 4; c++) {
      estrellas += '<circle cx="' + (1.8 + c * 2.4) + '" cy="' + (1.6 + f * 2.6) + '" r=".55" fill="#fff"/>';
    }
    return '<svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true" focusable="false">' +
      '<rect width="24" height="16" fill="#B22234"/>' + franjas +
      '<rect width="10.5" height="' + (7 * h).toFixed(2) + '" fill="#3C3B6E"/>' + estrellas + '</svg>';
  }

  function inyectarEstilos() {
    var s = document.createElement('style');
    // Selectores con tag + clase: las páginas tienen reglas genéricas de button
    // (.login-box button, etc.) que de otro modo estirarían estos botones.
    s.textContent =
      '.lon-idioma{display:inline-flex;align-items:center;gap:6px}' +
      '.lon-idioma button.lon-idioma-btn{width:auto;height:auto;margin:0;padding:3px;background:none;' +
      'border:1px solid transparent;border-radius:3px;cursor:pointer;display:inline-flex;line-height:0;' +
      'opacity:.45;transition:opacity .15s ease}' +
      '.lon-idioma button.lon-idioma-btn:hover{opacity:.8}' +
      '.lon-idioma button.lon-idioma-btn[aria-pressed="true"]{opacity:1;border-color:rgba(255,243,229,.8)}' +
      '.lon-idioma button.lon-idioma-btn:focus-visible{outline:2px solid #FFF3E5;outline-offset:1px}' +
      '.lon-idioma button.lon-idioma-btn svg{display:block;width:24px;height:16px;border-radius:2px;' +
      'box-shadow:0 0 0 1px rgba(0,0,0,.25)}' +
      // En un celular el header ya lleva seis cosas (escaner, menu, logo,
      // las dos banderas, carrito y cuenta) y las banderas quedaban pegadas
      // al logo, sin un pixel de aire: de lejos se leia como si lo taparan.
      '@media(max-width:480px){.lon-idioma{gap:4px;margin-left:8px}' +
      '.lon-idioma button.lon-idioma-btn{padding:2px}' +
      '.lon-idioma button.lon-idioma-btn svg{width:20px;height:14px}}';
    document.head.appendChild(s);
  }

  function armarSelectores() {
    document.querySelectorAll('[data-selector-idioma]').forEach(function (hueco) {
      if (hueco.firstChild) return;
      var caja = document.createElement('div');
      caja.className = 'lon-idioma';
      caja.setAttribute('role', 'group');
      [['es', 'Español', BANDERA_AR], ['en', 'English', banderaEU()]].forEach(function (d) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lon-idioma-btn';
        b.setAttribute('data-lang', d[0]);
        b.setAttribute('title', d[1]);
        b.setAttribute('aria-label', d[1]);
        b.innerHTML = d[2];
        b.addEventListener('click', function () { fijar(d[0]); });
        caja.appendChild(b);
      });
      hueco.appendChild(caja);
    });
  }

  function iniciar() {
    inyectarEstilos();
    armarSelectores();
    aplicarDom();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

  window.LONi18n = { t: t, idioma: function () { return idioma; }, fijar: fijar, claves: EN };
})();
