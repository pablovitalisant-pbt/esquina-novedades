# N03b — Elección de pago con exclusión mutua

DT aprueba por delegación. Con pedido-pago-opcional activo, POST /api/pedidos/{uuid}/metodo acepta {metodo: transferencia|efectivo}. Mercado Pago se elige mediante POST /pagar. Reserva vigente y stock reservado son obligatorios. Efectivo solo para modalidades delivery habilitadas, nunca retiro ni envío Arica. Transferencia requiere configuración bancaria completa en servidor. La elección no registra un cobro ni confirma entrega.

Cada endpoint toma la elección con UPDATE condicional atómico sobre la misma fila. Permite repetir el mismo método, rechaza uno distinto con 409. Una preferencia MP histórica impide seleccionar otro medio. /pagar adquiere mercadopago antes de invocar el SDK, mantiene la elección para reintento si falla y vuelve a revisar vigencia después de la llamada. Flag apagado devuelve 404 en ambas rutas. UI y configuración de transferencia en cortes siguientes. Hasta que exista configuración completa, transferencia no disponible.

División: N03b1 modifica únicamente app/api/pedidos/[id]/pagar/route.ts y sus pruebas, para adquirir y respetar la elección MP. N03b2 agrega ruta de alternativos, helper bancario servidor y pruebas dentro de 200 líneas, o se subdivide. N03c conecta UI y muestra la elección al recargar. N04 gestiona cobro. El esquema 049 es requisito de activación.

N03b1 rojo: MP contra elección efectiva/transferencia devuelve 409 y omite SDK, fallo de adquisición omite SDK, reintento MP sigue funcionando. Actualizar mocks SQL que distinguen SELECT y UPDATE. Smoke integrado en rama TEST con elección y preferencia fake. Auditar referencias a endpoint, flags, esquema y reserva antes de C. Webhook y estados no necesitan cambio para adquirir método.
