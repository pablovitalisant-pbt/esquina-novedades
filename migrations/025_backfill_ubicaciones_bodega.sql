-- 025: Backfill de ubicaciones_bodega para productos sin fila
--
-- Contexto: al arrancar Fase 1 del proyecto offline (Slice 5, escritura
-- offline de Bodega vía PowerSync), se detectó que de 5 productos en
-- produccion, solo 1 tenia fila en ubicaciones_bodega (el LEFT JOIN de
-- /api/ubicaciones deja el resto en NULL). El endpoint de guardado
-- (PUT /api/ubicaciones/codigo/[codigo]) hace upsert por codigo y lo
-- resuelve bien online, pero un UPDATE local en SQLite (PowerSync)
-- requiere que la fila ya exista - no hay upsert trivial del lado
-- cliente. Este backfill garantiza que todo producto tenga su fila de
-- bodega (vacia, sin conteo fisico), asi todo write local futuro es
-- siempre UPDATE, nunca INSERT.
--
-- NOTA: esta migracion ya fue aplicada manualmente por Pablo directo en
-- el SQL Editor de Neon contra la branch de produccion
-- (br-holy-darkness-acadbszt) el 2026-08-01. Este archivo documenta el
-- cambio para que el repo quede sincronizado con el estado real de la DB.
-- Verificado: COUNT(productos) = COUNT(ubicaciones_bodega) = 5 post-backfill.
--
-- Idempotente: seguro correr de nuevo, no duplica filas.

INSERT INTO ubicaciones_bodega (empresa_id, codigo, ubicacion, saldo, cantcaja, updated_at)
SELECT p.empresa_id, p.codigo, '', p.saldo, p.cantcaja, NOW()
FROM productos p
WHERE NOT EXISTS (
  SELECT 1 FROM ubicaciones_bodega u WHERE u.codigo = p.codigo AND u.empresa_id = p.empresa_id
);
