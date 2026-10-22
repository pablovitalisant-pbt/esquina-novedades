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
