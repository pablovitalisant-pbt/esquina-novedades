-- 013: Saldos iniciales por cuenta de caja
-- Columnas trazadas de app/api/caja/saldos-iniciales/route.ts [32-34,74-79]

CREATE TABLE IF NOT EXISTS public.caja_saldos_iniciales (
  id            SERIAL PRIMARY KEY,
  cuenta_id     INTEGER NOT NULL
                  REFERENCES caja_cuentas(id)
                  ON DELETE RESTRICT,
  fecha         DATE NOT NULL,
  saldo         NUMERIC(12,2) NOT NULL,
  observaciones TEXT,
  creado_por    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cuenta_id)
);
