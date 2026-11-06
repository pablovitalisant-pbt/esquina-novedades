# N02c — Botón de pago en la reserva

DT aprueba por delegación. Flag pedido-pago-opcional false. Files-to-touch: nuevo components/PedidoPagoBoton.tsx, nuevo __tests__/pedido-pago-boton.test.tsx; existentes app/pedido/[id]/page.tsx y __tests__/app/pedido/pedido-publico.test.tsx. <=200 líneas totales.

Con flag activo y reserva pendiente/vigente/stock_reservado, página muestra botón aunque no exista mp_init_point. Click POST /api/pedidos/{id}/pagar; éxito con init_point válido -> redirigirA. Loading bloquea doble clic con guard inmediato. Error HTTP/red/respuesta inválida -> mensaje accesible y reintento disponible, sin navegación ni alteración del pedido. Con flag apagado conservar link legacy. Nunca botón en reserva vencida/estado final/sin stock reservado. Reutilizar estilos del botón actual y módulos design-skill.

Impacto: página agrega stock_reservado a SELECT; componente nuevo y sus imports; test existente ajusta mock flag explícito y cubre sin preferencia. API N02b ya definida; no modifica DB/schema, middleware, env, navegación global ni webhook. Carrito N01 lleva al pedido. Tipos de query locales únicamente.

Riesgos/tests: render según flag/estado, doble clic, timeout/reintento, respuesta sin URL, éxito. Smoke: desde tienda real, reserva sin preferencia -> click MP -> preferencia fake creada -> navegación; DB real test y proveedor externo fake. Verificar preferencia nula antes del click. No realizar pagos reales.

Fases: tests rojos DT -> implementación claude-deep -> tests/lint/tsc/build DT -> smoke -> commit flag false. Contratos de N02a/b se verifican en el mismo recorrido integrado, con commits separados <=200 líneas.
