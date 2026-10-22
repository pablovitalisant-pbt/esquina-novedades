-- 029 — Migra categorias.id de SERIAL a UUID generado por el cliente.
-- No hay FK hacia categorias(id) (verificado: el join a productos es por
-- nombre, no por id). Se migra para que un INSERT + DELETE local offline
-- (Slice 12) use el mismo id en el dispositivo y en Postgres — sin id
-- estable, el DELETE sincronizado apuntaría a un id que el servidor nunca
-- vio y la categoría quedaría huérfana.
-- `nombre UNIQUE` no se toca, sigue protegiendo duplicados.

ALTER TABLE public.categorias ADD COLUMN id_uuid UUID DEFAULT gen_random_uuid();
UPDATE public.categorias SET id_uuid = gen_random_uuid() WHERE id_uuid IS NULL;
ALTER TABLE public.categorias ALTER COLUMN id_uuid SET NOT NULL;
ALTER TABLE public.categorias DROP CONSTRAINT categorias_pkey;
ALTER TABLE public.categorias RENAME COLUMN id TO id_int_legacy;
ALTER TABLE public.categorias RENAME COLUMN id_uuid TO id;
ALTER TABLE public.categorias ADD PRIMARY KEY (id);
