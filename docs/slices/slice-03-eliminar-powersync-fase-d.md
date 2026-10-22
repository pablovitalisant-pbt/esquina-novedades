# Slice 3 — Eliminar PowerSync — Fase D (Verificación)

## Corte 3.1 + 3.2 (AppShell, AlertasContext, AlertasBell, alertas-stock, admin/usuarios, catalogo/admin)

**Archivos modificados:** `components/AppShell.tsx`, `contexts/AlertasContext.tsx`, `components/AlertasBell.tsx`,
`app/(app)/alertas-stock/client_page.tsx`, `app/(app)/admin/usuarios/client_page.tsx`,
`app/(app)/catalogo/admin/client_page.tsx` y los 3 `client_page.test.tsx` co-ubicados.
**Nuevo:** `__tests__/slice-03-sin-powersync.test.ts` (T1, lista `MIGRADOS`; crece por corte).

**Cambios:** se quitan imports/ramas PowerSync y los wrappers que montaban el provider
(`AlertasStockClient`, `UsuariosClient`, `CatalogoAdminClient` renderizan el contenido directo).
Se conservan guards `navigator.onLine` y `OFFLINE_WRITE_MSG` (D2). `lib/powersync` no se toca.

**Tests:**
- Fase B: T1 en ROJO (9/9 fallan por `not.toMatch` de `@powersync|usePowerSync|OFFLINE_READ|…`).
- Los 3 tests co-ubicados se reescriben sin mocks de PowerSync/flags: carga por `fetch` (1 llamada, URL exacta), acciones por API y bloqueo sin conexión.
- Fase D: `npx jest` sobre el corte + `slice1-alertas-context`, `slice1-appshell-smoke`, `alertas-*`, `slice27-usuarios-bodega-smoke`, `slice9-catalogos-smoke`, `catalogo-edit-modal` → 12 suites, 75 tests, verde.
- `npx tsc --noEmit`: 129 errores (baseline 129, sin aumento).

**Diff (numstat, solo archivos que permanecen):** 45 líneas añadidas / 352 borradas en archivos existentes; + 22 en el test nuevo.

## Corte 3.3 + 3.4 + 3.5 (clientes, precios, bodega, admin/caja-config)

**Archivos modificados:** `app/(app)/{clientes,precios,bodega,admin/caja-config}/client_page.tsx` y sus 4 `client_page.test.tsx` co-ubicados; `__tests__/precios-eliminar-producto-ui.test.tsx`, `__tests__/bodega-client_page.test.tsx`, `__tests__/caja-config-client_page.test.tsx`; `__tests__/slice-03-sin-powersync.test.ts` (+11 entradas en `MIGRADOS`).

**Cambios:** se quitan imports `@powersync/*`, wrappers que montaban el provider (el componente exportado renderiza directo), ramas `OFFLINE_READ && db` y `mapRowToAgrupada` (bodega, solo offline). Se conservan guards `navigator.onLine` (caja-config, bodega conciliación) y los flags no-offline (`precios-precio-venta-card`, `drawer-compartir-precio`, `bodega-conciliacion-stock`). `lib/powersync` y `feature-flags.json` no se tocan.

**Tests:**
- Fase B: T1 en ROJO (11 nuevos fallan por el patrón prohibido; 9 anteriores verdes).
- Los tests se reescriben sin mocks de PowerSync/flags offline: carga por `fetch` (URL y número de llamadas), `DELETE` clientes 409, `PUT` bodega, guard sin conexión en caja-config.
- Fase D: `npx jest` sobre T1 + los 7 tests del corte + `slice20-precios`, `slice22-bodega`, `slice8-clientes`, `slice18b-clientes`, `precios-card-badge`, `bodega-ubicaciones` → 16 suites, 94 tests, verde.
- `npx tsc --noEmit`: 129 errores (baseline 129, sin aumento).

**Diff (numstat, archivos que permanecen):** 83 líneas añadidas / 628 borradas (límite D8: añadidas ≤ 200).

## Corte 3.6 + 3.7 (admin/categorias, notas-venta lista)

**Archivos modificados:** `app/(app)/admin/categorias/client_page.tsx`, `app/(app)/notas-venta/client_page.tsx`, `app/(app)/notas-venta/client_page.test.tsx`, `__tests__/notas-venta-prefetch-hover.test.tsx`, `__tests__/slice-03-sin-powersync.test.ts` (+4 entradas en `MIGRADOS`). **Borrado:** `__tests__/categorias-refresco-reactivo.test.tsx`.

**Cambios:** se quitan imports `@powersync/*`, wrappers de provider, ramas `OFFLINE_READ && db` (lectura, escritura, anular) y `fetchCategorias` + watcher (sin reemplazo, según contrato). Se conserva el flag `notas-venta-prefetch-hover` (D1).

**Tests:**
- Fase B: T1 en ROJO (4 nuevos fallan por el patrón prohibido; 20 anteriores verdes).
- `notas-venta/client_page.test.tsx` reescrito: carga por `fetch` y anular por `DELETE`.
- Fase D: T1 + `notas-venta/client_page` + `notas-venta-prefetch-hover` + `notas-venta-compartidas-smoke` → 4 suites, 40 tests, verde.
- `npx tsc --noEmit`: 129 errores (baseline 129, sin aumento).

## Corte 3.8a + 3.8b (notas-venta/[id])

**Archivos modificados:** `app/(app)/notas-venta/[id]/client_page.tsx`, `app/(app)/notas-venta/[id]/client_page.test.tsx`, `__tests__/notas-venta-{eliminar-offline,guardar-offline,compartir-whatsapp,exportar-pdf}.test.tsx`, `__tests__/slice-03-sin-powersync.test.ts` (+6 entradas en `MIGRADOS`).

**Cambios:** `PrenotaDetallePage` ya no monta provider (`PrenotaDetalleContent` fusionado); se quitan `usePowerSync`, `OFFLINE_READ`, props `db`/`offlineReady` de `PrenotaItemsTable` y las ramas offline de `fetchPrenota`, buscador, `agregarProducto`, `eliminarItem`, `handleGuardar` y anular nota vacía. Se conserva el flag `notas-venta-whatsapp-pdf`. `eliminar-offline` y `guardar-offline` quedan con un solo caso online (fetch DELETE/PATCH con UUID); se borran en 3.10.

**Tests:**
- Fase B: T1 en ROJO (6 nuevos fallan por el patrón prohibido).
- Fase D: T1 + 11 suites de notas-venta: 75 pasan, 13 fallan, todos en las 4 suites heredadas (`client_page.test`, `stock-frontend`, `buscador-productos-offline`, `shell-offline-id-url`). Baseline del corte: 15 fallos en esas mismas 4 suites (mejora de 2).
- `client_page.test.tsx`: el test nuevo "carga por fetch" falla por la misma causa heredada (el mock de `next/navigation` no define `useParams`); no se corrigió.
- `npx tsc --noEmit`: 127 errores (baseline 129, sin aumento).

**Diff (numstat, archivos que permanecen):** 90 líneas añadidas / 505 borradas (límite D8: añadidas ≤ 200).
