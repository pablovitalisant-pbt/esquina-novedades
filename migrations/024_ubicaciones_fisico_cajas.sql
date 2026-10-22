-- 024: Agregar fisico_cajas y fisico_unidades a ubicaciones_bodega
-- El codigo de /bodega (GET y PUT /api/ubicaciones) ya esperaba estas
-- columnas (conteo fisico separado en cajas + unidades sueltas), pero la
-- migracion nunca se creo. Causaba 500 "column u.fisico_cajas does not
-- exist" en toda busqueda de /bodega. Ver BUG-026 en BUGS.md.
--
-- NOTA: esta migracion ya fue aplicada manualmente por Pablo directo en
-- el SQL Editor de Neon contra la branch de produccion
-- (br-holy-darkness-acadbszt) el 2026-07-20. Este archivo documenta el
-- cambio para que el repo quede sincronizado con el estado real de la DB.
--
-- Aplicar en Neon branch br-holy-darkness-acadbszt (produccion), no por nombre.

ALTER TABLE public.ubicaciones_bodega
  ADD COLUMN IF NOT EXISTS fisico_cajas INTEGER,
  ADD COLUMN IF NOT EXISTS fisico_unidades INTEGER;
