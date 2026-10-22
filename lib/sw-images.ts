// Fuente única de la regla de imágenes del service worker (app/sw.ts).
// Extraída a su propio módulo para que los tests de Fase B puedan probar la
// entrada REAL que consume sw.ts, no una copia (app/sw.ts no es importable en
// jest: ejecuta serwist.addEventListeners() y usa self.__SW_MANIFEST a nivel
// módulo).
import { ExpirationPlugin, StaleWhileRevalidate } from "serwist";

// Bump manual: al reemplazar un logo/asset y querer forzar refresh en todos
// los clientes, subir esta constante (v1 → v2) y deployar. Un solo string.
export const IMAGE_CACHE_VERSION = 'v1';
export const IMAGE_CACHE_NAME = `static-image-assets-${IMAGE_CACHE_VERSION}`;

// Intencionalmente NO scopeado por same-origin ni por path (/logo-*): igual
// que la regla de defaultCache que reemplaza, cachea TODAS las imágenes SWR,
// incluidas las cross-origin de Cloudinary (fotos de producto). Por eso el
// bump de IMAGE_CACHE_VERSION re-descarga todas las imágenes de la app una
// vez, no solo los logos. Decisión consciente — ver sw-image-cache.test.ts.
export const IMAGE_URL_REGEX = /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i;

// Mismo ExpirationPlugin que la regla de defaultCache que reemplaza
// (maxEntries 64, 30 días, last-used) para no crecer sin cota en el cliente.
// sw.ts la inserta ANTES de ...defaultCache (first-match gana).
export const imageCacheEntry = {
  matcher: ({ url: { pathname } }: { url: URL }) => IMAGE_URL_REGEX.test(pathname),
  method: 'GET' as const,
  handler: new StaleWhileRevalidate({
    cacheName: IMAGE_CACHE_NAME,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 64,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        maxAgeFrom: 'last-used',
      }),
    ],
  }),
};
