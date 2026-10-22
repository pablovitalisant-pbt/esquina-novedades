
## Corte 4a+4b — precio_mayor (schema + APIs de productos)
- Archivos: `migrations/040_productos_precio_mayor.sql` (CHECK `> 0`), `scripts/migrations-order.ts`, `__tests__/slice-00-schema.test.ts` (039->040), `types/index.ts` (`precio_mayor?`), `lib/precio-mayor.ts` (validador estricto: number entero > 0 o null), `app/api/productos/route.ts` (POST + GET), `app/api/productos/[id]/route.ts` (WHITELIST + validacion).
- Tests: `__tests__/api/productos-precio-mayor.test.ts` (nuevo, 28).
- Resultado: 27 suites relacionadas, 268 verdes, 4 rojos no atribuibles al corte:
  - `productos-crear-duplicado` (2): DB real, 500 hasta que 040 se aplique en Neon (accion del Director Tecnico).
  - `productos-crear-smoke` (1) y `productos-stock-minimo-ui` (1): buscan labels en PreciosClient ("Unidades por caja", "Stock minimo"); no tocan archivos del corte (probable preexistente).
- tsc: 3 errores fuera de tests (sin cambio).
