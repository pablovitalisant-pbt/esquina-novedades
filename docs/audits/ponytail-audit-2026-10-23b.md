# Ponytail audit — 2026-10-23b

Solo lista; no se aplicó nada. Alcance: archivos no-test cambiados desde el audit anterior
(`git diff --name-only b6ef44c..HEAD -- app components contexts hooks lib utils types scripts middleware.ts next.config.mjs package.json config`, sin `*.test.*`).
Flags intencionales (`tienda-pago-online`, `precio-mayorista-ui`, `notas-venta-modalidad`, `clientes-etiqueta`, `mp-webhook-ignorar-ipn-legacy`, `pedido-confetti`, `registro_notas_bodega_ui`, `env-validacion-arranque`) NO se tocan.
"Sin lectores" = 0 coincidencias en Grep sobre código **y tests** (lección del audit anterior).

## Resultado (Director Técnico)
Pendiente.

## Resultado (Director Técnico)
Aplicados 1–6 y 8 (neto ≈ −130 líneas). **Rechazado 7**: el script de limpieza es destructivo y ya está verificado contra producción; se prefiere explícito. Desviaciones: las rutas de caja cubiertas por `permisos-por-rol-smoke` conservan su guard local (el test exige el literal); `Categoria` conserva `export` (lo importa `admin/categorias/page.tsx`, el audit se equivocó). Verificado por el DT: mismos mensajes y status (401 sin sesión, 403 no admin) — comparación de literales del diff.

## Hallazgos (mayor recorte primero)

1. `yagni` Chequeo admin copiado 19 veces en `app/api/caja` (12 funciones `guard`/`adminGuard` + 7 bloques inline). Un `requiereAdmin(session, mensaje = 'Acceso denegado')` en `app/api/caja/_types.ts`; los callers ya usan el patrón `const g = ...; if (g) return g`, así que solo cambian de nombre. (-~58)
   - Evidencia: 12 defs → `cierres/route.ts:19`, `clientes/route.ts:15`, `config/route.ts:11`, `cuentas/[id]/route.ts:9`, `cuentas/route.ts:9`, `movimientos/[id]/notas/route.ts:18`, `movimientos/[id]/route.ts:10`, `movimientos/route.ts:158`, `nota-busqueda/route.ts:19`, `notas/[kcodcli2]/route.ts:19`, `resumen/[kcodcli2]/route.ts:10`, `saldos-iniciales/route.ts:19`. Cuerpos idénticos salvo el texto de error.
   - 7 copias inline extra: p. ej. `movimientos/route.ts:28-32` repite el cuerpo de `guard` (`:158`) en el mismo archivo; `resumen-cuentas/route.ts:7`, `cierres/[id]/route.ts` y `saldos-iniciales/[id]/route.ts` no tienen guard y repiten el bloque. `grep 'rol !== "admin"' app/api/caja` → 19.
   - No hay tests que aserten esos mensajes de caja (`grep 'Acceso denegado' __tests__` → 0 en caja), así que el parámetro `mensaje` preserva las 3 variantes sin riesgo.

2. `delete` Helpers de sesión copiados 11 veces en `app/api`: `usuarioSesion()` + `type UsuarioSesion` locales. Uno compartido (3 líneas) y borrar los 10 tipos locales. (-~50)
   - Evidencia (misma función de 3 líneas, mismo tipo de 1 línea): `notas-venta/route.ts:7-11`, `notas-venta/[id]/route.ts:10-14`, `notas-venta/[id]/items/route.ts:9-13`, `notas-venta/[id]/items/[itemId]/route.ts:8-12`, `notas-venta/items/[itemId]/route.ts:8-12`, `notas-venta/[id]/pagar/route.ts:15-19`, `notas-venta/[id]/reembolsar/route.ts:12-16`, `notas-venta/[id]/aplicar-saldo-favor/route.ts:16-20`, `pedidos/route.ts:20-24`, `pedidos/[id]/route.ts:6-8`, `pedidos/[id]/convertir/route.ts:6-10`.
   - No se exportan ni los importan tests (`grep usuarioSesion --include=*.test.*` → 0). El de `pedidos/[id]/convertir` solo difiere en campos requeridos; el tipo permisivo sirve igual.

3. `delete` `mensajeError` definido 8 veces y `codigoError` 4 veces, más 55 ternarios `error instanceof Error ? error.message : String(error)` inline. Un `lib/errores.ts` con las dos funciones. (-~39)
   - Evidencia: `mensajeError` → `aplicar-saldo-favor/route.ts:22`, `[id]/items/[itemId]/route.ts:18`, `pagar/route.ts:21`, `reembolsar/route.ts:22`, `items/[itemId]/route.ts:18`, `pedidos/[id]/convertir/route.ts:12`, `pedidos/[id]/route.ts:10`, `pedidos/route.ts:30`. `codigoError` → `[id]/items/[itemId]/route.ts:14`, `reembolsar/route.ts:18`, `items/[itemId]/route.ts:14`, `pedidos/route.ts:26`.
   - `grep -c 'error instanceof Error ? error.message : String(error)'` en app/components/lib → 55 (27 como `const message = ...`). El import de `pedidos/route.ts:26,30` muestra que el patrón local ya se consideró útil; solo falta subirlo a `lib/`.

4. `delete` Tipos de sesión triplicados: `SessionUser` (caja) es un workaround obsoleto; `UserSession` puede ser alias de `Session['user']`; 78 casts `as SessionUser|UserSession` son no-ops. (-~8 líneas, -78 casts)
   - Evidencia: `types/next-auth.d.ts` (nuevo en A11) ya declara `Session.user` con `id/rut/nombre/rol/empresas`. Prueba de que aplica: `lib/auth.ts:66-70` escribe `session.user.rol` **sin cast** y compila; `tsconfig.json` incluye `**/*.ts`.
   - El comentario de `app/api/caja/_types.ts:1-2` ("NextAuth no la declara") quedó desactualizado.
   - `types/index.ts:149` `interface UserSession` = mismo shape que `Session['user']` → `export type UserSession = Session['user']` (1 línea).
   - `grep -c 'as UserSession' app components lib` → 52; `as SessionUser` → 26. Parte de estos casts está dentro de los 12 guards del hallazgo 1, así que ambos hallazgos se solapan al aplicarse.

5. `shrink` Interfaces de fila duplicadas dentro de caja: `CierreRow` (2 archivos), `MovimientoFechaRow` (2), `NotaRow` (2). Mover a `app/api/caja/_types.ts` (unificando `resumen` como `CuentaCierreResumen[] | string`, que además elimina el cast de `cierres/route.ts:45`). (-19)
   - Evidencia: `CierreRow` → `cierres/route.ts:9` y `movimientos/route.ts:10` (idénticas salvo `resumen`); `MovimientoFechaRow` → `export/route.ts:18` y `movimientos/route.ts:20` (idénticas); `NotaRow` → `nota-busqueda/route.ts:10` y `notas/[kcodcli2]/route.ts:10` (idénticas, 7 líneas cada una).

6. `native` `type Marca` en `lib/empresa.ts` documenta un único literal. `as const` hace lo mismo y conserva los literales de color/redes. (-17)
   - Evidencia: `lib/empresa.ts:1-17` (17 líneas de tipo) para un solo `export const EMPRESA` (`:19`). Antes de C1 el objeto ya era `as const`; los 17 consumidores (`grep 'EMPRESA\.'` sin tests, p. ej. `app/manifest.ts:6`, `components/ConfettiCompra.tsx:7`, `app/(app)/notas-venta/[id]/client_page.tsx:35`) aceptan literales.
   - Nota: `Marca` sí sirve de doc de los `null` de logo; si el Director prefiere conservarlo, es el hallazgo con menos impacto funcional de la lista.

7. `shrink` `CONTEO` en el script de limpieza repite el `WHERE` de las 13 sentencias de `PLAN` (+2 tablas hijas). Derivarlo de `PLAN` con `sql.replace(/^DELETE FROM /, 'SELECT COUNT(*)::int AS n FROM ')` y agregar las 2 hijas. (-12)
   - Evidencia: `scripts/limpiar-datos-prueba.ts:28-55` vs `:58-89`; mismo `$1`/`$2` y mismo filtro en cada tabla. El test `__tests__/slice-c6-limpiar-datos-prueba.test.ts:44-49` exige solo que `CONTEO` empiece con `SELECT`, así que la derivación lo mantiene verde.
   - Contra: la transformación es menos obvia de leer; si el Director prioriza claridad sobre 12 líneas, se descarta.

8. `delete` `export` sobrante en tipos usados solo dentro de su archivo: `ProductoCatalogoFila` y `Categoria`. Quitar `export`. (-0 líneas, -2 exports)
   - Evidencia: `app/api/catalogos/public/[slug]/seleccion.ts:15` (solo usado en `:40,98,100` del mismo archivo); `app/(app)/admin/categorias/client_page.tsx:30` (solo en `:114,208,212` del mismo archivo). No hay tests que los importen.

## Revisado y limpio (sin recorte)

- **Props de `MarcaLogo` y `RedesSociales` NO se tocan**: los tests existentes las usan como costura, no son flexibilidad muerta. `__tests__/marca.test.tsx:17,23` (`<MarcaLogo logo=... />`) y `:32,39` (`<RedesSociales redes=... />`). Borrarlas dejaría la rama de fallback sin forma de testearse.
- **`SessionProp` y `params?` de `PrenotaDetallePage` se conservan**: los tests pasan sesiones parciales y `params`. `app/(app)/notas-venta/[id]/client_page.test.tsx:77,204,242`; `app/(app)/notas-venta/client_page.test.tsx:22`; `__tests__/deudores-whatsapp.test.tsx:50`; `__tests__/app/pedidos/client_page.test.tsx:42`.
- `lib/env.ts`: todos los exports (`REQUERIDAS`, `REQUERIDAS_PAGO`, `OPCIONALES`, `revisarEntorno`, `validarEntorno`) tienen lector en `__tests__/lib/env.test.ts`. La separación `revisarEntorno` (pura) / `validarEntorno` (logs) es la costura de test, no una capa de más. Flag `env-validacion-arranque` es intencional.
- `scripts/limpiar-datos-prueba.ts`: `PEDIDOS`, `CODIGOS`, `PLAN`, `CONTEO`, `parseArgs`, `validarHost` los importa `__tests__/slice-c6-limpiar-datos-prueba.test.ts:1-8`; el guard `process.argv[1]?.endsWith(...)` (`:217`) es lo que permite ese import sin ejecutar. No borrar ninguno.
- `scripts/seed-test-integration.ts`: el loop final de conteos (`:55-58`) es la verificación contra la base real que exige CLAUDE.md; el guard `export {}` no aplica (script con imports, sin tests que lo importen).
- `app/catalogo/[slug]/page.tsx` → `data.ts`: movimiento puro de ~150 líneas, sin lógica nueva. `getCatalogData`, `parseCSVField` y el `try/catch` anidado quedaron iguales.
- `lib/pedidos/convertir.ts`: el INSERT de la línea Despacho está en dos ramas (CTE atómica para `pagado` con reserva; INSERT posterior para `pendiente`). No se puede deduplicar sin romper la atomicidad que documenta el comentario de `:65-66`.
- Rutas `app/api/notas-venta/items/[itemId]` y `app/api/notas-venta/[id]/items/[itemId]`: no son duplicados; la primera es el DELETE offline de BUG-052 (sin `prenota_id`, el server lo resuelve), documentado en su cabecera.
- `next.config.mjs`: la eliminación de `eslint.ignoreDuringBuilds` y `typescript.ignoreBuildErrors` ya es el recorte correcto; no queda nada que quitar.
- `package.json`: `seed` → `scripts/seed.ts` y `migrate` → `scripts/apply-migrations.ts` existen; `test:seed` y `limpiar-prueba` apuntan a scripts reales.
- `config/feature-flags.json`: las 8 claves son exactamente las intencionales; todas tienen lector. Sin propuestas.
- `app/(app)/admin/categorias/client_page.tsx`: ya se eliminó el fetch duplicado del mount y el estado `deletingId`; el cambio va en la dirección del recorte.
- `filtrarCatalogos` conserva `export` porque lo importa `__tests__/catalogos-utils.test.ts:10`. `hexToRgb` (notas-venta) y los tipos locales de fila de `inversion-mercaderia` / `catalogo/admin` se leen una sola vez: no hay duplicado que cobrar.
- `hooks/useShareImage.ts`, `components/ProductDrawer.tsx`, `components/CarritoDrawer.tsx`, `lib/pedidos/precios.ts`, `lib/precio-catalogo.ts`, `middleware.ts`, `scripts/seed-core.ts`: cambios de tipos, mensajes de error o fórmula de precio; sin código muerto nuevo.

net: -~190 líneas (≈-58 guards, -50 sesión, -39 errores, -19 filas, -17 `Marca`, -12 `CONTEO`, -8 tipos + 78 casts), 0 deps.
