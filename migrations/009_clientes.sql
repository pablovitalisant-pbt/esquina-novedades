-- Slice 18: Tabla de clientes + FK en prenotas
-- ON DELETE RESTRICT: no se puede eliminar un cliente con notas de venta asociadas

CREATE TABLE IF NOT EXISTS public.clientes (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  telefono   TEXT,
  direccion  TEXT,
  notas      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prenotas
  ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES public.clientes(id)
    ON DELETE RESTRICT;
