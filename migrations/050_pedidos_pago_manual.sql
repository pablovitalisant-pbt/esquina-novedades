-- 050 — Confirmación de pago manual (N04a). Idempotente.
-- Un registro por pedido. Solo datos de confirmación: no toca stock ni caja.
CREATE TABLE IF NOT EXISTS public.pedido_pagos_manuales (
  pedido_id     UUID PRIMARY KEY REFERENCES public.pedidos(id),
  cuenta_id     INTEGER NOT NULL REFERENCES public.caja_cuentas(id),
  usuario_id    INTEGER NOT NULL REFERENCES public.usuarios(id),
  metodo        TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia')),
  monto         INTEGER NOT NULL CHECK (monto > 0),
  referencia    TEXT,
  confirmado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL no viola un CHECK, por eso la exigencia de referencia en
  -- transferencia se declara explícitamente. Efectivo exige NULL.
  CONSTRAINT pedido_pagos_manuales_referencia_check CHECK (
    (metodo = 'efectivo' AND referencia IS NULL)
    OR (
      metodo = 'transferencia'
      AND referencia IS NOT NULL
      AND referencia = btrim(referencia)
      AND char_length(referencia) BETWEEN 1 AND 128
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pedido_pagos_manuales_cuenta_referencia_unique
  ON public.pedido_pagos_manuales (cuenta_id, lower(referencia))
  WHERE metodo = 'transferencia';
