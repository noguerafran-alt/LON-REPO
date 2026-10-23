/* Service worker mínimo: existe SOLO para que la tienda se pueda instalar
   como app (requisito de Android/Chrome) y para habilitar el push más
   adelante.

   NO CACHEA NADA, Y NO TIENE QUE EMPEZAR A HACERLO. Este repo no tiene build
   step: los archivos de public/ se editan y se despliegan tal cual, sin hash
   en el nombre. Un caché acá serviría HTML y JS viejos a clientes reales y,
   como el service worker queda instalado en el teléfono, un deploy no lo
   arregla: habría que escribir código de desinstalación y esperar a que cada
   cliente vuelva a entrar. Es de lo más difícil de revertir que se puede
   meter en producción. Si hace falta velocidad, se resuelve con cache HTTP
   del servidor, no acá. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));

// Chrome pide un handler de fetch para considerar la app instalable; va
// derecho a la red, sin tocar caché (ver arriba).
self.addEventListener('fetch', () => {});
