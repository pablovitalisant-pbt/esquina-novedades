# N02b — Iniciar Mercado Pago a petición del comprador

Contrato aprobado DT por delegación de Pablo. Flag pedido-pago-opcional false; depende N02a. Corte independiente <=200 líneas.

POST /api/pedidos/[id]/pagar: capability UUID del pedido público. Flag off ->404 sin DB. UUID inválido ->400 sin DB. Pedido inexistente ->404. Estado distinto de pendiente_pago, stock no reservado o vencido ->409 sin MP. Preferencia existente de pedido vigente ->200 {init_point} sin crear otra. Configuración MP/caja activa ausente ->503. Crear preferencia con helper existente (idempotencyKey pedido.id), 200 {init_point}; fallo proveedor ->502 genérico sin cancelar pedido/liberar stock ni filtrar secretos. Releer vigencia tras llamada para no entregar link sobre reserva vencida durante llamada. Sin GET que cree cobros.

Files-to-touch nuevos: app/api/pedidos/[id]/pagar/route.ts y __tests__/api/pedido-iniciar-pago.test.ts. Existentes: ninguno en este corte: helper crearPreferenciaPedido ya consulta precios servidor y persiste preferencia; N02c conectará UI antes de activar flag. No schema, migración, navegación, tipos globales, middleware, env nuevo ni webhook. No modificar guard stock ni BUG-005 firma.

Tests rojos: flag/UUID; inexistente; vencido/estado incorrecto/stock no reservado; reuse; config ausente; éxito y timeout. Mocks para contrato HTTP; smoke real navegador + DB TEST con proveedor MP fake antes de cierre integrado N02. Concurrencia preserva misma clave MP; test de doble petición y ausencia de escritura de cobro/stock. No afirmar que el proveedor es idempotente por un mock.

Presupuesto: endpoint <=65 líneas, tests <=105, evidencia <=20. Ejecutar test específico, regresiones MP/reserva, lint, tsc y build. N02c requiere botón con loading, errores y reintento y pruebas visuales.
