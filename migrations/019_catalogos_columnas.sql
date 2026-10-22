-- 019: Agregar columnas de configuración a catalogos
-- BUG-011 — el código lee/escribe 10 columnas que no existen en la tabla.
-- Tipos confirmados contra uso real en route.ts, page.tsx y CrearCatalogoDialog.tsx.
-- Columnas vestigiales (ambas_empresas, tipo_precio) NO se incluyen — PRD §9.3.19.

ALTER TABLE catalogos ADD COLUMN user_id          INTEGER REFERENCES usuarios(id);
ALTER TABLE catalogos ADD COLUMN margen_precio     NUMERIC DEFAULT 0;
ALTER TABLE catalogos ADD COLUMN mostrar_precio    BOOLEAN DEFAULT TRUE;
ALTER TABLE catalogos ADD COLUMN mostrar_stock     BOOLEAN DEFAULT FALSE;
ALTER TABLE catalogos ADD COLUMN solo_nuevo        BOOLEAN DEFAULT FALSE;
ALTER TABLE catalogos ADD COLUMN solo_stock        BOOLEAN DEFAULT TRUE;
ALTER TABLE catalogos ADD COLUMN palabras_incluir  TEXT DEFAULT '';
ALTER TABLE catalogos ADD COLUMN palabras_excluir  TEXT DEFAULT '';
ALTER TABLE catalogos ADD COLUMN categoria         TEXT;
ALTER TABLE catalogos ADD COLUMN solo_nuevo_top_n  INTEGER DEFAULT 1;
