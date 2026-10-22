# Slice U1 — Next 14.2.35 -> 15.5.28 — Fase A (Contrato)

Target: `next@15.5.28`, `eslint-config-next@15.5.28`. React se queda en 18. next-auth 4.24.15 (peer next ^15 OK). App Router.
Línea base verificada: `next` instalado 14.2.35; `npx tsc --noEmit` = **112 errores preexistentes** (el build corre con `ignoreBuildErrors: true`, así que tsc es la única red de tipos).

## 1. Inventario de lo que rompe en ESTE repo

### 1.1 params/searchParams asíncronos
Ya compatibles (usan `Promise<...>`/`RouteContext`, `types/index.ts:2`): los route handlers dinámicos ([id], [slug], [kcodcli2], [codigo], [itemId]) — 31 archivos, incluidos `notas-venta/[id]/*`, `caja/*/[kcodcli2]`, `productos/[id]/*`, `entrega/opciones/[codigo]`, `ubicaciones/codigo/[codigo]`, `catalogos/public/[slug]`. No requieren cambio.

**Siguen síncronos (los únicos 5 puntos reales):**
| Archivo:línea | Problema |
|---|---|
| `app/api/admin/usuarios/[id]/route.ts:47` | `DELETE` tipa `params: { id: string }` pero ya hace `await params` (línea 53) -> solo tipo; falla tsc en 15 |
| `app/(app)/notas-venta/[id]/page.tsx:6,11` | `params` sync, se pasa tal cual a `PrenotaDetallePage` |
| `app/(app)/notas-venta/[id]/client_page.tsx:254` | prop `params: {id}` sin uso (el id sale de `useParams`, línea 256) |
| `app/catalogo/[slug]/page.tsx:156-157,161-162` | `generateMetadata` y page leen `params.slug` sync |
| `app/pedido/[id]/page.tsx:41-42` | `params?.id` sync |

`searchParams` como prop de page/layout: **0 usos** (`grep` en `page.tsx`). Los `searchParams` restantes vienen de `new URL(request.url)` / `req.nextUrl` (webhook MP `route.ts:22,38`): no cambian.
Layouts con params: ninguno (`app/layout.tsx`, `app/(app)/layout.tsx`).
Tests que pasan `params={{id:'1'}}`: `app/(app)/notas-venta/[id]/client_page.test.tsx:77,204,242,250` (si se elimina la prop sin uso, actualizar).

### 1.2 cookies()/headers()/draftMode()
`next/headers`, `cookies(`, `headers(`, `draftMode`: **0 usos** en app/lib/components/middleware. next-auth 4.24.15 los usa internamente en `getServerSession` y ya es compatible con 15.

### 1.3 getServerSession
Sin cambio de API (next-auth v4). Usos en server components (`app/page.tsx:76`, `admin/*/page.tsx`, `alertas-stock/page.tsx`, `notas-venta/[id]/page.tsx:7`) y route handlers. Verificar solo en runtime (login + una ruta protegida).

### 1.4 Cache por defecto
- `fetch` server: único uso `app/api/share-image/route.ts:17` (fetch a URL externa dentro de handler GET). En 15 no se cachea por defecto -> comportamiento más fresco, sin impacto funcional.
- GET route handlers: ya no se cachean por defecto. `force-dynamic` existe en 15 route/pages (webhook, cron, catalogos, categorias, entrega, productos/page, page.tsx, pedido, catalogo). Los demás GET (~16, p.ej. `clientes`, `productos`, `caja/*`) dependen de `getServerSession`/`request.url` (dinámicos) -> sin cambio; en 14 eran dinámicos por lo mismo, en 15 aún más explícito.
- `revalidate`, `unstable_cache`, `fetchCache`, `next:{revalidate}`: **0 usos**. Client Router Cache `staleTimes` pasa a 0 para pages (navegación más fresca; sin config actual que migrar).
- `vercel.json` crons (`inversion-mercaderia/snapshot`, `cron/liberar-reservas`): GET, el segundo es `force-dynamic`. Verificar que el snapshot siga ejecutando (usa sesión/auth de cron: revisar en 3.).

### 1.5 next.config.mjs
Solo `eslint.ignoreDuringBuilds`, `typescript.ignoreBuildErrors`, `images.remotePatterns` (Cloudinary). Ninguna opción renombrada/eliminada (`experimental.*` no existe). **Sin cambios.** `ignoreBuildErrors:true` no se toca en este slice (fuera de alcance; 112 errores preexistentes).

### 1.6 middleware
`middleware.ts` usa `withAuth` de `next-auth/middleware`, runtime edge por defecto, matcher con regex (en 15 igual). Sin cambios de API. Riesgo: next-auth v4 middleware + Next 15 -> probar redirect sin sesión, redirect por rol, y `__tests__/middleware-pedido-publico.test.ts`. Nota: el matcher tiene `favicon\.ico` en string normal (`\.` = `.`), preexistente.

### 1.7 next/image, next/font, edge
- `next/image`: 2 imports (`components/ImageWithFallback.tsx`, `app/(auth)/login/page.tsx`/`layout`), `remotePatterns` Cloudinary. 15 no cambia la config; `images.quality` default/`minimumCacheTTL` ya no afectan. Sin cambio.
- `next/font/google` `Public_Sans` en `app/layout.tsx:2,7`: sin cambio (requiere red en build).
- `runtime`: solo `app/api/productos/upload/route.ts:7` = `"nodejs"`. Sin `edge`.
- `useSearchParams`: 0 usos (no hay requisito de Suspense). `useRouter/usePathname/useParams` de `next/navigation`: sin cambio.

### 1.8 React APIs
React 18 se mantiene. `useFormState`, `forwardRef`, `findDOMNode`, `propTypes`, `ReactDOM.render`: 0 usos. Sin impacto. Next 15 App Router usa canary de React 19 internamente solo bajo App Router; con `react@18` instalado emite warning de peer pero es soportado por DT (verificar `npm ls react` y que no haya warnings bloqueantes en build).

### 1.9 Otros
- `jest.config.js` usa `next/jest` (sigue existiendo en 15). Correr suite completa.
- `next lint` en 15.5 está deprecado (aviso, funciona). `eslint@^8` compatible con eslint-config-next 15.5.
- `package-lock.json` cambia (instalación del DT, fuera del conteo de líneas).

## 2. Codemod
Sí conviene, pero **solo `next-async-request-api`** (`npx @next/codemod@latest next-async-request-api .`) y revisarlo por diff; el `upgrade` completo además toca package.json/config y deja `await` con casts `UnsafeUnwrapped*` y comentarios `@next-codemod-error`. Archivos que tocaría (esperado): los 5 de 1.1 (más probablemente `client_page.tsx` si trata `params`). Los 31 handlers ya async no deberían cambiar; si el codemod los modifica, descartar. Alternativa igual de barata: edición manual (son 5 archivos, ~15 líneas). Recomendación: manual para los 5, codemod solo como verificación (`--dry`/`git diff` vacío en el resto).

## 3. Sub-slices (cada uno: `npx tsc --noEmit` sin errores nuevos vs 112, `npm test`, `npm run build` verdes)
| # | Contenido | Líneas ≈ | Notas |
|---|---|---|---|
| U1.1 | **Pre-compat en 14.2.35** (no rompe en 14, params Promise ya soportado): tipar/await params en los 5 archivos de 1.1; ajustar `client_page.test.tsx` si se quita la prop | ~25 | Reduce el salto; sin dependencia nueva |
| U1.2 | **Bump**: `next@15.5.28`, `eslint-config-next@15.5.28`, lockfile (DT instala). Sin cambios de código | ~2 (+lockfile aparte) | Codemod: lockfile cuenta aparte |
| U1.3 | Fixes post-bump surgidos del build/tests (tipos de route handlers, warnings, middleware/next-auth) | ≤100, definir tras U1.2 | Solo si aparece algo |
| U1.4 | Verificación runtime manual + `docs/slices` cierre + actualizar versión en `CLAUDE.md`/`PRD.md` si mencionan 14.2 | ~10 | Ver 5. |

Cambios mecánicos de codemod (si se corre): hasta 5 archivos de 1.1; no cuentan en el límite de 200.

## 4. Riesgos (checklist PBT-IA) y tests
Impacto lateral (archivos existentes que deben cambiar): los 5 de 1.1, `package.json`, `package-lock.json`, test `notas-venta/[id]/client_page.test.tsx` (solo si se quita la prop), docs (`CLAUDE.md` x2 dicen "Next.js 14.2"). Ninguno de: schema DB/migraciones, env vars, feature flags (no se necesita flag; es dependencia), `next.config.mjs`, `middleware.ts`, `vercel.json`.

Riesgos: (a) middleware+withAuth con Next 15; (b) cambio de cache de GET/fetch (ver 1.4); (c) warning peer react 18 con next 15; (d) `ignoreBuildErrors` oculta errores -> usar tsc contra baseline 112; (e) zonas frágiles de BUGS.md (webhook MP, notas-venta) -> revisar BUGS.md antes de U1.1; (f) crons Vercel.

Tests que intentan romperlo (nuevo `__tests__/next15-params-async.test.ts`, ≤60 líneas):
1. `PrenotaDetalleRoute`, `PublicCatalogoPage`, `generateMetadata` y `PedidoPage` invocados con `params: Promise.resolve({...})` devuelven elemento sin lanzar; con params sync (objeto plano) también (retrocompat durante U1.1 vía `await`).
2. `DELETE /api/admin/usuarios/[id]` con `params: Promise.resolve({id:'2'})` -> 200/401 según sesión, no 500.
3. Un handler por tipo de ruta ([id], [slug], [kcodcli2], [codigo], [itemId]) con params Promise -> responde (existentes ya cubren varios).
4. Webhook MP: `__tests__/api/mercadopago-webhook.test.ts` verde y firma inválida -> 401 (no regresar).
5. Login: `getServerSession` mockeado + middleware test (`middleware-pedido-publico.test.ts`) verdes.
6. tsc: conteo de errores ≤ 112 y sin errores nuevos en los 5 archivos.

## 5. Comandos de verificación
```
git status --short
npx tsc --noEmit 2>&1 | grep -c "error TS"      # <= 112
npm test -- --runInBand
npm run build
npm ls next react react-dom next-auth
npx @next/codemod@latest next-async-request-api . --dry   # opcional, esperar solo los 5 archivos
npm run dev  # manual: /login, /productos, /catalogo/<slug>, /pedido/<id>, /notas-venta/<id>, redirect sin sesión
```
Manual en dev/preview: login admin y vendedor; abrir nota de venta; DELETE usuario; pago MP en sandbox (webhook firmado); GET `/api/cron/liberar-reservas` con secreto.

## Contrato / aprobación
Fuera de alcance: React 19, quitar `ignoreBuildErrors`, migrar a Auth.js v5, arreglar los 112 errores tsc. Pendiente aprobación de Pablo para pasar a Fase B.
