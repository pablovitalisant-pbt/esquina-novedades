-- 043 — Reserva de stock y pago online (Slice 8a). Idempotente.
-- Pedidos con reserva: estado pendiente_pago, expira_en 36 h, ids de MP y
-- stock_reservado como marca de verdad (pagado_tardio NO tiene reserva).
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('pendiente','convertido','descartado',
                    'pendiente_pago','pagado','rechazado','expirado','pagado_tardio'));

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS expira_en TIMESTAMPTZ;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_preference_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS stock_reservado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unidades de stock reservadas por la línea (caja = cantidad * cantcaja al
-- momento de reservar). Se llenan en 8b; si cantcaja cambia después, la
-- devolución usa este valor y no el actual. NULL = línea sin reserva.
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS unidades INTEGER;

CREATE INDEX IF NOT EXISTS idx_pedidos_pendiente_pago_expira
  ON public.pedidos (expira_en) WHERE estado = 'pendiente_pago';
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_mp_payment_id_unique
  ON public.pedidos (mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_idempotency_key_unique
  ON public.pedidos (idempotency_key) WHERE idempotency_key IS NOT NULL;
