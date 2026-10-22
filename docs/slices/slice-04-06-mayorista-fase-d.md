
## Corte 4a+4b — precio_mayor (schema + APIs de productos)
- Archivos: `migrations/040_productos_precio_mayor.sql` (CHECK `> 0`), `scripts/migrations-order.ts`, `__tests__/slice-00-schema.test.ts` (039->040), `types/index.ts` (`precio_mayor?`), `lib/precio-mayor.ts` (validador estricto: number entero > 0 o null), `app/api/productos/route.ts` (POST + GET), `app/api/productos/[id]/route.ts` (WHITELIST + validacion).
- Tests: `__tests__/api/productos-precio-mayor.test.ts` (nuevo, 28).
- Resultado: 27 suites relacionadas, 268 verdes, 4 rojos no atribuibles al corte:
  - `productos-crear-duplicado` (2): DB real, 500 hasta que 040 se aplique en Neon (accion del Director Tecnico).
  - `productos-crear-smoke` (1) y `productos-stock-minimo-ui` (1): buscan labels en PreciosClient ("Unidades por caja", "Stock minimo"); no tocan archivos del corte (probable preexistente).
- tsc: 3 errores fuera de tests (sin cambio).

## Corte 4c — UI precio_mayor (flag `precio-mayorista-ui`, false)
- Archivos: `components/ProductDrawer.tsx`, `components/ProductCard.tsx`, `app/(app)/precios/client_page.tsx`, `config/feature-flags.json`, `__tests__/slice-03-sin-powersync.test.ts` (13 -> 14 flags), nuevo `__tests__/precio-mayorista-ui.test.tsx` (9 tests).
- Fase B: 5 rojos por la razon correcta (UI inexistente); los negativos (flag off, null, ocultarPrecios) ya en verde.
- Fase D: 80/83 suites verdes (725/730 tests). Fallan `productos-crear-smoke` y `productos-stock-minimo-ui` (labels de PreciosClient, ya reportados en 4a+4b) y `notas-venta-stock-frontend` (`useParams` sin mock): no tocados por el corte; sin baseline verificado (stash no permitido).
- tsc: 3 errores fuera de tests (sin cambio).
