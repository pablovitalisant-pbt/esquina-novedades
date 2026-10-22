-- 016: Cierres de período de caja
-- Columnas trazadas de app/api/caja/cierres/route.ts [22-24,180-183]
-- resumen es JSONB: [{cuenta_id, cuenta_nombre, moneda, saldo_anterior,
--   total_cobros, total_gastos, saldo_final}]

CREATE TABLE IF NOT EXISTS public.caja_cierres (
  id              SERIAL PRIMARY KEY,
  fecha_desde     DATE NOT NULL,
  fecha_hasta     DATE NOT NULL,
  resumen         JSONB NOT NULL,
  usuario_id      INTEGER NOT NULL
                    REFERENCES usuarios(id)
                    ON DELETE RESTRICT,
  usuario_nombre  TEXT NOT NULL,
  creado_por      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caja_cierres_fechas
  ON caja_cierres(fecha_hasta DESC);
