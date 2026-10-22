-- 022: Columna estado + motivo_anulacion en prenotas (Slice 35)
-- Trazado de docs/specs/caja-mayor.spec.ts [126-126] (interface CajaMovimiento.tipo)
-- y app/api/notas-venta/[id]/route.ts DELETE handler (Sub-slice 3)
--
-- CHECK (estado IN ('activa','anulada')) protege contra valores inválidos
-- desde cualquier punto de entrada (API directa, consola DB, migraciones futuras).
-- NO tocar: prenotas.titulo ya usa titulo_base como fuente de verdad.

ALTER TABLE IF EXISTS public.prenotas
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa', 'anulada'));

ALTER TABLE IF EXISTS public.prenotas
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

-- Índice para filtrar anuladas en listados (Sub-slice 3)
CREATE INDEX IF NOT EXISTS idx_prenotas_estado
  ON public.prenotas(estado);
