# N02a — Reserva independiente de Mercado Pago

Contrato aprobado por DT bajo delegación de Pablo del 2026-11-06. Depende de N01; integra N02b (iniciar pago) y N02c (botón) antes de activarse.

Con tienda-pago-online y pedido-pago-opcional activos, POST /api/pedidos reserva como hoy pero no exige configuración MP ni crea preferencia. 201 incluye id/estado/total/expira_en; sin init_point. Replay devuelve 200 con mismo pedido sin SDK. Falta de stock sigue rechazándose atómicamente; sin modificar cálculo, cantidades ni 36 h de reserva. Con pedido-pago-opcional false conserva comportamiento anterior.

Files-to-touch: app/api/pedidos/route.ts; __tests__/api/pedidos-mercadopago.test.ts; config/feature-flags.json (pedido-pago-opcional false). Estimación <=140 líneas incluyendo evidencia de cierre.

Impacto: CarritoDrawer ya soporta destino por id vía N01. Página pública y preferencia se integran en N02b/c antes de activar flag; no publicar este corte aislado. No se modifica esquema, permisos, tipos compartidos, imports de consumidores, middleware o variables. Webhook/convertir/cobro y liberación conservan contratos. Riesgos BUG-003/005: no tocar guard ni firma.

Fase B: sin token/siteUrl/cuenta MP -> 201 y transacción de reserva; SDK configurado para fallar no es invocado; replay sin init_point -> 200 y cero nueva transacción/SDK; flag false mantiene preflight heredado. Riesgos: escritura DB, integración externa, eventos simultáneos/idempotencia, entorno y flags. Reutilizar tests de reserva real y replay existentes, sin declarar mocks SQL como prueba DB.

Comandos DT: npm run test -- --runInBand __tests__/api/pedidos-mercadopago.test.ts __tests__/api/pedidos-reserva.test.ts __tests__/integration/reserva-stock-guard.test.ts; npm run lint; npx tsc --noEmit; npm run build.

Smoke E2E: tienda -> checkout real con MP deshabilitado en entorno TEST -> pedido reservado real, comprobar saldo descontado una vez y sin preferencia. Registrar junto al harness de N01. Flag temporal solo en entorno de prueba, devolver false antes de commit.
