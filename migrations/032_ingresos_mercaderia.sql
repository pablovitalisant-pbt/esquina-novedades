-- 032 — Ingreso de Mercadería (slice "Ingreso de Mercadería")
--
-- Auditoría de partidas recibidas. Cada POST /api/ingresos inserta una fila
-- aquí y, en la misma transacción, incrementa el saldo en productos y en
-- ubicaciones_bodega. Guarda el packing (unidades por caja) registrado en el
-- momento del ingreso y un flag de si cambió respecto al del producto.

CREATE TABLE IF NOT EXISTS ingresos_mercaderia (
  id                 SERIAL PRIMARY KEY,
  empresa_id         INTEGER NOT NULL REFERENCES empresas(id),
  codigo             TEXT NOT NULL,
  cantidad           INTEGER NOT NULL CHECK (cantidad > 0),
  cantcaja_registrado INTEGER NOT NULL,
  cantcaja_cambio    BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones      TEXT,
  usuario_id         INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nombre     TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingresos_mercaderia_codigo
  ON ingresos_mercaderia (empresa_id, codigo);
