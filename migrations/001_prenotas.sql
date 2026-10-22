-- 001: Tabla de notas de venta (prenotas)
-- Columnas trazadas de app/api/notas-venta/route.ts [24-27,65-67]
-- y app/api/notas-venta/[id]/route.ts [37-41,62,96-105]
-- Usa IF NOT EXISTS para ser idempotente.

CREATE TABLE IF NOT EXISTS public.prenotas (
  id              SERIAL PRIMARY KEY,
  titulo          TEXT NOT NULL,
  titulo_base     TEXT NOT NULL,
  usuario_id      INTEGER NOT NULL
                    REFERENCES usuarios(id)
                    ON DELETE RESTRICT,
  -- cliente_id se agrega en 009_clientes.sql (ADD COLUMN IF NOT EXISTS con FK)
  nombre_cliente  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
