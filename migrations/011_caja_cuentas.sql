-- 011: Cuentas de caja mayor
-- Columnas trazadas de app/api/caja/cuentas/route.ts [28,76-78]
-- y app/api/caja/cuentas/[id]/route.ts [44-49,94]

CREATE TABLE IF NOT EXISTS public.caja_cuentas (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  moneda     TEXT NOT NULL,        -- 'USD' | 'ARS'
  activa     BOOLEAN NOT NULL DEFAULT TRUE,
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
