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

## Sub-slice 9c — POST /api/pedidos con pago online

Fecha: 2026-10-22.

### Archivos

- `app/api/pedidos/route.ts`: preflight MP (token, `NEXT_PUBLIC_SITE_URL`,
  `caja_config.mp_cuenta_id` + cuenta activa) → 503 sin reservar; `nombre` en
  el SELECT de entrega; `expira_en::text` en el RETURNING; tras el commit
  `crearPreferenciaPedido`; fallo de MP → `rechazarPedido` + 502; replay con
  `Idempotency-Key` reusa `mp_init_point` sin llamar al SDK (y crea la
  preferencia si la reserva sigue `pendiente_pago` sin init point).
- `lib/pedidos/preferencia.ts`: `crearPreferenciaPedido()` — relee pedido e
  ítems de DB, arma el body con el builder puro, `Preference.create` con
  `requestOptions.idempotencyKey = pedido.id`, exige `id`, elige init point y
  persiste solo con `estado='pendiente_pago'`.
- `lib/pedidos/rechazar.ts` (nuevo): `rechazarPedido()` idempotente — CTE con
  exclusión `estado='pendiente_pago'`, devuelve `pedido_items.unidades` a
  `productos` y `ubicaciones_bodega`, limpia `idempotency_key`.
- `lib/pedidos/precios.ts`: `OpcionEntrega.nombre?`.
- `__tests__/api/pedidos-mercadopago.test.ts` (nuevo): 9 tests con SDK
  mockeado (preflight, body/idempotencyKey, 502 + liberación, replay).
- `__tests__/api/pedidos-reserva.test.ts`: env + mocks de preflight y
  `crearPreferenciaPedido` para el flag `true`.

### Resultado

- ROJO verificado antes de implementar (route sin preflight/preferencia).
- `npx jest __tests__/api/pedidos-mercadopago.test.ts
  __tests__/api/mercadopago-preferencia.test.ts __tests__/api/pedidos.test.ts
  __tests__/api/pedidos-reserva.test.ts
  __tests__/api/pedidos-precios-server.test.ts` → 5 suites, 61 tests verdes.
- Tests co-ubicados: ninguno junto a los archivos tocados; grep sin otros
  imports.
- `npx tsc --noEmit`: 0 errores en archivos del corte; 2 fuera de tests
  (preexistentes, `.next/types` y `app/page.tsx`).

## Sub-slice 9d — página pública `/pedido/[id]` + redirect del carrito

Fecha: 2026-10-22.

### Archivos

- `app/pedido/[id]/page.tsx` (nuevo): server component `force-dynamic`;
  valida UUID antes de consultar (`notFound()` si no matchea o no existe);
  `liberarReservasVencidas()` en try/catch; muestra nombre, estado + mensaje,
  fecha, ítems (cantidad/modalidad/código/subtotal), entrega + costo y total.
  **No** selecciona ni renderiza teléfono, email ni dirección. Enlace "Pagar
  con Mercado Pago" solo si `pendiente_pago` + `mp_init_point` + no vencido.
- `middleware.ts`: excluye `pedido/` del matcher (con barra, `/pedidos` sigue
  staff).
- `components/CarritoDrawer.tsx`: si el 201 trae `data.init_point`, limpia,
  cierra y redirige; sin init point conserva el flujo actual (toast).
- `lib/redirigir.ts` (nuevo): `redirigirA()` aislado para poder testear la
  navegación (jsdom no permite mockear `location`).
- `__tests__/app/pedido/pedido-publico.test.tsx` (nuevo): privacidad (PII
  presente en la fila mockeada y ausente del HTML), id inexistente/no UUID →
  `notFound`, enlace de pago vigente, sin enlace vencido/revision/rechazado/
  expirado.
- `__tests__/middleware-pedido-publico.test.ts` (nuevo): usa el matcher real
  exportado por `middleware.ts`.
- `__tests__/carrito.test.tsx`: caso 201 con `init_point` (redirige, limpia y
  cierra) junto al caso 201 sin init point ya existente.

### Resultado

- ROJO verificado antes de implementar: página y `lib/redirigir` inexistentes;
  matcher real todavía exigía sesión para `/pedido/<uuid>`.
- `npx jest __tests__/app/pedido/pedido-publico.test.tsx
  __tests__/middleware-pedido-publico.test.ts __tests__/carrito.test.tsx
  __tests__/checkout-entrega.test.tsx __tests__/api/cron-liberar-reservas.test.ts
  __tests__/api/liberar-reservas.test.ts __tests__/slice2a-clp.test.ts
  __tests__/slice-03-sin-powersync.test.ts
  __tests__/slice-landing-page-public.test.tsx
  __tests__/slice15-pettycash-smoke.test.ts` → 10 suites, 153 tests verdes.
- Tests co-ubicados: ninguno junto a los archivos tocados; grep de imports
  cubre los 10 suites anteriores.
- `npx tsc --noEmit`: 0 errores en archivos del corte; se mantienen los
  preexistentes fuera de tests (`.next/types` de catálogo y `app/page.tsx`).
- Líneas: producción 151 (bajo el límite de 200); con tests nuevos/modificados
  el diff total es ~320, excedido por el volumen de tests del corte.


## Sub-slice 10a — extraer `convertir` + usuario sistema + descartar `revision`

**Archivos:** `lib/pedidos/convertir.ts` (nuevo, núcleo sin sesión: `convertirPedido(id, usuarioId, usuarioNombre)` → `{status, body}`, lógica idéntica incl. `FOR UPDATE` y condición repetida en el UPDATE), `lib/pedidos/usuario-sistema.ts` (nuevo, resuelve por rut `SISTEMA-MP`; lanza si no existe), `app/api/pedidos/[id]/convertir/route.ts` (envoltorio con sesión), `app/api/pedidos/[id]/route.ts` (`revision` descartable; la devolución de stock ya exige `stock_reservado = true`).
**Tests:** `__tests__/api/pedidos-convertir-lib.test.ts` (nuevo, 6), `__tests__/api/pedidos-id.test.ts` (+1 caso `revision`); `pedidos-convertir.test.ts` sin cambios.
**Resultado:** Fase B roja (módulo inexistente / guard sin `revision`); Fase D verde: 26 tests del corte + 24 de tests que mencionan lo tocado. `tsc`: sin errores nuevos en archivos tocados. `lib/auth.ts` filtra `activo = true` (SISTEMA-MP no puede iniciar sesión).


## Sub-slice 10b — cuenta MP en caja-config

**Archivos:** `app/api/caja/config/route.ts` (nuevo; GET/PATCH solo `mp_cuenta_id`, admin, valida cuenta existente y activa, upsert en `caja_config`), `app/(app)/admin/caja-config/client_page.tsx` (4º fetch + selector "Cuenta para cobros de Mercado Pago").
**Tests:** `__tests__/api/caja-config-mp.test.ts` (nuevo, 11); actualizados: `app/(app)/admin/caja-config/client_page.test.tsx` (4 fetch + caso selector), `__tests__/caja-config-client_page.test.tsx` (permite 1 fetch a config; `findAllByText`), `__tests__/slice2-clp-guard.test.ts` (la ruta existe pero solo maneja `mp_cuenta_id`, sin dólar).
**Resultado:** Fase B roja (módulo inexistente / 4 fetch esperados). Fase D: 28 tests verdes (corte + co-ubicados + `pedidos-mercadopago`). `tsc`: sin errores nuevos fuera de tests (solo `.next/types` catálogo y `app/page.tsx`).

## Sub-slice 10c — cobro + pago aprobado

**Archivos:** `lib/pedidos/cobro-pedido.ts` (registrarCobroPedido), `lib/pedidos/pago-aprobado.ts` (pagoAprobado), `__tests__/api/pago-aprobado.test.ts`.
**Tests:** 18 (cada estado, monto/moneda, segundo payment id, sin `mp_cuenta_id`, convertir fallido, doble ejecución).
**Resultado:** Fase B roja (módulo inexistente). Fase D: 18/18 verdes. `tsc`: 2 errores fuera de tests, ninguno en archivos nuevos.

**Correccion 10c (carrera webhook doble):** si `convertirPedido` no da 201, `pagoAprobado` relee el estado; si ya es `convertido` sigue a `cobrar()` (idempotente) sin revision. `marcarRevision` excluye `convertido` del cambio de estado y en ese caso solo guarda `mp_revision_motivo`. +2 tests (doble ejecucion 409/relectura convertido; marcarRevision no saca de convertido): 20/20 verdes.

## Sub-slice 10d — webhook firmado

**Archivos:** `app/api/mercadopago/webhook/route.ts` (nuevo), `__tests__/api/mercadopago-webhook.test.ts` (nuevo, 14).
**Tests:** firma ausente/ajena/ts fuera de ventana -> 401 sin tocar nada; secret ausente 500; type != payment 200; external_reference no UUID / pedido inexistente 200; approved convierte y cobra una vez, replay no duplica; monto distinto -> revision; rejected/cancelled -> 200 sin cambios (modificado por DT: intento fallido, no libera stock; solo expiración 36 h o fallo 9c) y secuencia rejected -> approved termina convertido (una conversión); pending/in_process sin cambios; Payment.get o DB fallan -> 500 sin loguear secret. Firma real (validador del SDK), `Payment.get` mockeado.
**Resultado:** Fase B roja (ruta inexistente). Fase D: 14/14 verdes (tras ajuste DT); tests co-ubicados (pago-aprobado, rechazar) sin cambios (no se tocaron). `tsc`: sin errores nuevos fuera de tests.

## Sub-slice 10e — visibilidad staff + `mercadopago` en Caja Mayor

**Archivos:** `app/api/pedidos/route.ts` (GET: mp_payment_id/mp_fecha_pago/mp_revision_motivo), `app/(app)/pedidos/client_page.tsx` (label `revision`, bloque pago MP/motivo, filtro "Requieren revisión"), `app/(app)/caja-mayor/client_page.tsx` + `docs/specs/caja-mayor.spec.ts` (`mercadopago` en enums/tipo, display "Mercado Pago", select de edición), `PRD.md` §9 filas 9 y 10 completadas (pendiente de credenciales reales).
**Tests:** +1 GET pedidos (campos MP), +1 pedidos UI (label, motivo, filtro revision/pagado_tardio/motivo), +1 caja-mayor UI (display).
**Resultado:** Fase B roja (3 fallos por la razón correcta). Fase D: 15 suites / 179 tests verdes (corte + co-ubicados + referenciantes). `tsc`: 2 errores fuera de tests (no sube).
