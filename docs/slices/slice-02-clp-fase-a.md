# Slice 2 — CLP única moneda — Fase A (Contrato)

Fuente: PRD §8.2 ("Solo CLP, sin decimales en la UI"), §9 fila 2, §10, Zonas de riesgo.
Solo documento; no se escribió código.

## 0. Decisiones (Director Técnico) + decisión propia

- Moneda única CLP, enteros, formato `es-CL` → `Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0})` ⇒ `1234567 → "$1.234.567"`.
- Se elimina USD/ARS/tipo de cambio/`dolar_dia`/equivalentes. Sin DDL (columnas `moneda`, `monto_usd`, `tipo_cambio` se conservan en DB; `monto_usd`/`tipo_cambio` no se referencian más en código → quedan NULL por default).
- **Validación API (decisión propia): IGNORAR `moneda` en el input y forzar `'CLP'` en el servidor.** Se quita el campo de los schemas zod (zod descarta claves desconocidas) y el INSERT escribe el literal `'CLP'`. Razón: un solo camino de código, sin 400 nuevos, clientes viejos/colas no rompen. Rechazar con `z.literal('CLP')` agrega un camino de error que nadie usa.
- Montos de entrada: `z.number().int().positive()` (nuevo; hoy admite decimales). `NUMERIC(12,2)` en DB se mantiene; llega como `"1234.00"` y se lee con `parseFloat`/`Number`, sin cambio de lectura.
- Sin migración de datos: la DB es nueva (Slice 0: solo seed empresa + admin). Si hubiera movimientos con `moneda='ARS'`/`'USD'` previos, esta contrato NO los convierte (verificar con `SELECT moneda,count(*) FROM caja_movimientos GROUP BY 1` antes de cerrar el slice 2e).
- `caja_config.dolar_dia`: la fila queda inerte en DB (no se borra; sin DDL). La tabla `caja_config` no se elimina.

## 1. Inventario (producción; grep de USD|ARS|monto_usd|tipo_cambio|dolar|formatMonto|toFixed|es-BO|NumberFormat|moneda; hooks/, utils/, scripts/ = 0 coincidencias)

### Núcleo de formato / tipos
| Archivo | Cambio |
|---|---|
| `lib/utils.ts` | `formatUSD` (en-US, USD, 2 dec) → nueva `formatCLP`; borrar `formatArsEquivalente` (2e) |
| `docs/specs/caja-mayor.spec.ts` (importado por producción) | borrar `roundUpToHalf`; `formatMonto(n)` solo CLP entero; quitar `moneda` de `CajaCuentaCreate/Update/MovimientoCreate/Update` schemas e interfaces (`z.enum(["USD","ARS"])` líneas 24,31,63,81; tipos 42,132) |
| `types/index.ts:10` | `Cuenta.moneda: "USD"\|"ARS"` → quitar campo |
| `lib/inversion-mercaderia.ts:40-45` | `formatUsd` ("USD", en-US, 2 dec) → delegar a `formatCLP`; `round2` → `Math.round` |
| `lib/calcular-precio.ts:7` | `Math.round(x*100)/100` → `Math.round(x)` (margen entero) |
| `contexts/CarritoContext.tsx:26,56,61,126` | quitar `dolarDia` (prop, tipo, value) |

### API (todas bajo `app/api`)
| Archivo | Cambio |
|---|---|
| `caja/config/route.ts` | solo maneja `dolar_dia` → **borrar ruta** (y su test) |
| `caja/movimientos/route.ts` (36-37, 190-250) | quitar rama ARS→USD, `tipo_cambio_capturado`, lectura de `dolar_dia`; INSERT con `moneda='CLP'`, sin `monto_usd`/`tipo_cambio`; SELECT sin esas columnas |
| `caja/movimientos/[id]/route.ts` (70-175) | quitar recálculo por dólar; R27 (auto-ajuste imputaciones) compara `monto` nuevo vs anterior, tolerancia `0.005` → `0`; mensaje sin "USD"/`toFixed(2)` |
| `caja/movimientos/[id]/notas/route.ts` (38,65,111,123) | `montoDisponibleUsd = parseFloat(mov.monto_usd ?? mov.monto)` → `Number(mov.monto)`; mensajes con `formatMonto` |
| `notas-venta/[id]/pagar/route.ts` (11,96-183) | quitar `moneda` del schema, rama ARS, `monto_usd`/`tipo_cambio`; `montoAplicado = min(monto, saldoPendiente)`; excedente = `monto - saldoPendiente`; INSERT con `'CLP'`; quitar `monto_usd`/`tipo_cambio` del CTE `mov` y RETURNING |
| `notas-venta/[id]/reembolsar/route.ts` (49,85-92) | copiar `monto` (no `monto_usd`/`tipo_cambio`); `moneda` fija `'CLP'` |
| `notas-venta/[id]/aplicar-saldo-favor/route.ts:95`, `notas-venta/[id]/route.ts:174` | mensajes `toFixed(2)` → `formatCLP` |
| `caja/resumen/[kcodcli2]/route.ts` (39-83) | quitar `pago_monto_usd`/`tipo_cambio`/`moneda_original`; `total_pagado += monto_aplicado` |
| `caja/export/route.ts` (19,28-39) | quitar columnas `monto_usd`/`tipo_cambio` y filtro `moneda` |
| `caja/cuentas/route.ts`, `cuentas/[id]/route.ts` | quitar filtro `?moneda=` y campo `moneda` de zod; INSERT `'CLP'`; `moneda = COALESCE(...)` del PATCH se elimina |
| `caja/cierres/route.ts:98,150`, `resumen-cuentas/route.ts:19-42`, `saldos-iniciales/route.ts:23-82` | quitar cast `as "USD"\|"ARS"`, `cuenta_moneda`, default `"USD"`; agrupar por cuenta (ya lo hace) |
| `caja/nota-busqueda`, `caja/notas/[kcodcli2]` | solo importan del spec; revisar que compilen tras cambio del spec |

### UI
| Archivo | Cambio |
|---|---|
| `(app)/caja-mayor/client_page.tsx` (≈84 líneas) | quitar `dolarDia/dolarVigente`, `moneda/editMoneda`, `montoUSD`, banner "Dólar del día", selects moneda (925-936, 1052, 1438), preview ARS→USD (941-944), columnas Excel ARS/USD (592-644) → una columna "Monto"; `formatMonto(x)`; textos "USD"/"Bazar Naty" (761,901) → CLP/La Esquina; filtro "Todas monedas"; bloque `usd/clp` de cierres (1156-1183) |
| `(app)/caja-mayor/page.tsx:21-35` | quitar query `dolar_dia` y prop |
| `(app)/admin/caja-config/client_page.tsx` (≈34) | quitar bloque dólar (state, fetch, `handleSaveDolar`, input "Valor USD a ARS"), `moneda` en formulario/badges de cuenta |
| `(app)/notas-venta/[id]/client_page.tsx` (≈37) | `dolarDia` + `formatArsEquivalente` (≈12 sitios), `toFixed(2)` → `formatCLP`; labels "Precio USD"/"Total USD" (182,480-481); PDF/WhatsApp `USD$…` y `toLocaleString('en-US')` (592-754) |
| `(app)/notas-venta/client_page.tsx` (32,89,204) y `(app)/deudores/client_page.tsx` (27,133) | quitar `dolarDia`, fetch config y línea ARS |
| `(app)/precios/client_page.tsx` (32,252,357,373) | quitar `dolarDia`; `toFixed(2)` → `formatCLP`; no pasar `dolarDia` a hijos |
| `(app)/clientes/client_page.tsx:172`, `(app)/pedidos/client_page.tsx:8,194`, `(app)/admin/inversion-mercaderia/client_page.tsx` | `toFixed(2)`/`formatUSD` → `formatCLP` |
| `components/PagarNotaDialog.tsx` | quitar `dolarDia`, `moneda`, selección por moneda, `step` 0.01 → 1, `Math.floor(saldo*dolar)` |
| `components/AplicarSaldoFavorDialog.tsx`, `AgregarANotaVentaModal.tsx:173` | `toFixed(2)` → `formatCLP`; label "Precio USD" → "Precio" |
| `components/ProductCard.tsx`, `ProductDrawer.tsx` | quitar prop `dolarDia`, `formatArsEquivalente`; "Precios (USD)" → "Precios (CLP)"; share text `USD …` → `formatCLP` (308-315); `toFixed(2)` |
| `components/CarritoDrawer.tsx`, `LandingPage.tsx` ("Precios en USD", l.89) | `formatCLP`, quitar equivalente ARS |
| `app/catalogo/[slug]/{page,client_page}.tsx`, `app/productos/{page,client_page}.tsx` | quitar query `dolar_dia` y prop `dolarDia`; `formatCLP` |

Tests (excluidos del inventario, a actualizar; listados aparte): `slice4-clp-ars-smoke`, `format-ars-equivalente` (borrar), `slice4-formatMonto` (reescribir), `slice32-pagar-nota` (55 refs), `slice35b-reembolso-prenotas`, `slice35d-reportes-caja`, `api/saldo-favor`, `api/bug006-…`, `api/bug008-…`, `bug010-saldo-anterior`, `caja-mayor-fetchmovimientos`, `caja-mayor-bug054-ui`, `carrito`, `catalog-footer`, `catalogo-print`, `inversion-mercaderia-ui(-logic)`, `notas-venta-exportar-pdf` (20), `notas-venta-pagar-lista`, `notas-venta-stock-frontend`, `slice-landing-v2`, `slice13-repunte-smoke`, `slice35a-schema-prenotas`, `components/__tests__/ProductCard.test.tsx`, `components/ProductDrawer.test.tsx`, `app/(app)/admin/caja-config/client_page.test.tsx`, `caja-config-client_page.test.tsx`, `app/(app)/caja-mayor/client_page.test.tsx`, `app/(app)/notas-venta/[id]/client_page.test.tsx`, `app/(app)/precios/client_page.test.tsx`, `app/api/caja/movimientos/route.test.ts`, `__tests__/app/pedidos/client_page.test.tsx`.

## 2. Revisión de impacto lateral

- **Tipos compartidos**: `types/index.ts` (`Cuenta`), spec `caja-mayor.spec.ts` (consumido por ≥10 rutas/páginas), `CarritoContext` → todos incluidos arriba.
- **APIs de caja**: movimientos, notas, pagar, reembolsar, resumen, export, cuentas, cierres, saldos-iniciales incluidos. Deudores/saldo a favor: la lógica ya sumaba `monto_aplicado` / `saldo_favor`; no leen `monto_usd` (grep: solo los 9 archivos listados) → sin cambio de lógica, solo formato. `saldo_favor` pasa a CLP entero por construcción (excedente = monto − saldo).
- **Export Excel (caja-mayor y notas) y PDF/WhatsApp de notas**: incluidos (client_page de caja-mayor y notas-venta/[id]); `/api/caja/export` pierde columnas `monto_usd`/`tipo_cambio`.
- **Catálogo público / tienda**: `catalogo/[slug]`, `productos`, `ProductCard/Drawer`, `CarritoDrawer/Context`, `LandingPage` incluidos; las páginas server dejan de consultar `caja_config`.
- **Schema/migraciones**: ninguno (columnas se conservan). `scripts/migrations-order.ts` NO se toca (Zona de riesgo). Si una migración nueva resultara imprescindible (p. ej. borrar fila `dolar_dia`), va al final de `MIGRATION_ORDER`; hoy no se requiere.
- **Middleware/permisos/env/feature flags**: sin referencias a moneda (grep config/, scripts/, middleware.ts, public/ = 0). Ningún flag nuevo; el slice no se oculta tras flag porque es reemplazo de comportamiento (Fase D lo registra como excepción justificada).
- **Navegación**: `caja-config` sigue existiendo (cuentas, saldos iniciales); solo pierde el bloque dólar. Sin cambios de menú.
- **Señal 1 (zonas frágiles)**: Zonas de riesgo del PRD solo lista `migrations-order.ts` (no se toca). BUGS.md local: BUG-056 (monto_usd stale al editar movimiento) toca `movimientos/[id]` y la tabla de caja-mayor → este slice elimina su causa (ya no existe `monto_usd`); su test debe seguir verde o retirarse. `docs/referencia-bazar-naty/BUGS.md` (20 refs a moneda/monto_usd): aplica a `pagar`, `movimientos`, `reembolsar` → los tests de esos flujos (slice32, slice35b) son la red de seguridad y se adaptan, no se borran.
- **Archivos existentes que deben cambiar**: todos los de §1 (no se difiere ninguno).

## 3. Sub-slices (≤200 líneas añadidas/modificadas; borrar no cuenta; cada uno build+tests verdes)

Orden pensado para no romper: `formatCLP` se agrega primero; `formatUSD/formatArsEquivalente/roundUpToHalf` solo se borran al final, cuando ya no tienen usuarios; backend ignora `moneda` antes de que la UI la deje de enviar.

| # | Contenido | Est. líneas |
|---|---|---|
| 2a | `lib/utils` (+`formatCLP`), `calcular-precio`, `inversion-mercaderia`, tienda pública + producto: ProductCard/Drawer, CarritoDrawer/Context, LandingPage, catalogo, productos (page+client), precios, pedidos, clientes, inversion-mercaderia UI + tests asociados | ~150 |
| 2b | Notas de venta: `[id]/client_page` (PDF/WhatsApp/Excel), lista, AgregarANotaVentaModal, AplicarSaldoFavorDialog, deudores, mensajes de `notas-venta/[id]/route` y `aplicar-saldo-favor` + tests (pdf, pagar-lista, stock-frontend, saldo-favor) | ~170 |
| 2c | Backend caja: spec (schemas sin `moneda`, `formatMonto(n, _m?)` transitorio), types, movimientos POST/PATCH/notas, pagar, reembolsar, resumen, export, cuentas, cierres, resumen-cuentas, saldos-iniciales + tests (slice32, 35b, 35d, bug006/008/010, route.test) | ~190 |
| 2d | `caja-mayor` client_page + page.tsx (sin dólar/moneda, una columna Excel) + sus tests | ~190 |
| 2e | `caja-config` (quitar dólar y moneda de cuentas), `PagarNotaDialog`, borrar `api/caja/config`, borrar `formatUSD/formatArsEquivalente/roundUpToHalf` y 2º arg de `formatMonto`; borrar `format-ars-equivalente` y `slice4-clp-ars-smoke`; **test guard** (§4) | ~120 |

Si 2c o 2d superan 200 líneas medidas con `git diff --stat`, se parte en dos (movimientos / pagos-reembolso; tabla / formulario) antes de pedir commit.

## 4. Riesgos (checklist PBT-IA) y tests que intentan romperlo

Riesgos: (1) `NUMERIC(12,2)` devuelve string → siempre `Number()` antes de formatear; (2) saldo/imputación con tolerancia `0.005` se vuelve igualdad entera (R27 en PATCH); (3) datos históricos con otra moneda (ver §0); (4) `formatMonto`/spec importado por producción desde `docs/` — no moverlo en este slice (alcance), anotar para ponytail audit; (5) Intl `es-CL` depende de ICU de Node/Jest — el test lo verifica; (6) montos decimales de clientes viejos → ahora 400 por `.int()`; (7) `precios`/`calcular-precio` pasa de 2 decimales a entero: costo 990 × 1.15 = 1138.5 → 1139 (documentado); (8) `ProductDrawer` es zona con tests densos (11 refs) — adaptar, no borrar.

Tests nuevos (Fase B, deben fallar antes de implementar):
1. **Guard** `__tests__/slice2-clp-guard.test.ts`: recorre `app components lib contexts hooks types docs/specs` (excluye `*.test.*`, `__tests__`) y falla si encuentra `\bUSD\b|\bARS\b|monto_usd|tipo_cambio|dolar|formatUSD|formatArsEquivalente|roundUpToHalf|es-BO|en-US|toFixed\(` .
2. `formatCLP(1234567) === "$1.234.567"`; `formatCLP(0) === "$0"`; `formatCLP(1234.6) === "$1.235"`; `formatCLP(NaN)`/`null` no lanza ("—").
3. Pagar: monto 15000 vs saldo 10000 → `montoAplicado=10000`, excedente `5000` (enteros, sin `.00`); `body.moneda='ARS'` se ignora y se inserta `'CLP'`; monto `100.5` → 400.
4. Movimiento POST sin `dolar_dia` en caja_config → 201 (antes 400 con ARS); no se ejecuta SELECT a `caja_config`; INSERT no contiene `monto_usd`/`tipo_cambio`.
5. PATCH movimiento baja monto 20000→15000 con imputaciones 20000 → se ajustan a 15000 y el mensaje usa `formatCLP`.
6. Saldo de caja (resumen-cuentas / cierre): ingresos 10000 + 2500 − gasto 4000 = 8500, `Number.isInteger`.
7. Reembolso copia `monto` y `moneda='CLP'`; no referencia `monto_usd`.
8. Render: ProductCard/Drawer/Carrito/Landing/Catalogo no contienen texto "USD"/"ARS"/"≈" y muestran `$12.345`; `page.tsx` de catalogo/productos no consulta `caja_config`; `CarritoProvider` sin prop `dolarDia`.
9. Export Excel de caja: sin columnas ARS/USD; export PDF/WhatsApp de nota: `$12.345`, sin `USD$`.
10. Tests de `caja-config` ya no encuentran input "Valor USD a ARS"; `GET /api/caja/config` → 404.

## 5. Verificación

```
npx tsc --noEmit
npm run lint
npm run test
npm run build
npx jest __tests__/slice2-clp-guard.test.ts
git diff --stat            # ≤200 líneas añadidas por sub-slice
git grep -nE "\bUSD\b|\bARS\b|monto_usd|tipo_cambio|dolar|toFixed\(" -- app components lib contexts types docs/specs ':!*.test.*'
```
Verificación manual (npm run dev): cobro en caja-mayor, pago de nota con excedente → saldo a favor, export Excel, catálogo público y carrito.
