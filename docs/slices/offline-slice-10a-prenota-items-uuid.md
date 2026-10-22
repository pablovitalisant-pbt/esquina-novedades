# Slice 10a (Offline, Fase 1) — Notas de Venta: migrar prenota_items.id a UUID

Contrato Fase A propuesto por Claude (Director Técnico). Decisión de
Pablo (2026-08-01, Opción B): migrar `prenota_items.id` de `SERIAL` a
`UUID` generado por el cliente, para que el id local de PowerSync y el
id real en Postgres sean siempre el mismo — sin reconciliación. Prepara
el terreno para Slice 10b (escritura offline real de "agregar producto").
Este slice **no agrega escritura offline todavía** — solo migra el
schema y adapta el flujo online existente para que siga funcionando
igual, ahora con UUID.

## Por qué esta migración es segura

Verificado por grep: ninguna otra tabla tiene una `FOREIGN KEY` hacia
`prenota_items(id)` — es un nodo hoja, nada referencia sus filas por id.
Solo dos archivos de rutas y un `client_page.tsx` consumen ese id
directamente. Cambio contenido.

## Contrato

### Archivo nuevo

- **`migrations/027_prenota_items_uuid.sql`**:
  ```sql
  -- Migra prenota_items.id de SERIAL a UUID generado por el cliente.
  -- Necesario para que un INSERT local de PowerSync (Slice 10b) use el
  -- mismo id en el dispositivo y en Postgres, sin reconciliacion.
  -- Verificado: ninguna FK externa referencia prenota_items(id).

  ALTER TABLE public.prenota_items ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
  UPDATE public.prenota_items SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
  ALTER TABLE public.prenota_items ALTER COLUMN id_uuid SET NOT NULL;

  ALTER TABLE public.prenota_items DROP CONSTRAINT prenota_items_pkey;
  ALTER TABLE public.prenota_items RENAME COLUMN id TO id_int_legacy;
  ALTER TABLE public.prenota_items RENAME COLUMN id_uuid TO id;
  ALTER TABLE public.prenota_items ADD PRIMARY KEY (id);

  -- id_int_legacy se conserva por seguridad/auditoria (rollback), sin uso
  -- en codigo desde este commit. Candidato a DROP en una limpieza futura
  -- una vez verificado en produccion.
  ```
  `gen_random_uuid()` es nativa de Postgres desde la v13 (sin necesidad de
  `CREATE EXTENSION pgcrypto`) — confirmar la versión de Postgres de Neon
  antes de aplicar (si es anterior a 13, agregar la extensión).

### Archivos modificados

- **`app/api/notas-venta/[id]/items/route.ts`** (POST): aceptar un `id`
  opcional en el body (lo va a mandar `BackendConnector` en Slice 10b
  con el id generado localmente por PowerSync; el flujo online actual,
  sin ese campo, sigue funcionando igual). INSERT:
  ```sql
  INSERT INTO public.prenota_items (id, prenota_id, codigo, descripcion, imagen_url, empresa_id, cajas, unidades, precio, stock_referencia)
  VALUES (COALESCE(${body.id ?? null}, gen_random_uuid()), ${id}, ${codigo}, ${descripcion}, ${imagen_url}, ${empresa_id}, ${cajas}, ${unidades}, ${precio}, ${stock_referencia})
  RETURNING *
  ```

- **`app/api/notas-venta/[id]/items/[itemId]/route.ts`** (PATCH, DELETE):
  quitar el `Number(itemId)` — `itemId` pasa a tratarse como string (UUID)
  en todas las queries que lo usan (`WHERE id = ${itemId}`). Sin cambios
  de lógica de negocio (stock, validación de nota activa, etc.).

- **`app/(app)/notas-venta/[id]/client_page.tsx`**: los tipos/usos de
  `itemId`/`item.id` pasan de `number` a `string` (`eliminarItem`,
  `handleGuardar`, `autoFocusItemId`, `consumedAutoFocusRef`, etc.) — es
  un cambio mecánico de tipos, la lógica no cambia.

### No se toca

`prenotas.id` (sigue `SERIAL`, no tiene el problema de INSERT local — la
lectura offline de Notas de Venta, Slice 6, nunca crea filas de
`prenotas`), `caja_movimiento_notas.prenota_id` (FK a `prenotas`, no a
`prenota_items`, no afectado), `lib/powersync/AppSchema.ts` (no requiere
cambios — PowerSync ya maneja `id` como texto automáticamente, sin
declararlo).

## Riesgos a cubrir en Fase B

- **Migración de datos existente**: verificar contra Neon real que todas
  las filas actuales de `prenota_items` tienen `id_uuid` poblado antes
  del `SET NOT NULL` (la migración lo hace en 2 pasos — `ADD COLUMN` con
  default + `UPDATE` explícito para las filas ya existentes al momento
  del `ADD COLUMN`, por si el `DEFAULT` no alcanza a aplicar
  retroactivamente en todas).
- **Regresión completa del flujo online**: agregar producto a una nota,
  editar cantidad, eliminar item — deben comportarse exactamente igual
  que hoy, con la única diferencia de que el id ahora es un UUID visible
  en vez de un número. Cubrir con los tests existentes de Notas de Venta
  actualizados a UUIDs de prueba.
- **`stock_referencia` y demás columnas sin cambios**: confirmar que el
  `SELECT *`/`RETURNING *` no rompe ningún consumidor que asuma un orden
  de columnas específico (no debería, se accede por nombre en todos
  lados, pero vale confirmar).

## Verificación esperada (Fase D)

1. Migración aplicada en producción (Pablo, mismo método que las
   anteriores) — confirmar `\d prenota_items` muestra `id UUID PRIMARY
   KEY`.
2. Flujo online completo sin regresión: agregar, editar, eliminar item
   en una nota real — funciona igual, ids ahora son UUID.
3. Suite completa sin regresiones (tests actualizados para UUIDs donde
   corresponda).
4. `npm run build` limpio.
