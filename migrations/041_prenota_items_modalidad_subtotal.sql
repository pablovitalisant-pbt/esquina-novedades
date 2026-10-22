-- modalidad de venta por item + subtotal generado (caja: cajas*precio, unidad: unidades*precio). Idempotente.
ALTER TABLE public.prenota_items
  ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'unidad'
    CHECK (modalidad IN ('unidad','caja'));
ALTER TABLE public.prenota_items
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2)
    GENERATED ALWAYS AS (CASE WHEN modalidad = 'caja' THEN cajas * precio ELSE unidades * precio END) STORED;
