-- 052 — N12a2: comprobante privado adjunto a un pago del desarrollo. Idempotente.
-- Un solo comprobante por pago (PK). Bytes en la base: sin URL pública.
-- Reutiliza la función append-only de 051; no se edita una migración aplicada.
CREATE TABLE IF NOT EXISTS public.pagos_app_comprobantes (
  pago_id     UUID PRIMARY KEY REFERENCES public.pagos_app(id),
  mime        TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes       BYTEA NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152),
  subido_por  INTEGER NOT NULL REFERENCES public.usuarios(id),
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solo se adjunta a una transferencia no reversa. ERRCODE 23514: es una regla
-- de negocio, igual que los CHECK de MIME y tamaño; el cliente la ve como 23514.
CREATE OR REPLACE FUNCTION public.pagos_app_comprobantes_validar_pago()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  pago public.pagos_app%ROWTYPE;
BEGIN
  SELECT * INTO pago FROM public.pagos_app WHERE id = NEW.pago_id;
  IF NOT FOUND THEN
    RETURN NEW; -- el FK informa 23503
  END IF;
  IF pago.medio <> 'transferencia' OR pago.reversa_de IS NOT NULL THEN
    RAISE EXCEPTION 'pagos_app_comprobantes: solo transferencia no reversa (%)', pago.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pagos_app_comprobantes_validar_pago ON public.pagos_app_comprobantes;
CREATE TRIGGER pagos_app_comprobantes_validar_pago
  BEFORE INSERT ON public.pagos_app_comprobantes
  FOR EACH ROW EXECUTE FUNCTION public.pagos_app_comprobantes_validar_pago();

DROP TRIGGER IF EXISTS pagos_app_comprobantes_append_only ON public.pagos_app_comprobantes;
CREATE TRIGGER pagos_app_comprobantes_append_only
  BEFORE UPDATE OR DELETE ON public.pagos_app_comprobantes
  FOR EACH ROW EXECUTE FUNCTION public.pagos_app_append_only();
