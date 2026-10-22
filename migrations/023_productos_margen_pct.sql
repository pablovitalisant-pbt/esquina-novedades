-- 023: Agregar margen_pct a productos (Slice "Costo + Margen + Edición completa")
-- Columnas:
--   margen_pct DECIMAL(8,4) NULL  — porcentaje de ganancia sobre costo
--   NULL para productos legacy sin costo; al editar costo se recalcula.
-- Invariante anti-drift: NUNCA se aceptan costo + margen_pct + prcventa del
--   cliente a la vez. El servidor es la única fuente del cálculo:
--   prcventa = ROUND(costo * (1 + margen_pct/100), 2).
--
-- Aplicar en Neon branch br-holy-darkness-acadbszt (producción), no por nombre.

ALTER TABLE IF EXISTS public.productos
  ADD COLUMN IF NOT EXISTS margen_pct DECIMAL(8,4);
