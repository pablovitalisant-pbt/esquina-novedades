-- 045 — unidades mínimas para el precio mayor en la tienda online.
-- NULL = sin descuento por cantidad online. Idempotente.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS minimo_mayor INTEGER NULL
    CHECK (minimo_mayor IS NULL OR minimo_mayor >= 1);
