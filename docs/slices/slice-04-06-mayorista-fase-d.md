
## Corte 4a+4b — precio_mayor (schema + APIs de productos)
- Archivos: `migrations/040_productos_precio_mayor.sql` (CHECK `> 0`), `scripts/migrations-order.ts`, `__tests__/slice-00-schema.test.ts` (039->040), `types/index.ts` (`precio_mayor?`), `lib/precio-mayor.ts` (validador estricto: number entero > 0 o null), `app/api/productos/route.ts` (POST + GET), `app/api/productos/[id]/route.ts` (WHITELIST + validacion).
- Tests: `__tests__/api/productos-precio-mayor.test.ts` (nuevo, 28).
- Resultado: 27 suites relacionadas, 268 verdes, 4 rojos no atribuibles al corte:
  - `productos-crear-duplicado` (2): DB real, 500 hasta que 040 se aplique en Neon (accion del Director Tecnico).
  - `productos-crear-smoke` (1) y `productos-stock-minimo-ui` (1): buscan labels en PreciosClient ("Unidades por caja", "Stock minimo"); no tocan archivos del corte (probable preexistente).
- tsc: 3 errores fuera de tests (sin cambio).

## Corte 4c — UI precio_mayor (flag `precio-mayorista-ui`, false)
- Archivos: `components/ProductDrawer.tsx`, `components/ProductCard.tsx`, `app/(app)/precios/client_page.tsx`, `config/feature-flags.json`, `__tests__/slice-03-sin-powersync.test.ts` (13 -> 14 flags), nuevo `__tests__/precio-mayorista-ui.test.tsx` (9 tests).
- Fase B: 5 rojos por la razon correcta (UI inexistente); los negativos (flag off, null, ocultarPrecios) ya en verde.
- Fase D: 80/83 suites verdes (725/730 tests). Fallan `productos-crear-smoke` y `productos-stock-minimo-ui` (labels de PreciosClient, ya reportados en 4a+4b) y `notas-venta-stock-frontend` (`useParams` sin mock): no tocados por el corte; sin baseline verificado (stash no permitido).
- tsc: 3 errores fuera de tests (sin cambio).

## Corte 5a+5b — subtotal generado + items por modalidad
- 5a — Schema y totales servidor:
  - `migrations/041_prenota_items_modalidad_subtotal.sql` (nuevo, idempotente): `modalidad TEXT NOT NULL DEFAULT 'unidad' CHECK ('unidad','caja')` y `subtotal NUMERIC(14,2) GENERATED ALWAYS AS (CASE WHEN modalidad='caja' THEN cajas*precio ELSE unidades*precio END) STORED`.
  - `scripts/migrations-order.ts` (041 al final), `__tests__/slice-00-schema.test.ts` y `__tests__/api/productos-precio-mayor.test.ts` (ultima = 041).
  - 8 SQL `SUM(pi.unidades * pi.precio)` -> `SUM(pi.subtotal)`: notas-venta/route, deudores, [id]/pagar, [id]/aplicar-saldo-favor, caja/{nota-busqueda, notas/[kcodcli2], resumen/[kcodcli2], movimientos/[id]/notas}. JS servidor `[id]/route.ts` GET -> `Number(i.subtotal ?? 0)`.
- 5b — API de items + propagacion H1:
  - `items/route.ts` POST: `modalidad` (default `unidad`, otro -> 400). En `caja` exige `cajas` entero >= 1 y producto con `precio_mayor` entero > 0 y `cantcaja >= 1`; deriva `unidades = cajas * cantcaja` (ignora body) y el stock se descuenta con ese valor. INSERT incluye `modalidad`. Idempotencia por `id` intacta.
  - `items/[itemId]/route.ts` PATCH: `modalidad` inmutable (cambio -> 400); en `caja` ignora `body.unidades`, deriva `cajas * (unidades/cajas)` con la razon congelada (`cajas=0` -> 422) y valida `cajas` entero >= 1.
  - `productos/[id]/route.ts` PUT (H1): `prcventa` propaga solo a items `modalidad='unidad'`; `precio_mayor` (no null) solo a `modalidad='caja'`; mismo guard de notas activas sin pagos.
- Tests: nuevo `__tests__/api/slice5ab-modalidad.test.ts` (14). Ajustados: `slice-00-schema`, `productos-precio-mayor`, `prenotas` (fixture con `subtotal` + mocks de saldo a favor) y `debug/42p18-handler` (auto-skip mientras falten `modalidad`/`subtotal` en la DB de test, mismo patron que 035).
- Verificacion: 12 suites relacionadas verdes (206 tests). `npx tsc --noEmit`: 3 errores fuera de tests (`.next/*` x2 + `app/page.tsx`, preexistentes; sin cambios).
- Pendiente (Director Tecnico): aplicar 041 en Neon (`npm run migrate`, dos veces) y verificar `information_schema` antes de desplegar 5a/5b.

## Corte 5c+5d — detalle de nota: subtotal, modalidad, guard H4, exports
- Archivos: `app/(app)/notas-venta/[id]/client_page.tsx` (6 totales a `Number(item.subtotal)`; columna Modalidad y sufijo `/u`/`/caja`; edicion caja con `unidades` solo lectura y PATCH sin `unidades`; guard H4 `cajas=0`; Excel/PDF con Modalidad y subtotal; WhatsApp legacy cajas/uds + subtotal; linea `Tipo:` derivada localmente).
- Tests: nuevo `__tests__/slice5cd-detalle-modalidad.test.tsx` (9). Ajustados: `app/(app)/notas-venta/[id]/client_page.test.tsx` (mock `useParams` + se quito el smoke ARS obsoleto de slice 2), `__tests__/notas-venta-exportar-pdf.test.tsx` (fixture `subtotal`, 8 columnas, Modalidad), `__tests__/notas-venta-auto-focus.test.tsx` (header Precio + subtotal).
- Fase B: 8 rojos por la razon correcta (modalidad/subtotal/exportes ausentes); el PATCH de item unidad ya pasaba (regresion).
- Fase D: 17 suites verdes, 201 tests verdes. Unica falla: `__tests__/notas-venta-stock-frontend.test.tsx` (3, preexistente: mock de `next/navigation` sin `useParams`; mismo baseline antes del corte).
- Guard estatico `unidades*precio` en `app/components/lib`: 0 lineas. `npx tsc --noEmit`: 3 errores fuera de tests (sin cambio).
- Tamano: 247 lineas anadidas + ~24 modificadas, por encima del limite de 200 (5c+5d fusionados); ambas partes quedaron verdes.

## Corte 5e+5f — selector Unidad/Caja y tipo de nota (flag `notas-venta-modalidad`, false)
- Archivos: `components/AgregarANotaVentaModal.tsx` (prop `precio_mayor`, selector Unidad/Caja tras flag, Caja deshabilitado si `precio_mayor == null || cantcaja <= 0`, precio default `prcventa`/`precio_mayor`, "N unidades" solo en caja, body con `modalidad`); `app/(app)/notas-venta/[id]/client_page.tsx` (alta rapida manda `modalidad:'unidad'`; header: badge `mayor|menor|mixta` con flag, texto `Tipo:` sin flag); `app/(app)/notas-venta/client_page.tsx` (`Prenota.tipo`, badge en fila tras flag); `app/api/notas-venta/route.ts` (subquery `CASE ... BOOL_AND(...) AS tipo`); `app/api/notas-venta/[id]/route.ts` (GET calcula `tipo` en JS desde `items`); `config/feature-flags.json` (`notas-venta-modalidad: false`).
- Tests: nuevos `__tests__/slice5ef-modal-modalidad.test.tsx` (5), `__tests__/slice5ef-tipo-nota.test.tsx` (2), `__tests__/slice5ef-api-tipo.test.ts` (2). Ajustados: `__tests__/api/prenotas.test.ts` (respuesta GET incluye `tipo:'menor'`), `__tests__/slice-03-sin-powersync.test.ts` (conteo de flags 14 -> 15), `__tests__/notas-venta-stock-frontend.test.tsx` (mock `useParams` + `confirm`; falla preexistente de 5c/5d).
- Fase B: 8 rojos por la razon correcta (sin selector, sin badge, sin `tipo` en API).
- Fase D: 40 suites verdes, 362 tests verdes (incluye co-ubicados y todo test que importa/menciona los archivos tocados).
- `npx tsc --noEmit`: 3 errores fuera de tests (sin cambio); errores de tests preexistentes.
- Tamano: 62 lineas modificadas + 136 lineas de tests nuevos = 198 (bajo el limite de 200).

