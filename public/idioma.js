/* Selector de idioma (es / en / fr / pt-BR) del sitio público: landing, carta y tienda.
   El español vive escrito en el HTML/JS de cada página; acá solo están EN, FR y PT
   (si falta una clave en un idioma se cae al español).
   - HTML estático: data-i18n="clave" (reemplaza el texto del elemento) y
     data-i18n-attr="atributo:clave,otro:clave" (placeholder, aria-label, title, alt).
   - Textos armados por JS: LONi18n.t(clave, textoEnEspanol, { variables }).
   - Lo que viene de Google Sheets (catálogo) NO se traduce.
   - Textos del CMS (/landing-contenido): el elemento lleva data-i18n-cms y en su
     dataset lonEs / lonEn (valores del CMS, '' si no hay) y lonBase (texto del HTML).
     Español → lonEs o lonBase. Inglés → lonEn, si no el diccionario, si no lonBase. */
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
    g_carrito: 'Cart',
    g_mi_cuenta: 'My account',
    g_menu: 'Menu',
    g_menu_categorias: 'Categories menu',
    g_categorias: 'Categories',
    g_cerrar: 'Close',
    g_carta_cafe: 'Café menu',
    g_privacidad: 'Privacy',
    g_terminos: 'Terms',
    g_acceso_admin: 'Admin access →',
    g_acceso_admin_sin_flecha: 'Admin access',

    // Landing (textos de respaldo; si el CMS tiene valor, manda el CMS)
    l_presentacion: 'LON Philosophy introduction',
    l_banda_etiqueta: 'Making community',
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
    c_aviso_foto: 'Tap a product to see its photo',
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
    c_cerrar_foto: 'Close photo',
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
    t_sugerencias: 'Search suggestions',
    t_sin_sugerencias: 'No suggestions',
    t_sug_sub_en: '{s} in {c} ({n})',
    t_ph_buscar: 'SEARCH PRODUCT BY NAME...',
    t_whatsapp: 'Chat on WhatsApp',
    t_whatsapp_msg: 'Hi! I have a question about a product.',

    // Tienda: armados por JS
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
    t_catalogo_miga: 'Catalogue',
    t_grilla_2: 'View 2 per row',
    t_grilla_3: 'View 3 per row',
    t_cat_anteriores: 'See previous categories',
    t_cat_mas: 'See more categories',
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
    t_sin_url_pago: 'No payment URL was returned.',
    t_wallet_agregar: 'Add to Google Wallet',
    s_titulo: 'Stamp my coffee',
    s_cargando: 'Stamping your coffee...',
    s_token_invalido: 'This link is not valid. Tap your phone on the card at the counter.',
    s_ingresar: 'Sign in with Google to add your coffee.',
    s_sumado: '☕ Coffee added: you have {n} of {m}',
    s_cuantos: 'How many coffees?',
    s_sumado_parcial: 'Today you could add {k} more: we added {k}. You have {n} of {m}.',
    s_pendiente_sobrantes: 'One of these coffees is free! Show this QR to the staff: they redeem the free one and add the {k} remaining.',
    s_pendiente: 'Your next coffee is free! Show this QR to the staff.',
    s_frenado_min: 'You stamped a moment ago. You can stamp again at {h}.',
    s_frenado_dia: 'You reached today\'s stamp limit. Come back tomorrow.',
    s_error: 'Could not stamp your coffee. Try again.',
    s_ir_tienda: 'Go to the shop',
    s_inicio_aviso: 'Add it to your home screen: tap Share (□↑) → Add to Home Screen',
    s_tu_tarjeta: 'Your coffee card',
    s_error_tarjeta: 'Could not load your coffee card.'
  };

  var FR = {
    g_idioma: 'Langue',

    g_escanear: 'Scanner',
    g_catalogo: 'Catalogue',
    g_cuenta: 'Compte',
    g_carrito: 'Panier',
    g_mi_cuenta: 'Mon compte',
    g_menu: 'Menu',
    g_menu_categorias: 'Menu des catégories',
    g_categorias: 'Catégories',
    g_cerrar: 'Fermer',
    g_carta_cafe: 'Carte du café',
    g_privacidad: 'Confidentialité',
    g_terminos: 'Conditions',
    g_acceso_admin: 'Accès administrateur →',
    g_acceso_admin_sin_flecha: 'Accès administrateur',

    l_presentacion: 'Présentation de LON Philosophy',
    l_banda_etiqueta: 'Making community',
    l_ubicacion: 'Livres, objets et café — pour être présent',
    l_ver_piezas: 'Voir les pièces',
    l_instagram: 'Suivez-nous sur Instagram',
    l_quienes: 'Qui sommes-nous',
    l_sobre_lead: 'Nous sommes un concept store qui réunit lecture, objets et café sur un même rythme : regarder, choisir, prendre son temps.',
    l_sobre_cuerpo: 'LON Philosophy making community. Nous choisissons les livres et les pièces avec le même soin : voir et apprécier ce que l\'on reçoit, c\'est choisir d\'être présent.',
    l_alt_local: 'LON — la boutique',
    l_alt_detalle: 'LON — détail',
    l_pilares_titulo: 'Ce que vous allez trouver',
    l_pilar1_texto: 'Des lectures qui donnent envie de s\'attarder — club de lecture, nouveautés et étagères choisies avec soin.',
    l_pilar2_titulo: 'Objets',
    l_pilar2_texto: 'Céramique, bijoux, bougies et pièces qui vivent sur la table et sur la peau.',
    l_pilar3_titulo: 'Café & communauté',
    l_pilar3_texto: 'Un lieu pour se retrouver. La fidélité à la tasse, la conversation en boutique.',
    l_espacio: 'Le lieu',
    l_alt_espacio: 'Le lieu LON',
    l_caption: 'La boutique — lumière, matière et étagères.',
    l_quote: 'Voir et apprécier ce que l\'on reçoit, c\'est choisir d\'être présent.',
    l_ir_catalogo_aria: 'Aller au catalogue',
    l_band_texto: 'Parcourez le catalogue et composez votre commande en ligne.',
    l_ir_catalogo: 'Aller au catalogue',
    l_ver_completo: 'Voir tout le catalogue →',

    c_portada: 'Philosophy · Carte',
    c_aviso_foto: 'Touchez un produit pour voir sa photo',
    c_adicionales: 'Suppléments',
    c_matcha: 'Boisson au thé vert matcha. Mousseuse, au lait',
    c_golden: 'Boisson au curcuma, cannelle, noix de muscade, miel et poivre noir. Mousseuse, au lait',
    c_chai: 'Boisson au thé noir, cannelle, cardamome, noix de coco râpée, noix de muscade, clou de girofle, miel et poivre noir. Mousseuse, au lait',
    c_infusiones: 'Infusions · Anuá',
    c_inspirado_ca: 'INSPIRÉ DE L\'AMÉRIQUE CENTRALE',
    c_inspirado_lit: 'INSPIRÉ DU LITORAL ARGENTIN',
    c_bromelia: 'Ananas, gousse de vanille moulue, noix de coco grillée et anis. (notes douces, corps vanillé. Effet nourrissant, carminatif et rassasiant)',
    c_irupe: 'Mangue, hibiscus, citronnelle et fleur d\'oranger. (notes acidulées, vertes et sucrées. Effet rafraîchissant, anti-inflammatoire, antioxydant et réparateur)',
    c_palta: '(tartine de pain complet, avocat, tomate confite, fromage frais)',
    c_palta_opc: 'en option : œuf poché 2000 $',
    c_sin_tacc_mayus: 'SANS GLUTEN',
    c_sin_tacc: 'Sans gluten',
    c_forest: 'Pain maison à base de fécule de manioc, fécule de maïs, farine de riz complet, farine de pois chiche, farine de sarrasin et un mélange de graines. Servi avec aïoli d\'amande, avocat frais et oignons marinés.',
    c_chipa_setas: 'Garni d\'un assortiment de champignons des pins, portobellos et champignons de Paris sautés au poireau et aux tomates séchées confites.',
    c_chipa_tomates: 'Garni d\'oignons marinés et de tomates confites.',
    c_handroll_verdura: 'Crêpe sans gluten garnie d\'épinards, oignon et carotte sautés, ricotta crémeuse et fromage dambo.',
    c_handroll_bondiola: 'Crêpe sans gluten garnie d\'échine de porc braisée, oignon caramélisé et fromage dambo fondu.',
    c_precios: 'Prix en pesos argentins.',
    c_cerrar_foto: 'Fermer la photo',
    cn_almendra: 'LAIT D\'AMANDE',
    cn_avena: 'LAIT D\'AVOINE',
    cn_extra_shot: 'SHOT SUPPLÉMENTAIRE',
    cn_jugo: 'JUS D\'ORANGE',
    cn_lim_clasica: 'LIMONADE CLASSIQUE',
    cn_lim_frutos: 'LIMONADE AUX FRUITS ROUGES',
    cn_lim_hibiscus: 'LIMONADE À L\'HIBISCUS',
    cn_agua_gas: 'EAU GAZEUSE',
    cn_palta: 'AVOCAT · TARTINE',
    cn_chipa_setas: 'CHIPA AUX CHAMPIGNONS',
    cn_chipa_tomates: 'CHIPA AUX TOMATES CONFITES X2',
    cn_handroll_verdura: 'HANDROLL VÉGÉTARIEN',
    cn_handroll_bondiola: 'HANDROLL À L\'ÉCHINE DE PORC BRAISÉE',
    cn_florentinos: 'FLORENTINS (X3)',
    cn_bocadito: 'BOUCHÉE AUX AMANDES (X3)',
    cn_mini_alf_pist: 'MINI ALFAJOR À LA PISTACHE',
    cn_mini_alf_avel: 'MINI ALFAJOR À LA NOISETTE',
    cn_datil: 'DATTE FARCIE',
    cn_cookie_mani: 'COOKIE CACAHUÈTE ET CHOCOLAT',
    cn_cookie_frutos: 'COOKIE AUX FRUITS ROUGES',
    cn_alf_pist: 'ALFAJOR À LA PISTACHE',
    cn_alf_avel: 'ALFAJOR À LA NOISETTE',
    cn_brownie: 'BROWNIE AU CHOCOLAT',
    cn_budin: 'CAKE AUX FRUITS ROUGES',
    cn_forest: 'TARTINE FOREST',

    t_h1: 'LON Philosophy — Livres, bougies et objets design, sur commande',
    t_volver_catalogo: 'Retour au catalogue',
    t_volver: 'Retour',
    t_tu_carrito: 'Votre panier',
    t_continuar: 'Passer à la caisse',
    t_seguir_viendo: 'Continuer à parcourir le catalogue',
    t_mi_cuenta: 'Mon compte',
    t_hola: 'Bonjour,',
    t_cafe_fidelidad: 'Café fidélité',
    t_qr_alt: 'Votre code QR de fidélité',
    t_qr_texto: 'Montrez ce QR en boutique pour enregistrer votre café. À partir de 3, votre prochain passage vous vaut un cadeau surprise.',
    t_cerrar_sesion: 'Se déconnecter',
    t_login_texto: 'Connectez-vous avec votre compte Google pour ne pas avoir à ressaisir vos informations à votre prochain achat.',
    t_cantidad: 'Quantité',
    t_nombre: 'Nom complet',
    t_ph_nombre: 'Votre nom',
    t_telefono: 'Téléphone',
    t_ph_telefono: 'Votre numéro de téléphone',
    t_entrega: 'Livraison',
    t_retiro: 'Retrait en boutique',
    t_domicilio: 'Livraison à domicile',
    t_direccion: 'Adresse',
    t_ph_direccion: 'Rue et numéro',
    t_ciudad: 'Ville',
    t_ph_ciudad: 'Ville',
    t_provincia: 'Province',
    t_elegi_provincia: 'Choisissez votre province...',
    t_cp: 'Code postal',
    t_notas: 'Remarques',
    t_opcional: '(facultatif)',
    t_ph_notas: 'Tout ce que nous devons savoir',
    t_metodo_pago: 'Mode de paiement',
    t_tarjeta: 'Carte (Payway)',
    t_transferencia: 'Virement bancaire',
    t_transf_intro: 'Virez le total de l\'achat à :',
    t_transf_nota: 'Indiquez votre nom comme référence. Dès que nous confirmons la réception du paiement, nous organisons la livraison.',
    t_cargando_datos: 'Chargement des informations...',
    t_escanear_producto: 'Scanner un produit',
    t_menu_categorias: 'Menu / Catégories',
    t_carrito: 'Panier',
    t_ingresar: 'Se connecter',
    t_buscar: 'Rechercher',
    t_sugerencias: 'Suggestions de recherche',
    t_sin_sugerencias: 'Aucune suggestion',
    t_sug_sub_en: '{s} dans {c} ({n})',
    t_ph_buscar: 'RECHERCHER UN PRODUIT PAR NOM...',
    t_whatsapp: 'Discuter sur WhatsApp',
    t_whatsapp_msg: 'Bonjour ! J\'ai une question sur un produit.',

    t_en_stock: 'En stock',
    t_sin_stock: 'Épuisé',
    t_agregar: 'Ajouter',
    t_agregado: 'Ajouté ✓',
    t_cargando_catalogo: 'Chargement du catalogue...',
    t_err_catalogo: 'Impossible de charger le catalogue : {m}',
    t_err_catalogo_corto: 'Erreur de chargement du catalogue',
    t_sin_productos: 'Il n\'y a pas encore de produits.',
    t_sin_resultados: 'Aucun produit ne correspond à « {q} ».',
    t_resultados: 'Résultats pour « {q} » ({n})',
    t_todas: 'Toutes',
    t_catalogo_miga: 'Catalogue',
    t_grilla_2: 'Voir par 2',
    t_grilla_3: 'Voir par 3',
    t_cat_anteriores: 'Voir les catégories précédentes',
    t_cat_mas: 'Voir plus de catégories',
    t_foto_producto: 'Photo du produit',
    t_foto_n: 'photo {n}',
    t_comprar_ahora: 'Acheter maintenant',
    t_agregar_carrito: 'Ajouter au panier',
    t_agregado_carrito: 'Ajouté au panier ✓',
    t_sin_mas_stock: 'Il n\'y a plus de stock de ce produit.',
    t_sin_precio: 'Cet article ne peut pas encore être acheté en ligne : aucun prix n\'a été défini.',
    t_sin_stock_momento: 'Épuisé pour le moment.',
    t_tambien_interesar: 'Cela pourrait aussi vous plaire',
    t_mas_productos: 'Plus de produits',
    t_carrito_vacio: 'Votre panier est vide.',
    t_c_u: 'l\'unité',
    t_quitar_una: 'En retirer un',
    t_agregar_una: 'En ajouter un',
    t_sin_mas_stock_corto: 'Plus de stock disponible',
    t_quitar: 'Retirer',
    t_total: 'Total',
    t_regalo: 'Un cadeau vous attend !',
    t_err_tarjeta: 'Impossible de charger votre carte de café.',
    t_cargando: 'Chargement...',
    t_hola_nombre: 'Bonjour, {n}',
    t_err_sesion: 'Impossible de se connecter.',
    t_err_google: 'Impossible de vérifier le compte Google. Vérifiez votre connexion.',
    t_envio_estimado: 'Livraison estimée vers {p} : {c} $ (simple estimation, payée à part — nous confirmerons le coût final sur WhatsApp)',
    t_envio_sin_costo: 'Nous n\'avons pas encore d\'estimation de livraison pour cette province. La livraison se paie à part ; nous l\'organiserons sur WhatsApp.',
    t_finalizar: 'Passer commande',
    t_finalizar_carrito: 'Passer commande (panier)',
    t_volver_producto: '← Retour au produit',
    t_volver_carrito: '← Retour au panier',
    t_recargo_mp: 'Le prix augmente de {p} % si vous payez avec Mercado Pago : {a} $ au lieu de {b} $.',
    t_btn_transf: 'Confirmer la commande (virement bancaire)',
    t_btn_mp: 'Payer avec Mercado Pago',
    t_btn_payway: 'Payer avec Payway',
    t_sin_datos_transf: 'Nous n\'avons pas encore configuré les coordonnées de virement. Écrivez-nous sur WhatsApp pour organiser le paiement.',
    t_alias: 'Alias :',
    t_titular: 'Titulaire :',
    t_banco: 'Banque :',
    t_monto: 'Montant :',
    t_pocas_unidades: 'Il ne reste que {n} unité de ce produit.',
    t_pocas_unidades_pl: 'Il ne reste que {n} unités de ce produit.',
    t_sin_stock_prod: 'Ce produit n\'est plus en stock.',
    t_falta_nombre: 'Saisissez votre nom complet.',
    t_falta_email: 'Saisissez votre e-mail — nous en avons besoin pour vous envoyer la confirmation de commande.',
    t_falta_telefono: 'Saisissez votre numéro de téléphone (chiffres uniquement).',
    t_falta_direccion: 'Renseignez au moins l\'adresse et la ville pour la livraison.',
    t_redir_payway: 'Redirection vers Payway...',
    t_redir_mp: 'Redirection vers Mercado Pago...',
    t_confirmando: 'Confirmation de la commande...',
    t_ok_transf: 'C\'est fait ! Votre numéro de commande est {id}. Virez {m} $ et gardez le numéro de commande comme référence. Nous organiserons la livraison dès que nous aurons confirmé le paiement.',
    t_ok_transf_carrito: 'C\'est fait ! Vos numéros de commande sont {id}. Virez {m} $ sur {t} et gardez ces numéros comme référence.',
    t_cuenta_indicada: 'le compte indiqué',
    t_pedido_creado: 'Commande créée ✓',
    t_err_pago: 'Impossible de lancer le paiement : {m}',
    t_err_pedido: 'Impossible de confirmer la commande : {m}',
    t_err_desconocido: 'Erreur inconnue',
    t_sin_url_pago: 'Aucune URL de paiement n\'a été renvoyée.',
    t_wallet_agregar: 'Ajouter à Google Wallet',
    s_titulo: 'Tamponner mon café',
    s_cargando: 'Tamponnage de votre café...',
    s_token_invalido: 'Ce lien n\'est pas valide. Approchez votre téléphone de la carte du comptoir.',
    s_ingresar: 'Connectez-vous avec Google pour ajouter votre café.',
    s_sumado: '☕ Café ajouté : vous en avez {n} sur {m}',
    s_cuantos: 'Combien de cafés ?',
    s_sumado_parcial: 'Aujourd\'hui vous pouviez en ajouter {k} de plus : nous en avons ajouté {k}. Vous en avez {n} sur {m}.',
    s_pendiente_sobrantes: 'Un de ces cafés est offert ! Montrez ce QR au personnel : il valide le café offert et ajoute les {k} restants.',
    s_pendiente: 'Votre prochain café est offert ! Montrez ce QR au personnel.',
    s_frenado_min: 'Vous avez tamponné il y a peu. Vous pourrez retamponner à {h}.',
    s_frenado_dia: 'Vous avez atteint la limite de tampons du jour. Revenez demain.',
    s_error: 'Impossible de tamponner votre café. Réessayez.',
    s_ir_tienda: 'Aller à la boutique',
    s_inicio_aviso: 'Ajoutez-la à votre écran d’accueil : touchez Partager (□↑) → Sur l’écran d’accueil',
    s_tu_tarjeta: 'Votre carte café',
    s_error_tarjeta: 'Impossible de charger votre carte café.'
  };

  var PT = {
    g_idioma: 'Idioma',

    g_escanear: 'Escanear',
    g_catalogo: 'Catálogo',
    g_cuenta: 'Conta',
    g_carrito: 'Carrinho',
    g_mi_cuenta: 'Minha conta',
    g_menu: 'Menu',
    g_menu_categorias: 'Menu de categorias',
    g_categorias: 'Categorias',
    g_cerrar: 'Fechar',
    g_carta_cafe: 'Cardápio do café',
    g_privacidad: 'Privacidade',
    g_terminos: 'Termos',
    g_acceso_admin: 'Acesso de administrador →',
    g_acceso_admin_sin_flecha: 'Acesso de administrador',

    l_presentacion: 'Apresentação da LON Philosophy',
    l_banda_etiqueta: 'Making community',
    l_ubicacion: 'Livros, objetos e café — para estar presente',
    l_ver_piezas: 'Ver as peças',
    l_instagram: 'Siga a gente no Instagram',
    l_quienes: 'Quem somos',
    l_sobre_lead: 'Somos uma concept store que reúne leitura, objetos e café num mesmo ritmo: olhar, escolher, ficar um pouco.',
    l_sobre_cuerpo: 'LON Philosophy making community. Escolhemos livros e peças com o mesmo cuidado: ver e valorizar o que você leva é escolher estar presente.',
    l_alt_local: 'LON — a loja',
    l_alt_detalle: 'LON — detalhe',
    l_pilares_titulo: 'O que você vai encontrar',
    l_pilar1_texto: 'Leituras para saborear — clube do livro, novidades e estantes escolhidas com carinho.',
    l_pilar2_titulo: 'Objetos',
    l_pilar2_texto: 'Cerâmica, joias, velas e peças que moram na mesa e no corpo.',
    l_pilar3_titulo: 'Café & comunidade',
    l_pilar3_texto: 'Um lugar para se encontrar. Fidelidade por xícara, conversa na loja.',
    l_espacio: 'O espaço',
    l_alt_espacio: 'O espaço da LON',
    l_caption: 'A loja — luz, textura e estantes.',
    l_quote: 'Ver e valorizar o que você leva é escolher estar presente.',
    l_ir_catalogo_aria: 'Ir para o catálogo',
    l_band_texto: 'Explore o catálogo e monte seu pedido online.',
    l_ir_catalogo: 'Ir para o catálogo',
    l_ver_completo: 'Ver o catálogo completo →',

    c_portada: 'Philosophy · Cardápio',
    c_aviso_foto: 'Toque em um produto para ver a foto',
    c_adicionales: 'Adicionais',
    c_matcha: 'Bebida de chá verde matcha. Batida com leite',
    c_golden: 'Bebida feita com cúrcuma, canela, noz-moscada, mel e pimenta-do-reino. Batida com leite',
    c_chai: 'Bebida feita com chá preto, canela, cardamomo, coco em flocos, noz-moscada, cravo, mel e pimenta-do-reino. Batida com leite',
    c_infusiones: 'Infusões · Anuá',
    c_inspirado_ca: 'INSPIRADO NA AMÉRICA CENTRAL',
    c_inspirado_lit: 'INSPIRADO NO LITORAL ARGENTINO',
    c_bromelia: 'Abacaxi, fava de baunilha moída, coco tostado e anis. (notas doces, corpo com baunilha em destaque. Efeito nutritivo, carminativo e saciante)',
    c_irupe: 'Manga, hibisco, capim-limão e flor de laranjeira. (notas ácidas, verdes e doces. Efeito refrescante, anti-inflamatório, antioxidante e restaurador)',
    c_palta: '(torrada integral, abacate, tomate confit, cream cheese)',
    c_palta_opc: 'opcional: ovo pochê $2000',
    c_sin_tacc_mayus: 'SEM GLÚTEN',
    c_sin_tacc: 'Sem glúten',
    c_forest: 'Pão da casa feito com fécula de mandioca, amido de milho, farinha de arroz integral, farinha de grão-de-bico, farinha de trigo-sarraceno e mix de sementes. Servido com aioli de amêndoas, abacate fresco e cebola em conserva.',
    c_chipa_setas: 'Recheada com seleção de cogumelos pinho, portobello e champignon salteados com alho-poró e tomate seco confit.',
    c_chipa_tomates: 'Recheada com cebola em conserva e tomate confit.',
    c_handroll_verdura: 'Panqueca sem glúten recheada com espinafre, cebola e cenoura salteados, ricota cremosa e queijo dambo.',
    c_handroll_bondiola: 'Panqueca sem glúten recheada com copa-lombo de porco braseada, cebola caramelizada e queijo dambo derretido.',
    c_precios: 'Preços em pesos argentinos.',
    c_cerrar_foto: 'Fechar foto',
    cn_almendra: 'LEITE DE AMÊNDOAS',
    cn_avena: 'LEITE DE AVEIA',
    cn_extra_shot: 'SHOT EXTRA',
    cn_jugo: 'SUCO DE LARANJA',
    cn_lim_clasica: 'LIMONADA CLÁSSICA',
    cn_lim_frutos: 'LIMONADA DE FRUTAS VERMELHAS',
    cn_lim_hibiscus: 'LIMONADA DE HIBISCO',
    cn_agua_gas: 'ÁGUA COM GÁS',
    cn_palta: 'ABACATE · TORRADA',
    cn_chipa_setas: 'CHIPA DE COGUMELOS',
    cn_chipa_tomates: 'CHIPA DE TOMATE CONFIT X2',
    cn_handroll_verdura: 'HANDROLL VEGETARIANO',
    cn_handroll_bondiola: 'HANDROLL DE COPA-LOMBO BRASEADA',
    cn_florentinos: 'FLORENTINOS (X3)',
    cn_bocadito: 'BOCADINHO DE AMÊNDOAS (X3)',
    cn_mini_alf_pist: 'MINI ALFAJOR DE PISTACHE',
    cn_mini_alf_avel: 'MINI ALFAJOR DE AVELÃ',
    cn_datil: 'TÂMARA RECHEADA',
    cn_cookie_mani: 'COOKIE DE AMENDOIM E CHOCOLATE',
    cn_cookie_frutos: 'COOKIE DE FRUTAS VERMELHAS',
    cn_alf_pist: 'ALFAJOR DE PISTACHE',
    cn_alf_avel: 'ALFAJOR DE AVELÃ',
    cn_brownie: 'BROWNIE DE CHOCOLATE',
    cn_budin: 'BOLO INGLÊS DE FRUTAS VERMELHAS',
    cn_forest: 'TORRADA FOREST',

    t_h1: 'LON Philosophy — Livros, velas e objetos de design, sob encomenda',
    t_volver_catalogo: 'Voltar ao catálogo',
    t_volver: 'Voltar',
    t_tu_carrito: 'Seu carrinho',
    t_continuar: 'Continuar para o checkout',
    t_seguir_viendo: 'Continuar vendo o catálogo',
    t_mi_cuenta: 'Minha conta',
    t_hola: 'Olá,',
    t_cafe_fidelidad: 'Café fidelidade',
    t_qr_alt: 'Seu QR code de fidelidade',
    t_qr_texto: 'Mostre este QR na loja para registrar seu café. Ao chegar a 3, o próximo escaneamento rende um presente surpresa.',
    t_cerrar_sesion: 'Sair',
    t_login_texto: 'Entre com sua conta Google para não precisar digitar seus dados de novo na próxima compra.',
    t_cantidad: 'Quantidade',
    t_nombre: 'Nome completo',
    t_ph_nombre: 'Seu nome',
    t_telefono: 'Telefone',
    t_ph_telefono: 'Seu número de telefone',
    t_entrega: 'Entrega',
    t_retiro: 'Retirar na loja',
    t_domicilio: 'Entrega em domicílio',
    t_direccion: 'Endereço',
    t_ph_direccion: 'Rua e número',
    t_ciudad: 'Cidade',
    t_ph_ciudad: 'Cidade',
    t_provincia: 'Província',
    t_elegi_provincia: 'Escolha sua província...',
    t_cp: 'CEP',
    t_notas: 'Observações',
    t_opcional: '(opcional)',
    t_ph_notas: 'Algo que devamos saber',
    t_metodo_pago: 'Forma de pagamento',
    t_tarjeta: 'Cartão (Payway)',
    t_transferencia: 'Transferência bancária',
    t_transf_intro: 'Transfira o total da compra para:',
    t_transf_nota: 'Use seu nome como referência. Assim que confirmarmos o pagamento, combinamos a entrega.',
    t_cargando_datos: 'Carregando dados...',
    t_escanear_producto: 'Escanear um produto',
    t_menu_categorias: 'Menu / Categorias',
    t_carrito: 'Carrinho',
    t_ingresar: 'Entrar',
    t_buscar: 'Buscar',
    t_sugerencias: 'Sugestões de busca',
    t_sin_sugerencias: 'Sem sugestões',
    t_sug_sub_en: '{s} em {c} ({n})',
    t_ph_buscar: 'BUSCAR PRODUTO PELO NOME...',
    t_whatsapp: 'Conversar no WhatsApp',
    t_whatsapp_msg: 'Olá! Tenho uma dúvida sobre um produto.',

    t_en_stock: 'Em estoque',
    t_sin_stock: 'Esgotado',
    t_agregar: 'Adicionar',
    t_agregado: 'Adicionado ✓',
    t_cargando_catalogo: 'Carregando catálogo...',
    t_err_catalogo: 'Não foi possível carregar o catálogo: {m}',
    t_err_catalogo_corto: 'Erro ao carregar o catálogo',
    t_sin_productos: 'Ainda não há produtos.',
    t_sin_resultados: 'Não encontramos produtos para "{q}".',
    t_resultados: 'Resultados para "{q}" ({n})',
    t_todas: 'Todas',
    t_catalogo_miga: 'Catálogo',
    t_grilla_2: 'Ver de 2 em 2',
    t_grilla_3: 'Ver de 3 em 3',
    t_cat_anteriores: 'Ver categorias anteriores',
    t_cat_mas: 'Ver mais categorias',
    t_foto_producto: 'Foto do produto',
    t_foto_n: 'foto {n}',
    t_comprar_ahora: 'Comprar agora',
    t_agregar_carrito: 'Adicionar ao carrinho',
    t_agregado_carrito: 'Adicionado ao carrinho ✓',
    t_sin_mas_stock: 'Não há mais estoque deste produto.',
    t_sin_precio: 'Este item ainda não pode ser comprado online: não tem preço definido.',
    t_sin_stock_momento: 'Esgotado por enquanto.',
    t_tambien_interesar: 'Você também pode gostar',
    t_mas_productos: 'Mais produtos',
    t_carrito_vacio: 'Seu carrinho está vazio.',
    t_c_u: 'cada',
    t_quitar_una: 'Tirar uma',
    t_agregar_una: 'Adicionar uma',
    t_sin_mas_stock_corto: 'Sem mais estoque disponível',
    t_quitar: 'Remover',
    t_total: 'Total',
    t_regalo: 'Você tem um presente esperando!',
    t_err_tarjeta: 'Não foi possível carregar seu cartão de café.',
    t_cargando: 'Carregando...',
    t_hola_nombre: 'Olá, {n}',
    t_err_sesion: 'Não foi possível entrar.',
    t_err_google: 'Não foi possível verificar a conta Google. Confira sua conexão.',
    t_envio_estimado: 'Frete estimado para {p}: ${c} (apenas uma estimativa, pago à parte — confirmaremos o valor final pelo WhatsApp)',
    t_envio_sin_costo: 'Ainda não temos estimativa de frete para essa província. O frete é pago à parte; combinamos pelo WhatsApp.',
    t_finalizar: 'Finalizar compra',
    t_finalizar_carrito: 'Finalizar compra (carrinho)',
    t_volver_producto: '← Voltar ao produto',
    t_volver_carrito: '← Voltar ao carrinho',
    t_recargo_mp: 'O preço sobe {p}% se você pagar com Mercado Pago: ${a} em vez de ${b}.',
    t_btn_transf: 'Confirmar pedido (transferência bancária)',
    t_btn_mp: 'Pagar com Mercado Pago',
    t_btn_payway: 'Pagar com Payway',
    t_sin_datos_transf: 'Ainda não configuramos os dados para transferência. Fale com a gente pelo WhatsApp para combinar o pagamento.',
    t_alias: 'Alias:',
    t_titular: 'Titular:',
    t_banco: 'Banco:',
    t_monto: 'Valor:',
    t_pocas_unidades: 'Resta apenas {n} unidade deste produto.',
    t_pocas_unidades_pl: 'Restam apenas {n} unidades deste produto.',
    t_sin_stock_prod: 'Este produto não está mais em estoque.',
    t_falta_nombre: 'Digite seu nome completo.',
    t_falta_email: 'Digite seu e-mail — precisamos dele para enviar a confirmação do pedido.',
    t_falta_telefono: 'Digite seu telefone (somente números).',
    t_falta_direccion: 'Preencha pelo menos o endereço e a cidade para a entrega.',
    t_redir_payway: 'Redirecionando para o Payway...',
    t_redir_mp: 'Redirecionando para o Mercado Pago...',
    t_confirmando: 'Confirmando pedido...',
    t_ok_transf: 'Pronto! O número do seu pedido é {id}. Transfira ${m} e guarde o número do pedido como referência. Combinaremos a entrega assim que confirmarmos o pagamento.',
    t_ok_transf_carrito: 'Pronto! Os números dos seus pedidos são {id}. Transfira ${m} para {t} e guarde esses números como referência.',
    t_cuenta_indicada: 'a conta informada',
    t_pedido_creado: 'Pedido criado ✓',
    t_err_pago: 'Não foi possível iniciar o pagamento: {m}',
    t_err_pedido: 'Não foi possível confirmar o pedido: {m}',
    t_err_desconocido: 'Erro desconhecido',
    t_sin_url_pago: 'Nenhuma URL de pagamento foi retornada.',
    t_wallet_agregar: 'Adicionar ao Google Wallet',
    s_titulo: 'Carimbar meu café',
    s_cargando: 'Carimbando seu café...',
    s_token_invalido: 'Este link não é válido. Encoste o celular no cartão do balcão.',
    s_ingresar: 'Entre com o Google para somar seu café.',
    s_sumado: '☕ Café somado: você tem {n} de {m}',
    s_cuantos: 'Quantos cafés?',
    s_sumado_parcial: 'Hoje você podia somar mais {k}: somamos {k}. Você tem {n} de {m}.',
    s_pendiente_sobrantes: 'Um destes cafés é grátis! Mostre este QR à equipe: ela resgata o grátis e soma os {k} que sobram.',
    s_pendiente: 'Seu próximo café é grátis! Mostre este QR à equipe.',
    s_frenado_min: 'Você carimbou há pouco. Poderá carimbar de novo às {h}.',
    s_frenado_dia: 'Você atingiu o limite de carimbos de hoje. Volte amanhã.',
    s_error: 'Não foi possível carimbar seu café. Tente de novo.',
    s_ir_tienda: 'Ir para a loja',
    s_inicio_aviso: 'Adicione à sua tela de início: toque em Compartilhar (□↑) → Adicionar à Tela de Início',
    s_tu_tarjeta: 'Seu cartão de café',
    s_error_tarjeta: 'Não foi possível carregar seu cartão de café.'
  };

  var IDIOMAS = ['es', 'en', 'fr', 'pt'];
  var DIC = { en: EN, fr: FR, pt: PT };
  var HTML_LANG = { es: 'es', en: 'en', fr: 'fr', pt: 'pt-BR' };

  var idioma = 'es';
  try {
    var guardado = localStorage.getItem(CLAVE);
    if (IDIOMAS.indexOf(guardado) >= 0) idioma = guardado;
  } catch (e) { /* navegación privada: se sigue en español sin guardar */ }

  // Texto del diccionario del idioma activo (null en español o si falta la clave).
  function dic(clave) {
    var d = DIC[idioma];
    return d && d[clave] != null ? d[clave] : null;
  }

  function interpolar(texto, vars) {
    return String(texto).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] != null ? vars[k] : m;
    });
  }

  function t(clave, es, vars) {
    var d = dic(clave);
    return interpolar(d != null ? d : es, vars);
  }

  /* El español original se guarda la primera vez que se ve el elemento, así
     volver a español restaura exactamente lo que está escrito en el HTML. */
  function aplicarDom() {
    document.documentElement.lang = HTML_LANG[idioma];

    document.querySelectorAll('[data-lon-base]').forEach(function (el) {
      var d = el.dataset;
      // dataset.lonEn / lonFr / lonPt: casillas _en / _fr / _pt del CMS.
      el.textContent = idioma === 'es'
        ? (d.lonEs || d.lonBase)
        : (d['lon' + idioma.charAt(0).toUpperCase() + idioma.slice(1)] || dic(el.getAttribute('data-i18n')) || d.lonBase);
    });

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (el.hasAttribute('data-i18n-cms')) return;
      if (el._lonEs === undefined) el._lonEs = el.textContent;
      var tr = dic(el.getAttribute('data-i18n'));
      el.textContent = tr != null ? tr : el._lonEs;
    });

    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      if (el.hasAttribute('data-i18n-cms')) return;
      if (!el._lonEsAttr) el._lonEsAttr = {};
      el.getAttribute('data-i18n-attr').split(',').forEach(function (par) {
        var p = par.split(':');
        var attr = p[0].trim();
        if (!attr || !p[1]) return;
        if (!(attr in el._lonEsAttr)) el._lonEsAttr[attr] = el.getAttribute(attr) || '';
        var tr = dic(p[1].trim());
        el.setAttribute(attr, tr != null ? tr : el._lonEsAttr[attr]);
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
    if (IDIOMAS.indexOf(nuevo) < 0) return;
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

  var BANDERA_FR =
    '<svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true" focusable="false">' +
    '<rect width="8" height="16" fill="#0055A4"/><rect x="8" width="8" height="16" fill="#fff"/>' +
    '<rect x="16" width="8" height="16" fill="#EF4135"/></svg>';

  var BANDERA_BR =
    '<svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true" focusable="false">' +
    '<rect width="24" height="16" fill="#009C3B"/><polygon points="12,1.8 22,8 12,14.2 2,8" fill="#FFDF00"/>' +
    '<circle cx="12" cy="8" r="3.4" fill="#002776"/></svg>';

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
      '@media(max-width:480px){.lon-idioma{gap:1px;margin-left:6px}' +
      '.lon-idioma button.lon-idioma-btn{padding:2px}' +
      '.lon-idioma button.lon-idioma-btn svg{width:18px;height:12px}}';
    document.head.appendChild(s);
  }

  function armarSelectores() {
    document.querySelectorAll('[data-selector-idioma]').forEach(function (hueco) {
      if (hueco.firstChild) return;
      var caja = document.createElement('div');
      caja.className = 'lon-idioma';
      caja.setAttribute('role', 'group');
      [['es', 'Español', BANDERA_AR], ['en', 'English', banderaEU()], ['fr', 'Français', BANDERA_FR], ['pt', 'Português', BANDERA_BR]].forEach(function (d) {
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

  window.LONi18n = { t: t, idioma: function () { return idioma; }, fijar: fijar, claves: EN, diccionarios: DIC, repintar: aplicarDom, armarSelectores: armarSelectores };
})();
