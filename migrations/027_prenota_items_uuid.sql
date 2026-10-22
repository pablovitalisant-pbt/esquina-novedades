-- 027 — Migra prenota_items.id de SERIAL a UUID generado por el cliente.
-- Necesario para que un INSERT local de PowerSync (Slice 10b) use el mismo
-- id en el dispositivo y en Postgres, sin reconciliación.
-- Verificado: ninguna FK externa referencia prenota_items(id).
-- gen_random_uuid() es nativa desde Postgres 13 (Neon corre 18.x).

ALTER TABLE public.prenota_items ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
UPDATE public.prenota_items SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
ALTER TABLE public.prenota_items ALTER COLUMN id_uuid SET NOT NULL;

ALTER TABLE public.prenota_items DROP CONSTRAINT prenota_items_pkey;
ALTER TABLE public.prenota_items RENAME COLUMN id TO id_int_legacy;
ALTER TABLE public.prenota_items RENAME COLUMN id_uuid TO id;
ALTER TABLE public.prenota_items ADD PRIMARY KEY (id);

-- id_int_legacy se conserva por seguridad/auditoría (rollback), sin uso en
-- código desde este commit. Candidato a DROP en una limpieza futura una vez
-- verificado en producción.
