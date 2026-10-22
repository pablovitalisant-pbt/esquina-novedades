-- 018: Unificar empresas SANJH + VIDA DIGITAL → Bazar Naty
-- Verificado contra test-seed-inicial con datos reales (2026-07-05).
-- Orden probado: cada FK requiere UPDATE/DELETE explícito antes de tocar empresas.

-- 1. Migrar códigos en prenota_items: quitar prefijos VD- y SJ-
UPDATE prenota_items SET codigo = REPLACE(codigo, 'VD-', '') WHERE codigo LIKE 'VD-%';
UPDATE prenota_items SET codigo = REPLACE(codigo, 'SJ-', '') WHERE codigo LIKE 'SJ-%';

-- 2. Quitar prefijo SJ- en productos y ubicaciones_bodega
UPDATE productos SET codigo = REPLACE(codigo, 'SJ-', '') WHERE codigo LIKE 'SJ-%';
UPDATE ubicaciones_bodega SET codigo = REPLACE(codigo, 'SJ-', '') WHERE codigo LIKE 'SJ-%';

-- 3. catalogo_items FK sin ON DELETE CASCADE → eliminar antes que productos
DELETE FROM catalogo_items WHERE producto_id IN (
  SELECT id FROM productos WHERE empresa_id = 2
);

-- 4. Eliminar productos de empresa 2
DELETE FROM productos WHERE empresa_id = 2;

-- 5. Reasignar empresa_id=2 → 1 en tablas con FK a empresas
UPDATE ubicaciones_bodega SET empresa_id = 1 WHERE empresa_id = 2;
UPDATE catalogos SET empresa_id = 1 WHERE empresa_id = 2;
UPDATE despachos SET empresa_id = 1 WHERE empresa_id = 2;
UPDATE inventario_conteo SET empresa_id = 1 WHERE empresa_id = 2;
UPDATE prenota_items SET empresa_id = 1 WHERE empresa_id = 2;

-- 6. Eliminar usuario_empresa para empresa 2 (ya apuntan a empresa 1)
DELETE FROM usuario_empresa WHERE empresa_id = 2;

-- 7. Renombrar empresa 1 → Bazar Naty
UPDATE empresas SET nombre = 'Bazar Naty', slug = 'bazar-naty' WHERE id = 1;

-- 8. Eliminar empresa 2 (todas las FKs ya fueron actualizadas)
DELETE FROM empresas WHERE id = 2;
