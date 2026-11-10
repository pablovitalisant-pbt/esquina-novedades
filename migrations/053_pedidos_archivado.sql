-- Archivado lógico de pedidos expirados. Aditivo y nullable: el flag
-- pedidos-archivar-expirados queda apagado hasta verificar la columna en TEST.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS pedidos_archivado_visible_idx
  ON public.pedidos (estado, archivado_en)
  WHERE archivado_en IS NOT NULL;
