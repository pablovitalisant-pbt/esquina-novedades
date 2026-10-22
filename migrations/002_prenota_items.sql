-- 002: Items de notas de venta (prenota_items)
-- Columnas trazadas de app/api/notas-venta/[id]/items/route.ts [26-38]
-- y app/api/notas-venta/[id]/items/[itemId]/route.ts [34-39]
-- Usa IF NOT EXISTS para ser idempotente.

CREATE TABLE IF NOT EXISTS public.prenota_items (
  id              SERIAL PRIMARY KEY,
  prenota_id      INTEGER NOT NULL
                    REFERENCES prenotas(id)
                    ON DELETE CASCADE,
  codigo          TEXT NOT NULL,
  descripcion     TEXT,
  imagen_url      TEXT,
  empresa_id      INTEGER
                    REFERENCES empresas(id)
                    ON DELETE SET NULL,
  cajas           INTEGER DEFAULT 0,
  unidades        INTEGER DEFAULT 0,
  precio          NUMERIC(12,2),
  saldo_zofri     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
