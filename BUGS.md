# BUGS
Registro de bugs resueltos. Una entrada por bug, completada en Fase 6 del protocolo PBT-IA-DEBUGGING.

## BUG-001 — Jest corría contra la base de PRODUCCIÓN
- **Causa raíz:** `jest.env-setup.ts` carga `.env.test` con override, pero el proyecto no tenía `.env.test`; jest usó `DATABASE_URL` de `.env.local` (prod, host `ep-proud-hall-b6nxrz4m`). `PROD_HOSTS` solo bloqueaba hosts de Bazar Naty.
- **Fix:** `.env.test` → rama `test-integration` (`ep-polished-union-b66ujjc5`); `ep-proud-hall-b6nxrz4m` agregado a `PROD_HOSTS`; `assertEnvTestExiste` aborta si falta `.env.test` antes de cargar nada.
- **Verificación:** `__tests__/lib/test-safeguards.test.ts` (rojo → verde): host nuevo bloqueado y aborto sin `.env.test`.

## BUG-002 — jest no arrancaba: dotenv no declarado (2026-10-22)
- Sintoma: 207/207 suites fallan al cargar jest.env-setup.ts (`require('dotenv')`).
- Causa raiz: dotenv nunca estuvo en package.json; llegaba como dependencia transitiva. El slice L1 quito shadcn/sharp y `npm install` podo 208 paquetes, incluido dotenv. La verificacion de L1 se corrio antes del npm install (detectado por el agente en U1.1).
- Fix: `npm install -D dotenv` (devDependency explicita).
- Verificacion: suite completa vuelve a 5 suites heredadas, 1717 tests verdes; tsc no-test 2.
- Leccion: tras cualquier cambio de dependencias, re-correr la suite completa DESPUES de `npm install`.

## BUG-003 — Todo pedido con pago online respondía 409 "Stock insuficiente" (2026-10-23)
- Sintoma: primera compra de prueba en produccion (DEMO-003, saldo 30, pedido de 7 unidades) -> POST /api/pedidos 409 "Stock insuficiente". Ningun pedido online podia crearse.
- Causa raiz: la reserva de stock usaba `SELECT CASE WHEN EXISTS (SELECT 1 FROM upd) THEN 1 ELSE 1 / 0 END`. Postgres pliega la constante `1 / 0` al planificar y la consulta lanza 22012 SIEMPRE, haya stock o no; el handler lo traducia a "Stock insuficiente". Reproducido contra la base (falla incluso con 0 unidades). Los tests mockeaban sql y uno incluso exigia el texto `1 / 0`.
- Fix: guard `SELECT 1 / (SELECT COUNT(*) FROM upd)::int` (mismo patron que notas-venta), extraido a `lib/pedidos/reserva-stock.ts`.
- Verificacion: `__tests__/integration/reserva-stock-guard.test.ts` contra la rama test-integration (rojo con el guard viejo, verde con el fix); `pedidos-reserva.test.ts` ahora exige `1 / (SELECT COUNT(*) FROM upd)` y prohibe `ELSE 1 / 0`.
- Leccion: un guard SQL se prueba contra Postgres real; con sql mockeado el test solo confirma el texto.

## BUG-004 — Activar flags de la demo rompio 2 suites (2026-10-23)
- Sintoma: tras el commit bdc4659 (4 flags en true) fallan `__tests__/api/pedidos.test.ts` (503) y `slice5cd-detalle-modalidad.test.tsx` ("Tipo: mixta").
- Causa raiz: ambos tests leian `config/feature-flags.json` real y asumian los flags en false.
- Fix: mock explicito de flags en cada test; slice5cd cubre ahora ambos estados del flag.
- Verificacion: suite completa vuelve a las 5 suites heredadas (18 tests), igual que antes de activar los flags.

## BUG-005 -- Pago MP aprobado no actualizaba el pedido: webhook 401 (2026-10-23)
- Tipo: C (integracion externa) + E (solo en produccion).
- Sintoma: pago de prueba aprobado (op. 185721852894, pedido afb8e9f4-...) y el pedido seguia `pendiente_pago`, sin nota de venta ni cobro en caja.
- Evidencia: Vercel -> `[mp-webhook] firma invalida SignatureMismatch` en las notificaciones `MercadoPago WebHook v1.0 payment` (`?data.id=...&type=payment`). Panel MP -> `payment.created` `401 - Fallida`, body con `live_mode: true` y `user_id 3789061222` (seller Test User). Suite `__tests__/api/mercadopago-webhook.test.ts` (validador real del SDK 3.6.1) 16/16 verde: el codigo no era la causa.
- Causa raiz: el cobro lo hace el seller Test User, que tiene su propia app en MP (**TestApp-126a11e4**, 7071598447993792). Las notificaciones reales se firman con la clave secreta de ESA app; `MP_WEBHOOK_SECRET` tenia la de la app "Esquina Novedades Demo" (7942165158596026).
- Intento 1 (fallido, no repetir): poner la clave del Modo de prueba de "Esquina Novedades Demo". "Simular notificacion" dio 200 (el simulador firma con la clave de la app desde donde se envia) pero el pago real siguio en 401. Se cerro el bug solo con el simulador (antipatron 3) y se reabrio con un pago real.
- Fix aplicado: sin cambio de codigo. `MP_WEBHOOK_SECRET` (Production) = clave secreta del Modo de prueba de TestApp-126a11e4; redeploy de af3a8f5.
- Verificacion (pago real, unico criterio valido): pedido 67181656-22d3-4a80-8f63-6efc18d3d45d, op. 185751063980 -> webhook `WebHook v1.0` 200 a las 15:41:23; DB `convertido`, prenota_id 2, cobro 4990 CLP en cuenta 1 (forma_pago mercadopago); pagina /pedido muestra "Confirmado".
- Zona fragil:
  - La clave correcta es la de la app DUENA de las credenciales que cobran. Con la app productiva de Paola sera la de su app (modo productivo) y `MP_ACCESS_TOKEN` + `MP_WEBHOOK_SECRET` deben salir de la MISMA app y modo, con redeploy despues.
  - "Simular notificacion" NO valida la clave de los pagos reales: verificar siempre con un pago real.
  - Las IPN legacy `MercadoPago Feed v2.0` (`?id=...&topic=payment|merchant_order`, enviadas por `notification_url`) no traen `data.id` ni firma y el webhook responde 401; MP las reintenta. Pendiente decidir (ver traspaso).
- Commit: af3a8f5 (registro inicial, incorrecto) + este commit (correccion).

## BUG-006 -- A15: T6 de `catalogo-precio-override` intermitente con BD real (2026-10-31)
- Tipo: E (solo en test, carrera entre suites contra la misma BD).
- Sintoma: `__tests__/catalogo-precio-override.test.ts` T6 fallaba a veces con la rama `test-integration`; sospecha inicial: concurrencia con `slice4a-catalogo-precio-detalle` (ambos crean datos reales en paralelo).
- Reproduccion: 12 corridas sin falla (6 de ambas suites juntas + 6 de la suite completa, 254/254 y 2050/2050 verdes). No se reprodujo en esta sesion; se registra porque la carrera es visible en el codigo.
- Causa raiz (evidencia de codigo): los catalogos del fixture se creaban con `palabras_incluir = ''`, asi que el catalogo incluia TODOS los productos activos de la empresa. T2/T6/T7 operaban sobre `productos[0]` de esa lista global. Si otra suite inserta o borra un producto entre dos GET (p. ej. `slice4a` inserta su producto en `beforeAll` y lo borra en `afterAll`), T2 puede comparar counts distintos y T6 puede elegir un codigo que ya no existe (`producto` undefined). Hoy `productos[0]` es el sembrado `QA-001` (orden por codigo), estable, por eso las 12 corridas pasaron; la dependencia de datos globales es la carrera.
- Fix (solo tests, sin tocar codigo de app ni serializar suites): fixture propio `OVR-<ts>` en `productos`; ambos catalogos usan `palabras_incluir = TEST_CODIGO` (solo ven ese producto); T5 verifica aislamiento sobre ese mismo codigo y `afterAll` borra por codigo exacto.
- Verificacion: 5 corridas seguidas de la suite completa en verde (254/254 suites, 2050/2050 tests en cada una); `tsc --noEmit` 0; lint 0 warnings / 0 errores. `.env.test` y el safeguard de BUG-034 intactos.
- Leccion: en suites con BD real, un catalogo con `palabras_incluir = ''` no es un fixture aislado: es una consulta a toda la tabla que otras suites mutan en paralelo.
