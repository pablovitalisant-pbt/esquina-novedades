# N03a — Método de pago del pedido

DT aprueba por delegación. Contrato: pedidos.metodo_pago nullable, valores mercadopago/transferencia/efectivo; null significa sin elección. DB rechaza valores no permitidos. No convierte pedidos ni registra cobros al elegir. Históricos quedan null. Cambio aditivo, sin borrar datos.

Files-to-touch: nueva migrations/049_pedidos_metodo_pago.sql; existente scripts/migrations-order.ts (agregar al final); nuevo __tests__/integration/pedido-metodo-pago-schema.test.ts. <=150 líneas, flag pedido-pago-opcional false ya existente gobierna futura funcionalidad. API/página solo incorporan columna en N03b/c antes de activar; no consumidores que requieran cambio en este corte de esquema. Tipos locales se definirán con consumidores. Sin env/middleware/permisos nuevos.

Riesgos: INSERT/UPDATE DB y migración idempotente. Fase B contra Postgres TEST: columna existe nullable; pedido fixture admite null y tres opciones; valor arbitrario rechazado y no cambia estado/stock. Limpiar solo fixture propio. Tests fallan antes de aplicar migración. DT aplica únicamente 049 a rama TEST con host validado; verifica esquema y corre tests. No aplicar producción. Smoke de esquema end-to-end: escritura/lectura real y constraint real, no mock SQL. Añadir smoke navegador al integrar selector N03c.

Verificación: test específico + suite de orden de migraciones + lint/tsc/build en integración. No ejecutar runner completo que falla por migración histórica 019.
