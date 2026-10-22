# Slice 13a (Offline, Fase 1) — Clientes: migrar clientes.id a UUID (+ cascada)

Contrato Fase A propuesto por Claude (Director Técnico). Decisión de
Pablo (2026-08-01, Opción A confirmada tras dos correcciones de rumbo
mías documentadas abajo): migrar `clientes.id` a UUID, con cascada a
`prenotas.cliente_id` (FK real) y `caja_movimientos.kcodcli2` (mismo
valor semántico, sin FK formal). Cero escritura offline nueva en este
slice — solo migra el schema y adapta el flujo online existente. La
lectura/escritura offline real del módulo Clientes es Slice 13b.

## Historial de la decisión (para que quede registrado)

1. Pregunté Opción A/B — Pablo eligió A (completo).
2. Al investigar el alcance real (17 archivos tocan `cliente_id`/
   `kcodcli2`), encontré que ni la asignación de cliente a una nota
   (`PATCH /api/notas-venta/[id]`) ni el buscador de clientes de Caja
   Mayor (que además solo muestra clientes con notas previas, `JOIN` no
   `LEFT JOIN`) tienen rama offline hoy — el escenario "crear cliente
   offline y venderle al toque" no es un camino de código que exista
   actualmente. Recomendé bajar a Opción B (sin migración). Pablo
   confirmó el cambio de rumbo.
3. Verificación posterior (búsqueda activa, `docs.powersync.com`):
   PowerSync **recomienda explícitamente** id generado por el cliente
   para cualquier INSERT offline — sin eso, cuando el servidor asigna su
   propio id (SERIAL) y esa fila se vuelve a sincronizar hacia abajo,
   queda **duplicada** localmente (la fila local original bajo su id
   temporal, más la fila real bajo el id del servidor). Esto no depende
   de si otro módulo referencia el id — es un problema de INSERT en sí
   mismo. Además, aunque no hubiera necesidad offline, cambiar el tipo
   de `clientes.id` sin migrar `prenotas.cliente_id`/`caja_movimientos.
   kcodcli2` rompe los `JOIN`/comparaciones existentes de inmediato
   (Postgres no castea implícito `integer = uuid`) — la cascada es
   obligatoria para que la app online siga funcionando, no opcional.
   Con esto, Opción A vuelve a ser la correcta. Pablo confirmó de nuevo.

Fuente: [Client ID - PowerSync docs](https://docs.powersync.com/usage/sync-rules/client-id).

## Hallazgo adicional — bug latente en Slice 6 (lectura Notas de Venta)

`AppSchema.ts` declara `prenotas.cliente_id` como `column.integer`. El
query local de Notas de Venta (`client_page.tsx` línea 266, `LEFT JOIN
clientes c ON c.id = p.cliente_id`) compara contra `c.id`, el id
especial de PowerSync — siempre texto. Mismo patrón que el bug de
`caja_movimiento_notas.movimiento_id` encontrado en Slice 11b: "funciona"
hoy por afinidad dinámica con ids SERIAL, se rompe con UUID real. Se
corrige en este slice.

## Contrato

### Archivo nuevo — `migrations/030_clientes_uuid.sql`

```sql
-- Migra clientes.id de SERIAL a UUID generado por el cliente, con
-- cascada a prenotas.cliente_id (FK real, migracion 009) y
-- caja_movimientos.kcodcli2 (mismo valor semantico, sin FK formal pero
-- comparado directamente contra clientes.id/prenotas.cliente_id en
-- multiples queries).

-- 1. clientes
ALTER TABLE public.clientes ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
UPDATE public.clientes SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
ALTER TABLE public.clientes ALTER COLUMN id_uuid SET NOT NULL;

-- 2. prenotas.cliente_id (backfill por join antes de soltar la FK vieja)
ALTER TABLE public.prenotas ADD COLUMN cliente_id_uuid UUID;
UPDATE public.prenotas p
  SET cliente_id_uuid = c.id_uuid
  FROM public.clientes c
  WHERE c.id = p.cliente_id;
-- cliente_id es nullable (notas sin cliente asignado) — no SET NOT NULL.

-- 3. caja_movimientos.kcodcli2 (sin FK, mismo backfill por join)
ALTER TABLE public.caja_movimientos ADD COLUMN kcodcli2_uuid UUID;
UPDATE public.caja_movimientos m
  SET kcodcli2_uuid = c.id_uuid
  FROM public.clientes c
  WHERE c.id = m.kcodcli2;
-- kcodcli2 también nullable (gastos sin cliente) — no SET NOT NULL.

-- 4. Soltar FK vieja (prenotas -> clientes) y PK vieja (clientes).
ALTER TABLE public.prenotas DROP CONSTRAINT prenotas_cliente_id_fkey;
ALTER TABLE public.clientes DROP CONSTRAINT clientes_pkey;

-- 5. Renombrar: columnas int quedan como legacy, uuid pasa a ser la real.
ALTER TABLE public.clientes RENAME COLUMN id TO id_int_legacy;
ALTER TABLE public.clientes RENAME COLUMN id_uuid TO id;
ALTER TABLE public.prenotas RENAME COLUMN cliente_id TO cliente_id_int_legacy;
ALTER TABLE public.prenotas RENAME COLUMN cliente_id_uuid TO cliente_id;
ALTER TABLE public.caja_movimientos RENAME COLUMN kcodcli2 TO kcodcli2_int_legacy;
ALTER TABLE public.caja_movimientos RENAME COLUMN kcodcli2_uuid TO kcodcli2;

-- 6. Recrear PK y FK sobre las columnas UUID.
ALTER TABLE public.clientes ADD PRIMARY KEY (id);
ALTER TABLE public.prenotas
  ADD CONSTRAINT prenotas_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id);
-- Sin ON DELETE explícito en la FK original (verificar contra Neon real
-- antes de aplicar — si tenía CASCADE/RESTRICT/SET NULL, replicarlo
-- igual acá; no asumir).
```

**Verificación previa obligatoria (no asumir)**: confirmar contra
`pg_constraint` el nombre real de la FK `prenotas.cliente_id →
clientes(id)` y su `ON DELETE` antes de escribir el `DROP
CONSTRAINT`/`ADD CONSTRAINT` — mismo procedimiento que Slice 11a con
`caja_movimiento_notas_movimiento_id_fkey`.

### `lib/powersync/AppSchema.ts`

- `prenotas.cliente_id`: `column.integer` → `column.text` (bugfix, ver
  hallazgo arriba).
- `caja_movimientos.kcodcli2`: `column.integer` → `column.text`.
- `clientes`: sin cambios (no declara `id`, PowerSync lo maneja solo).

### Archivos modificados (adaptar flujo online existente, sin lógica nueva)

- **`app/api/clientes/route.ts`** (POST): aceptar `id` opcional del
  body crudo, `COALESCE(id, gen_random_uuid())` — mismo patrón que
  todas las migraciones anteriores (preparación para Slice 13b).
- **`app/api/clientes/[id]/route.ts`** (GET, PATCH, DELETE): quitar
  `parseInt`/`isNaN` — `id` como string en todo.
- **`app/api/notas-venta/route.ts`** (POST): quitar `parseInt(body.
  cliente_id, 10)` — usar `body?.cliente_id ?? null` directo.
- **`app/api/notas-venta/[id]/route.ts`** (PATCH): quitar `Number(body.
  cliente_id)` (dos lugares) y el cast `::int` en el `UPDATE`.
- **`app/api/caja/movimientos/route.ts`**: quitar `::bigint` en los dos
  `SELECT` (GET y el `RETURNING` del POST) sobre `kcodcli2`.
- **`app/api/caja/movimientos/[id]/route.ts`** (PATCH, R28): la
  comparación `newKcodcli2 !== parseInt(String(current.kcodcli2 ||
  "0"), 10)` pasa a comparación directa de strings (`newKcodcli2 !==
  (current.kcodcli2 ?? null)`).
- **`app/api/caja/movimientos/[id]/notas/route.ts`**: quitar
  `parseInt(mov.kcodcli2, 10)` — usar `mov.kcodcli2` directo en la
  comparación `p.cliente_id = ${kcodcli2}`.
- **`app/api/caja/resumen/[kcodcli2]/route.ts`**: quitar
  `parseInt`/`isNaN` del param de ruta — `kcodcli2` como string.
- **`app/api/caja/notas/[kcodcli2]/route.ts`**: mismo cambio.
- **`app/api/caja/export/route.ts`**: quitar `::bigint` del `SELECT`.
- **`docs/specs/caja-mayor.spec.ts`**: `kcodcli2` en
  `CajaMovimientoCreateSchema`/`CajaMovimientoUpdateSchema` pasa de
  `z.coerce.number().int().positive().nullable().optional()` a
  `z.string().nullable().optional()`; campos `cliente_id`/`kcodcli2` en
  `CajaMovimiento`, `NotaVentaConSaldo`, `NotaBusquedaResult`,
  `ImputacionResult` (si aplica) pasan de `number` a `string`.
- **`app/(app)/caja-mayor/client_page.tsx`**: `ClienteOption.
  cliente_id`: `number` → `string`. Quitar `Number(cliente.cliente_id)`
  en el `body` del `fetch(POST)` online y en el `db.execute` local
  offline (Slice 11b) — pasa el string tal cual.
- **`app/(app)/notas-venta/[id]/client_page.tsx`**: `asignarCliente`
  envía `c.id` sin casts — ya es string-safe (tipos `any` en ese
  bloque), confirmar con `tsc` que no rompe nada.

### No se toca

`app/api/caja/clientes/route.ts` (sin casts numéricos, confirmado por
lectura completa), `app/api/caja/nota-busqueda/route.ts` (sin casts),
`app/api/notas-venta/[id]/pagar/route.ts` y `.../reembolsar/route.ts`
(usan `nota.cliente_id ?? null` reenviado directo a otro INSERT, sin
parseInt — mismo patrón ya verificado seguro en Slice 11a), tabla
`categorias` (sin relación).

## Riesgos a cubrir en Fase B

- **Constraint name real**: verificar contra Neon antes del `DROP
  CONSTRAINT` de `prenotas_cliente_id_fkey` (nombre y `ON DELETE`).
- **Backfill completo**: `prenotas.cliente_id_uuid` y `caja_movimientos.
  kcodcli2_uuid` deben quedar correctamente poblados por el join para
  el 100% de las filas que tenían un valor no nulo — verificar
  `COUNT(*) WHERE cliente_id IS NOT NULL AND cliente_id_uuid IS NULL =
  0` antes de continuar (a diferencia de Slice 11a, acá NO se hace
  `SET NOT NULL` porque el campo es opcional — el riesgo es un backfill
  incompleto silencioso, no un `SET NOT NULL` que falle ruidosamente).
- **Regresión Slice 6** (bug latente): la lectura offline de Notas de
  Venta debe seguir mostrando el nombre del cliente asignado
  (`cliente_nombre`) tras el fix de tipo.
- **Regresión completa del flujo online**: crear/editar/eliminar
  cliente, asignar/quitar cliente de una nota, buscar clientes en Caja
  Mayor, registrar cobro con cliente, resumen de cliente — todo igual,
  ids ahora UUID.
- **R28 de `movimientos/[id]/route.ts`** (borrar imputaciones si cambia
  el cliente): test explícito de que la comparación de strings
  reemplaza correctamente a la comparación numérica sin cambiar el
  comportamiento.

## Verificación esperada (Fase D)

1. Migración 030 aplicada en producción (Pablo) — confirmar `\d
   clientes` → `id UUID PRIMARY KEY`, `\d prenotas` → `cliente_id UUID`
   con FK activa, `\d caja_movimientos` → `kcodcli2 UUID`.
2. Flujo online completo sin regresión (los 6 puntos del riesgo de
   arriba, verificados contra datos reales).
3. Lectura offline de Notas de Venta y Caja Mayor sin regresión
   (incluye el bugfix de `cliente_id`/`kcodcli2` en `AppSchema.ts`).
4. Suite completa sin regresiones, `npm run build` limpio.
