# Slice 2 — CLP única moneda — Fase D (Verificación)

## Sub-slice 2a

**Archivos (producción):** `lib/utils.ts` (+`formatCLP`; `formatUSD`/`formatArsEquivalente` se mantienen hasta 2e), `lib/calcular-precio.ts`, `lib/inversion-mercaderia.ts` (borra `formatUsd`, `round2` = `Math.round`), `contexts/CarritoContext.tsx`, `components/{ProductCard,ProductDrawer,CarritoDrawer,LandingPage}.tsx`, `app/productos/{page,client_page}.tsx`, `app/catalogo/[slug]/{page,client_page}.tsx` (sin consulta a `caja_config`), `app/(app)/{precios,pedidos,clientes,admin/inversion-mercaderia}/client_page.tsx` (precios ya no llama `/api/caja/config`).

**Tests:** nuevo `__tests__/slice2a-clp.test.ts` (formatCLP + guard acotado a los 15 archivos del corte). Adaptados: calcular-precio, carrito, catalog-footer, catalogo-print, slice-landing-v2, app/pedidos, inversion-mercaderia-{calc,ui,ui-logic}, ProductCard, ProductDrawer, precios/client_page.

**Resultado:** Fase B en rojo (41 tests, formatCLP inexistente / formatos viejos). Fase D: 42/44 suites verdes (413/415 tests). Los 2 rojos (`productos-crear-smoke` "Unidades por caja", `productos-stock-minimo-ui` "Stock mínimo") son preexistentes: esos textos no existen en `precios/client_page.tsx` de HEAD. `tsc --noEmit`: 3 errores fuera de tests (igual que antes: 2 en `.next/types`, `app/page.tsx`).

**Fuera del corte (pendiente):** `ProductCard-prenota.test.tsx`/otros no tocados siguen verdes. `formatSaldoPendiente` (en-US) queda para 2b. Sin flag (reemplazo de comportamiento).

**Corrección 2a:** `app/(app)/clientes/client_page.test.tsx` TEST 4 y 6 ajustados a "Saldo a favor: $40" (formatCLP). Borrado con `git rm` `__tests__/slice4-clp-ars-smoke.test.ts` (afirmaba ARS/USD, contradice el Slice 2).

## Sub-slice 2b

**Archivos (producción):** `lib/utils.ts` (`formatSaldoPendiente` → `formatCLP`), `app/(app)/notas-venta/[id]/client_page.tsx` (UI, PDF, WhatsApp, Excel en CLP; sin `dolarDia`, sin fetch a `/api/caja/config`, `paraPdf` eliminado), `app/(app)/notas-venta/client_page.tsx`, `app/(app)/deudores/client_page.tsx`, `components/{AgregarANotaVentaModal,AplicarSaldoFavorDialog}.tsx`, `app/api/notas-venta/[id]/route.ts` y `aplicar-saldo-favor/route.ts` (mensajes con `formatCLP`).

**Tests:** nuevo `__tests__/slice2b-clp.test.ts` (formatSaldoPendiente + guard sobre los 7 archivos del corte). Adaptados: notas-venta-exportar-pdf (bloque ARS → CLP), notas-venta-pendiente, notas-venta-auto-focus, deudores-whatsapp, notas-venta-stock-frontend (mock `dolar_dia` retirado).

**Resultado:** Fase B en rojo (8/9). Fase D sobre 45 suites relacionadas: 14 tests fallidos antes y 14 después (los mismos, baseline heredado: `notas-venta/[id]/client_page.test.tsx`, `notas-venta-stock-frontend`, `api/prenotas`, `items/route.test`); 0 regresiones, +8 tests verdes. `tsc --noEmit`: 3 errores fuera de tests (sin cambio). `saldo-favor.test.ts` (pagar, ARS) y `PagarNotaDialog` quedan para 2c/2e. Sin flag.

## Sub-slice 2c — backend de caja (CLP)

**Archivos (prod)**: `docs/specs/caja-mayor.spec.ts` (schemas sin `moneda`, `monto` `.int()`, `formatMonto(n,_m?)` es-CL, `roundUpToHalf` se queda transitorio para caja-mayor/client_page hasta 2d/2e), `types/index.ts` (comentario legado), `caja/movimientos` (GET/POST), `caja/movimientos/[id]` (PATCH R27 entero, mensaje `formatCLP`), `[id]/notas`, `notas-venta/[id]/pagar`, `[id]/reembolsar`, `caja/resumen/[kcodcli2]`, `caja/export`, `caja/cuentas`, `cuentas/[id]`, `cierres`, `resumen-cuentas`, `saldos-iniciales`.
**Decisiones**: API ignora `moneda` e inserta `'CLP'`; sin DDL; sin flag (reemplazo de comportamiento). Campos `moneda`/`monto_usd`/`tipo_cambio` quedan como opcionales/legado en interfaces del spec porque la UI (2d) aún los referencia; `resumen` mantiene `monto_usd` = monto aplicado (transitorio, se borra en 2d).
**Tests**: reescritos `slice32-pagar-nota`, `api/saldo-favor` (T4), `slice4-formatMonto` (1 caso), `caja/movimientos/route.test`; nuevo `slice2c-movimientos-clp` (PATCH 20000→15000, decimal 400). Contrato §4 tests 3, 4, 5 cubiertos. Test 6/7 (saldo, reembolso) siguen verdes con mocks existentes (35b, 35d, bug010); no se agregó aserción nueva de `moneda='CLP'` en reembolso.
**Resultado**: Fase B roja (route.test 5 fail, slice32 8 fail). Fase D: jest del corte + co-ubicados + menciones en verde. Fallos no atribuibles al corte (archivos no tocados): `api/prenotas` (cliente_saldo_favor), `api/catalogos-crud` (requiere DB), `notas-venta/[id]/client_page.test` (2b/ARS). `tsc --noEmit` fuera de tests: 3 (igual que la base).

## Sub-slice 2d — caja-mayor UI (CLP)

**Archivos (prod):** `app/(app)/caja-mayor/client_page.tsx` (sin `dolarDia`/`dolarVigente`, `moneda`/`editMoneda`, `montoUSD`→`montoNum`; banner dólar, selects de moneda, preview ARS→USD y bloque usd/clp de cierres eliminados; montos con `formatCLP`; Excel con una columna "Monto"; cuentas sin filtro por moneda; "Bazar Naty"→"La Esquina"), `app/(app)/caja-mayor/page.tsx` (sin query `dolar_dia` ni prop).
**Tests:** `app/(app)/caja-mayor/client_page.test.tsx` reescrito (4: sin fetch a `/api/caja/config`; CLP sin USD/ARS/Dólar/Moneda; POST sin `moneda` y monto entero; Excel con columna Monto y sin ARS/USD). `__tests__/caja-mayor-bug054-ui.test.tsx`: se quita prop `dolarDia`.
**Resultado:** Fase B roja 4/4 (config 1≠0, sin `$12.345`). Fase D: 9 suites (corte + co-ubicados + menciones: bug054, fetchmovimientos, slice-03, slice19, slice13, permisos, bug010, slice35e) 128/128 verdes. `tsc --noEmit` fuera de tests: 3 (igual). Sin flag.
**Pendiente / legado:** `page.tsx` aún selecciona `moneda` de `caja_cuentas` (el tipo `Cuenta` la exige; se quita en 2e con `types/index.ts`). `client_page` lee `PagoDetalle.monto_usd` (= monto aplicado, transitorio de 2c) para el detalle de pagos. Tolerancias `0.005` se dejan (inocuas con enteros).

## Sub-slice 2e — cierre (caja-config, PagarNotaDialog, limpieza de legado)

**Archivos (prod):** `app/(app)/admin/caja-config/client_page.tsx` (sin bloque dólar, sin moneda en cuentas/saldos, 2 fetch), `components/PagarNotaDialog.tsx` (sin `/api/caja/config`, sin moneda, monto entero), `app/(app)/caja-mayor/{client_page,page}.tsx` (`PagoDetalle.monto`; page sin `moneda`), `app/api/caja/resumen/[kcodcli2]/route.ts` (devuelve `monto`, no `monto_usd`), `docs/specs/caja-mayor.spec.ts` (sin `CajaConfig*`, `roundUpToHalf`, 2º arg de `formatMonto`, campos `moneda`/`monto_usd`/`tipo_cambio`), `types/index.ts` (`Cuenta` sin `moneda`), `lib/utils.ts` (sin `formatUSD`/`formatArsEquivalente`).
**Borrados (`git rm`):** `app/api/caja/config/route.ts`, `__tests__/format-ars-equivalente.test.ts` (`slice4-clp-ars-smoke` no existía).
**Tests:** nuevo `__tests__/slice2-clp-guard.test.ts` (contrato §4 test 1 + config borrada); reescritos `__tests__/caja-config-client_page.test.tsx`, `__tests__/slice4-formatMonto.test.ts`, `app/(app)/admin/caja-config/client_page.test.tsx`.
**Resultado:** Fase B roja (guard con ~60 hallazgos). Fase D verde en corte + co-ubicados + menciones. Fallos heredados en archivos no tocados (`useParams` sin mock en `notas-venta/[id]`, `api/prenotas`, `api/catalogos-crud`). Sin flag.
