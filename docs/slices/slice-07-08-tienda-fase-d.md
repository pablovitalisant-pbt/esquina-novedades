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

## Sub-slice 7d — Checkout con entrega

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §3.1–3.2 (fila 7d) y §9 (tests UI 33–35).

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `components/CarritoGateModal.tsx` | modificado | Email obligatorio (no vacío y con `@`); se guarda en `ContactoCarrito`. |
| `components/CarritoCheckoutForm.tsx` | nuevo | Formulario de checkout: contacto editable, opción de entrega (costo incluido en el label), dirección solo si `requiere_direccion`, nota de la opción (Arica: se paga al chofer) y validación cliente. Emite `DatosCheckout` al drawer. |
| `components/CarritoDrawer.tsx` | modificado | Carga opciones desde `GET /api/entrega/opciones` al abrir; líneas por modalidad con subtotal y edición/borrado por `producto_id + modalidad`; subtotal, costo de entrega y total estimado; el POST envía solo `producto_id`, `modalidad` y `cantidad` (sin precios ni total), más contacto y entrega. |
| `__tests__/checkout-entrega.test.tsx` | nuevo | 6 casos: email obligatorio en el gate, carga de opciones, delivery sin/con dirección, retiro sin dirección + body sin precios, subtotal/costo/total estimado, nota de Arica. |
| `__tests__/carrito.test.tsx` | modificado | Seeds con email, mock de opciones, selección de retiro antes de enviar; totales leídos por `data-testid` (las aserciones de precio/caja siguen iguales). |

### Resultados

- Fase B: `npx jest __tests__/checkout-entrega.test.tsx` → **rojo por la razón correcta**: 6/6 fallan porque el drawer no tenía selector de entrega ni checkout (los items se mostraban con el formato legacy).
- Fase D (`npx jest` sobre el corte + co-ubicados/relacionados `carrito`, `tienda-modalidad`, `slice2a-clp`, `catalog-footer`, `catalogo-print`): **6 suites, 50 tests, verde**.
- `npx tsc --noEmit`: **3 errores fuera de tests**, igual que el baseline (`.next/types` ×2 y `app/page.tsx`), sin errores nuevos.
- El total del drawer es estimado: el servidor lo recalcula y valida entrega/dirección en 7e. Suite completa: la corre el Director Técnico.

## Sub-slice 7e — POST/GET pedidos con precios server-side

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §5.1 y sub-slice 7e.

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `app/api/pedidos/route.ts` | modificado | POST: valida email (`@`) y `entrega_codigo`; lee productos (`prcventa`, `precio_mayor`, `cantcaja`, `activo`, `costo`) y la opción de entrega desde DB; calcula líneas, subtotales y total con `calcularPedido` (origen `catalogo` usa `precioCatalogoBase` + override, la misma fórmula de la página); `ErrorPrecio → 400`; ignora precios/total del body; inserta `pedidos` con email/entrega/dirección/total e ítems con `modalidad`/`precio`. Cliente por teléfono: completa `email` solo si faltaba. Sin reserva de stock (`stock_reservado` queda en su default `false`). GET: devuelve email, entrega, costo, dirección, total e ítems con modalidad/precio/subtotal. |
| `__tests__/api/pedidos.test.ts` | modificado | Mock por contenido SQL; cubre los casos 1–3, 5–11 de §9 para el corte: body manipulado ignorado, caja sin `precio_mayor` → 400, delivery sin dirección → 400, catálogo con margen/override, email requerido, cliente sin/con email y carrera 23505, y GET con los campos nuevos. |

### Resultados

- Fase D (`npx jest` sobre tests del corte + relacionados que mencionan `/api/pedidos`: `pedidos.test`, `pedidos-precios-server`, `pedidos-id`, `pedidos-convertir`, `carrito`, `checkout-entrega`): **6 suites, 64 tests, verde**.
- `npx tsc --noEmit`: **3 errores fuera de tests**, igual que el baseline (`.next/types` ×2 y `app/page.tsx`), sin errores nuevos.
- Sin reserva de stock ni flag: `tienda-pago-online` no existe aún; queda para 8b/8c. `stock_reservado` no se escribe hasta la migración 043 (8a).

### Corrección de seguridad (post-7e)

**Hallazgo del Director Técnico:** con `origen='catalogo'` se aplicaba el precio de catálogo a cualquier `producto_id` del body. Un cliente podía elegir un catálogo con margen bajo y comprar productos que ese catálogo no muestra, pagando menos que `prcventa`.

**Fix:**
- `app/api/catalogos/public/[slug]/seleccion.ts` | nuevo | Extrae la selección del catálogo público (`parseKeywords` + `filterProducts` + `solo_stock`/`solo_nuevo` + filtro empresa/categoría) a una única función `seleccionarProductosCatalogo`, usada por el GET público y por el POST de pedidos.
- `app/api/catalogos/public/[slug]/route.ts` | modificado | El GET delega la selección en `seleccionarProductosCatalogo` (sin cambiar la respuesta).
- `app/api/catalogos/public/[slug]/route.test.ts` | modificado | Importa `parseKeywords` desde `seleccion.ts` (el route ya no exporta helpers: Next rechaza exports extra en route handlers).
- `app/api/pedidos/route.ts` | modificado | Con `origen='catalogo'`, verifica cada producto contra la selección real del catálogo; si alguno no pertenece → `400 'producto no pertenece al catalogo'`, sin escrituras. `costo` NULL/no numérico sin override sigue cayendo en `ErrorPrecio` (`precioCatalogoBase` → NaN) → 400.
- `__tests__/api/pedidos.test.ts` | modificado | Nuevos: producto fuera del catálogo → 400, producto dentro por palabra clave → 201 con precio de catálogo, costo NULL sin override → 400.

**Resultados:** rojo confirmado (el caso "fuera del catálogo" devolvía 201). Verde: `npx jest __tests__/api/pedidos.test.ts app/api/catalogos/public` (39 tests), más `filter-products`, `catalogo-codigos-incluir`, `catalogo-solo-nuevo*` (16 tests). `npx tsc --noEmit` sin errores nuevos en los archivos tocados.

## Sub-slice 7f — UI staff de pedidos + admin de costos de entrega

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §7 (fila 7f) y §9 (tests UI).

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `app/(app)/pedidos/client_page.tsx` | modificado | El detalle muestra email, opción de entrega (con dirección) y el `total` calculado por el servidor; ítems con `modalidad` ("2 cajas" / "1 unidad") y su `subtotal`; badge de estados nuevos (`pendiente_pago`, `pagado`, `pagado_tardio`, `expirado`, `rechazado`) con fallback al código. Se elimina el recálculo local con `precio_referencia`. |
| `app/(app)/admin/caja-config/client_page.tsx` | modificado | Sección "Opciones de entrega": carga desde `GET /api/entrega/opciones` y edita el costo por fila con `PATCH /api/entrega/opciones/[codigo]`. |
| `app/(app)/admin/caja-config/client_page.test.tsx` | modificado | 3 fetch iniciales y caso de edición de costo con PATCH. |
| `__tests__/app/pedidos/client_page.test.tsx` | modificado | Casos 7f: total del servidor (no recalculado), estado, email, entrega/dirección, modalidad y subtotal por ítem. |
| `PRD.md` | modificado | §9 fila 7 marcada como completada. |

### Resultados

- Fase B: los tests del corte fallaron por la razón correcta (la vista no tenía modalidad/subtotal/entrega y caja-config no cargaba opciones de entrega).
- Fase D (`npx jest` sobre tests del corte + co-ubicados/relacionados `caja-config-client_page`, `slice-03-sin-powersync`, `slice14-cajas-smoke`, `slice2-build-smoke`, `slice2a-clp`): **7 suites, 97 tests, verde**.
- `npx tsc --noEmit`: sin errores nuevos fuera de tests (se mantienen los preexistentes de `.next/types` y `app/page.tsx`).
- Simplificación deliberada: el admin de caja-config edita solo el costo; `activa`/`requiere_direccion`/`nota` siguen disponibles por el PATCH pero no se exponen aún. El GET usado es el público (solo activas), por lo que no se reactivan opciones inactivas desde esta pantalla. Suite completa: la corre el Director Técnico.

## Sub-slice 8a — migración 043 + liberación de reservas vencidas

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §4.2, §6.1 y §9 (tests 18–21, 25).

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `migrations/043_pedidos_reserva.sql` | nuevo | CHECK de estados ampliado (conserva los 3 actuales), `expira_en`, `mp_preference_id`, `mp_payment_id`, `stock_reservado BOOLEAN NOT NULL DEFAULT false`, `idempotency_key TEXT`; `pedido_items.unidades INTEGER` (unidades de stock reservadas por línea, se llenan en 8b); índices parcial `pendiente_pago/expira_en`, únicos de `mp_payment_id` e `idempotency_key`. Idempotente. |
| `lib/pedidos/liberar-reservas.ts` | nuevo | `liberarReservasVencidas()`: una sola sentencia CTE. El `UPDATE pedidos ... WHERE estado='pendiente_pago' AND stock_reservado=true AND expira_en < NOW()` es la exclusión; devuelve stock a `productos.saldo` y `ubicaciones_bodega.saldo` agrupado por producto, sumando `pi.unidades` (lo reservado). No recalcula con `cantcaja`, que puede haber cambiado entre la reserva y la expiración; las líneas con `unidades IS NULL` no devuelven nada. |
| `__tests__/api/liberar-reservas.test.ts` | nuevo | Semántica del SQL (un statement, NOW(), condiciones de estado/reserva/expiración, suma de `pi.unidades`, exclusión de NULL, ambas tablas, `GROUP BY`), segunda llamada sin doble devolución y ceros sin vencidos. Incluye el caso que intenta romper: `cantcaja` cambia tras reservar y se devuelven exactamente las unidades reservadas. |
| `scripts/migrations-order.ts` | modificado | `043_pedidos_reserva.sql` al final. |
| `__tests__/slice-00-schema.test.ts` | modificado | Última migración = 043. |
| `__tests__/api/productos-precio-mayor.test.ts` | modificado | Última migración = 043. |
| `__tests__/api/entrega-opciones.test.ts` | modificado | Impacto lateral: su assert de "042 al final" ahora exige 042 seguida de 043. |

### Resultados

- Fase B: rojo por la razón correcta (módulo `liberar-reservas` inexistente y orden de migraciones aún en 042).
- Fase D (`npx jest` sobre el corte + co-ubicados/relacionados: `slice-00-schema`, `productos-precio-mayor`, `entrega-opciones`, `slice5ab-modalidad`, `productos-softdelete-impacto-lateral`, `slice15-pettycash-smoke`): **7 suites, 134 tests, verde**.
- `npx tsc --noEmit`: sin errores nuevos fuera de tests (se mantiene el preexistente de `app/page.tsx`; `liberar-reservas.ts` sin errores).
- Decisión: no se agregó guard de flag en el lib; con `tienda-pago-online=false` nunca existen pedidos `pendiente_pago` con reserva, y el flag/wiring llegan en 8b/8c. Suite completa: la corre el Director Técnico.

#### Corrección post-revisión (hallazgo del Director Técnico)

- `lib/pedidos/liberar-reservas.ts` recalculaba las unidades a devolver con `p.cantcaja` **actual**; si el tamaño de la caja cambiaba entre reserva y expiración se devolvía una cantidad distinta a la reservada.
- Fix: `pedido_items.unidades` guarda las unidades reservadas por línea (se llena en 8b al reservar); la liberación suma `pi.unidades` y las filas con `unidades IS NULL` no devuelven nada. La migración 043 aún no estaba aplicada en ninguna base, así que se extendió sin migración nueva.
- Test agregado: `cantcaja` cambia después de reservar → se devuelven exactamente las unidades reservadas.
- Fase D (`npx jest __tests__/api/liberar-reservas.test.ts __tests__/slice-00-schema.test.ts`): **2 suites, 22 tests, verde**.

## Sub-slice 8b — reserva atómica en POST /api/pedidos (flag `tienda-pago-online`)

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §5.1, §6 y §9 (tests 12–17, 34).

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `config/feature-flags.json` | modificado | Nuevo flag `tienda-pago-online: false`. |
| `app/api/pedidos/route.ts` | modificado | Con flag `true`: `liberarReservasVencidas()` al inicio; `estado='pendiente_pago'`, `stock_reservado=true`, `expira_en = NOW() + 36 h` calculado en DB y `pedido_items.unidades`. Una sola `sql.transaction` con `INSERT pedidos` + `INSERT pedido_items` + por línea `UPDATE productos SET saldo=saldo-u WHERE id AND saldo>=u` (con el mismo descuento en `ubicaciones_bodega`) y guard `1/0` que aborta con `22012`; el catch relee `saldo` real y responde 409 `{ error:'Stock insuficiente', items:[{codigo,disponible,solicitado}] }` sin dejar pedido (rollback). `Idempotency-Key` (header o `idempotency_key`): pre-check devuelve 200 con el pedido existente; el 23505 del índice único en carrera también devuelve el ganador. Con flag `false` el alta es idéntica a 7e (sin UPDATEs de stock, estado `pendiente`). |
| `__tests__/api/pedidos-reserva.test.ts` | nuevo | Reserva exitosa (descuento en ambas tablas, guard `1/0`, unidades 12 para 2 cajas, estados y 36 h), liberación antes de tocar stock, dos pedidos por el último stock (201 + 409 con detalle), misma Idempotency-Key dos veces (una reserva, 200) y stock insuficiente (409, un solo `sql.transaction`). |
| `__tests__/slice-03-sin-powersync.test.ts` | modificado | Impacto lateral: el assert "solo los N flags esperados" pasa de 16 a 17 por el flag nuevo. |

### Resultados

- Fase B: rojo por la razón correcta (5/5): el route ignoraba el flag, no descontaba stock, no emitía 409 y no deduplicaba por Idempotency-Key.
- Fase D (`npx jest` sobre el corte + co-ubicados/relacionados: `pedidos`, `pedidos-precios-server`, `pedidos-convertir`, `pedidos-id`, `liberar-reservas`, `slice-03-sin-powersync`): **7 suites, 114 tests, verde**. Además, los 19 suites restantes que mencionan `config/feature-flags.json`: verde tras ajustar el conteo de flags (142 tests).
- `npx tsc --noEmit`: sin errores nuevos en los archivos del corte; se mantienen los preexistentes (1 no-test `app/page.tsx` + 2 de `.next/types`, total 113 con tests). Suite completa: la corre el Director Técnico.
- Simplificación deliberada: el detalle del 409 se construye releyendo `saldo` tras el rollback (no la lectura previa, que puede estar obsoleta por concurrencia). No se agrega endpoint nuevo ni cola de reintentos.

## Sub-slice 8c — liberación perezosa + cron + vercel.json

**Contrato:** `docs/slices/slice-07-08-tienda-fase-a.md` §3, §5.4, §6.1 y §8.

### Archivos

| Archivo | Tipo | Cambio |
|---|---|---|
| `app/api/cron/liberar-reservas/route.ts` | nuevo | `GET` con `Authorization: Bearer $CRON_SECRET` comparado con `timingSafeEqual`; 401 si falta/no coincide y 500 si `CRON_SECRET` no está configurada. Responde `{ data: { liberados, unidades } }`. |
| `app/api/notas-venta/[id]/items/route.ts` | modificado | `liberarReservasVencidas()` inmediatamente antes del UPDATE de stock. En escritura el error se propaga (contrato §8: no reservar sobre stock sucio). |
| `app/api/catalogos/public/[slug]/route.ts`, `app/catalogo/[slug]/page.tsx`, `app/productos/page.tsx` | modificados | Liberación al inicio de cada lectura pública, dentro de `try/catch`: loguea y continúa. |
| `vercel.json` | modificado | Cron diario `/api/cron/liberar-reservas` (`17 4 * * *`; Hobby admite 1/día). |
| `.env.example` | modificado | `CRON_SECRET=`. |
| `__tests__/api/cron-liberar-reservas.test.ts` | nuevo | Sin header → 401, token incorrecto → 401, token correcto → 200 con `{ liberados, unidades }`, secreto ausente → 500. |
| `__tests__/api/notas-venta-items-post-stock.test.ts` | modificado | La secuencia SQL suma la liberación; índices corridos. Caso nuevo: si la liberación falla, el POST falla y no descuenta stock. |
| `app/api/notas-venta/[id]/items/route.test.ts` | modificado | Ídem (co-ubicado). |
| `__tests__/api/prenotas.test.ts`, `__tests__/api/slice5ab-modalidad.test.ts`, `__tests__/catalogo-solo-nuevo-fix.test.ts`, `__tests__/slice-landing-v2.test.tsx` | modificados | Impacto lateral: mocks/índices por la query de liberación. En `catalogo-solo-nuevo-fix` se agrega el caso "si la liberación falla, el catálogo sigue respondiendo". |

### Resultados

- Fase B: rojo por la razón correcta (ruta cron inexistente; las lecturas públicas no llamaban a la liberación; el POST no liberaba antes del stock).
- Fase D (`npx jest` sobre el corte + co-ubicados `app/api/notas-venta/[id]/items/route.test.ts` y `app/api/catalogos/public/[slug]/route.test.ts` + relacionados que importan/mencionan los archivos tocados): **14 suites, 216 tests, verde**. `catalogo-precio-override.test.ts` es un test de integración con DB real que falla en su `beforeAll` por la rama de test vacía (`SELECT id FROM usuarios` → 0 filas); no depende de este corte.
- `npx tsc --noEmit`: sin errores nuevos fuera de tests (se mantienen los preexistentes de `.next/types` y `app/page.tsx`).
- Decisión: liberación segura (log + continuar) solo en lecturas; en `POST items` se propaga (contrato §8). Sin guard de flag en el lib: con `tienda-pago-online=false` no existen pedidos `pendiente_pago` reservados, y la CTE no toca filas. Suite completa: la corre el Director Técnico.
