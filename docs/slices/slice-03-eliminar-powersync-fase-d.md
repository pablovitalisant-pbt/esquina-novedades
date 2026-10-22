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
