-- 014: Movimientos de caja (cobros y gastos)
-- Columnas trazadas de app/api/caja/movimientos/route.ts [35-43,211-217]
-- y app/api/caja/movimientos/[id]/route.ts [40-41,155-172]
-- empresa: el código escribe el literal 'bazar-naty' (BUG-004/005, single-tenant).
--   Sin CHECK constraint — TEXT libre para flexibilidad futura.

CREATE TABLE IF NOT EXISTS public.caja_movimientos (
  id              SERIAL PRIMARY KEY,
  fecha           DATE NOT NULL,
  tipo            TEXT NOT NULL,          -- 'cobro' | 'gasto'
  kcodcli2        INTEGER,
  nombre_cliente  TEXT,
  cuenta_id       INTEGER NOT NULL
                    REFERENCES caja_cuentas(id)
                    ON DELETE RESTRICT,
  moneda          TEXT NOT NULL,          -- 'USD' | 'ARS'
  monto           NUMERIC(12,2) NOT NULL,
  monto_usd       NUMERIC(12,2),
  tipo_cambio     NUMERIC(10,4),
  forma_pago      TEXT,
  observaciones   TEXT,
  empresa         TEXT,                   -- single-tenant: el código escribe 'bazar-naty'
  es_credito      BOOLEAN NOT NULL DEFAULT FALSE,
  usuario_id      INTEGER NOT NULL
                    REFERENCES usuarios(id)
                    ON DELETE RESTRICT,
  usuario_nombre  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_fecha
  ON caja_movimientos(fecha DESC);

CREATE INDEX IF NOT EXISTS idx_caja_movimientos_cuenta
  ON caja_movimientos(cuenta_id);
