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