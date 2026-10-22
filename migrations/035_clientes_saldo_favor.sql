-- 035 — Ledger "saldo a favor" de clientes (Slice 3a).
-- Registra créditos (sobrepago de un cobro sobre el saldo pendiente) y
-- débitos (aplicación de ese crédito a una nota futura, Slice 3b).
-- Tipos verificados contra migraciones reales:
--   clientes.id  = UUID   (migración 030, re-creada como PK sobre id_uuid)
--   prenotas.id  = SERIAL (migración 001)
--   usuarios.id  = INTEGER (migración 003, referenciado en caja_movimientos)
CREATE TABLE IF NOT EXISTS public.clientes_saldo_favor_movimientos (
  id                  SERIAL PRIMARY KEY,
  cliente_id          UUID NOT NULL
                        REFERENCES public.clientes(id)
                        ON DELETE RESTRICT,
  tipo                TEXT NOT NULL CHECK (tipo IN ('credito','debito')),
  monto               NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  origen_prenota_id   INTEGER
                        REFERENCES public.prenotas(id)
                        ON DELETE RESTRICT,
  aplicado_prenota_id INTEGER
                        REFERENCES public.prenotas(id)
                        ON DELETE RESTRICT,
  usuario_id          INTEGER NOT NULL
                        REFERENCES public.usuarios(id)
                        ON DELETE RESTRICT,
  usuario_nombre      TEXT NOT NULL,
  observaciones       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csfm_cliente
  ON public.clientes_saldo_favor_movimientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_csfm_origen
  ON public.clientes_saldo_favor_movimientos(origen_prenota_id);
CREATE INDEX IF NOT EXISTS idx_csfm_aplicado
  ON public.clientes_saldo_favor_movimientos(aplicado_prenota_id);
