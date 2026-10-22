-- 034 — Pedidos públicos: schema de pedidos y pedido_items.
--
-- Un pedido es una solicitud pública (catálogo / productos) de un visitante
-- que aún NO se convirtió en nota de venta. No descuenta productos.saldo (eso
-- ocurre recién en la nota de venta, slice 3 del plan). El precio_referencia
-- es solo contexto (lo que vio el visitante), no precio de venta.
--
-- FK verificadas contra el schema real:
--   clientes.id  → UUID (migración 030).  pedidos.cliente_id referencia UUID.
--   prenotas.id  → SERIAL (migración 001). pedidos.prenota_id referencia INTEGER.
--   productos.id → SERIAL (migración 003). pedido_items.producto_id referencia INTEGER.

CREATE TABLE IF NOT EXISTS public.pedidos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID REFERENCES public.clientes(id),
  nombre_contacto   TEXT NOT NULL,
  telefono_contacto TEXT NOT NULL,
  origen            TEXT NOT NULL CHECK (origen IN ('productos', 'catalogo')),
  origen_slug       TEXT,
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'convertido', 'descartado')),
  prenota_id        INTEGER REFERENCES public.prenotas(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pedido_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         UUID NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  producto_id       INTEGER NOT NULL REFERENCES public.productos(id),
  codigo            TEXT NOT NULL,
  detalle           TEXT,
  cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
  precio_referencia NUMERIC(12,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON public.pedidos(estado);
