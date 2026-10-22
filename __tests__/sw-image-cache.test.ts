/**
 * FASE B — Tests que intentan romper el slice "bump manual de cache de imágenes".
 *
 * Riesgo declarado en Fase A: el matcher /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i
 * NO está scopeado por same-origin ni por path (/logo-*). Como la regla de
 * defaultCache que reemplaza, cachea TODAS las imágenes StaleWhileRevalidate,
 * incluidas las cross-origin de Cloudinary (fotos de producto en
 * ImageWithFallback y en /api/share-image).
 *
 * Consecuencia consciente: subir IMAGE_CACHE_VERSION invalida el cache de todas
 * las imágenes de la app, no solo los logos. Aceptable (StaleWhileRevalidate
 * sirve la vieja mientras trae la nueva), pero queda registrado y verificado
 * acá para que el día que alguien pregunte "¿por qué se re-descargaron todas
 * las fotos de producto cuando solo cambié el logo?" la respuesta sea un test,
 * no una sorpresa.
 */

// serwist es ESM en node_modules que jest no transforma. Para probar la entrada
// REAL que consume sw.ts (lib/sw-images.ts la construye con new ExpirationPlugin
// y new StaleWhileRevalidate), mockeamos serwist: cada mock guarda su config en
// la instancia, y el test la lee de imageCacheEntry.handler directamente. Así el
// 4to test verifica el ExpirationPlugin presente en el handler con sus valores
// reales, sin tocar el jest.config global ni referenciar variables externas.
jest.mock('serwist', () => {
  class ExpirationPlugin {
    config: any;
    constructor(cfg: any) {
      this.config = cfg;
    }
  }
  class StaleWhileRevalidate {
    plugins: any[];
    cacheName: any;
    constructor(cfg: any) {
      this.plugins = cfg.plugins ?? [];
      this.cacheName = cfg.cacheName;
    }
  }
  return { ExpirationPlugin, StaleWhileRevalidate };
});

import {
  IMAGE_CACHE_NAME,
  IMAGE_CACHE_VERSION,
  IMAGE_URL_REGEX,
  imageCacheEntry,
} from '@/lib/sw-images';

test('el cacheName de imágenes está versionado (bump manual = un string)', () => {
  expect(IMAGE_CACHE_NAME).toBe(`static-image-assets-${IMAGE_CACHE_VERSION}`);
  expect(IMAGE_CACHE_NAME).toMatch(/^static-image-assets-/);
});

test('el handler trae el mismo ExpirationPlugin que la regla de defaultCache que reemplaza (paridad, sin cota perdida)', () => {
  const handler = imageCacheEntry.handler as any;
  expect(imageCacheEntry.method).toBe('GET');
  // StaleWhileRevalidate construido con el cacheName versionado.
  expect(handler.cacheName).toBe(IMAGE_CACHE_NAME);
  // ExpirationPlugin presente con los mismos valores que defaultCache
  // (maxEntries 64, 30 días, last-used).
  expect(handler.plugins).toHaveLength(1);
  expect(handler.plugins[0].config).toEqual({
    maxEntries: 64,
    maxAgeSeconds: 30 * 24 * 60 * 60,
    maxAgeFrom: 'last-used',
  });
});

test('el matcher NO está scopeado por origen ni path: cachea imágenes cross-origin de Cloudinary bajo el mismo cache versionado', () => {
  // Fotos de producto en Cloudinary (dominio distinto, path distinto a /logo-*).
  const cloudinary = new URL(
    'https://res.cloudinary.com/bazarnaty/image/upload/v123/productos/camisa.webp'
  );
  expect(IMAGE_URL_REGEX.test(cloudinary.pathname)).toBe(true);

  // Logo local, same-origin.
  const logo = new URL('https://bazarnaty.vercel.app/logo-texto.png');
  expect(IMAGE_URL_REGEX.test(logo.pathname)).toBe(true);
});

test('el matcher NO cachea requests sin extensión de imagen (páginas, API)', () => {
  expect(IMAGE_URL_REGEX.test('/notas-venta/123')).toBe(false);
  expect(IMAGE_URL_REGEX.test('/api/powersync/token')).toBe(false);
  expect(IMAGE_URL_REGEX.test('/catalogo')).toBe(false);
});
