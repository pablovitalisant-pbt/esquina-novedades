-- 026 — Bandeja de conflictos de sincronización offline (Fase 2)
-- Backend puro: tabla + índice. Slice 9a. Ver ARQUITECTURA-OFFLINE §Fase 2.

CREATE TABLE IF NOT EXISTS public.sync_conflictos (
  id                  SERIAL PRIMARY KEY,
  tabla               TEXT NOT NULL,
  operacion           TEXT NOT NULL,        -- 'PUT' | 'PATCH' | 'DELETE'
  entidad_id          TEXT,                 -- codigo/id de la fila afectada (clave libre, varía por tabla)
  payload             JSONB NOT NULL,
  http_status         INTEGER,
  error_mensaje       TEXT,
  usuario_id          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_nombre      TEXT,
  estado              TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'resuelto'
  resuelto_en         TIMESTAMPTZ,
  resuelto_por        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  resuelto_por_nombre TEXT,
  accion_tomada       TEXT,                 -- 'descartado' (única acción del MVP, ver §Fase 2)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflictos_estado
  ON sync_conflictos(estado, created_at DESC);
