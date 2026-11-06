-- 049 — Método de pago elegido en el pedido (N03a). Idempotente.
-- Nullable: null = el comprador aún no eligió. Históricos quedan null.
-- Solo registra la elección; no convierte pedidos ni cobra.
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS metodo_pago TEXT;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_metodo_pago_check
  CHECK (metodo_pago IS NULL OR metodo_pago IN ('mercadopago','transferencia','efectivo'));
