# Slice 14 (Offline, Fase 1) — Notas de Venta: anular offline

Contrato Fase A propuesto por Claude (Director Técnico). Prerrequisito
pedido por Pablo antes de extender Slice 13b (Clientes) para poder
borrar offline un cliente cuyas notas son solo anuladas — hoy esa
cascada no se puede hacer offline porque anular una nota, en sí mismo,
no es una capacidad offline. Este slice la agrega.

## Alcance

Solo la acción **"Anular"** existente — `DELETE /api/notas-venta/[id]`
(sin pago registrado, revierte stock). **Fuera de alcance**:
"Reembolsar" (`POST /api/notas-venta/[id]/reembolsar` — anula una nota
CON pagos, crea un movimiento de reembolso en `caja_movimientos` y
reversa cada pago) — es una operación mucho más grande, encadenada con
Caja Mayor, que amerita su propio slice si se necesita más adelante.

## Dos puntos de uso, mismo endpoint

1. **`app/(app)/notas-venta/client_page.tsx`** (`handleEliminar`, lista):
   flujo completo — bloquea con 409 si hay pago registrado, si no,
   anula y restaura stock.
2. **`app/(app)/notas-venta/[id]/client_page.tsx`** (botón "← Volver",
   línea 604-616): caso trivial — solo dispara si la nota está vacía
   (`items.length === 0`), nunca puede tener pago ni stock que
   restaurar.

## Por qué es simple (solo UPDATE, sin INSERT)

El `DELETE` real es: `UPDATE prenotas SET estado='anulada'` +
`UPDATE productos SET saldo = saldo + N` + `UPDATE ubicaciones_bodega
SET saldo = saldo + N` (uno por cada producto de la nota). Ninguna fila
nueva — mismo perfil de riesgo que Bodega (Slice 5): filas ya
sincronizadas, solo se actualizan. `prenotas.id` nunca cambió de tipo
(sigue `SERIAL`/integer, nunca se crea localmente), sin problema de
reconciliación de id.

## Decisión de diseño — no restaurar stock localmente

A diferencia de replicar el `UPDATE` de stock en el dispositivo, la
rama offline **solo** actualiza `prenotas.estado` localmente. La
restauración de stock la hace el `DELETE /api/notas-venta/[id]`
existente, reutilizado tal cual, cuando `BackendConnector` sincroniza.

Razón: `ubicaciones_bodega` ya tiene una rama en `BackendConnector`
(Slice 5) que sube `fisico_cajas`/`fisico_unidades`/`observaciones` —
no un delta de `saldo` directo. Mutar `saldo` localmente generaría un
op que esa rama no sabe interpretar. Consecuencia aceptada: el stock
visible localmente (Bodega/Precios) quedará desactualizado hasta el
próximo sync completo — mismo tipo de limitación ya aceptada en Slice
10b ("sin decremento local de `productos.saldo`" al agregar un item).
El estado de la nota (`anulada`) sí se ve al instante — es lo que el
usuario necesita confirmar en el momento.

## Contrato

### `app/(app)/notas-venta/client_page.tsx`

`handleEliminar`: si `OFFLINE_READ && db`:
1. Chequeo local de pago (replica el `SELECT` del servidor):
   ```sql
   SELECT COALESCE(SUM(CASE WHEN cm.tipo = 'reembolso' THEN -cmn.monto_aplicado ELSE cmn.monto_aplicado END), 0) AS total
   FROM caja_movimiento_notas cmn
   JOIN caja_movimientos cm ON cm.id = cmn.movimiento_id
   WHERE cmn.prenota_id = ?
   ```
   Si `total > 0`: mismo toast/acción "Ir a reembolsar" que el 409 del
   servidor, no se encola nada.
2. Si no hay pago: `db.execute(UPDATE prenotas SET estado = 'anulada',
   updated_at = ? WHERE id = ? AND estado = 'activa')`. Actualizar
   estado local (`setPrenotas(prev => prev.filter(...))`, igual que hoy)
   y `toast.success('Nota anulada')`.

### `app/(app)/notas-venta/[id]/client_page.tsx`

El caso "← Volver" con nota vacía: si `OFFLINE_READ && db`,
`db.execute(UPDATE prenotas SET estado = 'anulada', updated_at = ?
WHERE id = ? AND estado = 'activa')` en vez del `fetch(DELETE)`. Sin
chequeo de pago (garantizado `items.length === 0`).

### `lib/powersync/BackendConnector.ts`

Nueva rama `op.table === 'prenotas' && op.op === 'PATCH'`: reutiliza
`DELETE /api/notas-venta/${op.id}` tal cual (mismo endpoint que ya hace
el chequeo de pago + anula + restaura stock, atómico, server-side):
```ts
const res = await fetch(`/api/notas-venta/${op.id}`, { method: 'DELETE' });
```
- `res.ok` → continue.
- `409` (pago registrado — carrera: se pagó desde otro dispositivo
  entre el chequeo local y el sync): descartar + reportar a la bandeja
  (conflicto real — el usuario creyó que anulaba sin pago).
- `404` (ya anulada — convergencia, ej. anulada desde otro dispositivo):
  descartar sin reportar.
- `401/500/red`: no completar, reintento.

**Importante**: esta rama solo debe dispararse para el caso `estado →
'anulada'`. Si en el futuro `prenotas` gana otros campos editables
offline, hay que distinguir por `opData` (por ahora es el único campo
que este slice permite mutar localmente en `prenotas`, así que no hay
ambigüedad).

### No se toca

`app/api/notas-venta/[id]/route.ts` (el `DELETE` se reutiliza sin
cambios), `app/api/notas-venta/[id]/reembolsar/route.ts` (fuera de
alcance), `lib/powersync/AppSchema.ts` (`prenotas.estado` ya es
`column.text` desde Slice 6).

## Riesgos a cubrir en Fase B

- **Carrera de pago**: nota sin pago localmente, pero pagada desde otro
  dispositivo antes de sincronizar → 409 al sync → reportado a la
  bandeja, no se pierde silenciosamente.
- **Doble anulación**: anular la misma nota desde dos dispositivos
  offline → el segundo sync da 404 → descartado sin ruido
  (convergencia, no es un conflicto real).
- **Nota vacía por "Volver"**: test de que no dispara el chequeo de pago
  (no aplica) y anula directo.
- **Regresión Slice 6**: la lectura local de `prenotas` (lista y
  detalle) debe reflejar `estado = 'anulada'` al instante tras el
  UPDATE local, antes de sincronizar.
- **Stock desactualizado localmente tras anular offline**: documentar
  explícitamente (no es un bug, es la limitación aceptada arriba) — test
  de que NO se genera ningún op para `productos`/`ubicaciones_bodega`
  desde esta acción.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios.
2. Flag `true`, online: anular nota sin pago (lista y "Volver" con nota
   vacía), intentar anular una con pago (bloqueo) — igual que hoy.
3. Flag `true`, offline: anular una nota sin pago sin red → estado
   cambia al instante en la UI local. Reconectar, confirmar en Neon que
   `estado='anulada'` y que el stock de `productos`/`ubicaciones_bodega`
   se restauró correctamente (lo hizo el servidor al sincronizar).
4. Offline, intentar anular una nota con pago → bloqueo local inmediato
   con el mismo mensaje que el 409 online.
5. Suite completa sin regresiones, `npm run build` limpio.
