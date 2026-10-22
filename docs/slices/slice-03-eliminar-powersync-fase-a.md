# Slice 3 — Eliminar PowerSync / offline — Fase A (Contrato)

Estado: **borrador a la espera de aprobación de Pablo (BLOQUEANTE).** No se escribió código.
Base medida: `main` @ `5d3ad37`, 2026-10-22.
Fuente de alcance: PRD §4 ("Modo offline / PowerSync (se elimina)"), §9 fila 3, §10.3 ("Eliminar `POWERSYNC_*`").

Leyenda de certeza: **[V]** verificado leyendo/ejecutando en esta sesión · **[E]** estimación (se re-mide en Fase C con `git diff --numstat`) · **[?]** no verificado.

---

## 0. Hallazgos que condicionan el diseño

1. **Todas las ramas offline están muertas hoy [V].** Los 11 flags `*-offline-*`/`alertas-badge-offline` están en `false` en `config/feature-flags.json`; solo `sync-conflictos-reporte` está en `true`, y lo lee únicamente `BackendConnector` (que nunca se instancia con los flags en false). Quitar las ramas no cambia el comportamiento en runtime; el riesgo es de compilación y de tests.
2. **`next.config.mjs` tiene `typescript.ignoreBuildErrors: true` y `eslint.ignoreDuringBuilds: true` [V].** `npm run build` NO detecta imports rotos de tipos. La verificación real es `npx tsc --noEmit` + `npm run lint` + jest. Baseline de tsc hoy: **129 errores** (`npx tsc --noEmit | grep -c "error TS"`) [V]; no se debe aumentar y no debe aparecer ningún archivo nuevo en la lista.
3. **`tsconfig.json` tiene `"types": ["@serwist/next/typings"]` [V].** Al estar `types` definido, TS NO auto-incluye el resto de `@types/*`. Quitar esa línea cambia qué globals ven todos los archivos (`@types/jest`, `@types/node`): puede bajar o subir el conteo de errores. Se mide antes/después en el sub-slice que lo toca (3.11).
4. **`categorias/client_page.tsx`: `fetchCategorias` es una función solo-offline [V]** (`if (!(OFFLINE_READ && db)) return;`, líneas 283-309). La rama online no tiene equivalente: las categorías iniciales vienen del SSR (`page.tsx`). Se **elimina** (no se reemplaza); hay que comprobar que el conteo tras crear/borrar/arrastrar online queda igual que hoy.
5. **`jose` queda sin uso [V].** Solo lo importa `app/api/powersync/token/route.ts`. Está fuera de la lista del Director → decisión D3.
6. **`public/sw.js` es un artefacto generado e ignorado por git [V]** (`.gitignore` líneas "Serwist"). Existe en disco local; hay que borrarlo a mano para que no se sirva en dev.
7. **Sin runner de migraciones y sin tocar schema [V].** `sync_conflictos` (migr. 026) y las columnas UUID (027-030) quedan. Consecuencia: la tabla queda huérfana en el código (nadie la lee/escribe tras borrar `api/sync-conflictos`). Se declara, no se arregla.

---

## 1. Inventario exacto de archivos

### 1.1 ELIMINAR (archivo/directorio completo — no cuenta para el límite de 200)

| Ruta | Líneas | Por qué |
|---|---|---|
| `lib/powersync/AppSchema.ts` | 179 | schema SQLite local |
| `lib/powersync/BackendConnector.ts` | 832 | cola de subida |
| `lib/powersync/BackendConnector.test.ts` | 699 | test del conector |
| `lib/powersync/PowerSyncProvider.tsx` | 29 | provider |
| `lib/powersync/reportarConflicto.ts` | 52 | POST a sync-conflictos |
| `app/api/powersync/token/route.ts` + `route.test.ts` | 42 + test | emite JWT; único uso de `jose` |
| `app/(app)/admin/powersync-status/{page,client_page}.tsx` | — | pantalla de estado |
| `app/(app)/admin/sync-conflictos/{page,client_page,client_page.test}.tsx` | — | UI de conflictos |
| `app/api/sync-conflictos/route.ts`, `[id]/route.ts` + 2 tests | 83 + 63 + tests | API de conflictos |
| `app/offline/page.tsx` | — | fallback del SW |
| `app/sw.ts` | 188 | service worker (ver 1.4) |
| `lib/sw-images.ts` | 36 | regla de imágenes del SW |
| `__tests__/sw-image-cache.test.ts` | — | test del punto anterior |
| `__tests__/bugfix-caja-mayor-busqueda-offline.test.ts` | — | check estructural de rama offline |
| `__tests__/caja-mayor-sync-bug054.test.ts` | — | prueba BackendConnector |
| `__tests__/notas-venta-sync-bug052.test.ts` | — | prueba BackendConnector |
| `__tests__/caja-mayor-refresco-reactivo.test.tsx` | — | `onChangeWithCallback` (solo offline) |
| `__tests__/categorias-refresco-reactivo.test.tsx` | — | idem |
| `__tests__/notas-venta-buscador-productos-offline.test.tsx` | — | un test, rama offline |
| `__tests__/notas-venta-shell-offline-id-url.test.tsx` | — | existe por el shell del SW |
| `public/sw.js` (+ `swe-worker*`, si existen) | — | artefacto local ignorado por git |

Las 12 filas de tests: clasificación hecha por nombre de archivo, `describe` y `jest.mock` **[V]**; los cuerpos NO se leyeron completos **[?]** → en Fase B de cada sub-slice se abre el archivo y, si tiene un caso online que no está cubierto en otro lado, pasa a "ajustar".

### 1.2 MODIFICAR

Cada fila: qué cambia. "≈N" = líneas modificadas (añadidas+borradas dentro del archivo) **[E]**, calculadas por tamaño de los bloques `if (OFFLINE_READ && db)` y wrappers; se re-miden.

**Client pages** (en todas: quitar import `usePowerSync`, `PowerSyncProvider`, y `flags` si ya no se usa; colapsar el wrapper `XClient` que decide montar el provider → render directo del contenido; borrar `const db`, `OFFLINE_READ` y cada rama `if (OFFLINE_READ && db)` conservando solo el `else`/fetch; limpiar deps de `useCallback/useEffect` que citaban `db, OFFLINE_READ`).

| Archivo | Específico | ≈ |
|---|---|---|
| `app/(app)/alertas-stock/client_page.tsx` | lectura (l.66-103) + acción (l.112) | 60 |
| `app/(app)/admin/usuarios/client_page.tsx` | lectura (l.56-…); **conservar** guards `navigator.onLine` y `OFFLINE_WRITE_MSG` (D2) | 40 |
| `app/(app)/catalogo/admin/client_page.tsx` | lectura (l.73) + watcher (l.107-113); **conservar** guards `navigator.onLine` (l.137,157) | 60 |
| `app/(app)/clientes/client_page.tsx` | lectura (l.56), alta (l.98), baja (l.147) | 80 |
| `app/(app)/precios/client_page.tsx` | lectura dual (l.99, l.123) | 70 |
| `app/(app)/bodega/client_page.tsx` | prop `offline` de `BodegaContent`/`UbicacionEditor`, lectura (l.101), guardado (l.330); **conservar** `online = navigator.onLine` (l.286) salvo que solo sirva a la rama offline [?] | 110 |
| `app/(app)/admin/caja-config/client_page.tsx` | carga (l.74), CRUD saldos/cuentas (l.129,217,259,311,355); **conservar** guards `navigator.onLine` (l.205,299) | 200 |
| `app/(app)/admin/categorias/client_page.tsx` | borrar `fetchCategorias` + watcher + lectura inicial (l.283-309), `fetchProductos` local (l.317-350), drag (l.467,515), crear (l.547), eliminar (l.584) | 175 |
| `app/(app)/notas-venta/client_page.tsx` | lectura (l.59), dólar (l.137), crear/anular (l.159,189); **conservar** `PREFETCH_HOVER` (D1) | 150 |
| `app/(app)/notas-venta/[id]/client_page.tsx` | `PrenotaItemsTable`: props `db`/`offlineReady` + `handleGuardar` (l.39-97); `fetchPrenota` (l.323), buscador (l.465), agregar (l.519), eliminar (l.582), anular (l.941), prop en l.1211; `useParams().id` **se conserva** (solo se corrige el comentario del SW) | 190 |
| `app/(app)/caja-mayor/client_page.tsx` (1980 l.) | dólar (l.104), `fetchMovimientos` (l.188-~295), `fetchSaldos` (l.322-369), watcher (l.379-391), búsqueda (l.447-~535), imputación (l.597-~660), edit (l.725-~785), delete (l.801), `handleSubmit` (l.830-~985); **conservar** `online`+listeners (l.73-83) que bloquean cierres (D2) | ≈600 en 4 cortes |

**Shell, contexto, nav**

| Archivo | Cambio | ≈ |
|---|---|---|
| `components/AppShell.tsx` | quitar `PowerSyncProvider`, `flags`, `BADGE_OFFLINE`; `SessionProvider > app` | 12 |
| `contexts/AlertasContext.tsx` | quitar `usePowerSync`/`flags`; queda solo `fetch('/api/alertas-stock')` | 30 |
| `components/AlertasBell.tsx` | quitar rama offline (l.62-105) | 55 |
| `components/TopNav.tsx` | borrar `DropdownMenuItem` "Conflictos de Sync" (l.224-228) e import `ShieldAlert` si queda sin uso | 7 |
| `components/BottomNav.tsx` | borrar `Link` "Conflictos de Sync" (l.175-178) e import `ShieldAlert` | 6 |

**Infra y config**

| Archivo | Cambio | ≈ |
|---|---|---|
| `next.config.mjs` | quitar `withSerwist`/`spawnSync`/`randomUUID`/`revision`, `transpilePackages` de `@powersync/*`, `@journeyapps/wa-sqlite`, `comlink` (y `jose` si D3), bloque `webpack` (asyncWebAssembly, topLevelAwait, regla `.wasm`); `export default nextConfig` | 55 |
| `tsconfig.json` | quitar `types: [@serwist/next/typings]` y `"webworker"` de `lib`; `exclude` sin `public/sw.js` | 4 |
| `middleware.ts` | matcher: quitar `offline`, `sw\.js`, `swe-worker\.js` | 1 |
| `.gitignore` | quitar bloque "# Serwist" (2 líneas + comentario) | 3 |
| `package.json` | quitar `@powersync/react`, `@powersync/web`, `@journeyapps/wa-sqlite`, `@serwist/next`, `serwist` (+ `jose` si D3) | 6 |
| `package-lock.json` | regenerado por `npm uninstall` (**excluido del conteo**, es generado) | — |
| `config/feature-flags.json` | borrar 12 keys: `sync-conflictos-reporte`, `bodega-offline-lectura`, `notas-venta-offline-lectura`, `precios-offline-lectura`, `caja-mayor-offline-lectura`, `categorias-offline-lectura`, `clientes-offline-lectura`, `alertas-stock-offline-lectura`, `usuarios-offline-lectura`, `caja-config-offline-lectura`, `catalogo-admin-offline-lectura`, `alertas-badge-offline`. Quedan 13 (incl. `notas-venta-prefetch-hover`) | 12 |
| `.env.example` | quitar `POWERSYNC_JWT_PRIVATE_KEY`, `POWERSYNC_INSTANCE_URL` y su comentario | 3 |
| `app/(app)/admin/caja-config/page.tsx` | comentario l.14 ("offline vía SQLite local") | 1 |
| `PRD.md` | §9 fila 3: marcar completado (solo al cierre, con OK de Pablo) | 1 |

**Tests a ajustar (no borrar)** — quitar `jest.mock('@powersync/react')`, `jest.mock('@/lib/powersync/PowerSyncProvider')`, mocks de flags offline y los `describe` de modo offline; conservar los online:

| Test | Qué se conserva |
|---|---|
| `__tests__/notas-venta-eliminar-offline.test.tsx` | `describe('eliminarItem — modo online (no-regresión)')`; renombrar a `notas-venta-eliminar-item.test.tsx` (git mv) |
| `__tests__/notas-venta-guardar-offline.test.tsx` | `describe('handleGuardar — modo online (no-regresión)')`; renombrar |
| `__tests__/caja-mayor-bug054-ui.test.tsx` | "cierre de caja bloqueado offline" (depende de `navigator.onLine`, que se conserva); se borran "editar/eliminar offline" y "edit offline monto_usd" [?: confirmar al abrirlo] |
| `__tests__/bodega-client_page.test.tsx`, `caja-config-client_page.test.tsx`, `precios-eliminar-producto-ui.test.tsx`, `notas-venta-compartir-whatsapp.test.tsx`, `notas-venta-exportar-pdf.test.tsx`, `notas-venta-prefetch-hover.test.tsx` | todo; solo mocks |
| Co-ubicados: `alertas-stock`, `bodega`, `caja-mayor`, `clientes`, `precios`, `catalogo/admin`, `admin/usuarios`, `notas-venta`, `notas-venta/[id]`, `admin/caja-config` `client_page.test.tsx` | todo lo online; mocks/flags offline fuera (3-7 menciones c/u) |
| `__tests__/slice-audit-ponytail-deletes.test.ts` | **contradice el slice**: `LIVE_FLAGS` exige 11 flags offline + `sync-conflictos-reporte` y el test de `.env.example` exige `POWERSYNC_JWT_PRIVATE_KEY`. Se reduce `LIVE_FLAGS` a `despachos-ia`, `registro_notas_bodega_ui`; el test de `.env.example` se invierte (no debe contener `POWERSYNC`) |

Sin cambios (verificado que pasan sin tocar o solo tienen comentarios): `notas-venta-compartidas-smoke.test.ts` (assert `no p.usuario_id`, sigue válido), `slice19-caja-fix.test.ts`, `productos-softdelete-impacto-lateral.test.ts` (comentario), `slice5-deps-smoke.test.ts` (no menciona powersync/serwist) **[V por grep]**.

### 1.3 NO se toca (declarado)

- `migrations/*`, `scripts/migrations-order.ts` (zona de riesgo del PRD), schema DB, tabla `sync_conflictos`.
- `public/manifest.json` y `metadata.manifest` en `app/layout.tsx` (D del Director). Su contenido sigue diciendo "Bazar Naty": es de Slice 1 (rebranding).
- `lib/rutas-por-rol.ts`: no tiene rutas `powersync-status` ni `sync-conflictos` propias; ambas cuelgan de `/admin`, que sigue existiendo **[V]**.
- Rutas API de negocio que aceptan `id` UUID opcional del cliente (`clientes`, `categorias`, `notas-venta/[id]/items`, `caja/movimientos`) y sus comentarios que citan "BackendConnector/PowerSync": el contrato es retrocompatible, las columnas UUID siguen en DB y tienen tests de API. Quedan con comentarios desactualizados (D6).
- `docs/slices/offline-slice-*.md`, `bugfix-*offline*`, `docs/ARQUITECTURA-OFFLINE.md`: historia (D4).

### 1.4 Decisión Serwist: **se elimina** (con evidencia)

| Regla de `app/sw.ts` | Por qué existe | ¿Valor sin offline? |
|---|---|---|
| `APP_SHELL_ROUTES` + precache en `install` (l.13-60) | "todas las rutas… quedan offline desde el primer arranque" | No |
| `NotasVentaShellStrategy` (l.70-114) | sirve shell de otra nota; el contenido "lo arma el cliente contra PowerSync" | No |
| `/api/*` `NetworkOnly` (l.116-121) | evitar servir cacheado `/api/powersync/token` | No |
| `NetworkFirst` "pages-app" para toda navegación, 24 h (l.152-160) | base del fallback offline | **Negativo**: cachea HTML autenticado por rol en un ERP multiusuario y interfiere con el redirect de Mercado Pago de la tienda |
| `fallbacks → /offline` (l.177-185) | offline | No |
| `imageCacheEntry` (`lib/sw-images.ts`) | su propio encabezado: reemplaza una regla de `defaultCache` (solo existe porque existe el SW) | Marginal: las fotos son Cloudinary (CDN + cache HTTP) y pasan por `next/image` |

No hay `navigator.serviceWorker.register` manual en el repo (grep de `serviceWorker|register` en `app/layout.tsx`: sin resultados); el registro lo inyecta `@serwist/next` **[V]**. Conclusión: nada del SW da valor independiente; PRD §4 lo declara fuera del MVP. Se elimina con `@serwist/next` y `serwist`.

No verificado **[?]**: (a) si el manifest solo, sin SW, mantiene el criterio de "instalable" en los navegadores objetivo; (b) qué hace un navegador que ya tenga el SW viejo registrado cuando `/sw.js` deje de existir. No hay deploy de este proyecto según PRD §9 (deploy = slice 11) y `git log` (2 commits), pero un preview en Vercel no es verificable desde el repo. Si hubo, desregistrar en DevTools > Application. Kill-switch (D5): no recomendado.

---

## 2. Revisión de impacto lateral

| Área | ¿Cambia? | Detalle |
|---|---|---|
| Navegación `TopNav` / `BottomNav` | **Sí** | Eliminar link "Conflictos de Sync" (apunta a página que se borra → 404 si queda). Los tests de nav (`slice1-nav-mvp*`, `nav-redesign-fase-b`, `bottomnav-inversion-mercaderia`, `slice3-bottomnav-active`) no mencionan sync-conflictos [V grep]; cuentan "Config de Caja"/"Administración": re-correr. |
| `AppShell` | **Sí** | Deja de montar `PowerSyncProvider`. `SessionProvider > AlertasProvider > …` |
| `AlertasContext` / `AlertasBell` (PRD §9 dice "revisar dependencia") | **Sí, se mantienen** | Dependen de PowerSync solo por la rama `alertas-badge-offline`. La rama online (`fetch('/api/alertas-stock')`) es la que usan hoy. `useAlertas` lo consumen `TopNav`, `AlertasBell`, `alertas-stock/client_page` y 9 tests [V]. Los tests de Alertas no mockean powersync → no deberían romperse. |
| `rutas-por-rol` / `middleware.ts` | `middleware.ts` **Sí (1 línea)** | Matcher excluía `offline`, `sw.js`, `swe-worker.js`. Tras borrar `/offline` y el SW, esas exclusiones sobran; si se dejan no rompen, pero se quitan. Cuidado de no tocar el resto del regex (login, api, catalogo, productos, `_next`). `rutas-por-rol.ts` **no cambia**. |
| `next.config.mjs` | **Sí** | Ver 1.2. Jest carga este archivo vía `next/jest`: el `transpilePackages` de `@powersync/*` se quita **después** de que ningún test importe esos paquetes (último sub-slice). |
| `tsconfig.json` | **Sí** | `types` y `lib: webworker` (solo servían a `sw.ts`). Impacto en tsc medido antes/después (hallazgo 3). |
| Jest config (`jest.config.js`, `jest.setup.ts`, `jest.env-setup.ts`) | **No** | No mencionan powersync/serwist [V]. `moduleNameMapper` solo `@/`. |
| Tipos compartidos (`types/`, `utils/`, `hooks/`) | **No** | Sin referencias [V grep]. |
| Schema DB / migraciones | **No** (regla del Director) | Tabla `sync_conflictos` huérfana; migraciones 025-030 mencionan PowerSync en comentarios SQL, no se editan. |
| Variables de entorno | **Sí** | `.env.example`: `POWERSYNC_*`. Ningún otro archivo de código lee `process.env.POWERSYNC_*` salvo el route borrado [V]. `.env.local` de Pablo: puede borrar las variables a mano (no se toca). |
| Feature flags | **Sí** | 12 keys. Todo código que las lee se limpia antes (orden de sub-slices). |
| Dependencias | **Sí** | 5 + `jose` (D3). |
| `vercel.json` | **No** | Solo cron de inversión-mercaderia. |
| CSP / headers | **No** | No hay config de headers en el repo [V: `vercel.json` y `next.config.mjs` no tienen `headers`]. |
| Documentación | `PRD.md` (1 línea al cierre). `CLAUDE.md` del proyecto no menciona PowerSync. `CONTEXT-CLAUDE-CHAT.md` ya dice "se elimina". `docs/ARQUITECTURA-OFFLINE.md` obsoleto (D4). |
| `public/manifest.json` | **No** | Se mantiene (Director). |

Respuesta a la pregunta obligatoria "¿qué archivos que ya existen necesitan cambiar para que el slice quede integrado?": **los listados en 1.2** (11 client pages, 3 de shell/contexto, 2 de nav, 6 de config/infra, ~20 tests). No hay "ninguno".

Señal 1 (BUGS): `BUGS.md` raíz sin entradas de offline [V]. En `docs/referencia-bazar-naty/BUGS.md` se leyeron BUG-029 (`created_at` en AppSchema), BUG-037 (JWKS) y BUG-040 (eliminar ítem offline); BUG-052/054/055/056, citados en comentarios de `caja-mayor` y `notas-venta`, **no se leyeron** [?]. Todos describen ramas offline que se eliminan; el riesgo propio de Señal 1 es borrar por arrastre algo compartido de `caja-mayor` y `notas-venta/[id]` (zonas frágiles heredadas) → esos dos van en cortes pequeños con revisión de diff.

---

## 3. Sub-slices (≤200 líneas NO borradas; build y tests verdes en cada uno)

**Regla de conteo (D8):** `git diff --numstat --diff-filter=AM HEAD -- . ':!package-lock.json'` → suma de añadidas + borradas de archivos modificados/nuevos. Los archivos eliminados completos y el lockfile no cuentan. Si una estimación [E] se pasa de 200 al medir, se parte antes de seguir.

**Orden:** primero los consumidores (pages, shell), después los proveedores (`lib/powersync`, route, flags, deps). Mientras `lib/powersync` exista, ningún import queda roto; el flag de cada página se quita de `feature-flags.json` solo al final (3.10), cuando nadie lo lee. Como los flags están en `false`, quitar una rama deja el comportamiento por defecto intacto.

Cada sub-slice repite el ciclo corto: Fase B (tests rojos) → C (implementación) → D (verificación §5) → commit solo con OK de Pablo.

| # | Contenido | ≈ líneas [E] | Deja en pie |
|---|---|---|---|
| 3.1 | `AppShell` + `AlertasContext` + `AlertasBell` | 100 | resto de pages todavía con PowerSync (flags false) |
| 3.2 | `alertas-stock` + `admin/usuarios` + `catalogo/admin` (+ sus tests) | 190 | |
| 3.3 | `clientes` + `precios` (+ tests, `precios-eliminar-producto-ui`) | 170 | |
| 3.4 | `bodega` (+ `bodega-client_page.test`, co-ubicado) | 110 | |
| 3.5 | `admin/caja-config` (+ `caja-config-client_page.test`, co-ubicado) | 200 (límite; si excede, partir lectura / escritura) | |
| 3.6 | `admin/categorias` (+ borrar `categorias-refresco-reactivo`) | 175 | |
| 3.7 | `notas-venta` lista (+ `prefetch-hover`, co-ubicado, `compartidas-smoke` re-correr) | 150 | |
| 3.8a | `notas-venta/[id]`: wrapper, `fetchPrenota`, buscador | 100 | |
| 3.8b | `notas-venta/[id]`: `PrenotaItemsTable.handleGuardar`, agregar, eliminar, anular + ajustar `eliminar-offline`, `guardar-offline`, `compartir-whatsapp`, `exportar-pdf` | 190 | |
| 3.9a | `caja-mayor`: lectura (dólar, `fetchMovimientos`, `fetchSaldos`, watcher) | 175 | |
| 3.9b | `caja-mayor`: búsqueda unificada + imputación manual; borrar `bugfix-…busqueda-offline`, `caja-mayor-refresco-reactivo` | 150 | |
| 3.9c | `caja-mayor`: `handleSubmit` (cobro/gasto) | 165 | |
| 3.9d | `caja-mayor`: edit/delete + wrapper/imports/flag + ajustar `caja-mayor-bug054-ui`, co-ubicado; borrar `caja-mayor-sync-bug054` | 110 | **ya nada importa `@powersync/*` fuera de `lib/powersync`** |
| 3.10 | Proveedores: borrar `lib/powersync/*`, `api/powersync`, `admin/powersync-status`, `admin/sync-conflictos`, `api/sync-conflictos` (+ tests, `notas-venta-sync-bug052`, `buscador-productos-offline`, `shell-offline-id-url`); quitar links de nav (13 l.); 12 flags (12 l.); `.env.example` (3); ajustar `slice-audit-ponytail-deletes` (~15); comentarios obsoletos mínimos (`caja-config/page.tsx`, comentario SW en `[id]`) | 50 | |
| 3.11 | Service worker y deps: borrar `app/sw.ts`, `lib/sw-images.ts`, `sw-image-cache.test`, `app/offline`, `public/sw*`; editar `next.config.mjs`, `tsconfig.json`, `middleware.ts`, `.gitignore`, `package.json` (+ `npm uninstall` → lockfile); test guardia global (§4 T-final); `PRD.md` fila 3 | 75 | 0 referencias |

Total estimado ≈ 1.8 k líneas tocadas en 15 cortes, de las cuales la mayoría son borrado dentro de archivos que quedan.

Cada corte conserva el estado "build verde": una página limpia ya no importa PowerSync; las demás siguen como hoy. Un corte nunca borra algo que otro todavía importa (se comprueba con T1 y con `tsc`).

---

## 4. Riesgos (checklist PBT-IA) y tests que intentan romperlo

### 4.1 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Borrar de más: llevarse con la rama offline algo compartido (estado, `useEffect`, `setLoading`) y dejar la pantalla en "cargando" | T3 (fetch por página) y diff revisado en `caja-mayor`/`notas-venta/[id]` |
| R2 | `categorias`: lista deja de refrescar online (hallazgo 4) | T4 |
| R3 | Dependencias de hooks: quitar `db, OFFLINE_READ` de arrays cambia la identidad de callbacks → loop de efectos o fetch doble | Test por página con `fetch` mock y `toHaveBeenCalledTimes` en el mount |
| R4 | Link de nav a página borrada | T7 + grep |
| R5 | Build "verde" con tipos rotos por `ignoreBuildErrors` | tsc con baseline (§5) |
| R6 | Cambio de `types` en tsconfig altera globals de TS | medir tsc antes/después en 3.11; si sube, mantener `"types": ["jest","node"]` |
| R7 | `.wasm`/Worker de PowerSync sigue en el bundle por un import residual (barrel, dynamic import) | T6 (`.next` sin `.wasm`) |
| R8 | Test que exige lo que se elimina (`slice-audit-ponytail-deletes`) | ajuste explícito en 3.10 |
| R9 | Pérdida de cobertura al borrar tests | Se borran solo tests cuyo objeto desaparece; los casos online se conservan (§1.2). |
| R10 | Usuario con SW viejo (preview/dev) | D5 / manual |
| R11 | Un cobro pasa a tener un solo camino: antes, con red caída y flag on, se guardaba local; ahora falla con error. Es el comportamiento pedido por PRD §4 | Mensajes `navigator.onLine` se conservan (D2) |
| R12 | Tabla `sync_conflictos` huérfana | Declarada; limpieza de schema = slice futuro |
| R13 | Comandos de Fase B/D con efectos: ninguno toca DB (no se aplica SQL en este slice) | — |

### 4.2 Tests propuestos (se escriben en Fase B de cada corte; deben fallar antes y pasar después)

Un solo archivo nuevo `__tests__/slice-03-sin-powersync.test.ts` (fs, sin render), con una lista `MIGRADOS` que crece por corte y se reemplaza en 3.11 por el recorrido total:

- **T1** Para cada archivo en `MIGRADOS`: no contiene `@powersync`, `lib/powersync`, `usePowerSync`, `OFFLINE_READ`, `wa-sqlite`.
- **T2** (3.10) existen sólo los 13 flags esperados (lista exacta, anti sobre-borrado) y ninguno coincide con `/offline|sync-conflictos/`. `.env.example` sin `POWERSYNC`.
- **T5** (3.10/3.11) no existen: `lib/powersync`, `app/api/powersync`, `app/api/sync-conflictos`, `app/(app)/admin/powersync-status`, `app/(app)/admin/sync-conflictos`, `app/offline`, `app/sw.ts`, `lib/sw-images.ts`; sí existen `public/manifest.json` y `app/layout.tsx` contiene `manifest:`.
- **T-final** (3.11) recorrido de `app components contexts hooks lib utils types scripts __tests__ middleware.ts next.config.mjs tsconfig.json` (excluye este test): ninguna ocurrencia de `powersync|wa-sqlite|serwist` (case-insensitive); `package.json` sin las 5 deps (y `jose` si D3); `next.config.mjs` sin `wasm|asyncWebAssembly|withSerwist`; `tsconfig.json` sin `serwist`; matcher de `middleware.ts` sin `offline|sw\.js` pero con `login|api/|catalogo|productos|_next/static`.

Tests de comportamiento (en los `client_page.test.tsx` co-ubicados, ajustando los existentes):

- **T3** Por página (alertas-stock, usuarios, catalogo/admin, clientes, precios, bodega, caja-config, categorias, notas-venta, notas-venta/[id], caja-mayor) y `AlertasProvider`: render **sin ningún mock de PowerSync** y con `global.fetch` mock → se llama a la URL esperada exactamente 1 vez en el mount (`/api/alertas-stock`, `/api/admin/usuarios`, `/api/catalogos`, `/api/clientes`, `/api/productos…`, `/api/bodega…`, `/api/caja/config`…, `/api/admin/productos-lista`, `/api/notas-venta`, `/api/notas-venta/:id`, `/api/caja/movimientos`; **URLs exactas se fijan leyendo cada página en Fase B [?]**) y se pinta el dato devuelto.
- **T4** `categorias`: tras crear/eliminar/arrastrar online el conteo y la lista quedan igual que antes del slice (test de caracterización escrito **antes** de editar, contra el código actual, y re-corrido después).
- **T-mut** Mutaciones online siguen yendo a la API: `handleSubmit` caja-mayor → `POST /api/caja/movimientos`; `eliminarItem`/`handleGuardar`/agregar producto → `DELETE`/`PATCH`/`POST` de `notas-venta`; clientes alta/baja; caja-config CRUD (existentes: se conservan).
- **T6** Build: `npm run build` y `find .next -name "*.wasm"` vacío; `ls public/sw*` vacío tras build (baseline: medir en `main` antes del primer corte para comprobar que hoy sí aparece).
- **T7** Nav: render `TopNav`/`BottomNav` como admin: no existe link a `/admin/sync-conflictos`; sí `Usuarios`, `Config de Caja`, y `Inversión en Mercadería` con su flag.
- **T8** Guards conservados (D2): `usuarios`, `catalogo/admin`, `caja-config`, `CrearCatalogoDialog` y cierre de caja-mayor siguen bloqueando escritura con `navigator.onLine=false` y mensaje.
- **T9** Contratos de API sin cambio: ejecutar los tests existentes de `clientes`, `categorias`, `notas-venta/[id]/items`, `caja/movimientos` (aceptan `id` UUID opcional) sin modificarlos.
- **T10** Orfandad declarada: ningún archivo fuera de `migrations/` y `scripts/migrations-order.ts` contiene `sync_conflictos` tras 3.10 (documenta la tabla huérfana).

---

## 5. Comandos exactos de verificación

Entorno: Git Bash, raíz `C:\Users\pablo\Documents\esquina-novedades\esquina-novedades`.

**Una sola vez, antes del corte 3.1 (baseline en `main`):**
```bash
git status --short                                   # debe estar limpio
npx tsc --noEmit 2>&1 | grep "error TS" | sed 's/(.*//' | sort | uniq -c > /tmp/tsc-before.txt
grep -c . /tmp/tsc-before.txt; npx tsc --noEmit 2>&1 | grep -c "error TS"   # hoy: 129 errores
npx jest 2>&1 | tail -n 40                           # baseline de suites rojas (NO medido hoy: el comando fue denegado por permisos en esta sesión)
npm run build && find .next -name "*.wasm" | head    # baseline T6; ls public/sw*
```

**En cada corte (Fase D):**
```bash
npx jest <archivos del corte>                        # lo tocado
npx jest                                             # suite completa: 0 rojos nuevos vs baseline
npx tsc --noEmit 2>&1 | grep "error TS" | sed 's/(.*//' | sort | uniq -c > /tmp/tsc-after.txt
diff /tmp/tsc-before.txt /tmp/tsc-after.txt          # solo pueden desaparecer líneas (archivos borrados), nunca aparecer
npm run lint
git diff --numstat --diff-filter=AM HEAD -- . ':!package-lock.json'   # sumar cols 1+2 ≤ 200
git grep -n -i -E "powersync|usePowerSync|OFFLINE_READ" -- <archivos MIGRADOS hasta ahora>   # vacío
```

**Cierre (tras 3.11):**
```bash
git grep -n -i -E "powersync|wa-sqlite|serwist" -- . ':!docs' ':!migrations' ':!PRD.md' ':!CONTEXT-CLAUDE-CHAT.md' ':!package-lock.json' ':!__tests__/slice-03-sin-powersync.test.ts'   # vacío
npm ls @powersync/web @powersync/react @journeyapps/wa-sqlite @serwist/next serwist   # "(empty)"
npm ci --dry-run                                     # lockfile consistente con package.json
npm run build && find .next -name "*.wasm"           # vacío
ls public/sw* 2>/dev/null                            # vacío
npx jest && npx tsc --noEmit 2>&1 | grep -c "error TS"   # ≤ 129 (menos al borrar archivos con errores)
npm run dev                                          # humo manual: login, /precios, /notas-venta/<id>, /caja-mayor, /admin/categorias, campana de alertas; DevTools > Application: sin Service Workers
```

---

## Decisiones que necesito de Pablo antes de Fase B

| # | Pregunta | Recomendación |
|---|---|---|
| D1 | Flag `notas-venta-prefetch-hover` (prefetch de Next en hover, fue pensado para el modo offline, no usa PowerSync, está en `false`) | Dejarlo; fuera de alcance. |
| D2 | Guards `navigator.onLine` con mensaje "requiere conexión" (usuarios, catálogo, caja-config, cierres de caja, `CrearCatalogoDialog`) | Conservarlos: no son PowerSync, tienen tests y dan un mensaje útil sin red. |
| D3 | Quitar también `jose` (queda sin uso tras borrar el route del token) y de `transpilePackages` | Sí. |
| D4 | `docs/ARQUITECTURA-OFFLINE.md` obsoleto y `docs/slices/offline-slice-*` | Dejar los slices como historia; añadir banner "OBSOLETO (Slice 3)" a ARQUITECTURA-OFFLINE.md en 3.11 (1 línea). |
| D5 | Kill-switch de SW para navegadores con SW viejo | No (sin deploy previo). |
| D6 | Comentarios obsoletos "BackendConnector/PowerSync" en 5 rutas API de negocio | Dejarlos; limpiar en un slice de limpieza. |
| D7 | `manifest.json` y header "Bazar Naty" | Slice 1. |
| D8 | Regla de conteo del límite de 200 (añadidas+borradas en archivos que permanecen, sin lockfile ni archivos borrados completos) | Confirmar. Si "no-borrado" significa solo líneas añadidas/modificadas, los cortes 3.2-3.3, 3.8, 3.9 podrían fusionarse (≈8 cortes en vez de 15). |
