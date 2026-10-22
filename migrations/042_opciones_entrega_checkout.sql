-- 042 — Opciones de entrega + columnas de checkout (Slice 7a). Idempotente.
-- Costos/textos en DB; el servidor los lee para calcular entrega y total.
CREATE TABLE IF NOT EXISTS public.opciones_entrega (
  codigo             TEXT PRIMARY KEY,
  nombre             TEXT NOT NULL,
  costo              INTEGER NOT NULL DEFAULT 0 CHECK (costo >= 0),
  requiere_direccion BOOLEAN NOT NULL DEFAULT false,
  activa             BOOLEAN NOT NULL DEFAULT true,
  orden              INTEGER NOT NULL DEFAULT 0,
  nota               TEXT
);

INSERT INTO public.opciones_entrega (codigo,nombre,costo,requiere_direccion,activa,orden,nota)
VALUES
  ('retiro','Retiro en tienda',0,false,true,1,NULL),
  ('delivery_iquique','Delivery Iquique',3000,true,true,2,NULL),
  ('delivery_alto_hospicio','Delivery Alto Hospicio',4000,true,true,3,NULL),
  ('envio_arica','Envío a Arica',0,true,true,4,'Se paga al chofer según tamaño')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS email_contacto TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_codigo TEXT REFERENCES public.opciones_entrega(codigo);
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS entrega_costo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS direccion_entrega TEXT;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS total INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS modalidad TEXT NOT NULL DEFAULT 'unidad'
  CHECK (modalidad IN ('unidad','caja'));
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS precio INTEGER NOT NULL DEFAULT 0
  CHECK (precio >= 0);
ALTER TABLE public.pedido_items ADD COLUMN IF NOT EXISTS subtotal INTEGER
  GENERATED ALWAYS AS (cantidad * precio) STORED;
