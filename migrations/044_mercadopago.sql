-- 044 — Mercado Pago Checkout Pro (Slice 9a). Idempotente.
-- Columnas de pago online sobre pedidos; el estado 'revision' es visible para
-- el admin y no expira automáticamente. caja_movimientos.id es UUID desde 028.
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_init_point TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_fecha_pago TIMESTAMPTZ;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mp_revision_motivo TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS caja_movimiento_id UUID
  REFERENCES public.caja_movimientos(id) ON DELETE SET NULL;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('pendiente','convertido','descartado',
                    'pendiente_pago','pagado','rechazado','expirado',
                    'pagado_tardio','revision'));

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_caja_movimiento_unique
  ON public.pedidos (caja_movimiento_id) WHERE caja_movimiento_id IS NOT NULL;

-- Usuario sistema para el webhook (prenotas.usuario_id y caja_movimientos.usuario_id
-- son NOT NULL). Inactivo y con password no-bcrypt: bcrypt.compare nunca lo acepta
-- y lib/auth.ts filtra activo = true, así que no puede iniciar sesión.
INSERT INTO public.usuarios (rut, nombre, rol, password, activo)
VALUES ('SISTEMA-MP', 'Mercado Pago', 'vendedor', '!', false)
ON CONFLICT (rut) DO NOTHING;
