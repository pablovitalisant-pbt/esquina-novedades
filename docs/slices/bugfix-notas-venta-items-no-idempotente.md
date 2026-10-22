# Bugfix — POST /api/notas-venta/[id]/items no es idempotente: retry infinito + doble descuento de stock

Encontrado en producción durante verificación manual de Task #5 (Notas de
Venta), inmediatamente después de corregir `bugfix-notas-venta-race-
lectura-local-y-retry-infinito.md`. Bug distinto y más grave: pérdida real
de stock en Postgres.

## Evidencia

Log de Vercel (error real, con stack):

```
NeonDbError: duplicate key value violates unique constraint "prenota_items_pkey"
code: '23505'
detail: 'Key (id)=(8a831862-7aa6-4f27-8aa1-0b22a87961d9) already exists.'
```

El ítem con ese `id` **ya existía** en `prenota_items` — se insertó
correctamente en un intento anterior. Algo después del INSERT (posible
candidato: el `UPDATE prenotas SET updated_at` que sigue, o un timeout de
red en el camino de vuelta) hizo que el cliente no recibiera un 200 limpio,
PowerSync lo tomó como fallo y reintentó. Cada reintento repite **todo**
el handler desde el inicio, incluido el descuento de stock, antes de
llegar al INSERT que ahora sí choca con la constraint única y devuelve
500. Un 500 se clasifica como reintentable en `BackendConnector.ts` →
loop infinito, sin backoff, visible en consola como decenas de intentos
por segundo.

Daño confirmado en Neon: producto `GL81264-1` (empresa_id 1) tenía
`stock_referencia: 200` al momento de agregar el ítem (1 unidad). El
saldo real cayó a 138 antes de que se cortara el loop — 62 unidades
descontadas quededo debería haber bajado solo 1. Corregido manualmente a
199 (200 - 1, la única unidad legítima) en `productos` y
`ubicaciones_bodega`, con aprobación explícita de Pablo, fuera de este
commit (corrección de datos, no de código).

## Causa raíz

`app/api/notas-venta/[id]/items/route.ts` — el handler `POST` no verifica
si el `id` del ítem (`itemId`, viene en el body — es el id local de
PowerSync, ver comentario línea 23) ya existe en `prenota_items` antes de
ejecutar el descuento de stock (líneas 52-57, 74-77) y el INSERT (líneas
79-83). Cualquier reintento de una operación ya aplicada exitosamente
vuelve a correr la lógica completa de negocio, no solo el INSERT.

## Fix

`app/api/notas-venta/[id]/items/route.ts`, al inicio del handler `POST`
(después de la validación de `id` ya aplicada en el bugfix anterior, antes
de tocar stock):

```ts
// Idempotencia: si este item ya fue insertado (reintento de PowerSync tras
// una respuesta que no llegó limpia al cliente), devolver la fila existente
// sin repetir el descuento de stock. Sin esto, cada reintento de un item ya
// aplicado vuelve a descontar stock antes de chocar con la unique constraint
// del INSERT — causó pérdida real de stock en producción (ver BUGS.md).
if (itemId) {
  const existente = await sql`
    SELECT * FROM public.prenota_items WHERE id = ${itemId}
  `;
  if (existente.length > 0) {
    return NextResponse.json(existente[0]);
  }
}
```

Va inmediatamente después de destructurar `body` (después de la línea que
define `itemId`, antes de la validación R7 de nota activa) — antes de
cualquier `UPDATE`/`INSERT`.

## No se toca

- El resto de la lógica de negocio (descuento de stock, validaciones R1,
  R3, R4, R6, R7) — sigue igual, solo se agrega el guard de idempotencia
  antes.
- No se investiga la causa exacta de por qué la primera respuesta no llegó
  limpia al cliente (timeout de red, latencia de Vercel, etc.) — el guard
  de idempotencia es correcto y suficiente independientemente de esa causa,
  es el patrón esperado para cualquier endpoint que PowerSync puede
  reintentar.
- `BackendConnector.ts` no se toca — el comportamiento de "500 =
  reintentable" es correcto en general; el problema era que este endpoint
  específico no toleraba el reintento.

## Verificar

1. Simular el escenario: insertar manualmentee un item con un `id` fijo,
   volver a llamar al mismo endpoint con el mismo `id` → debe devolver 200
   con la fila existente, sin descontar stock una segunda vez (confirmar
   `productos.saldo` sin cambios entre el primer y segundo llamado).
2. Regresión: agregar un ítem nuevo (id nuevo) sigue descontando stock
   normalmente, una sola vez.
3. Regresión: "Stock insuficiente" (400) sigue funcionando igual para
   ítems nuevos sin stock.
4. `npm run build` limpio, suite sin regresiones. DIFF antes de commit.

## Zona frágil (agregar a BUGS.md)

Cualquier endpoint que PowerSync pueda reintentar vía `BackendConnector.ts`
debe ser idempotente por `id`/`op.id` — si hace mutaciones de negocio
(descuento de stock, contadores, etc.) antes del INSERT/UPDATE final, un
reintento sin guard de idempotencia puede aplicar esas mutaciones más de
una vez aunque el registro final no se duplique. Revisar los demás
endpoints que reciben `op.id` desde `BackendConnector.ts` (`caja/
movimientos`, `caja/movimientos/[id]/notas`, `caja/config`, etc.) — **no
incluido en el alcance de este bugfix**, queda como tarea de auditoría
futura (candidato a ponytail audit).
