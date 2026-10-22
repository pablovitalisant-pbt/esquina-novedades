-- 037 — Informe de Inversión en Mercadería (slice "Informe de Inversión en Mercadería")
--
-- Snapshots diarios del costo invertido en mercadería y la venta potencial.
-- El GET con fecha pasada lee EXACTAMENTE lo capturado el día X (no se
-- reconstruye retroactivamente: no existe historial confiable).
--
-- Aplicar contra el proyecto/rama activos de Neon (ver CLAUDE.md, sección
-- Neon): bazar-naty-mirror-2026-08 / branch main. NO asumir por conocimiento
-- previo; verificar contra la tabla antes de aplicar.

CREATE TABLE IF NOT EXISTS snapshots_inversion_mercaderia (
  id                    SERIAL PRIMARY KEY,
  empresa_id            INTEGER REFERENCES empresas(id),
  fecha                 DATE NOT NULL,
  costo_total           DECIMAL(14,2) NOT NULL,
  venta_potencial_total DECIMAL(14,2) NOT NULL,
  ganancia_proyectada   DECIMAL(14,2) NOT NULL,
  productos_sin_costo   INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, fecha)
);

CREATE TABLE IF NOT EXISTS snapshots_inversion_mercaderia_detalle (
  id              SERIAL PRIMARY KEY,
  snapshot_id     INTEGER REFERENCES snapshots_inversion_mercaderia(id) ON DELETE CASCADE,
  codigo          TEXT NOT NULL,
  detalle         TEXT,
  saldo           INTEGER NOT NULL,
  costo           DECIMAL(12,2),
  prcventa        DECIMAL(12,2),
  costo_total     DECIMAL(14,2),
  venta_potencial DECIMAL(14,2)
);
CREATE INDEX IF NOT EXISTS idx_snap_detalle_snapshot
  ON snapshots_inversion_mercaderia_detalle(snapshot_id);
