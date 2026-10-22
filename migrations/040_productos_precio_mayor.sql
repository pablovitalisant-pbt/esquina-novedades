-- precio por caja (mayorista); NULL = no se vende por mayor. Idempotente.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS precio_mayor INTEGER NULL
    CHECK (precio_mayor IS NULL OR precio_mayor > 0);
