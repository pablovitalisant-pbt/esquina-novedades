# M01 — Detener creación inválida de notas

Base limpia `4bad9b2`, riesgo conocido BUG-007 en el modal: conservar conversión numérica del precio. Se inspeccionó árbol de archivos y consumidores de crearNota/agregarItem. La causa está en `lib/api-notas.ts`: verificarOk=false permite consumir un error HTTP como si fuera éxito y String(data.id) produce "undefined".

## Contrato autorizado por delegación de Pablo

- `crearNota(clienteId?)` envía el mismo POST y body. Un 200/201 con ID entero positivo o string no vacío válido devuelve su representación string.
- HTTP no-ok rechaza con ErrorNota antes de interpretar el body como éxito. Respuesta sin ID válido rechaza; nunca devuelve "undefined", "null" ni un objeto convertido a string.
- Modal: si falla crear, no llama /items, conserva modal abierto, muestra error y permite reintento.
- POS: conserva mensaje y payload existentes; quitar segundo argumento verificarOk.
- Red/JSON inválido siguen rechazando. No hay reintento automático de POST ni cambios en DB.

## Alcance

Implementación: `lib/api-notas.ts`, `app/(app)/pos/client_page.tsx` (≤50 líneas). Tests: `__tests__/lib/api-notas.test.ts`, `__tests__/AgregarAPrenotaModal.test.tsx`. BUGS y este contrato para cierre. No cambiar otros archivos de aplicación.

Impacto lateral: se revisaron imports, ambas llamadas, catch ErrorNota, API de creación y de ítems, UI de ahorro y BUG-007. Sin schema, permisos, navegación, env ni flags nuevos.

## Riesgos y pruebas

- Estado asíncrono y compartido: error de creación no debe cerrar modal ni enviar ítem; probar recuperación con reintento.
- Escrituras existentes: no cambiar payload ni reintentar automáticamente; comprobar cero /items ante error y una secuencia válida.
- HTTP fallido y schema inválido: rechazo con/sin cuerpo, ID ausente, null u objeto; mantener éxito y errores de red.
- Smoke E2E obligatorio: precios → agregar a nueva nota, fallo controlado y recuperación, en entorno TEST con red interceptada para errores, sin escrituras en producción.

Comandos: `npx jest --runInBand --runTestsByPath __tests__/lib/api-notas.test.ts __tests__/AgregarAPrenotaModal.test.tsx`, suites POS relacionadas, `npx tsc --noEmit`, `npm run lint`. El DT ejecuta y registra rojo/verde.

## Evidencia DT

Rojo: 4 fallos específicos y 17 verdes antes de implementación. Verde: suites api-notas, AgregarAPrenotaModal, pos4-ui y pos3-cobrar, 35 tests. Smoke privado `node node_modules/playwright/cli.js test --config mantenimiento.config.cjs`: 1 verde, error HTTP500 con HTML no provoca /items; reintento manual envía una sola línea con precio numérico y cierra modal. Sin escrituras DB ni producción.
