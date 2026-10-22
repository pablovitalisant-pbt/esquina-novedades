# Ponytail audit — 2026-10-22

Solo lista; no se aplicó nada. Alcance: app/, components/, contexts/, hooks/, lib/, utils/, types/, scripts/, middleware.ts, next.config.mjs, package.json, config/feature-flags.json. Excluye docs/, migrations/, node_modules, .next.
Flags intencionales en false (`precio-mayorista-ui`, `notas-venta-modalidad`, `clientes-etiqueta`, `tienda-pago-online`) NO se tocan.
Conteos de líneas con `wc -l`; "sin lectores" = 0 coincidencias en Grep sobre el alcance (excluyendo `__tests__`).

## Hallazgos (mayor recorte primero)

1. `delete` Módulo despachos-ia completo. Nada: la API `/api/despachos/*` nunca existió. [app/(app)/bodega/despachos/{page.tsx 28, client_page.tsx 245}] (-273 src; + -235 tests que solo prueban ese código: client_page.test.tsx 150, __tests__/despachos-guard-smoke.test.ts 85)
   - Evidencia: `ls app/api/despachos` → no existe; `client_page.tsx:44` y `:62` hacen fetch a `/api/despachos/buscar` y `/procesar`; único lector del flag `despachos-ia` es `page.tsx:9` (que redirige si false); flag en `config/feature-flags.json:2`.
2. `delete` Registro de notas de bodega (flag `registro_notas_bodega_ui` en false, UI inalcanzable). Nada; si se quiere conservar, decisión de producto. [app/(app)/bodega/registro-notas/{client_page.tsx 283, page.tsx 10}, app/api/bodega/registro-notas/{route.ts 58, [id]/route.ts 54} (+ route.test.ts), links en components/TopNav.tsx:179 y components/BottomNav.tsx:139] (-405 src)
   - Evidencia: `grep registro-notas|registro_notas` → solo esos archivos + `scripts/migrations-order.ts` (tabla se queda: migraciones no se editan). Único consumidor de `date-fns` junto con despachos (ver 5).
3. `yagni` Dos librerías de Excel: `xlsx` y `exceljs`. Unificar en `exceljs` (ya usado en caja-mayor). [app/(app)/notas-venta/[id]/client_page.tsx:6, app/(app)/caja-mayor/client_page.tsx:543, package.json] (-1 dep, `xlsx` pesa ~7 MB)
   - Evidencia: `import * as XLSX from 'xlsx'` en `notas-venta/[id]/client_page.tsx:6`; `await import("exceljs")` en `caja-mayor/client_page.tsx:543`. Son los únicos usos de cada una.
4. `delete` Flag `nueva-paleta-colores`: 0 lectores. Borrar la clave. [config/feature-flags.json:6] (-1)
   - Evidencia: `grep -rn nueva-paleta` (sin node_modules/.next/docs/.git) → solo `feature-flags.json:6`.
5. `native` `date-fns` (+ locale `es`) para `format`. `Intl.DateTimeFormat('es-CL')` / `toLocaleDateString('es-CL')`. [app/(app)/bodega/registro-notas/client_page.tsx:10-11, app/(app)/bodega/despachos/client_page.tsx:8-9] (-1 dep; los 2 usuarios caen con 1 y 2 — queda 0 imports)
   - Evidencia: Grep `from 'date-fns'` en el alcance → solo esos 2 archivos, ambos en módulos candidatos a borrar. Si 1 y 2 se borran, la dep queda sin uso: desinstalar.
6. `delete` Flag `pedidos-publicos`: 0 lectores en código. Borrar la clave. [config/feature-flags.json:11] (-1)
   - Evidencia: `grep -rn pedidos-publicos` → solo `feature-flags.json:11` y mención en PRD.md:181 (texto).
7. `shrink` Flags viejos de Bazar Naty siempre en true: quitar clave + condicional y dejar el camino activo (8 flags, ~2–6 líneas c/u, más los casts `(flags as any)` e imports de flags que quedan sin uso). [config/feature-flags.json] (~-30 líneas)
   - `notas-venta-whatsapp-pdf` → app/(app)/notas-venta/[id]/client_page.tsx:714
   - `precios-precio-venta-card` → app/(app)/precios/client_page.tsx:22
   - `drawer-compartir-precio` → app/(app)/precios/client_page.tsx:25
   - `ingreso-mercaderia` → components/TopNav.tsx:172, components/BottomNav.tsx:138, app/(app)/bodega/ingresos/page.tsx:11 (+ __tests__/ingresos-guard-smoke.test.ts:16-65 que lo afirma)
   - `bodega-conciliacion-stock` → app/(app)/bodega/client_page.tsx:213
   - `carrito-pedidos-ui` → app/productos/client_page.tsx:30, app/catalogo/[slug]/client_page.tsx:18
   - `pedidos-staff-ui` → components/TopNav.tsx:117, components/BottomNav.tsx:96
   - `inversion-mercaderia` → components/TopNav.tsx:224, components/BottomNav.tsx:175, app/(app)/admin/inversion-mercaderia/page.tsx:16
   - Evidencia: valores `true` en `config/feature-flags.json:5,7-14`; lectores por `Grep "flags\b.*\["`. Nota: varios tests mockean estos flags (`__tests__/catalog-footer.test.tsx:20`, `bottomnav-inversion-mercaderia.test.tsx:19`, `bodega/client_page.test.tsx:10`) y se actualizarían.
8. `delete` Flag `notas-venta-prefetch-hover` en false (feature heredada apagada) con su rama de prefetch. [app/(app)/notas-venta/client_page.tsx:29 y sus usos, config/feature-flags.json:4] (~-10; contar los usos de `PREFETCH_HOVER` antes de cortar)
   - Evidencia: único lector `notas-venta/client_page.tsx:29` (`=== true`); valor false en `feature-flags.json:4`. No verifiqué el tamaño exacto de la rama.
9. `delete` `sharp` como dependencia directa: ningún import. Next la usa solo si se autohospeda; en Vercel no hace falta. [package.json:35] (-1 dep)
   - Evidencia: Grep `from ['"]sharp` en alcance → 0; `grep sharp next.config.mjs` → 0. Riesgo: si se despliega fuera de Vercel, mantenerla.
10. `delete` devDependency `shadcn` (CLI de scaffolding, ya generó components/ui). `npx shadcn@latest` cuando se necesite. [package.json devDependencies, `components.json` se conserva] (-1 dev dep)
    - Evidencia: Grep `from ['"]shadcn` en alcance → 0 imports; solo se invoca como CLI.
11. `shrink` Nombre `bazar-naty` residual en `package.json:2` (y package-lock). Renombrar a `esquina-novedades`. (0 líneas, higiene)
12. `shrink` Comentarios obsoletos de PowerSync (ya eliminado): app/api/categorias/route.ts:37, app/api/clientes/route.ts:75, app/api/caja/movimientos/route.ts:165 y :200, app/api/ingresos/route.ts:12 (mención a "Bazar"). Reescribir o borrar comentarios (~-8 líneas).
    - Evidencia: Grep `powersync` (case-insensitive) en el alcance.

## Revisado y limpio (sin recorte)
- `lib/empresa.ts`, `lib/precio-catalogo.ts`, `lib/calcular-precio.ts` (8 líneas), `lib/redirigir.ts`, `hooks/useShareImage.ts`, `components/{BodegaCard,CatalogFooter,ImageWithFallback,AplicarSaldoFavorDialog}.tsx`: todos tienen importadores en código fuente (Grep `import .*<nombre>`).
- `lib/test-safeguards.ts`: lo importa `jest.env-setup.ts:11`.
- Deps con uso real: `@dnd-kit/core` (admin/categorias), `bcryptjs`, `recharts` + `next-themes` (inversión), `qrcode.react` (catalogo/admin:28), `jspdf`/`jspdf-autotable` (notas-venta/[id]), `zod` (4 rutas), `@base-ui/react` + `class-variance-authority` (components/ui).
- No auditado a fondo: rutas API restantes y migraciones de tablas de los módulos 1–2 (fuera de alcance).

net: -~950 lines (≈-510 despachos, ≈-405 registro-notas, ≈-40 flags/comentarios; tests de código eliminado incluidos), -3 deps possible (xlsx, date-fns, sharp; +1 devDep shadcn).
