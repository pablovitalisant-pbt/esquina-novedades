# Slice 3 (Offline) — PWA base con Serwist

Contrato Fase A aprobado por Pablo el 2026-08-01. Ver `docs/ARQUITECTURA-OFFLINE.md`
para el contexto completo del proyecto offline-first. Slices anteriores:
`docs/slices/offline-slice-01-powersync-token.md` (commit `a32aa09`) y
`docs/slices/offline-slice-02-powersync-client-sdk.md` (commit `cb922af`),
ambos verificados en producción.

## Objetivo

Service worker que precachea el app shell y sirve una página de respaldo
cuando falla la navegación por falta de red — la app debe poder abrir
incluso arrancando en frío sin señal. Cierra Fase 0 de infraestructura
offline.

## Contexto ya resuelto (no tocar)

`app/layout.tsx` y `public/manifest.json` ya tienen todo lo necesario
para instalabilidad PWA: `manifest: '/manifest.json'`, `appleWebApp`,
`icons` (192/512), `theme-color` meta tag, `mobile-web-app-capable`.
Verificado leyendo ambos archivos en Fase A — no requieren cambios.

## Contrato

### Archivos nuevos

- **`app/sw.ts`**:
  ```ts
  import { defaultCache } from "@serwist/next/worker";
  import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
  import { Serwist } from "serwist";

  declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
      __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
    }
  }
  declare const self: ServiceWorkerGlobalScope;

  const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: defaultCache,
    fallbacks: {
      entries: [
        { url: "/offline", matcher({ request }) { return request.destination === "document"; } },
      ],
    },
  });
  serwist.addEventListeners();
  ```

- **`app/offline/page.tsx`**: página de respaldo simple — sin fetch de
  datos, sin guard de auth (server component estático). Mensaje "sin
  conexión" + botón de reintentar (`<a href="/">` o similar, no
  necesita JS). Seguir `design-skill/SKILL.md` (mínimo `layout.md`,
  `typography.md`, `colors.md`, `cards.md`, `buttons.md`).

### Archivos modificados

- **`next.config.mjs`**: envolver con `withSerwist`:
  ```js
  import withSerwistInit from "@serwist/next";
  import { spawnSync } from "node:child_process";

  const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout ?? crypto.randomUUID();

  const withSerwist = withSerwistInit({
    swSrc: "app/sw.ts",
    swDest: "public/sw.js",
    additionalPrecacheEntries: [{ url: "/offline", revision }],
  });

  export default withSerwist({ /* nextConfig existente, sin tocar */ });
  ```
  **Riesgo crítico**: la config ya tiene un `webpack()` custom (wasm/topLevelAwait
  para PowerSync, Slice 2). Antes de dar por buena la integración, verificar
  contra el código fuente instalado de `@serwist/next` (`node_modules/@serwist/next`)
  que `withSerwist` compone/llama el `webpack()` existente del proyecto en
  vez de pisarlo — no asumir por la documentación. Mismo criterio que se
  aplicó en Slice 2 con `disableSSRWarning` (verificar tipos/código real
  instalado, no solo el ejemplo de la doc).

- **`tsconfig.json`**: agregar `"@serwist/next/typings"` a `compilerOptions.types`,
  `"webworker"` a `compilerOptions.lib` (fusionar con `["dom","dom.iterable","esnext"]`
  existente — no reemplazar), agregar `"public/sw.js"` a `exclude` (fusionar
  con `["node_modules","ol"]` existente).

- **`.gitignore`**: agregar sección:
  ```
  # Serwist
  public/sw*
  public/swe-worker*
  ```

- **`middleware.ts`**: agregar `offline` a la alternancia de exclusión del
  matcher (junto a `login|catalogo|productos`):
  ```
  '/((?!api/|login|offline|catalogo|productos|_next/static|_next/image|favicon\.ico|.*\.(?:png|jpg|jpeg|svg|gif|webp|ico|json|webmanifest)$).+)'
  ```

- **`package.json`**: agregar `@serwist/next` (dependency) y `serwist`
  (devDependency).

### No se toca

`app/layout.tsx`, `public/manifest.json` — ya completos (ver "Contexto
ya resuelto" arriba).

## Revisión de impacto lateral (ya hecha en Fase A, confirmada)

- `app/layout.tsx` y `public/manifest.json`: revisados, completos. Sin cambio.
- `lib/powersync/*` (Slice 2): sin cambio directo, pero el build combinado
  (Serwist + PowerSync wasm) es el riesgo #1 de este slice — ambos
  modifican `webpack()` en `next.config.mjs`.
- `middleware.ts`: cambio mínimo (una palabra en el matcher).
- Ningún módulo real del MVP se toca.

## Limitación conocida (declarada, no resuelta en este slice)

Este slice cubre precache del app shell + fallback de navegación. **No**
cubre cacheo de las respuestas RSC/fetch de cada módulo real del MVP —
eso depende de que cada módulo migre a PowerSync en Fase 1. La app va a
*abrir* offline, pero la navegación profunda dentro de módulos aún no
migrados puede fallar hasta que Fase 1 los cubra.

## Riesgos a cubrir en Fase B

- Composición de `webpack()` entre Serwist y PowerSync — verificar contra
  código fuente instalado, no contra la doc.
- `defaultCache` de Serwist no debe cachear indebidamente `/api/*`
  (especialmente `/api/powersync/token`, sesión-específico) — verificar
  contra el código fuente instalado de `@serwist/next/worker` qué rutas
  cubre `defaultCache` por defecto.
- `npm run build` completo sin errores, `public/sw.js` generado y no vacío.
- Regresión: test de Slice 1 (`app/api/powersync/token/route.test.ts`)
  sigue en verde; `/admin/powersync-status` (Slice 2) sigue conectando
  y mostrando conteos correctos.

## Verificación esperada (Fase D)

1. `npm run build` sin errores nuevos, `public/sw.js` generado.
2. Test de Slice 1 sigue pasando (regresión).
3. En navegador: DevTools → Application → Service Workers muestra el SW
   registrado y activo. Simular offline (Network → Offline) y navegar a
   una ruta nueva → debe mostrar `/offline`, no un error de red del
   navegador.
4. `/admin/powersync-status` (Slice 2) sigue conectando y mostrando
   conteos correctos — confirma que la integración de webpack no rompió
   el pipeline de PowerSync.
