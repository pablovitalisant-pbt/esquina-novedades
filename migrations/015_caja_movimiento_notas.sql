-- 015: Imputación de notas de venta a movimientos de caja
-- Columnas trazadas de app/api/caja/movimientos/[id]/notas/route.ts [105,136-138],
-- app/api/caja/notas/[kcodcli2]/route.ts [38-41],
-- app/api/caja/resumen/[kcodcli2]/route.ts [49-51]
--
-- ⚠️ DEUDA: knumfoli (TEXT, legacy pre-Slice 13) y prenota_id (INTEGER, canónico)
--   almacenan el mismo dato. knumfoli se mantiene para no romper rutas que aún lo usan:
--   movimientos/route.ts:39, movimientos/[id]/notas/route.ts:105,136, export/route.ts:31.
--   Migrar esas 3 rutas a prenota_id requiere un ciclo PBT-IA separado (BUG-009).

CREATE TABLE IF NOT EXISTS public.caja_movimiento_notas (
  id              SERIAL PRIMARY KEY,
  movimiento_id   INTEGER NOT NULL
                    REFERENCES caja_movimientos(id)
                    ON DELETE CASCADE,
  empresa         TEXT,
  prenota_id      INTEGER NOT NULL
                    REFERENCES prenotas(id)
                    ON DELETE RESTRICT,
  knumfoli        TEXT,                 -- legacy: mismo valor que prenota_id como string
  monto_aplicado  NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cmn_movimiento
  ON caja_movimiento_notas(movimiento_id);

CREATE INDEX IF NOT EXISTS idx_cmn_prenota
  ON caja_movimiento_notas(prenota_id);
