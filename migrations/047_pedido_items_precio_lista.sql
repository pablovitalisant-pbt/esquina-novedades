-- 047 — precio de lista (detalle) por línea de pedido, para mostrar el ahorro
-- del descuento por mayor automático (Slice 4b). Idempotente.
ALTER TABLE public.pedido_items
  ADD COLUMN IF NOT EXISTS precio_lista INTEGER NULL
    CHECK (precio_lista IS NULL OR precio_lista >= 0);
