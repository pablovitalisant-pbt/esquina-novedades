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

## Sub-slice 7b — Cálculo server-side de precios y totales

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §1, §6 y sub-slice 7b.

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `lib/pedidos/precios.ts` | nuevo | Puro y testeable: `calcularLinea` (unidad/caja, precio desde `productos`, unidades de stock) y `calcularPedido` (valida entrega/dirección y calcula `total = Σ subtotales + entrega_costo`). Ignora por construcción cualquier precio/total del body. `ErrorPrecio` para 400. Origen `catalogo` exige el precio ya resuelto con `precioCatalogoBase` y lo redondea a CLP entero. |
| `lib/precio-catalogo.ts` | nuevo | `precioCatalogoBase(costo, margen)`: fórmula extraída 1:1 de `page.tsx` (ceil a 1 decimal). Única fuente para la página y el checkout. |
| `app/catalogo/[slug]/page.tsx` | modificado | Usa `precioCatalogoBase` en lugar de la fórmula inline. Resultado idéntico; override se mantiene igual. |
| `__tests__/api/pedidos-precios-server.test.ts` | nuevo | 10 casos: precio manipulado ignorado, caja sin `precio_mayor`/`cantcaja`, caja factura `cantidad * cantcaja` unidades, delivery sin dirección, retiro sin dirección, opción inactiva, total con entrega, misma fórmula de catálogo y redondeo CLP. |
| `docs/slices/slice-07-08-tienda-fase-d.md` | modificado | Esta sección. |

### Resultados

- `npx jest __tests__/api/pedidos-precios-server.test.ts`: **1 suite, 10 tests, verde**.
- Relacionados/co-ubicados: `productos-softdelete-impacto-lateral`, `slice-audit-ponytail-yagni`, `slice2a-clp` → verde. `catalogo-precio-override` no corre en este entorno: su `beforeAll` requiere filas en `catalogos` de la BD de integración y falla antes de importar código del corte (preexistente, no causado por 7b).
- `npx tsc --noEmit`: **3 errores fuera de tests**, igual que el baseline (`.next/types` ×2 y `app/page.tsx`), sin errores nuevos.
- POST `/api/pedidos` aún no consume este módulo (corresponde a 7e). Suite completa: la corre el Director Técnico.

## Sub-slice 7c — Carrito mixto y selector de modalidad

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §1, §7 (fila 7c) y §9 (tests UI 30–32).

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `contexts/CarritoContext.tsx` | modificado | `Modalidad`; `ItemCarrito` con `modalidad` y `precio` (precio de la modalidad); `ContactoCarrito.email?`; dedupe por `producto_id + modalidad`; `quitarItem`/`actualizarCantidad` aceptan modalidad (sin ella conservan el comportamiento legacy para el drawer de 7d). |
| `components/SelectorModalidad.tsx` | nuevo | Control unidad/caja con precio de cada modalidad, stock y packing. Caja deshabilitada salvo `precio_mayor > 0 && cantcaja > 0`. |
| `components/BotonAgregarPedido.tsx` | modificado | Recibe `precio`, `precio_mayor`, `cantcaja`, `stock`; compone el selector, construye el ítem según modalidad y conserva el gate de nombre/teléfono. |
| `app/productos/page.tsx` | modificado | Selecciona `MAX(precio_mayor)` y lo normaliza a número/null. |
| `app/productos/client_page.tsx` | modificado | Pasa `precio_mayor`, `stock` y `umed` al botón. |
| `app/catalogo/[slug]/page.tsx` | modificado | Selecciona `MAX(p.precio_mayor)` en ambas ramas de query y lo expone al cliente. |
| `app/catalogo/[slug]/client_page.tsx` | modificado | Pasa `precio_catalogo` como precio unidad, `precio_mayor`, `stock` y `umed`. |
| `__tests__/tienda-modalidad.test.tsx` | nuevo | 10 casos: dedupe por producto+modalidad, aislamiento de cantidades, quitar/actualizar por modalidad, selector con/sin caja disponible, botón unidad/caja, gate vigente y wiring de ambas páginas. |
| `__tests__/carrito.test.tsx` | modificado | Ítems de prueba con `modalidad`/`precio`; sin cambios de expectativas. |

### Resultados

- Fase B: `npx jest __tests__/tienda-modalidad.test.tsx` → rojo por módulo `SelectorModalidad` inexistente; tras implementar, verde.
- Fase D (`npx jest` sobre el corte + co-ubicados/relacionados `carrito`, `catalogo-print`, `catalog-footer`, `slice2a-clp`, `pedidos-precios-server`, `ProductCard`): **7 suites, 64 tests, verde**.
- `npx tsc --noEmit`: **3 errores fuera de tests**, igual que el baseline (`.next/types` ×2 y `app/page.tsx`), sin errores nuevos.
- `CarritoDrawer` sigue mostrando el precio legacy (`precio_referencia`); su adaptación a modalidad/subtotal corresponde a 7d.
