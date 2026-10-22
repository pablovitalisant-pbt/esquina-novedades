# BUGS
Registro de bugs resueltos. Una entrada por bug, completada en Fase 6 del protocolo PBT-IA-DEBUGGING.

## BUG-001 — Jest corría contra la base de PRODUCCIÓN
- **Causa raíz:** `jest.env-setup.ts` carga `.env.test` con override, pero el proyecto no tenía `.env.test`; jest usó `DATABASE_URL` de `.env.local` (prod, host `ep-proud-hall-b6nxrz4m`). `PROD_HOSTS` solo bloqueaba hosts de Bazar Naty.
- **Fix:** `.env.test` → rama `test-integration` (`ep-polished-union-b66ujjc5`); `ep-proud-hall-b6nxrz4m` agregado a `PROD_HOSTS`; `assertEnvTestExiste` aborta si falta `.env.test` antes de cargar nada.
- **Verificación:** `__tests__/lib/test-safeguards.test.ts` (rojo → verde): host nuevo bloqueado y aborto sin `.env.test`.
