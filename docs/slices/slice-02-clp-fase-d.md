# Slice 2 — CLP única moneda — Fase D (Verificación)

## Sub-slice 2a

**Archivos (producción):** `lib/utils.ts` (+`formatCLP`; `formatUSD`/`formatArsEquivalente` se mantienen hasta 2e), `lib/calcular-precio.ts`, `lib/inversion-mercaderia.ts` (borra `formatUsd`, `round2` = `Math.round`), `contexts/CarritoContext.tsx`, `components/{ProductCard,ProductDrawer,CarritoDrawer,LandingPage}.tsx`, `app/productos/{page,client_page}.tsx`, `app/catalogo/[slug]/{page,client_page}.tsx` (sin consulta a `caja_config`), `app/(app)/{precios,pedidos,clientes,admin/inversion-mercaderia}/client_page.tsx` (precios ya no llama `/api/caja/config`).

**Tests:** nuevo `__tests__/slice2a-clp.test.ts` (formatCLP + guard acotado a los 15 archivos del corte). Adaptados: calcular-precio, carrito, catalog-footer, catalogo-print, slice-landing-v2, app/pedidos, inversion-mercaderia-{calc,ui,ui-logic}, ProductCard, ProductDrawer, precios/client_page.

**Resultado:** Fase B en rojo (41 tests, formatCLP inexistente / formatos viejos). Fase D: 42/44 suites verdes (413/415 tests). Los 2 rojos (`productos-crear-smoke` "Unidades por caja", `productos-stock-minimo-ui` "Stock mínimo") son preexistentes: esos textos no existen en `precios/client_page.tsx` de HEAD. `tsc --noEmit`: 3 errores fuera de tests (igual que antes: 2 en `.next/types`, `app/page.tsx`).

**Fuera del corte (pendiente):** `ProductCard-prenota.test.tsx`/otros no tocados siguen verdes. `formatSaldoPendiente` (en-US) queda para 2b. Sin flag (reemplazo de comportamiento).

**Corrección 2a:** `app/(app)/clientes/client_page.test.tsx` TEST 4 y 6 ajustados a "Saldo a favor: $40" (formatCLP). Borrado con `git rm` `__tests__/slice4-clp-ars-smoke.test.ts` (afirmaba ARS/USD, contradice el Slice 2).
