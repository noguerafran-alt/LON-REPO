/* Panel ☰ compartido entre la landing (/) y el catálogo (/tienda): un solo lugar
   para que no vuelvan a desincronizarse. Requiere idioma.js cargado antes.
   Las categorías NO están fijas acá: las manda cada página con fijarCategorias()
   (landing: GET /catalogo-categorias; /tienda: las que ya cargó para sus pestañas).
   Mientras no lleguen, el panel muestra solo «Ver catálogo completo». */
(function () {
  var ICONO = {
    sobre: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
    escanear: '<svg viewBox="0 0 24 24"><path d="M4 8V6.5A1.5 1.5 0 0 1 5.5 5H8"/><path d="M16 5h2.5A1.5 1.5 0 0 1 20 6.5V8"/><path d="M20 16v1.5a1.5 1.5 0 0 1-1.5 1.5H16"/><path d="M8 19H5.5A1.5 1.5 0 0 1 4 17.5V16"/><circle cx="12" cy="12" r="3"/></svg>',
    carrito: '<svg viewBox="0 0 24 24"><path d="M7 8h10l-.7 10.2a1.5 1.5 0 0 1-1.5 1.4H9.2a1.5 1.5 0 0 1-1.5-1.4L7 8Z"/><path d="M9.5 8V6.8A2.5 2.5 0 0 1 12 4.3 2.5 2.5 0 0 1 14.5 6.8V8"/></svg>',
    cuenta: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M5.5 19.2c1.5-3 3.8-4.5 6.5-4.5s5 1.5 6.5 4.5"/></svg>',
  };

  // Todo con prefijo de ID: las páginas tienen reglas genéricas de a/button/h2 que si no le ganarían.
  var CSS =
    '#panelMenuLon{position:fixed;inset:0;z-index:1000;display:none}' +
    '#panelMenuLon.abierto{display:block}' +
    '#panelMenuLon .panel-menu-backdrop{position:absolute;inset:0;background:rgba(59,18,32,.35)}' +
    '#panelMenuLon .panel-menu-sheet{position:absolute;top:0;right:0;overflow-y:auto;width:min(320px,88vw);height:100%;background:var(--bg);color:var(--ink);padding:24px 20px;box-shadow:-8px 0 24px rgba(59,18,32,.12);display:flex;flex-direction:column;gap:8px;text-align:left}' +
    '#panelMenuLon .panel-menu-sheet h2{font-family:Fraunces,serif;font-style:italic;font-weight:400;font-size:22px;margin:8px 0 16px;color:var(--ink)}' +
    '#panelMenuLon .panel-menu-sheet a{display:block;padding:12px 0;border-bottom:1px solid var(--line);font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);text-decoration:none}' +
    '#panelMenuLon .panel-menu-sheet a.acceso{display:flex;align-items:center;gap:12px}' +
    '#panelMenuLon .panel-menu-sheet a.acceso svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round;flex:none}' +
    '#panelMenuLon #menuLonCategorias{display:contents}' +
    '#panelMenuLon .panel-menu-accesos{margin-top:20px;border-top:1px solid var(--line)}' +
    '#panelMenuLon .panel-menu-idioma{margin-top:20px}' +
    '#panelMenuLon .panel-menu-cerrar{align-self:flex-end;background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink);line-height:1;padding:4px;width:auto;height:auto}';

  var panel, boton, listaCat, opts;

  function acceso(href, icono, clave, es, accion) {
    return '<a class="acceso" href="' + href + '"' + (accion ? ' data-accion="' + accion + '"' : '') + '>' +
      icono + '<span data-i18n="' + clave + '">' + es + '</span></a>';
  }

  function abrir() {
    panel.hidden = false;
    panel.classList.add('abierto');
    boton.setAttribute('aria-expanded', 'true');
    panel.querySelector('.panel-menu-cerrar').focus();
  }
  function cerrar() {
    panel.classList.remove('abierto');
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
  }

  function iniciar(o) {
    opts = o || {};
    boton = opts.boton;
    if (!boton || panel) return;
    var estilo = document.createElement('style');
    estilo.textContent = CSS;
    document.head.appendChild(estilo);

    panel = document.createElement('div');
    panel.id = 'panelMenuLon';
    panel.hidden = true;
    panel.innerHTML =
      '<div class="panel-menu-backdrop" data-cerrar-menu></div>' +
      '<div class="panel-menu-sheet" role="dialog" aria-label="Menú" data-i18n-attr="aria-label:g_menu">' +
      '<button type="button" class="panel-menu-cerrar" data-cerrar-menu aria-label="Cerrar" data-i18n-attr="aria-label:g_cerrar">×</button>' +
      '<h2 data-landing="menu_categorias" data-i18n="g_categorias">Categorías</h2>' +
      '<div id="menuLonCategorias"></div>' +
      '<a href="/tienda" style="margin-top:12px;border:none;font-weight:600;" data-i18n="l_ver_completo">Ver catálogo completo →</a>' +
      '<a href="/cafeteria" data-i18n="g_cafeteria">Cafetería</a>' +
      '<a href="/carta" style="border:none;" data-i18n="g_carta_cafe">Carta del café</a>' +
      '<div class="panel-menu-accesos">' +
      acceso('/', ICONO.sobre, 'g_sobre_lon', 'Sobre LON') +
      acceso('/cliente.html', ICONO.escanear, 'g_escanear', 'Escanear') +
      acceso('/tienda?carrito=1', ICONO.carrito, 'g_carrito', 'Carrito', 'carrito') +
      acceso('/tienda?cuenta=1', ICONO.cuenta, 'g_mi_cuenta', 'Mi cuenta', 'cuenta') +
      '</div>' +
      '<div class="panel-menu-idioma" data-selector-idioma></div>' +
      '</div>';
    document.body.appendChild(panel);
    listaCat = panel.querySelector('#menuLonCategorias');

    boton.addEventListener('click', function () {
      if (panel.classList.contains('abierto')) cerrar(); else abrir();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('abierto')) { cerrar(); boton.focus(); }
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-cerrar-menu]')) { cerrar(); return; }
      var a = e.target.closest('a');
      if (!a) return;
      var accion = a.getAttribute('data-accion');
      var cat = a.getAttribute('data-cat');
      // En /tienda estas opciones se resuelven sin recargar; en la landing el link normal navega.
      var propia = (accion === 'carrito' && opts.alCarrito) || (accion === 'cuenta' && opts.alCuenta) || (cat && opts.alCategoria);
      if (propia) {
        e.preventDefault();
        if (cat) opts.alCategoria(cat); else (accion === 'carrito' ? opts.alCarrito : opts.alCuenta)();
      }
      cerrar();
    });

    if (window.LONi18n) {
      window.LONi18n.armarSelectores();
      window.LONi18n.repintar();
    }
  }

  // Los nombres vienen de Sheets: van tal cual, sin traducir (regla del proyecto).
  function fijarCategorias(cats) {
    if (!listaCat) return;
    listaCat.textContent = '';
    (cats || []).forEach(function (c) {
      if (!c || !c.categoria) return;
      var a = document.createElement('a');
      a.href = '/tienda?cat=' + encodeURIComponent(c.categoria);
      a.setAttribute('data-cat', c.categoria);
      a.textContent = c.nombre || c.categoria;
      listaCat.appendChild(a);
    });
  }

  window.LONMenu = { iniciar: iniciar, fijarCategorias: fijarCategorias, cerrar: function () { if (panel) cerrar(); } };
})();
