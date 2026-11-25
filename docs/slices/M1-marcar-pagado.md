# M1 — Marcar como pagado desde /pedidos

Flag `pedido-marcar-pagado` (default `false`). Requiere además
`pedido-cobro-manual` (`true`).

## Qué cambia

- Un admin puede cobrar un pedido que quedó `pendiente_pago`, con stock
  reservado y sin `metodo_pago` (el comprador nunca eligió): elige efectivo o
  transferencia en el panel. El selector arranca en "Selecciona…" (sin valor
  por defecto).
- El botón cerrado del panel dice "Marcar como pagado" en ese caso; el panel
  abierto conserva el botón "Registrar cobro".
- Ese caso solo se ofrece cuando el pedido realmente se puede cobrar:
  `estado === 'pendiente_pago' && stock_reservado === true &&
  !mp_init_point && !mp_payment_id && caja_movimiento_id == null &&
  metodo_pago == null`. Convertidos/pagados sin método, con rastro de MP o sin
  reserva no muestran la acción (el API los rechazaría con 409).
- `adquirirPagoManual` acepta `metodo` opcional; con pedido sin método, lo fija
  en `pedidos.metodo_pago` y en `pedido_pagos_manuales` en la misma sentencia
  atómica. Un método distinto al ya fijado es conflicto; un reintento idéntico
  sigue siendo reintento.
- Guard MP (riesgo 2): el UPDATE exige `mp_init_point IS NULL AND
  mp_payment_id IS NULL`. Un pedido legado sin método pero con rastro de
  Mercado Pago no se puede marcar pagado (el dinero pudo entrar por MP y el
  cobro manual duplicaría el ingreso). Los pedidos con método ya elegido
  (efectivo/transferencia) siguen igual: en el flujo normal esas columnas
  están en NULL.
- La ruta `confirmar-pago` conserva su compuerta original (solo
  `pedido-cobro-manual`; si no, 404). El `metodo` del body solo se acepta con
  `pedido-marcar-pagado === true`; si viene `metodo` y el flag está apagado →
  400 `{"error":"Método de pago inválido"}` sin llamar a `adquirirPagoManual`
  (un POST armado a mano no se salta el flag). Un `metodo` desconocido sigue
  siendo 400.
- El GET de `/api/pedidos` entrega `mp_init_point` (solo admin con
  `pedido-cobro-manual`) para decidir si el pedido es cobrable. La vista NO
  muestra link de pago de Mercado Pago.

## Sin tocar

`convertirPedido` y `registrarCobroManualPedido` no se modificaron.

## Verificación

- Suites M1 en verde: ruta, vista, componente, integración contra la BD de
  test y GET de pedidos (104 tests entre las 5 suites tocadas).
- `jest` completo, `tsc`, `lint` y `build` en Fase D.
