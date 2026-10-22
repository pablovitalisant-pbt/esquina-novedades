# Slice 5 (Offline, Fase 1) — Bodega, escritura offline real

Contrato Fase A aprobado por Pablo el 2026-08-01. Ver `docs/ARQUITECTURA-OFFLINE.md`
y `docs/slices/offline-slice-04-bodega-lectura.md` (lectura offline de
Bodega, commit `0908f16`, ya verificado en producción).

## Objetivo

Migrar el guardado de conteo físico de Bodega (hoy
`fetch(PUT /api/ubicaciones/codigo/[codigo])`) a escritura local vía
PowerSync, con sincronización real al backend cuando vuelve la conexión.
Cierra el caso de uso completo de Bodega offline: buscar → contar →
guardar, todo sin red.

## Prerrequisito ya aplicado (Parte 1, manual)

`migrations/025_backfill_ubicaciones_bodega.sql` — ya corrido por Pablo
contra producción (`br-holy-darkness-acadbszt`), verificado
`COUNT(productos) = COUNT(ubicaciones_bodega) = 5`. Garantiza que todo
producto tiene fila en `ubicaciones_bodega`, así todo write local de
este slice es **siempre UPDATE, nunca INSERT** — evita el problema de
que el `id` que PowerSync generaría localmente (UUID de texto) no
coincide con el `SERIAL` de Postgres.

## Contrato (Parte 2, código)

### Archivos modificados

- **`app/(app)/bodega/client_page.tsx`**:
  - `UbicacionEditor` recibe una prop nueva `offline?: boolean` (heredada
    desde `BodegaContent`, mismo flag `bodega-offline-lectura` que ya
    controla la lectura — no se agrega un flag nuevo).
  - En `handleSave`: si `offline` y hay `db` (via `usePowerSync()`,
    accesible en `BodegaContent` y pasado a `UbicacionEditor` o re-obtenido
    con el hook si `UbicacionEditor` ya está dentro del árbol de
    `PowerSyncProvider`), reemplazar el `fetch(PUT ...)` por:
    ```ts
    await db.execute(
      `UPDATE ubicaciones_bodega
       SET ubicacion = ?, fisico = ?, fisico_cajas = ?, fisico_unidades = ?, diferencia = ?, observaciones = ?
       WHERE codigo = ?`,
      [ubicacionStr, fisicoTotal, cajas, unidades, diferencia, obs, ubicacion.codigo]
    );
    ```
    Reutiliza los valores (`fisicoTotal`, `diferencia`, `cajas`, `unidades`)
    que el componente ya calcula hoy para el preview. Con `offline=false`
    el `fetch` original queda intacto.
  - Actualizar `onSaved` para reflejar el cambio local inmediatamente
    (optimistic UI natural: `db.execute` ya actualiza la vista local,
    pero el estado de React de `ubicaciones` en `BodegaContent` necesita
    el mismo patch que ya hace `handleUbicacionSaved`).

- **`lib/powersync/BackendConnector.ts`** — implementar `uploadData()`
  (hoy no-op):
  ```ts
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;
    try {
      for (const op of transaction.crud) {
        if (op.table !== 'ubicaciones_bodega') continue;
        const data = op.opData ?? {};
        const res = await fetch(`/api/ubicaciones/codigo/${op.id ? data.codigo : data.codigo}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ubicacion: data.ubicacion,
            fisico_cajas: data.fisico_cajas,
            fisico_unidades: data.fisico_unidades,
            observaciones: data.observaciones,
          }),
        });
        if (!res.ok) {
          console.error(`uploadData: fallo al sincronizar ${data.codigo}`, res.status);
          // No se re-lanza: no bloquear la cola por un error de validación.
          // Bandeja de revisión de conflictos: Fase 2 (ver ARQUITECTURA-OFFLINE.md
          // sección 4), no se resuelve en este slice.
        }
      }
    } finally {
      await transaction.complete();
    }
  }
  ```
  **Reutiliza el endpoint existente `PUT /api/ubicaciones/codigo/[codigo]`
  tal cual** — cero lógica de negocio duplicada, misma validación, mismo
  upsert por `codigo`.

### No se toca

`app/api/ubicaciones/codigo/[codigo]/route.ts` (se reutiliza sin cambios),
el flag `bodega-offline-lectura` (sigue siendo el único flag, controla
lectura + escritura juntas).

## Revisión de impacto lateral (ya hecha en Fase A, confirmada)

- Backfill ya aplicado y verificado — sin acción de código pendiente sobre eso.
- `lib/powersync/AppSchema.ts`: ya tiene todas las columnas necesarias
  (Slice 4) — sin cambio de schema en este slice.
- Ningún otro módulo del MVP se toca.

## Riesgos a cubrir en Fase B

- Verificar (o hacer verificar a Claude Code contra datos reales) que el
  backfill efectivamente corrió antes de dar por buena cualquier prueba
  — si no, vuelve el problema de INSERT sin resolver.
- Guardar offline → reconectar → confirmar que el cambio llega a Neon
  (no solo que quedó en SQLite local) — evidencia real con query en Neon.
- Guardar dos veces offline el mismo producto antes de reconectar (cola
  de 2 operaciones) → confirmar que ambas se aplican en orden correcto,
  el valor final en Neon es el de la segunda edición, no se pisan mal.
- `db.execute()` sobre una fila que no existiera (si el backfill no
  hubiera corrido) — no debe romper la UI silenciosamente; no es el
  caso esperado pero vale un test de defensa.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios (regresión).
2. Flag `true`, online: guardar un conteo físico, confirmar en Neon
   (SQL Editor) que el valor llegó correctamente — comparar con lo que
   se guardó en la UI.
3. Flag `true`, offline: guardar un conteo físico sin red, confirmar que
   la UI se actualiza al instante (optimistic). Reconectar, esperar
   sync, confirmar en Neon que el valor llegó.
4. Doble edición offline del mismo producto antes de reconectar → el
   valor final en Neon coincide con la última edición.
