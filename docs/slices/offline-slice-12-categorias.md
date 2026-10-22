# Slice 12 (Offline, Fase 1) — Categorías: lectura + escritura offline real

Contrato Fase A propuesto por Claude (Director Técnico). Directiva de
Pablo (2026-08-01): toda la aplicación debe funcionar offline, sin
excepción — incluidos los módulos de administración. A partir de acá se
retoman los módulos restantes en un solo contrato lectura+escritura por
módulo (no se separa en dos slices como Bodega/Notas de Venta/Caja
Mayor), porque el análisis de riesgo de cada uno resultó bajo — se
justifica caso por caso más abajo.

## Alcance

Lectura y reasignación de categoría de productos (drag-and-drop, individual
y grupal) offline. **Fuera de alcance**: "Generar catálogo" (botón
existente en la UI) — pertenece al módulo Catálogo admin, se trata en un
slice aparte.

## Por qué esto es más simple que Notas de Venta / Caja Mayor

- `productos.categoria` es una columna `TEXT` libre, sin FK — la
  reasignación es un `UPDATE productos SET categoria = ...`, nunca un
  INSERT. Mismo perfil de riesgo que Bodega (Slice 5): fila ya
  sincronizada, solo se actualiza, sin problema de reconciliación de id.
- `categorias` no tiene ningún FK dependiente — verificado por grep en
  `migrations/`, ninguna tabla referencia `categorias(id)`. El join con
  `productos` es por **nombre**, no por id (`WHERE p.categoria =
  c.nombre`, ver `app/api/categorias/route.ts`).
- Aun así, se migra `categorias.id` a UUID (ver abajo) — no por una FK a
  proteger, sino para evitar un caso real: crear una categoría offline y
  eliminarla offline antes de reconectar. Sin id estable, el DELETE
  intentaría borrar por un id local que el servidor nunca vio (la
  categoría synced tendría OTRO id, generado por `gen_random_uuid()`
  del lado servidor) — el DELETE fallaría silenciosamente y la
  categoría quedaría huérfana en el servidor. Con id generado por el
  cliente, local = servidor siempre, sin ese caso.

## Contrato

### Archivo nuevo — `migrations/029_categorias_uuid.sql`

Mismo patrón que Slice 10a (sin FK que migrar, más simple):
```sql
ALTER TABLE public.categorias ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
UPDATE public.categorias SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
ALTER TABLE public.categorias ALTER COLUMN id_uuid SET NOT NULL;
ALTER TABLE public.categorias DROP CONSTRAINT categorias_pkey;
ALTER TABLE public.categorias RENAME COLUMN id TO id_int_legacy;
ALTER TABLE public.categorias RENAME COLUMN id_uuid TO id;
ALTER TABLE public.categorias ADD PRIMARY KEY (id);
```
`nombre UNIQUE` no se toca, sigue protegiendo duplicados.

### `lib/powersync/AppSchema.ts`

Nueva tabla:
```ts
categorias: new Table({
  nombre: column.text,
  created_at: column.text,
}),
```
`productos` no cambia — `categoria: column.text` ya existe desde Slice 7.

### `app/api/categorias/route.ts` (POST)

Aceptar `id` opcional del body crudo, mismo patrón `COALESCE`:
```sql
INSERT INTO categorias (id, nombre) VALUES (COALESCE(${body.id ?? null}, gen_random_uuid()), ${nombre.trim()})
```
El `catch` de `error.code === '23505'` (nombre duplicado, `→ 400`) sigue
igual — es el caso de conflicto real (dos dispositivos crean la misma
categoría offline).

### `app/api/categorias/[id]/route.ts` (DELETE)

**No requiere cambio de código** — `id` ya se usa sin `parseInt`,
interpolado directo en los templates `sql`. Verificado por lectura
completa del archivo.

### `app/api/productos/[id]/route.ts` (PUT)

**No requiere cambio de código.** El whitelist de columnas ya acepta
`categoria` de forma aislada — cuando el body solo trae `{categoria:
...}`, ninguna de las ramas de anti-drift (`hasCosto`/`hasMargen`/
`hasPrcVenta`) se activa, y ninguna propagación a
`ubicaciones_bodega`/`prenota_items` se dispara (esas solo miran
`detalle`/`imagen_url`/`prcventa`). Verificado por lectura completa del
archivo — la reasignación de categoría es, en los hechos, un UPDATE de
una sola columna sin efectos colaterales.

### `app/(app)/admin/categorias/client_page.tsx`

- Tipo `Categoria.id`: `number` → `string`.
- `OFFLINE_READ` (nuevo flag `categorias-offline-lectura`) + `db` via
  `usePowerSync()` (requiere envolver en `PowerSyncProvider`, mismo
  patrón que los demás módulos).
- `fetchProductos`: si offline, reemplazar el `fetch(GET
  /api/admin/productos-lista)` por una query local sobre `productos`
  replicando los 3 filtros del servidor (por categoría / sin categoría /
  todos, cada uno con y sin búsqueda) con `LIMIT`/`OFFSET` para el
  scroll infinito. Sin `DISTINCT ON` (no existe en SQLite, y no hace
  falta: single-tenant, PowerSync ya sincroniza una fila por producto).
- Carga inicial de `categorias` (hoy prop `initialCategorias` desde
  `page.tsx`, SSR): si offline-first real (app reabierta sin red), el
  SSR no puede ejecutar — mismo caso ya aceptado y diferido para todos
  los módulos anteriores (tarea #12, precache de Serwist en dev). Con
  build de producción no debería reproducirse; se verifica junto con esa
  tarea, no en este slice.
- `handleCrearCategoria`: si offline, `db.execute(INSERT INTO
  categorias (id, nombre, created_at) VALUES (?, ?, ?))` con
  `crypto.randomUUID()` — mismo patrón que Slice 10b.
- `handleEliminarCategoria`: si offline, `db.execute(DELETE FROM
  categorias WHERE id = ?)`.
- `handleDragEnd` (single y group): si offline, reemplazar el/los
  `fetch(PUT /api/productos/${id})` por `db.execute(UPDATE productos SET
  categoria = ? WHERE id = ?)` — el optimistic update de React ya
  existente no cambia, solo la fuente de la escritura.

### `lib/powersync/BackendConnector.ts`

Tres ramas nuevas, mismo patrón que las existentes:
- `op.table === 'categorias'`, `op.op === 'PUT'` (insert): `POST
  /api/categorias` con `{id: op.id, nombre: data.nombre}`. 400
  (nombre duplicado) → descartar + reportar conflicto. 401/500/red →
  reintento.
- `op.table === 'categorias'`, `op.op === 'DELETE'`: `DELETE
  /api/categorias/${op.id}`. 404 (ya no existe, ej. borrada desde otro
  dispositivo) → descartar sin reportar (no es un conflicto real, es
  convergencia). 401/500/red → reintento.
- `op.table === 'productos'`, `op.op === 'PATCH'`: `PUT
  /api/productos/${op.id}` con **solo** `{categoria: data.categoria}`
  (el `opData` de un UPDATE local únicamente trae la columna que cambió,
  mismo comportamiento ya documentado para `ubicaciones_bodega`). 400
  ("Categoria no valida", ej. la categoría todavía no sincronizó desde
  otro dispositivo) / 403 (producto de otra empresa, no debería pasar
  single-tenant) / 404 → descartar + reportar. 401/500/red → reintento.

### `config/feature-flags.json`

Nuevo flag `categorias-offline-lectura: false` — cubre lectura y
escritura juntas (mismo patrón que Bodega/Caja Mayor, un flag por
módulo).

### No se toca

`app/(app)/admin/categorias/page.tsx` (SSR inicial sin cambios — el
flag decide si se monta `PowerSyncProvider` en el client component, no
en el server component), `CrearCatalogoDialog` (fuera de alcance, ver
"Alcance" arriba), `app/api/admin/productos-lista/route.ts` (se
reutiliza tal cual para el flujo online, sin cambios).

## Riesgos a cubrir en Fase B

- **INSERT a DB (categorías)**: duplicados — `id` UUID generado por
  cliente previene colisión; `nombre UNIQUE` sigue protegiendo contra
  dos categorías con el mismo nombre (test: 400 al sincronizar, se
  reporta a la bandeja).
- **Crear + eliminar categoría offline antes de reconectar**: test
  explícito de que el DELETE, al sincronizar, encuentra el id correcto
  (porque es el mismo generado localmente) — este es el caso que motivó
  la migración a UUID.
- **UPDATE a DB (productos.categoria)**: reasignar a una categoría que
  todavía no sincronizó desde otro dispositivo → 400 "Categoria no
  valida" → conflicto reportado, no bloquea la cola. Test explícito.
- **Reasignación grupal (`isGroupDrag`)**: N productos a la vez — cada
  uno genera su propio op `PATCH` en la cola; test de que todos se suben
  correctamente y en orden, sin que uno bloquee a los demás si falla
  (cada op se maneja independientemente, no en lote).
- **Búsqueda + scroll infinito offline**: test de que la paginación
  local (`LIMIT`/`OFFSET`) devuelve los mismos resultados que el
  servidor para los 3 filtros (categoría / sin categoría / todos), con y
  sin búsqueda.
- **Doble evento async**: el `Promise.all` de la reasignación grupal ya
  existe — test de que la rama offline no lo necesita (cada
  `db.execute` es síncrono con la cola local, no hay condición de
  carrera de red que cubrir ahí).

## Verificación esperada (Fase D)

1. Migración 029 aplicada en producción (Pablo) — confirmar `\d
   categorias` muestra `id UUID PRIMARY KEY`.
2. Sync Stream: agregar `categorias` (prerrequisito manual, Pablo, antes
   de probar lectura/escritura offline).
3. Flag `false`: comportamiento actual sin cambios.
4. Flag `true`, online: crear categoría, reasignar producto (individual
   y grupal), eliminar categoría — funciona igual, ids UUID.
5. Flag `true`, offline: las mismas 4 acciones sin red → UI se actualiza
   al instante. Reconectar, confirmar en Neon que todo llegó correcto,
   incluida la categoría creada y luego eliminada offline (no debe
   quedar huérfana).
6. Suite completa sin regresiones, `npm run build` limpio.
