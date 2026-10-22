-- 028 — Migra caja_movimientos.id de SERIAL a UUID generado por el cliente,
-- y caja_movimiento_notas.movimiento_id (FK, ON DELETE CASCADE) en la misma
-- migración. Necesario para que un INSERT local de PowerSync (Slice 11b) use
-- el mismo id en el dispositivo y en Postgres, sin reconciliación.
-- Constraint name verificado contra Neon real (2026-08-01):
--   caja_movimiento_notas_movimiento_id_fkey (confdeltype = 'c', CASCADE).

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
-- auditoría (rollback), sin uso en código desde este commit. Candidatos a
-- DROP en una limpieza futura una vez verificado en producción.
