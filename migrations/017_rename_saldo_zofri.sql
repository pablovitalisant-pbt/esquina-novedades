-- 017: Renombrar saldo_zofri → stock_referencia en prenota_items
-- Terminología Zofri (zona franca Iquique, Chile) no aplica a Bazar Naty (Bermejo, Bolivia).
-- Postgres no soporta IF EXISTS en RENAME COLUMN → bloque DO para idempotencia.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'prenota_items'
      AND column_name = 'saldo_zofri'
  ) THEN
    ALTER TABLE public.prenota_items RENAME COLUMN saldo_zofri TO stock_referencia;
  END IF;
END $$;
