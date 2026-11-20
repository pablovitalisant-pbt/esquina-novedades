-- 054 — Marca de entrega del pedido (S1). Aditivo y nullable: el flag
-- pedidos-entrega queda apagado hasta verificar las columnas en TEST.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS entregado_en TIMESTAMPTZ;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS entregado_por_id INTEGER REFERENCES public.usuarios(id);

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS entregado_por_nombre TEXT;
