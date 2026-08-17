# Escáner de SKU → Google Sheets

App web (sin instalar nada en el celular) que usa la cámara para leer un código QR
con un SKU, y agrega automáticamente una fila a una Google Sheet con el SKU,
la fecha y la hora del escaneo.

## Estructura

```
qr-sku-scanner/
├── server.js         # servidor Express + endpoint /scan
├── googleSheets.js   # lógica para agregar filas a la hoja de cálculo
├── package.json
├── .env.example
└── public/
    └── index.html    # la página que abrís desde el celular (cámara + QR)
```

## 1. Preparar la Google Sheet

1. Creá (o abrí) la hoja de cálculo donde querés que se registren los escaneos.
2. En la primera fila, poné encabezados, por ejemplo:

   | SKU | Fecha | Hora |
   |-----|-------|------|

3. Fijate el nombre exacto de la pestaña (por defecto suele ser `Hoja1` o `Sheet1`
   según el idioma de tu cuenta) — lo vas a necesitar en el paso 3.
4. Copiá el ID de la hoja desde la URL:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
   ```

## 2. Crear la cuenta de servicio de Google

Esto es lo que le da permiso a tu servidor para editar la hoja sin que
vos tengas que loguearte cada vez.

1. Andá a https://console.cloud.google.com/ y usá tu proyecto (o creá uno nuevo).
2. En el buscador de arriba, buscá **"Google Sheets API"** y hacé clic en **Habilitar**.
3. Andá a **"IAM y administración" → "Cuentas de servicio"** → **"Crear cuenta de servicio"**.
   Ponele un nombre (ej: `qr-scanner`) y creála (no hace falta darle ningún rol especial de proyecto).
4. Entrá a la cuenta de servicio recién creada → pestaña **"Claves"** → **"Agregar clave"** →
   **"Crear clave nueva"** → tipo **JSON**. Se descarga un archivo `.json`.
5. Renombrá ese archivo a `credentials.json` y colocalo dentro de la carpeta `qr-sku-scanner`.
6. Copiá el email de la cuenta de servicio (algo como `qr-scanner@tu-proyecto.iam.gserviceaccount.com`,
   lo ves en la lista de cuentas de servicio o dentro del archivo JSON, campo `client_email`).
7. Volvé a la Google Sheet del paso 1 → botón **"Compartir"** → pegá ese email → dale permiso de
   **Editor** → Enviar (sin necesidad de que la cuenta de servicio "acepte" nada).

## 3. Instalar y configurar

```bash
cd qr-sku-scanner
npm install
cp .env.example .env
```

Editá `.env`:
```
GOOGLE_SHEET_ID=el_id_que_copiaste_de_la_hoja
GOOGLE_SHEET_NAME=Hoja1
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
PORT=3000
```

## 4. Correr el servidor

```bash
npm start
```

Deberías ver `✅ Servidor corriendo en el puerto 3000`.

## 5. Importante: la cámara necesita HTTPS

Los navegadores de celular **no dejan usar la cámara** en una página que no sea
segura (HTTPS), salvo que sea exactamente `localhost` — y `localhost` no sirve
si querés abrir la página desde el celular apuntando a tu computadora.

**Para probarlo rápido desde el celular**, la forma más simple es un túnel con ngrok:

1. Instalá ngrok: https://ngrok.com/download (o `npm install -g ngrok`)
2. Con el servidor corriendo (`npm start`), abrí otra terminal y corré:
   ```
   ngrok http 3000
   ```
3. Te va a dar una URL como `https://algo-random.ngrok-free.app`. Abrí esa URL
   desde el navegador del celular (Chrome/Safari) — ahí sí te va a dejar usar la cámara.

**Para algo permanente** (no depender de tu computadora prendida), lo ideal es
desplegar este proyecto en un hosting con HTTPS automático, como Render o Railway,
y usar esa URL final desde el celular.

## Probarlo

1. Abrí la URL (la de ngrok o la de tu hosting) desde el celular.
2. Dale permiso a la cámara cuando el navegador lo pida.
3. Apuntá a un código QR que contenga un SKU (podés generar uno de prueba en
   cualquier generador de QR online, poniendo como contenido, por ejemplo, `SKU-001`).
4. Si todo está bien configurado, en unos segundos vas a ver "Agregado a la hoja"
   y, al abrir la Google Sheet, una fila nueva con el SKU, la fecha y la hora.

## Notas

- `credentials.json` y `.env` **nunca se suben a git** (ya están en `.gitignore`) —
  son las claves de acceso a tu cuenta de Google.
- Cada escaneo evita guardarse dos veces seguidas si la cámara sigue leyendo el mismo
  código por unos segundos (hay un margen de 4 segundos antes de permitir repetirlo).
- El servidor SIEMPRE agrega la fila al final de la pestaña indicada — no hace falta
  que la hoja tenga una estructura especial, solo que el nombre de la pestaña coincida
  con `GOOGLE_SHEET_NAME` en tu `.env`.

## SEO (cómo aparece el sitio en Google)

El catálogo es una sola página que arma los productos con JavaScript y refleja
el producto abierto en la URL (`/?producto=slug-del-nombre`). Para una persona
eso funciona bien, pero un buscador pide la URL al servidor y recibiría siempre
el mismo HTML — mismo título y mismo canonical para todos los productos.

`seo.js` resuelve eso: intercepta la home **antes** de `express.static` y, si la
URL trae `?producto=`, reemplaza el bloque de meta tags del HTML por uno propio
de ese producto (título, descripción, imagen para compartir y schema `Product`
con precio y stock). El frontend no cambia: sigue leyendo `?producto=` igual.

Piezas:

| Archivo | Qué hace |
|---|---|
| `seo.js` | Meta tags por producto + `/sitemap.xml` generado desde el catálogo |
| `public/index.html` | Meta tags de la home, entre las marcas `SEO:INICIO` / `SEO:FIN` |
| `public/robots.txt` | Permite indexar el catálogo, bloquea admin y checkout |

Cosas a tener en cuenta al tocar esto:

- **`SITIO_URL` no es `PUBLIC_URL`.** `PUBLIC_URL` es la dirección interna del
  hosting (`*.onrender.com`), la que necesitan Payway y WhatsApp. `SITIO_URL` es
  el dominio propio y es la única que se usa para SEO. Hoy coinciden (todavía
  no hay dominio propio), pero si se agrega uno hay que actualizar `SITIO_URL`
  — si se mezclan, los canonical siguen apuntando a onrender y el dominio nuevo
  queda afuera de Google.
- **El slug se calcula en dos lados** y tienen que coincidir: `slugProducto()` en
  `seo.js` y la función del mismo nombre en `public/index.html`.
- **Las marcas `SEO:INICIO` / `SEO:FIN`** delimitan qué se reemplaza. Si se mueven
  o renombran, hay que actualizar `seo.js` (avisa por consola si no las encuentra).
- El catálogo se cachea 5 minutos para no gastar cuota de la API de Sheets con
  las visitas de los bots, que son muchas y seguidas.

Después de subir esto a producción, falta hacer una vez, a mano:

1. Dar de alta el sitio en [Google Search Console](https://search.google.com/search-console)
   y enviar `https://lonphilosophy.onrender.com/sitemap.xml`.
2. Crear/completar el perfil de **Google Business** si el negocio tiene local físico.

## Catálogo: agregar al carrito desde la tarjeta

Antes, el único botón de cada tarjeta de producto era "Ver más" y lo único que
hacía era abrir el detalle — agregar al carrito solo se podía desde ahí. Ahora
el botón agrega directo al carrito (con "Agregado ✓" como feedback, sin navegar
ni recargar nada), y tocar el resto de la tarjeta (foto, nombre, precio) abre el
detalle como antes. Aplica a las 4 grillas de producto: destacados (carrusel),
resultados de búsqueda, catálogo por categoría y "también te puede interesar".
El botón se deshabilita cuando el producto no tiene precio cargado o está sin
stock (`puedeComprarProducto()` en `public/index.html`).
