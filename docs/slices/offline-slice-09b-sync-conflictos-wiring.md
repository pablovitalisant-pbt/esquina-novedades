# Slice 9b (Offline, Fase 2) — Bandeja de conflictos: wiring de BackendConnector

Contrato Fase A propuesto por Claude (Director Técnico). Depende de
Slice 9a (commit `ae56ff8`, migración 026 ya aplicada en producción por
Pablo). Ver `docs/ARQUITECTURA-OFFLINE.md` sección "Fase 2".

## Objetivo

Cuando `BackendConnector.uploadData()` descarta una operación por fallo
permanente (400 de validación), además de loguear en consola, reportarla
a `POST /api/sync-conflictos` (Slice 9a) para que quede visible en la
bandeja de administración. Hoy solo hay un caso real: la escritura de
Bodega (`ubicaciones_bodega`).

## Señal 1 del protocolo — zona frágil conocida

`lib/powersync/BackendConnector.ts` es el archivo del fix crítico de
Slice 5 (el bug de pérdida de datos por `transaction.complete()`
incondicional, ver `BUGS.md`/`ARQUITECTURA-OFFLINE.md` Slice 5). Este
slice modifica ese mismo archivo. Confirmo antes de tocarlo: el fix de
Slice 5 sigue intacto (`shouldComplete` flag, re-lanzar sin completar en
fallos reintentables) — **no se toca esa lógica**, solo se agrega el
reporte del conflicto dentro de la rama que ya existe para 400
permanente, sin alterar cuándo se completa o no la transacción.

## Contrato

### Archivo modificado

- **`lib/powersync/BackendConnector.ts`**: dentro de la rama `if
  (res.status === 400)` (línea ~88), antes del `continue`, agregar el
  reporte del conflicto — gateado por un flag nuevo para poder
  desactivarlo instantáneamente sin tocar el resto del flujo de Bodega
  ya en producción:

  ```ts
  if (res.status === 400) {
    console.error(`uploadData: ${codigo} 400 (permanente) — se descarta`, res.status);
    if ((flags as any)['sync-conflictos-reporte']) {
      await reportarConflicto({
        tabla: op.table,
        operacion: op.op, // tipo de operación CRUD de PowerSync (PUT/PATCH/DELETE)
        entidad_id: codigo,
        payload: data,
        http_status: res.status,
        error_mensaje: await extraerMensajeError(res),
      });
    }
    continue;
  }
  ```

  `reportarConflicto()` — función nueva en el mismo archivo (o
  `lib/powersync/reportarConflicto.ts` si crece, a criterio de Claude
  Code, manteniendo el archivo principal legible):
  - `POST /api/sync-conflictos` con el body de arriba.
  - **Falla de forma silenciosa (try/catch propio) y nunca afecta
    `shouldComplete` ni relanza**: si el reporte del conflicto falla (red
    caída justo en ese instante, por ejemplo), la operación original ya
    fue determinada como inválida permanentemente — no tiene sentido
    bloquear la cola de sync por un fallo al *reportar* algo que de todos
    modos se va a descartar. Solo `console.error` adicional si el reporte
    falla.
  - `extraerMensajeError(res)`: intenta `await res.json()` y devuelve
    `body?.error ?? null`; si el `.json()` falla (respuesta no-JSON),
    devuelve `null` sin lanzar.

  Importar `flags` desde `@/config/feature-flags.json` (mismo patrón que
  todos los `client_page.tsx` de los slices anteriores).

- **`config/feature-flags.json`**: agregar `"sync-conflictos-reporte":
  false`.

### No se toca

La lógica de `shouldComplete`/retry del fix de Slice 5 (confirmado
arriba), `app/api/sync-conflictos/**` (ya existe de 9a, se consume tal
cual), cualquier otro archivo.

## Riesgos a cubrir en Fase B

- **Llamada a API externa** (en este caso, interna pero por red): el
  `POST /api/sync-conflictos` puede fallar (timeout, 500, etc.) —
  riesgo cubierto por el diseño: nunca debe re-lanzar ni afectar
  `shouldComplete`. Test explícito: mockear el POST fallando y verificar
  que la transacción igual se completa (la operación original se
  descarta igual que hoy).
- **Regresión del fix de Slice 5**: test explícito de que un fallo
  reintentable (401/500/excepción de red) sigue sin completar la
  transacción — comportamiento idéntico a antes de este slice.
- **Flag en `false`**: con el flag apagado, cero llamadas a
  `/api/sync-conflictos` — test que lo confirme (mock del POST nunca
  invocado).
- **Payload con datos reales del usuario**: confirmar que `data` (el
  `opData` de PowerSync) no incluye nada que no debería viajar al
  registro de conflictos — es el mismo payload que ya se manda al
  endpoint real, sin campos adicionales.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento idéntico a Slice 5 (regresión) — ningún
   POST a `/api/sync-conflictos`.
2. Flag `true`, fallo 400 real (ej. producto inexistente en Bodega):
   confirmar en la tabla `sync_conflictos` (Neon) que quedó una fila
   `pendiente` con los datos correctos.
3. Flag `true`, fallo reintentable (401/500/red): confirmar que sigue
   reintentando igual que antes (sin reportar conflicto — no es un
   conflicto, es un fallo transitorio) y que la transacción no se
   completa hasta el éxito.
4. Suite completa sin regresiones, incluidos los tests existentes de
   `BackendConnector.test.ts` (Slice 5).
