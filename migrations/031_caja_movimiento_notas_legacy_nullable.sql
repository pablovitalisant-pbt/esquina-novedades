-- 031 — Hace nullable la columna legacy movimiento_id_int_legacy de
-- caja_movimiento_notas.
-- En 028 se renombró movimiento_id (INTEGER NOT NULL) → movimiento_id_int_legacy
-- y se promovió una UUID como movimiento_id real. El código ya no puebla la
-- columna legacy, pero quedó NOT NULL sin default → cada INSERT de
-- caja_movimiento_notas que omite esa columna viola el constraint (error 500
-- en pagar/reembolsar notas de venta y en vincular nota desde Caja Mayor).
-- id_int_legacy en caja_movimientos no sufrió esto porque era SERIAL (default).
-- La columna se conserva (auditoría/rollback); solo se le quita el NOT NULL.

-- Regla dura del CLAUDE.md: aplicar contra la branch de producción
-- br-holy-darkness-acadbszt (host pooled ep-blue-truth-accio1kb-pooler).
ALTER TABLE public.caja_movimiento_notas
  ALTER COLUMN movimiento_id_int_legacy DROP NOT NULL;
