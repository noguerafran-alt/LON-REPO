/* Tarjeta de fidelidad visual (estilo pase de wallet) + detección de iPhone/iPad.
   Compartido por /sellar, /mi-tarjeta y «Mi cuenta» de /tienda. */
(function(){
  // iPadOS se presenta como Mac, pero con pantalla táctil.
  function esIOS(){
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }
  function esApp(){
    return navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  }

  const css = document.createElement('style');
  css.textContent =
    '.lon-tarjeta{background:#5E1E2B;color:#FFF3E5;border-radius:16px;padding:18px 18px 16px;text-align:center;box-shadow:0 6px 18px rgba(59,18,32,.28);max-width:340px;margin:0 auto;font-family:Fraunces,Georgia,serif}' +
    '.lon-tarjeta img.lon-t-logo{height:26px;display:block;margin:0 auto 12px}' +
    '.lon-tarjeta .lon-t-nombre{font-size:18px;margin:0 0 12px;word-break:break-word}' +
    '.lon-tarjeta .lon-t-sellos{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 14px}' +
    '.lon-tarjeta .lon-t-sello{width:34px;height:34px;border-radius:50%;border:2px solid #FFF3E5;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:16px}' +
    '.lon-tarjeta .lon-t-sello.lleno{background:#FFF3E5;color:#5E1E2B}' +
    '.lon-tarjeta .lon-t-sello.gratis{border-style:dashed}' +
    '.lon-tarjeta img.lon-t-qr{width:150px;height:150px;background:#fff;padding:8px;border-radius:8px;display:block;margin:0 auto;box-sizing:content-box}';
  document.head.appendChild(css);

  // llenos/total: cafés sumados y CAFES_PARA_GRATIS; el círculo extra es el gratis.
  function tarjeta({ nombre, llenos, total, qr }){
    const d = document.createElement('div');
    d.className = 'lon-tarjeta';
    const logo = document.createElement('img');
    logo.className = 'lon-t-logo'; logo.src = '/logo-catalogo-white.png'; logo.alt = 'LON';
    const n = document.createElement('p');
    n.className = 'lon-t-nombre'; n.textContent = nombre || '';
    const caja = document.createElement('div');
    caja.className = 'lon-t-sellos';
    for (let i = 0; i <= total; i++) {
      const s = document.createElement('div');
      const esGratis = i === total;
      s.className = 'lon-t-sello' + ((i < llenos || (esGratis && llenos >= total)) ? ' lleno' : '') + (esGratis ? ' gratis' : '');
      s.textContent = esGratis ? '🎁' : (i < llenos ? '☕' : '');
      caja.appendChild(s);
    }
    d.append(logo, n, caja);
    if (qr) {
      const q = document.createElement('img');
      q.className = 'lon-t-qr'; q.src = qr; q.alt = 'QR';
      d.appendChild(q);
    }
    return d;
  }

  window.LONTarjeta = { esIOS, esApp, tarjeta };
})();
