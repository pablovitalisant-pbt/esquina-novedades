-- Soft-delete de productos (slice eliminar-producto, 2026-09-12).
-- NO es DELETE fisico: catalogo_items.producto_id y pedido_items.producto_id
-- son FK RESTRICT (un DELETE fallaria), y las tablas que usan `codigo` como
-- texto sin FK quedarian huerfanas en silencio. Se oculta el producto.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
