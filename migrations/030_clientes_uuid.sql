-- 030 — Migra clientes.id de SERIAL a UUID generado por el cliente, con
-- cascada a prenotas.cliente_id (FK real, migración 009) y
-- caja_movimientos.kcodcli2 (mismo valor semántico, sin FK formal pero
-- comparado directamente contra clientes.id/prenotas.cliente_id).
-- Necesario para un INSERT local de PowerSync (Slice 13b) use el mismo id
-- en el dispositivo y en Postgres, sin reconciliación/duplicados.
-- Constraint verificado contra Neon real (2026-08-01):
--   prenotas_cliente_id_fkey, confdeltype = 'r' (RESTRICT) → se replica.

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
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id)
  ON DELETE RESTRICT; -- confdeltype 'r' real (replicado), sqlstate 23001
