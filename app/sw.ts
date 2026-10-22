import { defaultCache } from "@serwist/next/worker";
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, Strategy } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { imageCacheEntry } from "@/lib/sw-images";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// ─── Rutas de módulo navegables (fuente única) ────────────────────────
// Todo shell de módulo que deba funcionar offline va acá. Al agregar un
// módulo nuevo se agrega UNA línea acá, no se audita sw.ts entero.
const APP_SHELL_ROUTES = [
  "/",
  "/login",
  "/clientes",
  "/caja-mayor",
  "/precios",
  "/bodega",
  "/bodega/despachos",
  "/bodega/registro-notas",
  "/alertas-stock",
  "/deudores",
  "/ventas/kardex",
  "/notas-venta",
  "/pedidos",
  "/productos",
  "/catalogo/admin",
  "/admin/categorias",
  "/admin/usuarios",
  "/admin/caja-config",
  "/admin/sync-conflictos",
  "/admin/powersync-status",
];

// Precache de shells de módulo en install: todas las rutas de APP_SHELL_ROUTES
// quedan offline desde el primer arranque del día, sin depender de visita previa.
// Solo se cachea una respuesta 200 no-redirigida: rutas con restricción de rol
// (ej. /clientes redirige a /dashboard para bodeguero) devuelven redirect y se
// descartan para no contaminar "pages-app" con un shell de otro rol.
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all(
      APP_SHELL_ROUTES.map((route) =>
        fetch(route, { cache: "no-store" })
          .then((res) => {
            if (res.ok && !res.redirected) {
              return caches
                .open("pages-app")
                .then((cache) => cache.put(route, res));
            }
          })
          .catch((e) => console.error("[sw] precache falló para", route, e))
      )
    )
  );
});

// Limpieza del cache viejo "pages" (nombre pre-refactor, ya nada apunta a él).
// El ExpirationPlugin solo poda entradas cuando una Strategy vuelve a abrir ese
// cacheName; como ningún handler abre "pages", quedaría huérfano para siempre.
// Se borra una vez aquí en activate (mismo patrón de BUG-046: no tragar errores).
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("pages"));
});

// ─── Shell offline para /notas-venta/[id] nunca visitada ──────────────
// El NetworkFirst genérico cachea por URL exacta; si una nota nunca se abrió
// con conexión, no hay entrada en el cache "pages-notas-venta" y offline cae a /offline.
// Esta estrategia, scopeada a /notas-venta/, baja el timeout de red (el
// usuario realmente offline no espera 10s) y, si la nota exacta no está,
// sirve el shell cacheado de CUALQUIER otra nota (el SSR es idéntico entre
// notas — mismo esqueleto "cargando" —, el contenido real lo arma el cliente
// contra PowerSync por la URL actual, no por el HTML servido). El riesgo de
// hidratación se cubre en client_page.tsx tomando el id de useParams().
class NotasVentaShellStrategy extends Strategy {
  protected async _handle(request: Request, handler: any): Promise<Response | undefined> {
    // 1) Intentar red con timeout corto (2s). handler.fetch no expone abort;
    //    Promise.race da el timeout sin depender de la firma de Serwist.
    let timedOut = false;
    const timeout = new Promise<Response>((_, reject) =>
      setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, 2000)
    );
    try {
      const networkResponse = await Promise.race([handler.fetch(request), timeout]);
      if (!timedOut && networkResponse) {
        await handler.cachePut(request, networkResponse.clone());
        return networkResponse;
      }
    } catch {
      // red caída o timeout → seguir con el cache
    }

    // 2) Cache de la URL exacta (si esta nota específica sí se visitó antes).
    const exact = await handler.cacheMatch(request);
    if (exact) return exact;

    // 3) Shell genérico: cualquier entrada /notas-venta/<id> en el cache
    //    "pages-notas-venta".
    const cache = await caches.open(handler.cacheName ?? "pages-notas-venta");
    const keys = await cache.keys();
    const shellKey = keys.find((k) => {
      const pathname = new URL(k.url).pathname;
      return pathname.startsWith("/notas-venta/") && pathname !== "/notas-venta";
    });
    if (shellKey) return cache.match(shellKey);

    // 4) Sin shell → undefined → cae al fallback /offline global.
    return undefined;
  }
}

// defaultCache cachea los GET de /api/* con NetworkFirst (cache "apis"),
// incluido /api/powersync/token, que es sesión-específico. En red caída
// serviría un token cacheado para una sesión que ya no es la actual.
// Forzamos NetworkOnly para TODO /api/* ANTES de defaultCache (Serwist usa
// first-match) para no servir nunca datos de API desde cache.
// Ver riesgo Fase B del slice offline-03.
const runtimeCaching = [
  {
    matcher: ({ sameOrigin, url: { pathname } }: { sameOrigin: boolean; url: URL }) =>
      sameOrigin && pathname.startsWith("/api/"),
    method: "GET" as const,
    handler: new NetworkOnly(),
  },
  // Shell offline para /notas-venta/[id] (nunca visitada). Va ANTES del
  // handler genérico de navegación (first-match): network-first con timeout
  // corto + fallback a shell genérico del cache "pages-notas-venta". Scopeado a
  // /notas-venta/ para no afectar el resto de navegaciones.
  {
    matcher: ({ request, url: { pathname } }: { request: Request; url: URL }) =>
      request.mode === "navigate" &&
      pathname.startsWith("/notas-venta/") &&
      pathname !== "/notas-venta",
    method: "GET" as const,
    handler: new NotasVentaShellStrategy({
      cacheName: "pages-notas-venta",
      plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 86400 })],
    }),
  },
  // Navegaciones (documentos): estrategia explícita ANTES de defaultCache.
  // El fallback /offline solo se adhiere a handlers Strategy presentes en
  // runtimeCaching (no es un catch-handler global). defaultCache no matchea
  // navegaciones de forma fiable: su entrada "HTML" mira Content-Type (un
  // header de respuesta, ausente en requests) y las rutas SSR tipo /precios
  // caen al catch-all "others", que no resuelve el fallback. Esta entrada
  // asegura que toda navegación la maneje un NetworkFirst con el fallback
  // adherido, sirviendo /offline cuando falla la red.
  {
    matcher: ({ request }: { request: Request }) => request.mode === "navigate",
    method: "GET" as const,
    handler: new NetworkFirst({
      cacheName: "pages-app",
      plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 86400 })],
      networkTimeoutSeconds: 10,
    }),
  },
  // Imágenes con cache versionado (bump manual). defaultCache cachea las
  // imágenes bajo "static-image-assets" fijo, que nunca invalida. Esta entrada
  // gana por first-match y usa cacheName versionado (imageCacheEntry, en
  // lib/sw-images.ts): subir IMAGE_CACHE_VERSION y deployar fuerza refresh de
  // imágenes en todos los clientes. Mismo ExpirationPlugin que la regla de
  // defaultCache que reemplaza (maxEntries 64, 30 días, last-used).
  imageCacheEntry,
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});
serwist.addEventListeners();
