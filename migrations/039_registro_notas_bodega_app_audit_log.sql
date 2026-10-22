-- 039: Tablas usadas por el código y nunca creadas por migraciones (Slice 0, D1/D2).
-- Columnas inferidas de app/api/bodega/registro-notas/route.ts y [id]/route.ts.
-- app_audit_log usa camelCase entre comillas porque el INSERT lo referencia así.
CREATE TABLE IF NOT EXISTS public.registro_notas_bodega (
  id              SERIAL PRIMARY KEY,
  folio           TEXT NOT NULL,
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  usuario_nombre  TEXT NOT NULL,
  observacion     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_audit_log (
  id            TEXT PRIMARY KEY,
  "actorUserId" INTEGER,
  action        TEXT NOT NULL,
  entity        TEXT NOT NULL,
  "entityId"    TEXT,
  diff          JSONB,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
