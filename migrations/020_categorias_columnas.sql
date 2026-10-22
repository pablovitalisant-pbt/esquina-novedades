-- 020_categorias_columnas.sql
-- BUG-012: Crear tabla categorias y agregar columnas faltantes a productos
--
-- La tabla categorias y las columnas productos.categoria / productos.public_id
-- nunca fueron creadas por ninguna migracion, aunque el codigo las referencia
-- desde el inicio del proyecto. Esta migracion las materializa.

BEGIN;

CREATE TABLE IF NOT EXISTS categorias (
    id          SERIAL PRIMARY KEY,
    nombre      TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS public_id TEXT;

COMMIT;
