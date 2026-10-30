-- 048 — Cliente genérico de mesón para el POS.
-- La tabla clientes no tenía RUT (009 + 030 + 042); se agrega nullable para
-- poder identificar al genérico sin depender del nombre. Idempotente.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS rut TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_rut_unique
  ON public.clientes (rut)
  WHERE rut IS NOT NULL;

-- RUT 66.666.666-6 es el genérico del SII. Solo crea si no existe.
INSERT INTO public.clientes (nombre, rut)
SELECT 'Cliente de mesón', '66.666.666-6'
WHERE NOT EXISTS (
  SELECT 1 FROM public.clientes WHERE rut = '66.666.666-6'
);
