# Fase D — Slices 7 y 8: tienda con entrega + reserva de stock

## Sub-slice 7a — Opciones de entrega (migración 042 + GET/PATCH + tests)

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §4.1 y sub-slice 7a.

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `migrations/042_opciones_entrega_checkout.sql` | nuevo | Tabla `opciones_entrega` + seed idempotente (4 opciones), `clientes.email`, columnas de checkout en `pedidos` y `pedido_items` (`modalidad`, `precio`, `subtotal` generado). Se aplica a Neon por el Director Técnico. |
| `scripts/migrations-order.ts` | modificado | 042 al final del orden. |
| `app/api/entrega/opciones/route.ts` | nuevo | GET público: solo `activa = true`, ordenado por `orden`. |
| `app/api/entrega/opciones/[codigo]/route.ts` | nuevo | PATCH admin: costo, activa, orden, requiere_direccion, nota. Parcial, valida tipos, 401/403/404/400. |
| `__tests__/api/entrega-opciones.test.ts` | nuevo | 11 bloques de test (21 casos con `test.each`): público, filtro/orden SQL, 401/403/404, validaciones sin escritura, actualización parcial, migración 042. |
| `__tests__/slice-00-schema.test.ts` | modificado | Última migración esperada = 042 (antes 041). |
| `__tests__/api/productos-precio-mayor.test.ts` | modificado | Ídem: último elemento de `MIGRATION_ORDER` = 042. |
| `__tests__/api/slice5ab-modalidad.test.ts` | modificado | 041 ya no es la última; se afirma que sigue presente en el orden. |

### Resultados

- `npx jest` (tests del corte + co-ubicados/relacionados: `entrega-opciones`, `slice5ab-modalidad`, `productos-precio-mayor`, `slice-00-schema`): **4 suites, 83 tests, verde**.
- `npx tsc --noEmit`: **3 errores fuera de tests**, igual que el baseline (`.next/types` ×2 y `app/page.tsx`), sin errores nuevos.
- Suite completa y migración contra Neon: pendientes del Director Técnico.
