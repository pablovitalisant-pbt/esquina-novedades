-- 036 — Unicidad de clientes por teléfono normalizado a dígitos.
-- Dos clientes son el mismo si regexp_replace(telefono,'[^0-9]','','g') coincide,
-- cuando telefono no es null/vacío. Clientes sin teléfono quedan FUERA de esta
-- protección (deuda declarada, no resuelta en este slice).
--
-- NOTA BUG-066: el patrón es '[^0-9]' (sin backslash). El literal '\D' en un
-- template sql`...` es manglado por el driver @neondatabase/serverless.
--
-- RIESGO DE APLICACIÓN: si producción ya tiene clientes con el mismo teléfono
-- normalizado (deuda "aceptado" de pedidos, BUG-066 creó al menos uno), este
-- CREATE UNIQUE INDEX fallará. Verificar antes de aplicar (ver PRD §10).
CREATE UNIQUE INDEX clientes_telefono_normalizado_unique
ON public.clientes (regexp_replace(telefono, '[^0-9]', '', 'g'))
WHERE telefono IS NOT NULL AND telefono <> '';
