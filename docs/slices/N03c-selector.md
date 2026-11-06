# N03c — Mostrar medios de pago en la reserva

DT aprueba por delegación. N03c1 agrega components/PedidoMediosPago.tsx y __tests__/pedido-medios-pago.test.tsx. N03c2 modifica página pública y pruebas existentes para integrar el componente. Presupuesto 200 líneas por corte.

En reserva pendiente vigente y con stock, ofrecer Mercado Pago, transferencia cuando el servidor tiene los cinco datos requeridos y efectivo solo para delivery local activo. Al elegir un medio alternativo, POST /metodo con guard contra doble envío. Mostrar instrucciones desde la respuesta sin salir de la página. Efectivo indica que se pagará al recibir. Transferencia muestra titular, RUT, banco, tipo y número de cuenta y referencia. Si falla, error accesible y permitir reintentar. Tras elegir, ocultar los otros medios. Al recargar, mostrar la elección persistida. El servidor solo entrega datos bancarios al pedido con transferencia elegida. Preferencia MP histórica muestra solo MP.

Riesgos: render condicional, solicitudes simultáneas y fallo de red. Fase B prueba los tres riesgos, elección y restauración al recargar. Integración con la página respeta flag apagado y no consulta columna 049 cuando está apagado. No cambia schema, middleware, permisos ni lógica de cobro. Smoke de checkout en navegador con PostgreSQL TEST y datos bancarios ficticios. Verificar vista móvil.
