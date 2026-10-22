-- Sub-slice 1 Backend: umbral de stock minimo + tabla de productos silenciados
-- IF NOT EXISTS en todo: el schema real de productos no es confiable (PRD §10)

ALTER TABLE productos ADD COLUMN IF NOT EXISTS no_reponer BOOLEAN DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo INTEGER;

CREATE TABLE IF NOT EXISTS alertas_stock_bajo (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
