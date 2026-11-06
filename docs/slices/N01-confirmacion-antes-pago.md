# N01 — Confirmación de reserva antes de pagar

Fase A aprobada por Pablo el 2026-11-06; fases siguientes delegadas al DT con evidencia PBT-IA. Base 2de5b7a.

## Contrato observable

Con flag `pedido-confirmacion-antes-pago` activo, tras respuesta exitosa de POST /api/pedidos con data.id válido, CarritoDrawer navega a /pedido/{id}, limpia el carrito y cierra el cajón. Aunque exista init_point, no navega directamente a MP. El comprador ve la reserva y decide pulsar el botón de pago existente.

Con flag apagado se conserva comportamiento anterior. Respuesta fallida, sin id o id inválido: mostrar error y conservar carrito; nunca navegar a /pedido/undefined. Validar respuesta antes de limpiar.

Ejemplos de contrato para tests: 201 + data {id: UUID válido, init_point: URL MP} => navegar al pedido; 200 equivalente => mismo resultado; 502 => carrito intacto; 201 sin id => error sin navegación ni limpieza. Solo se permite una solicitud simultánea por envío.

Interfaz cubierta: resultado de POST /api/pedidos y evento enviar pedido de CarritoDrawer. Sin nuevo endpoint. La página pública y su botón Pagar ya existen.

N01 no añade todavía transferencia/efectivo ni desacopla la creación de preferencia MP; esas partes quedan explícitamente en N02–N04. No activar en producción como si el requerimiento completo estuviera resuelto.

## Impacto lateral y files-to-touch

Revisado inventario de archivos del repo, referencias a CarritoDrawer, rutas de pedidos y tests relacionados.

Archivos existentes que requieren modificación:
1. components/CarritoDrawer.tsx — validación del resultado y destino de navegación.
2. __tests__/carrito.test.tsx — casos con flag activo/inactivo, resultado inválido, errores y doble envío; conservar cobertura heredada.
3. config/feature-flags.json — flag nuevo false.

Documento nuevo de verificación: docs/slices/N01-verificacion.md, con evidencia roja/verde y smoke E2E ejecutado. Actualizar este contrato y CONTEXT-CLAUDE-CHAT.md al cierre para estado/contador, dentro del presupuesto de líneas.

Consumidores existentes components/TiendaPortada.tsx y app/catalogo/[slug]/client_page.tsx reciben el cambio por el componente compartido; no necesitan modificar props/imports. app/pedido/[id]/page.tsx ya acepta el identificador y muestra resumen/estado y botón MP. No cambian schema, migraciones, tipos compartidos, middleware, permisos, variables de entorno ni API. Los flags se mockean explícitamente conforme a BUG-004.

Pruebas de regresión existentes a ejecutar, sin modificación prevista: __tests__/checkout-entrega.test.tsx, __tests__/app/pedido/pedido-publico.test.tsx, __tests__/app/pedido/pedido-descuento.test.tsx. Si evidencia muestra que necesitan cambio, actualizar alcance antes de implementar.

## Riesgos y Fase B propuesta

- Render condicional por flag: probar ambos estados; sin acceso nuevo a estado de navegador durante SSR.
- Eventos simultáneos: doble clic no duplica solicitud.
- Estado compartido: carrito solo se vacía ante respuesta válida; timeout/error conserva productos.
- Respuesta de red incompleta: éxito sin id no puede perder el carrito.
- No hay nueva escritura DB, JOIN ni variable de entorno. Se mantiene reserva existente, sin tocar guard SQL.
- Al menos un test por riesgo, entregado en DIFF y ejecutado en rojo antes de implementación.
- Smoke E2E obligatorio en entorno de prueba: producto -> carrito -> datos -> reserva -> URL /pedido/id -> resumen -> botón MP; comprobar que no se abandona el sitio antes del clic. Repetir acceso desde catálogo. No usar pedidos ni cobros reales para esta prueba.
- No hay runner de navegador declarado en package.json: smoke con navegador controlado y evidencia registrada; no llamar E2E a un test de componente. Si no hay entorno seguro disponible, registrar bloqueo de verificación y no cerrar el slice.

## Estimación y verificación

Presupuesto objetivo 120–190 líneas cambiadas incluyendo tests/documentación. Claude-deep debe contar el DIFF antes de seguir; si supera 200, dividir. Director Técnico no implementa.

Comandos existentes, a ejecutar por DT tras implementación autorizada:

    npm run test -- --runInBand __tests__/carrito.test.tsx __tests__/checkout-entrega.test.tsx __tests__/app/pedido/pedido-publico.test.tsx __tests__/app/pedido/pedido-descuento.test.tsx
    npm run lint
    npx tsc --noEmit
    npm run build

Validar safeguards antes de tests con DB; nunca apuntarlos a producción. Evidencia actual: inspección estática únicamente. No se afirma rojo, verde ni último commit limpio de fallos: HEAD es solo la base de trabajo.

## Gate

Autorización de Pablo vigente para contratos, fases y commits. DT exige rojo verificado antes de autorizar C y verde más smoke antes del cierre. Push/deploy y datos reales se evalúan separadamente.
