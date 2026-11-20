-- 055 — Registro de cambios de código de producto (B5).
--
-- El historial (/bodega/historial) resuelve con estas filas la cadena de
-- códigos anteriores de un producto y sus ventanas de tiempo. No se reescribe
-- la bitácora histórica: ingresos_mercaderia y conciliaciones_stock conservan
-- el código con que se registraron.
--
-- Sin backfill: los cambios anteriores a esta migración no tienen fila y el
-- historial de esos productos sigue mostrando solo el código actual.

CREATE TABLE IF NOT EXISTS public.productos_codigo_cambios (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES public.empresas(id),
  producto_id     INTEGER NOT NULL REFERENCES public.productos(id),
  codigo_anterior TEXT NOT NULL,
  codigo_nuevo    TEXT NOT NULL,
  usuario_id      INTEGER REFERENCES public.usuarios(id),
  usuario_nombre  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usado por el historial: filas de un producto en orden temporal.
CREATE INDEX IF NOT EXISTS idx_productos_codigo_cambios_producto
  ON public.productos_codigo_cambios (producto_id, created_at, id);
