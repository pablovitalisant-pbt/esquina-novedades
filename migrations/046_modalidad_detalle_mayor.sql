-- 046: modalidad de venta por línea = 'detalle' | 'mayor' (precio mayor POR UNIDAD).
-- No existe venta por caja: cantcaja queda solo para bodega. Idempotente:
-- el runner reaplica todas las migraciones.
--
-- 1) Quitar los CHECK viejos de modalidad (nombres autogenerados por Postgres,
--    se buscan por definición en pg_constraint).
-- 2) Migrar valores: unidad -> detalle, caja -> mayor.
-- 3) DEFAULT 'detalle' + nuevo CHECK.
-- 4) subtotal de prenota_items = unidades * precio (antes dependía de cajas).

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname IN ('prenota_items', 'pedido_items')
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%modalidad%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.relname, c.conname);
  END LOOP;
END $$;

UPDATE public.prenota_items SET modalidad = 'detalle' WHERE modalidad = 'unidad';
UPDATE public.prenota_items SET modalidad = 'mayor' WHERE modalidad = 'caja';
UPDATE public.pedido_items SET modalidad = 'detalle' WHERE modalidad = 'unidad';
UPDATE public.pedido_items SET modalidad = 'mayor' WHERE modalidad = 'caja';

ALTER TABLE public.prenota_items ALTER COLUMN modalidad SET DEFAULT 'detalle';
ALTER TABLE public.pedido_items ALTER COLUMN modalidad SET DEFAULT 'detalle';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prenota_items_modalidad_check'
  ) THEN
    ALTER TABLE public.prenota_items
      ADD CONSTRAINT prenota_items_modalidad_check CHECK (modalidad IN ('detalle','mayor'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pedido_items_modalidad_check'
  ) THEN
    ALTER TABLE public.pedido_items
      ADD CONSTRAINT pedido_items_modalidad_check CHECK (modalidad IN ('detalle','mayor'));
  END IF;
END $$;

-- subtotal generado: solo se recrea si la expresión actual no es unidades * precio.
DO $$
DECLARE expr text;
BEGIN
  SELECT generation_expression INTO expr
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'prenota_items' AND column_name = 'subtotal';

  IF expr IS NULL THEN
    ALTER TABLE public.prenota_items
      ADD COLUMN subtotal NUMERIC(14,2) GENERATED ALWAYS AS (unidades * precio) STORED;
  ELSIF regexp_replace(replace(expr, '::numeric', ''), '[()\s]', '', 'g') <> 'unidades*precio' THEN
    ALTER TABLE public.prenota_items DROP COLUMN subtotal;
    ALTER TABLE public.prenota_items
      ADD COLUMN subtotal NUMERIC(14,2) GENERATED ALWAYS AS (unidades * precio) STORED;
  END IF;
END $$;
