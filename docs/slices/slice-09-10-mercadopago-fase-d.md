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
