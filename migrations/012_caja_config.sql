-- 012: Configuración de caja (dólar día, etc.)
-- Columnas trazadas de app/api/caja/config/route.ts [28-29,54-62]

CREATE TABLE IF NOT EXISTS public.caja_config (
  clave       TEXT PRIMARY KEY,
  valor       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_por TEXT
);
