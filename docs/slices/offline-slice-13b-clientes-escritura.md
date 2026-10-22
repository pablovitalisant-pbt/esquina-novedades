# Slice 13b (Offline, Fase 1) — Clientes: lectura + escritura offline real

Contrato Fase A propuesto por Claude (Director Técnico). Depende de
Slice 13a (`clientes.id` ya es UUID, con cascada a `prenotas.cliente_id`
y `caja_movimientos.kcodcli2` — migración 030 aplicada y verificada en
producción, commit `90f79dd`) y de Slice 14 (anular nota offline —
commit `d2114da`), que habilita el DELETE de cliente con cascada
completa descrito abajo.

## Contrato

### `lib/powersync/AppSchema.ts`

Sin cambios — `clientes` ya tiene todas las columnas necesarias desde
Slice 6 (`nombre`, `telefono`, `direccion`, `notas`).

### `app/api/clientes/route.ts` (POST)

Aceptar `id` opcional del body crudo, mismo patrón `COALESCE` que todos
los slices anteriores:
```sql
INSERT INTO public.clientes (id, nombre, telefono, direccion, notas)
VALUES (COALESCE(${body.id ?? null}, gen_random_uuid()), ...)
```

### `app/api/clientes/[id]/route.ts`

**Sin cambios** — ya quedó string-safe en Slice 13a (se verificó por
grep: cero `parseInt`/`isNaN` en el archivo).

### `app/(app)/clientes/client_page.tsx`

- Tipo `Cliente.id`: `number` → `string`.
- Envolver en `PowerSyncProvider` gateado por flag nuevo
  `clientes-offline-lectura` (mismo patrón que Categorías/Caja Mayor —
  wrapper + contenido separado).
- `fetchClientes`: si `OFFLINE_READ && db`, reemplazar el fetch por
  lectura local:
  ```sql
  SELECT id, nombre, telefono, direccion, notas, created_at FROM clientes
  WHERE (? = '' OR nombre LIKE '%' || ? || '%')
  ORDER BY nombre ASC LIMIT 50
  ```
  Nota: SQLite `LIKE` ya es case-insensitive para ASCII por defecto —
  suficiente equivalente al `ILIKE` de Postgres para este caso de uso,
  se documenta la diferencia (no cubre acentos/no-ASCII) pero no se
  soluciona en este slice.
- `handleSave`: si offline, `crypto.randomUUID()` + `db.execute(INSERT
  INTO clientes (id, nombre, telefono, direccion, notas, created_at)
  VALUES (...))` (crear) o `db.execute(UPDATE clientes SET nombre = ?,
  telefono = ?, direccion = ?, notas = ? WHERE id = ?)` (editar).
- `handleDelete`: si offline, **antes** de borrar, replica el mismo
  chequeo en dos pasos que hace `app/api/clientes/[id]/route.ts`
  (ahora posible en su totalidad gracias a Slice 14, que permite que
  una nota llegue a `estado='anulada'` sin conexión):
  1. ```sql
     SELECT estado FROM prenotas WHERE cliente_id = ?
     ```
     Si alguna fila tiene `estado != 'anulada'`: bloquear con
     `toast.error('No se puede eliminar: el cliente tiene notas de venta
     asociadas')` (mismo mensaje que el 409 online) y no encolar nada.
  2. Si todas son `anulada` (o no hay ninguna): chequear movimientos de
     caja asociados:
     ```sql
     SELECT 1 FROM caja_movimiento_notas
     WHERE prenota_id IN (SELECT id FROM prenotas WHERE cliente_id = ?)
     LIMIT 1
     ```
     Si hay alguno: bloquear con el mismo mensaje que el 409 online
     ("existen movimientos de caja asociados a notas anuladas de este
     cliente").
  3. Si pasa ambos chequeos: `db.execute(DELETE FROM clientes WHERE id
     = ?)`. **No se borran localmente `prenotas`/`prenota_items`** — el
     cliente desaparece de la UI local al instante, pero sus notas
     anuladas siguen visibles en Notas de Venta hasta el próximo sync,
     que es cuando `DELETE /api/clientes/[id]` (reutilizado tal cual)
     hace el borrado en cascada real, server-side, atómico. Se
     documenta como límite aceptado — mismo patrón que "la UI local
     tarda un sync en reflejar cambios de otra tabla" ya usado en
     Slices 10b/14 (no se replica cascada de borrado multi-tabla
     localmente: SQLite local de PowerSync no aplica `ON DELETE
     CASCADE`, y hacerlo a mano agrega una condición de carrera —el
     405/409 del servidor podría no coincidir con lo ya borrado local—
     sin beneficio real, ya que el usuario ya ve el resultado correcto
     de inmediato en la pantalla que importa, Clientes).

### `lib/powersync/BackendConnector.ts`

Tres ramas nuevas, mismo patrón que `categorias`:
- `op.table === 'clientes'`, `op.op === 'PUT'` (insert): `POST
  /api/clientes` con `{id: op.id, nombre: data.nombre, telefono:
  data.telefono, direccion: data.direccion, notas: data.notas}`. 400
  (nombre vacío — no debería pasar, el form local ya valida) →
  descartar + reportar. 401/500/red → reintento.
- `op.table === 'clientes'`, `op.op === 'PATCH'` (edición): `PATCH
  /api/clientes/${op.id}` con solo los campos en `opData` (columnas
  cambiadas). 404 (cliente ya no existe, borrado desde otro
  dispositivo) → descartar + reportar. 401/500/red → reintento.
- `op.table === 'clientes'`, `op.op === 'DELETE'`: `DELETE
  /api/clientes/${op.id}`. 404 → descartar sin reportar (convergencia,
  mismo criterio que categorías). 409 (el chequeo local dio 0 notas
  pero, entre el chequeo y el sync, se creó una nota para este cliente
  desde otro dispositivo) → descartar + reportar — es un conflicto real.
  401/500/red → reintento.

### `config/feature-flags.json`

Nuevo flag `clientes-offline-lectura: false` (lectura + escritura,
mismo patrón que los módulos anteriores).

### No se toca

`app/(app)/clientes/page.tsx` (SSR sin cambios — no pasa props, el
flag decide todo en el client component), el resto de rutas ya
adaptadas en 13a.

## Riesgos a cubrir en Fase B

- **INSERT a DB (clientes)**: sin `UNIQUE` en `nombre` (a diferencia de
  categorías) — no hay riesgo de conflicto de duplicado por nombre;
  duplicados de id no son posibles por UUID generado por cliente.
- **DELETE — bloqueo local vs servidor**: test de que el chequeo local
  de dos pasos (nota activa / movimiento de caja) bloquea correctamente
  en cada caso, que un cliente con solo notas anuladas y sin movimientos
  de caja SÍ puede eliminarse offline, y que el 409 del servidor
  (carrera entre chequeo local y sync — ej. se registró un cobro para
  una de las notas anuladas entre el chequeo y el sync) se reporta a la
  bandeja sin romper la cola.
- **UPDATE a DB (edición)**: test de que solo se suben las columnas
  cambiadas (`opData` parcial), igual que `ubicaciones_bodega`.
- **Búsqueda local vs servidor**: test de que `LIKE` local y `ILIKE`
  servidor devuelven el mismo resultado para el caso común (sin
  acentos), documentando la diferencia conocida.
- **Doble evento async**: `handleSave` ya tiene `saving` como guard,
  sin cambios — test de regresión de que la rama offline lo respeta.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios.
2. Sync Stream: `clientes` ya está sincronizada desde Slice 6 — sin
   prerrequisito manual nuevo.
3. Flag `true`, online: crear/editar/eliminar cliente, buscar — igual
   que hoy, ids UUID.
4. Flag `true`, offline: las mismas acciones sin red → UI al instante.
   Reconectar, confirmar en Neon que llegó correcto, incluido un
   cliente creado y luego eliminado offline (sin huérfano, mismo id).
5. Offline, intentar eliminar un cliente con una nota **activa** →
   bloqueo local inmediato, sin op en la cola.
6. Offline: anular (Slice 14) todas las notas de un cliente de prueba,
   confirmar que no tiene movimientos de caja asociados, eliminar el
   cliente offline → desaparece de la UI local al instante. Reconectar,
   confirmar en Neon que el cliente y sus notas anuladas (+ items) se
   borraron en cascada correctamente.
7. Offline, cliente con notas anuladas pero CON movimiento de caja
   asociado → bloqueo local inmediato con el mensaje correspondiente.
8. Suite completa sin regresiones, `npm run build` limpio.
