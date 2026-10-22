# Slice 2 (Offline) — SDK cliente PowerSync + verificación end-to-end

Contrato Fase A aprobado por Pablo el 2026-08-01. Ver `docs/ARQUITECTURA-OFFLINE.md`
para el contexto completo del proyecto offline-first, y
`docs/slices/offline-slice-01-powersync-token.md` para el slice anterior
(endpoint de token, ya commiteado y verificado en producción — commit `a32aa09`).

## Objetivo

Integrar el SDK web de PowerSync, definir el schema local mínimo (Bodega
piloto), y exponer una página de diagnóstico admin-only que pruebe el
pipeline completo Neon → PowerSync → SQLite local en el navegador.
**No se toca ningún módulo real del MVP todavía** — eso es Fase 1. Esta
página es una herramienta de verificación temporal de Fase 0.

## Contexto técnico importante

El proyecto usa Next.js 14.2.35 con Webpack (no Turbopack, que recién es
default en Next 16+). Aplica la config **legacy de webpack** de PowerSync
(https://docs.powersync.com/client-sdks/frameworks/next-js#webpack-configuration-legacy),
sin necesidad de copiar workers a `public/` ni script `postinstall`.

No se usa el token de desarrollo estático del demo oficial de PowerSync
ni variables `NEXT_PUBLIC_*` expuestas al cliente — `fetchCredentials()`
llama a nuestro propio endpoint `/api/powersync/token` (Slice 1).

## Contrato

### Archivos nuevos

- **`lib/powersync/AppSchema.ts`** — schema mínimo:
  - tabla `productos`: `codigo` (text), `detalle` (text), `saldo` (real)
  - tabla `ubicaciones_bodega`: `codigo` (text), `ubicacion` (text), `saldo` (real), `fisico` (real)
  - Deliberadamente acotado a lo necesario para probar el pipeline.
    Expandir a todas las columnas reales es trabajo de Fase 1, cuando se
    verifique el schema real contra `\d productos` en Neon (riesgo de
    drift ya registrado en PRD §10 — `seed.ts`/`migrations/` no reflejan
    el schema real).
  - No declarar columna `id` (PowerSync la crea automáticamente).

- **`lib/powersync/BackendConnector.ts`**:
  - `fetchCredentials()`: `fetch('/api/powersync/token', { credentials: 'include' })`,
    parsea `{ token, endpoint }`. Si la respuesta no es 200, lanzar error
    claro (no retornar `null` silenciosamente — a diferencia del demo
    oficial, acá sí tenemos backend propio y un 401/500 debe ser visible).
  - `uploadData()`: no-op documentado explícitamente en comentario (sin
    escrituras en este slice; se implementa por módulo en Fase 1).

- **`lib/powersync/PowerSyncProvider.tsx`**:
  - `'use client'`.
  - Singleton lazy (`getDB()`) para evitar instancias duplicadas en dev
    (hot reload).
  - `new PowerSyncDatabase({ schema: AppSchema, database: { dbFilename: 'bazarnaty.db' }, flags: { disableSSRWarning: true } })`.
  - Sin paths de worker explícitos (los resuelve webpack vía import
    dinámico con la config legacy — a diferencia del ejemplo Turbopack
    de la doc oficial, que sí especifica `worker: '/@powersync/worker/...'`).
  - `dbInstance.connect(new BackendConnector())`.
  - Exportar `PowerSyncProvider` que envuelve `children` en
    `PowerSyncContext.Provider` (de `@powersync/react`).

- **`app/(app)/admin/powersync-status/page.tsx`**:
  - Server component. Guard admin-only: mismo patrón que
    `app/(app)/admin/caja-config/page.tsx` (`getServerSession(authOptions)`,
    `redirect('/dashboard')` si `session.user.rol !== 'admin'`).
  - Renderiza `<PowerSyncStatusClient />` (sin fetch de datos server-side
    — este slice es 100% client-side por naturaleza de PowerSync).

- **`app/(app)/admin/powersync-status/client_page.tsx`**:
  - `'use client'`.
  - Envuelve el contenido en `<PowerSyncProvider>` **local a esta página**
    (no en el layout global — ver revisión de impacto lateral).
  - Usa `useStatus()` de `@powersync/react` para mostrar estado de
    conexión (conectando/conectado/error).
  - Usa `useQuery('SELECT * FROM productos')` y
    `useQuery('SELECT * FROM ubicaciones_bodega')` (o `usePowerSync()` +
    `getAll()` si `useQuery` no aplica bien al caso), muestra conteo de
    filas sincronizadas de cada tabla.
  - Diseño: seguir `design-skill/SKILL.md` (mínimo `layout.md`,
    `typography.md`, `colors.md`, `cards.md`) — es una página nueva con JSX.

### Archivos modificados

- **`next.config.mjs`**: agregar bloque webpack (legacy, según doc oficial):
  ```js
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, topLevelAwait: true };
    if (!isServer) {
      config.module.rules.push({ test: /\.wasm$/, type: 'asset/resource' });
    }
    return config;
  }
  ```
  Fusionar con la config existente — **no eliminar** `transpilePackages: ['jose']`,
  `eslint.ignoreDuringBuilds`, `typescript.ignoreBuildErrors`, `images.remotePatterns`.

- **`package.json`**: agregar `@powersync/web`, `@journeyapps/wa-sqlite`, `@powersync/react`.

## Revisión de impacto lateral (ya hecha en Fase A, confirmada)

- **`lib/rutas-por-rol.ts`**: revisado — el rol `admin` ya incluye el
  prefijo `/admin`, cubre `/admin/powersync-status` por `startsWith`.
  **Sin cambio necesario.**
- **`middleware.ts`**: su matcher incluye rutas de página (no API) y usa
  `RUTAS_POR_ROL` — ya cubierto por el punto anterior. Sin cambio.
- **`app/(app)/layout.tsx`** y **`components/AppShell.tsx`**: **no se
  tocan** — decisión deliberada de no montar `PowerSyncProvider`
  globalmente todavía. Solo se monta dentro de esta página de diagnóstico.
- **`components/TopNav.tsx` / `BottomNav.tsx`**: no se agrega entrada de
  navegación — herramienta temporal, se accede por URL directa. Se
  retira o reemplaza cuando Fase 1 migre Bodega de verdad.
- **`types/index.ts`**: sin cambio — el schema de PowerSync genera sus
  propios tipos, no se comparte con los tipos de dominio existentes.

## Riesgos a cubrir en Fase B

- Config de webpack mal fusionada rompe otro build (`transpilePackages`
  de jose, `images.remotePatterns` de Cloudinary) — verificar `npm run build`
  completo, no solo el dev server.
- `fetchCredentials()` sin sesión (cookie ausente) — debe fallar con
  error claro, no colgarse silenciosamente.
- Mismatch de hidratación SSR/cliente — mitigado por `disableSSRWarning`
  + boundary `'use client'`, pero verificar en consola del navegador
  (sin warnings de hidratación).
- Line count: si el total supera 200 líneas, proponer sub-slices antes
  de implementar (Fase C).

## Verificación esperada (Fase D)

Evidencia mínima antes de pedir aprobación de commit:
1. `npm run build` sin errores nuevos (comparar contra baseline conocido).
2. Captura o descripción de la página `/admin/powersync-status` en el
   navegador mostrando estado "conectado" y conteos de `productos` /
   `ubicaciones_bodega` coincidentes con lo que hay en Neon (verificar
   con una query directa en Neon SQL Editor para comparar números).
3. Consola del navegador sin errores ni warnings de hidratación.
