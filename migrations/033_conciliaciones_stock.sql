-- 033 — Conciliación de Stock (slice "Actualizar Stock" en /bodega)
--
-- Auditoría de conciliaciones de stock. Cada POST /api/bodega/conciliaciones
-- (admin-only) inserta una fila aquí y, en la misma transacción, sobrescribe
-- el saldo de productos y de ubicaciones_bodega con el conteo físico
-- (fisico_cajas * cantcaja + fisico_unidades). Guarda el saldo anterior y la
-- diferencia para trazabilidad.
--
-- Aplicar en Neon branch br-holy-darkness-acadbszt (produccion), no por nombre.

CREATE TABLE IF NOT EXISTS public.conciliaciones_stock (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES public.empresas(id),
  codigo            TEXT NOT NULL,
  saldo_anterior    INTEGER NOT NULL,
  saldo_nuevo       INTEGER NOT NULL,
  diferencia        INTEGER NOT NULL,
  cantcaja          INTEGER NOT NULL,
  fisico_cajas      INTEGER NOT NULL,
  fisico_unidades   INTEGER NOT NULL DEFAULT 0,
  observaciones     TEXT,
  usuario_id        INTEGER NOT NULL REFERENCES public.usuarios(id),
  usuario_nombre    TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_stock_codigo
  ON public.conciliaciones_stock (empresa_id, codigo);
