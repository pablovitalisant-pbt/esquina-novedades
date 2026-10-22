# Slice 11a (Offline, Fase 1) — Caja Mayor: migrar caja_movimientos.id a UUID

Contrato Fase A propuesto por Claude (Director Técnico). Decisión de
Pablo (2026-08-01, Opción A confirmada): migrar `caja_movimientos.id` y
la FK `caja_movimiento_notas.movimiento_id` a UUID juntos, para habilitar
después (Slice 11b) escritura offline de "registrar cobro/gasto" **y**
"imputación manual a nota" en la misma acción. Datos actuales en
producción son solo de prueba (confirmado por Pablo) — baja el riesgo de
la migración, pero no cambia la mecánica: hay que hacerla bien igual.

Este slice **no agrega escritura offline todavía** — solo migra el
schema y adapta el flujo online existente (mismo patrón que Slice 10a
para `prenota_items`, pero acá con una FK real de por medio).

## Por qué es más compleja que Slice 10a

`prenota_items` no tenía ninguna FK apuntándole. `caja_movimientos` sí:
`caja_movimiento_notas.movimiento_id REFERENCES caja_movimientos(id) ON
DELETE CASCADE` (migración 015, tabla ya en uso — flag `notas-venta-pagar`
en `true`). Hay que migrar las dos columnas en la misma migración,
recreando la FK al final.

## Contrato

### Archivo nuevo — `migrations/028_caja_movimientos_uuid.sql`

```sql
-- Migra caja_movimientos.id de SERIAL a UUID generado por el cliente,
-- y caja_movimiento_notas.movimiento_id (FK) en la misma migración.
-- Necesario para que un INSERT local de PowerSync (Slice 11b) use el
-- mismo id en el dispositivo y en Postgres, sin reconciliacion.

-- Paso 0 (verificación, no asumir el nombre de la constraint por
-- convención): correr antes de aplicar el resto,
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.caja_movimiento_notas'::regclass AND contype = 'f';
-- y confirmar que el nombre real coincide con el usado abajo
-- (`caja_movimiento_notas_movimiento_id_fkey`, el que Postgres asigna
-- por convención a una FK sin nombre explícito en migración 015). Si no
-- coincide, corregir el DROP CONSTRAINT antes de aplicar.

-- 1. caja_movimientos: agregar columna UUID, poblar, migrar PK.
ALTER TABLE public.caja_movimientos ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
UPDATE public.caja_movimientos SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
ALTER TABLE public.caja_movimientos ALTER COLUMN id_uuid SET NOT NULL;

-- 2. caja_movimiento_notas: agregar columna UUID para la FK, poblar por join.
ALTER TABLE public.caja_movimiento_notas ADD COLUMN movimiento_id_uuid UUID;
UPDATE public.caja_movimiento_notas cmn
  SET movimiento_id_uuid = cm.id_uuid
  FROM public.caja_movimientos cm
  WHERE cm.id = cmn.movimiento_id;
ALTER TABLE public.caja_movimiento_notas ALTER COLUMN movimiento_id_uuid SET NOT NULL;

-- 3. Soltar FK vieja y PK vieja.
ALTER TABLE public.caja_movimiento_notas DROP CONSTRAINT caja_movimiento_notas_movimiento_id_fkey;
ALTER TABLE public.caja_movimientos DROP CONSTRAINT caja_movimientos_pkey;

-- 4. Renombrar: la columna int queda como legacy, la uuid pasa a ser la real.
ALTER TABLE public.caja_movimientos RENAME COLUMN id TO id_int_legacy;
ALTER TABLE public.caja_movimientos RENAME COLUMN id_uuid TO id;
ALTER TABLE public.caja_movimiento_notas RENAME COLUMN movimiento_id TO movimiento_id_int_legacy;
ALTER TABLE public.caja_movimiento_notas RENAME COLUMN movimiento_id_uuid TO movimiento_id;

-- 5. Recrear PK y FK sobre las columnas UUID.
ALTER TABLE public.caja_movimientos ADD PRIMARY KEY (id);
ALTER TABLE public.caja_movimiento_notas
  ADD CONSTRAINT caja_movimiento_notas_movimiento_id_fkey
  FOREIGN KEY (movimiento_id) REFERENCES public.caja_movimientos(id) ON DELETE CASCADE;

-- id_int_legacy / movimiento_id_int_legacy se conservan por seguridad/
-- auditoria (rollback), sin uso en codigo desde este commit. Candidatos
-- a DROP en una limpieza futura una vez verificado en produccion.
```

`idx_cmn_movimiento` (índice sobre `movimiento_id`) sigue el rename de
columna automáticamente en Postgres — no requiere recrearse.

### Archivos modificados

- **`app/api/caja/movimientos/route.ts`** (POST): aceptar `id` opcional
  en el body (lo manda `BackendConnector` en Slice 11b), mismo patrón
  `COALESCE` que Slice 10a:
  ```sql
  INSERT INTO caja_movimientos (id, fecha, tipo, ...)
  VALUES (COALESCE(${body.id ?? null}, gen_random_uuid()), ...)
  ```

- **`app/api/caja/movimientos/[id]/route.ts`** (PATCH, DELETE): quitar
  `parseInt((await params).id, 10)` / `isNaN(movimientoId)` — `id` pasa a
  tratarse como string (UUID) en todas las queries. Sin cambio de lógica
  de negocio (R22–R30 intactas).

- **`app/api/caja/movimientos/[id]/notas/route.ts`** (POST): mismo
  cambio — quitar `parseInt`, `movimientoId` como string.

- **`app/api/caja/resumen/[kcodcli2]/route.ts`**: línea con
  `movimiento_id: parseInt(r.pago_mov_id, 10)` → `movimiento_id:
  r.pago_mov_id` (ya viene como string desde la DB, sin necesidad de
  parsear).

- **`docs/specs/caja-mayor.spec.ts`**: tipos `movimiento_id`/`id` de
  `CajaMovimiento`, `ImputacionResult`, `PagoDetalle` pasan de `number` a
  `string` — cambio mecánico de tipos.

- **`app/(app)/caja-mayor/client_page.tsx`**: `editMov.id`,
  `movimientoId` (línea 592) pasan de `number` a `string` en todos los
  usos (`handleSubmit`, edición, eliminación, título del modal).

### No se toca (verificado)

- **`app/api/notas-venta/[id]/pagar/route.ts`** y
  **`app/api/notas-venta/[id]/reembolsar/route.ts`**: insertan en
  `caja_movimientos`/`caja_movimiento_notas` vía `INSERT ... RETURNING
  id` y CTE (`WITH mov AS (...)`), sin `parseInt` ni cast explícito al
  id — el driver de Neon devuelve el UUID como string y lo reenvía sin
  problema al siguiente INSERT. Verificado por lectura completa de
  ambos archivos, sin cambio necesario.
- `caja_cuentas.id`, `caja_cierres.id`, `prenotas.id`/`prenota_id`: no
  tocados, siguen `SERIAL`/`INTEGER` — el problema de reconciliación de
  id solo existe para filas que un cliente puede crear localmente
  offline, y ninguna de esas tablas se crea offline en este ni en
  slices anteriores.
- `lib/powersync/AppSchema.ts`: no requiere cambios — mismo motivo que
  Slice 10a, PowerSync maneja `id` como texto automáticamente.
- `config/feature-flags.json`: sin flag nuevo en este slice.

## Riesgos a cubrir en Fase B

- **Constraint name real**: confirmar contra Neon real (no asumir) que
  `caja_movimiento_notas_movimiento_id_fkey` es el nombre correcto antes
  de aplicar el `DROP CONSTRAINT` — si no coincide, la migración falla
  ruidosamente (comportamiento aceptable, mejor que un DROP silencioso
  del constraint equivocado).
- **Backfill de la FK**: el `UPDATE ... FROM ... WHERE cm.id =
  cmn.movimiento_id` debe dejar `movimiento_id_uuid` poblado para el
  100% de las filas de `caja_movimiento_notas` existentes — verificar
  `COUNT(*) WHERE movimiento_id_uuid IS NULL = 0` antes del `SET NOT
  NULL` (falla ruidosamente si no, ya que `SET NOT NULL` rechaza nulls).
- **Regresión completa del flujo online de Caja Mayor**: registrar
  cobro/gasto, editar, eliminar, imputar manualmente a una nota — deben
  comportarse exactamente igual que hoy, con la única diferencia de que
  `id`/`movimiento_id` ahora son UUID visibles.
- **`pagar`/`reembolsar` (flujos automáticos desde Notas de Venta)**:
  regresión — marcar una nota como pagada y reembolsar una nota anulada
  deben seguir creando el cobro/reembolso y su vínculo correctamente.
- **`caja/resumen/[kcodcli2]`**: regresión — el historial de pagos de un
  cliente debe seguir mostrando `movimiento_id` correctamente (ahora
  string) sin romper el frontend que lo consume.

## Verificación esperada (Fase D)

1. Migración aplicada en producción (Pablo) — confirmar `\d
   caja_movimientos` muestra `id UUID PRIMARY KEY` y `\d
   caja_movimiento_notas` muestra `movimiento_id UUID` con FK activa
   hacia `caja_movimientos(id)`.
2. Flujo online completo sin regresión: registrar cobro, registrar
   gasto, editar, eliminar, imputar manualmente a una nota — funciona
   igual, ids ahora son UUID.
3. Flujo automático sin regresión: marcar nota como pagada (crea cobro +
   vínculo), anular nota con pago (crea reembolso + vínculo).
4. Resumen de cliente (`/api/caja/resumen/[kcodcli2]`) sin regresión.
5. Suite completa sin regresiones, `npm run build` limpio.
