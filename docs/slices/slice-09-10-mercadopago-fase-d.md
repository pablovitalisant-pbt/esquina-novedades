# Fase D — Slices 9-10: Mercado Pago

## Sub-slice 9a — Migración 044 + usuario sistema

Fecha: 2026-10-22.

### Archivos

- `migrations/044_mercadopago.sql` (nuevo): columnas `mp_init_point`,
  `mp_fecha_pago`, `mp_revision_motivo`, `caja_movimiento_id UUID` FK a
  `caja_movimientos` (SET NULL), CHECK de estado con `revision`, índice único
  parcial del cobro e INSERT idempotente del usuario sistema `SISTEMA-MP`
  (`rol='vendedor'`, `activo=false`, password `'!'` que bcrypt nunca acepta).
- `scripts/migrations-order.ts`: 044 al final.
- `__tests__/mercadopago-044-schema.test.ts` (nuevo).
- `__tests__/slice-00-schema.test.ts`: última migración = 044.
- `__tests__/api/productos-precio-mayor.test.ts`: última migración = 044.
- `__tests__/api/entrega-opciones.test.ts`: la aserción de orden ya no fija el
  cierre del array (no se rompe al agregar migraciones).

### Tests

- `npx jest __tests__/mercadopago-044-schema.test.ts __tests__/slice-00-schema.test.ts __tests__/api/productos-precio-mayor.test.ts __tests__/api/entrega-opciones.test.ts __tests__/api/slice5ab-modalidad.test.ts`
  → 5 suites, 92 tests, todos en verde.
- ROJO verificado antes de implementar (044 inexistente y orden sin 044).
- `npx tsc --noEmit`: sin errores nuevos fuera de tests (2 preexistentes).

## Sub-slice 9b — Cliente/config MP + builder de preferencia

Fecha: 2026-10-22.

### Archivos

- `lib/mercadopago/config.ts` (nuevo): `mpConfig()` (token + timeout 10 s,
  error claro sin filtrar el token), `siteUrl()` (sin barra final, exige URL
  absoluta), `TOLERANCIA_SEGUNDOS=300` y `elegirInitPoint()` — única función
  que decide `sandbox_init_point` si el token empieza con `TEST-`, si no
  `init_point`.
- `lib/pedidos/preferencia.ts` (nuevo): `construirItemsPreferencia()` y
  `construirPreferencia()` puras (CLP entero, despacho solo si costo > 0,
  `external_reference`, `payer.email`, `notification_url`, 3 `back_urls`,
  `auto_return='approved'`, `expires`, `expiration_date_to` desde
  `pedidos.expira_en`).
- `__tests__/api/mercadopago-preferencia.test.ts` (nuevo): 6 tests puros.

Decisión de alcance: `crearPreferenciaPedido()` (llamada real al SDK) pasa a
9c, junto al route que la usa; el corte 9b queda en builder puro, config e
init point. Total del corte: 200 líneas exactas.

### Resultado

- ROJO verificado antes de implementar (módulos inexistentes).
- `npx jest __tests__/api/mercadopago-preferencia.test.ts` → 1 suite,
  6 tests en verde.
- Sin tests co-ubicados ni otros tests que importen estos archivos (grep).
- `npx tsc --noEmit`: 0 errores nuevos; se mantienen los preexistentes fuera
  de tests (2 en este entorno: `.next/types` y `app/page.tsx`).
