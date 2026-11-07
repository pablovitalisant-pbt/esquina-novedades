# BUG-010 — Enviar pedido sin respuesta visible en móvil

Base de diagnóstico con árbol limpio, `94da326`. Clasificación visual y validación del formulario. Se revisaron BUG-003 y el flujo de reserva antes de limitar la corrección a la UI.

## Evidencia y causa

La captura reportada muestra el botón de envío y una parte del formulario, mientras el resumen ocupa el pie del carrito. La imagen no permite saber qué campo faltaba en esa sesión.

En un navegador de prueba de 360 × 740, con dos líneas y contacto ficticios, se pulsó Enviar sin elegir entrega. No hubo POST. El formulario generó el mensaje de validación al final de su contenido desplazable y el resumen lo ocultó. El fallo también se puede producir antes del submit de React cuando el navegador rechaza un correo inválido.

Las tres pruebas de regresión iniciales fallaron por ausencia de alerta en el pie. El smoke móvil reprodujo el problema y guardó una captura local con datos sintéticos.

## Contrato y alcance

- Ante nombre, teléfono, correo, entrega o dirección incompletos, mostrar el aviso en el pie del carrito y enfocar el campo correspondiente.
- Capturar el aviso de correo inválido del navegador y conservar su validación.
- Desplazar el campo después de actualizar el layout para que quede visible al crecer el mensaje del pie.
- Con datos válidos, conservar el envío y la navegación al pedido reservado.
- Conservar los productos ante validación y errores de API.

Los únicos archivos de implementación son `components/CarritoCheckoutForm.tsx` y `components/CarritoDrawer.tsx`, con un parche inferior a 50 líneas cambiadas. Se reutiliza el aviso de error de API del pie. La prueba está en `__tests__/checkout-entrega.test.tsx`.

La revisión lateral incluye formulario asociado al botón externo, restricciones HTML del correo, foco dentro del Sheet, estado del carrito, errores de la API y transición al pedido reservado. No requiere schema ni nuevas variables.

## Verificación

Resultados verificados por el DT después de revisar el DIFF de Claude-Deep:

- `npx tsc --noEmit`: código 0.
- `npm run lint`: sin errores ni advertencias ESLint.
- `npx jest --runInBand --runTestsByPath __tests__/checkout-entrega.test.tsx __tests__/carrito.test.tsx __tests__/pedido-medios-pago.test.tsx`: 3 suites, 36 pruebas verdes.
- `node node_modules/playwright/cli.js test --config checkout-validacion.config.cjs`, desde el arnés privado: 3 casos móviles verdes. Cada uno exige alerta y campo completos en pantalla, foco correcto y cero POST. Captura revisada visualmente por el DT.
- `node node_modules/playwright/cli.js test --config checkout-mobile-completo.config.cjs`, con `PBT_N03=1`: flujo completo móvil verde en TEST, POST de reserva 201, elección de transferencia y persistencia tras recargar. Fixture propio eliminado y configuración de prueba restaurada.

Riesgos cubiertos: estado compartido del formulario y carrito, validación nativa anterior al submit y envío asíncrono. El parche no agrega escrituras, consultas, integraciones ni variables. La corrección utiliza el checkout activo y no agrega otro feature flag que mantenga oculto el arreglo.
