-- 051 — N12a1: registro privado de pagos del desarrollo. Idempotente.
-- Esquema aislado: sin consumidores ni rutas todavía. Append-only por trigger:
-- una corrección se registra como reversa auditada, nunca editando el asiento.
CREATE TABLE IF NOT EXISTS public.pagos_app (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave       UUID NOT NULL UNIQUE,
  fecha       DATE NOT NULL,
  medio       TEXT NOT NULL CHECK (medio IN ('efectivo', 'transferencia')),
  monto_clp   INTEGER NOT NULL CHECK (monto_clp > 0),
  detalle     TEXT NOT NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversa_de  UUID UNIQUE REFERENCES public.pagos_app(id),
  CONSTRAINT pagos_app_detalle_check CHECK (
    detalle = btrim(detalle) AND char_length(detalle) BETWEEN 1 AND 500
  )
);

-- Una reversa exige: original existente, original no reversa, mismo monto y
-- mismo medio. La unicidad de reversa_de impide dos reversas del mismo asiento.
CREATE OR REPLACE FUNCTION public.pagos_app_validar_reversa()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  original public.pagos_app%ROWTYPE;
BEGIN
  IF NEW.reversa_de IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO original FROM public.pagos_app WHERE id = NEW.reversa_de;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pagos_app: reversa_de % no existe', NEW.reversa_de;
  END IF;
  IF original.reversa_de IS NOT NULL THEN
    RAISE EXCEPTION 'pagos_app: no se revierte una reversa (%)', original.id;
  END IF;
  IF NEW.monto_clp <> original.monto_clp OR NEW.medio <> original.medio THEN
    RAISE EXCEPTION 'pagos_app: la reversa debe igualar monto y medio de %', original.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pagos_app_validar_reversa ON public.pagos_app;
CREATE TRIGGER pagos_app_validar_reversa
  BEFORE INSERT ON public.pagos_app
  FOR EACH ROW EXECUTE FUNCTION public.pagos_app_validar_reversa();

-- Los dueños de infraestructura conservan el mantenimiento: pueden desactivar
-- el trigger explícitamente. La aplicación no tiene esa vía.
CREATE OR REPLACE FUNCTION public.pagos_app_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'pagos_app es append-only: % no permitido', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS pagos_app_append_only ON public.pagos_app;
CREATE TRIGGER pagos_app_append_only
  BEFORE UPDATE OR DELETE ON public.pagos_app
  FOR EACH ROW EXECUTE FUNCTION public.pagos_app_append_only();
