-- 021: Agregar updated_at a usuarios
-- Causa: PUT /api/admin/usuarios/[id] fallaba con 500 porque
-- el código ejecuta UPDATE usuarios SET updated_at = NOW()
-- pero la columna nunca existió en la tabla (schema drift desde 003_core_tables.sql).
-- Ver BUGS.md para el detalle completo del debugging.

ALTER TABLE usuarios ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
