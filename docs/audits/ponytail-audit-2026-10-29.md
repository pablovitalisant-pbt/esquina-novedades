# Ponytail audit — 2026-10-29

Solo lista; no se aplicó nada. Alcance: archivos no-test cambiados desde la última
limpieza (`git diff --name-only c5fe864..HEAD -- app components contexts hooks lib utils
types scripts middleware.ts config migrations`, sin `*.test.*`). Contexto: cambio de
modelo del 2026-10-29 — no existe venta por caja; `modalidad` es `'detalle' | 'mayor'`
y `cantcaja` queda solo para bodega.
Flags intencionales (`tienda-pago-online`, `tienda-mayor-online`, `precio-mayorista-ui`,
`notas-venta-modalidad`, `clientes-etiqueta`, `mp-webhook-ignorar-ipn-legacy`,
`pedido-confetti`, `registro_notas_bodega_ui`, `env-validacion-arranque`) NO se tocan.
"Sin lectores" = 0 coincidencias en grep sobre código **y** tests.

## Resultado (Director Tecnico)
Se aplican 1, 2 (actualizando los tests que fijaban el alias legacy: el servidor ignora la modalidad del cliente, cualquier valor u omitida), 3, 4 (solo codigo), 5, 6, 7, 8, 9 y 11. **Rechazados los DROP de columnas** (`pedido_items.precio_referencia` de 4 y `catalogos.margen_precio` de 10): destructivos y sin beneficio en codigo; se dejan sin uso. Condicion para 1: `data.ts` y el route publico devuelven los mismos productos en el mismo orden para el mismo catalogo (test de equivalencia).

## Hallazgos (mayor recorte primero)

1. `shrink` `app/catalogo/[slug]/data.ts` reimplementa completa `seleccionarProductosCatalogo`
   (keywords, las 2 queries con grupo por categoría, `filterProducts`, solo_stock/solo_nuevo,
   overrides). Además `parseCSVField` (`data.ts:8-12`) duplica `parseKeywords` (`seleccion.ts:11-14`).
   Reemplazo: `const rows = await seleccionarProductosCatalogo(sql, cat)` y agregar
   `MAX(p.precio_mayor)`/`MAX(p.minimo_mayor)` a los 2 SELECT de `seleccion.ts:58-98` (+ tipo).
   `data.ts` pasa de ~150 a ~55 líneas. (-~85)
   - Evidencia: `data.ts:41-121` vs `seleccion.ts:31-107` (mismas queries repetidas dos veces
     dentro de cada archivo); comparar `data.ts:20-24` con `seleccion.ts:11-14`.
   - Tests que cubren ambos caminos (`slice4a-catalogo-precio-detalle.test.ts:63,87`,
     `catalogo-precio-override.test.ts:303`) siguen verdes si data.ts delega: solo comparan
     `precio_catalogo`/`precio_override`.

2. `delete` Validación de modalidad del cliente con alias legacy `'unidad'/'caja'`. El valor
   se ignora por completo (lo decide el servidor desde la cantidad), así que la validación
   solo puede eliminar una rama viva. Reemplazo: borrar `MODALIDADES_CLIENTE`,
   `validarModalidadCliente` y su llamada, y el bloque equivalente del route. (-~20)
   - Evidencia: `lib/pedidos/precios.ts:76-84,121`; `app/api/pedidos/route.ts:32,135-140`.
   - **Bloqueado por tests que exigen aceptar `'caja'` y que `'docena'` dé 400**:
     `__tests__/api/pedidos.test.ts:111,138`, `pedidos-precios-server.test.ts:46-57`,
     `hotfix-tienda-mayor-api.test.ts:69`, `hotfix-tienda-mayor-precios.test.ts:27`.
     Si se aplica, hay que actualizar esos tests en el mismo slice (decisión de contrato API).

3. `delete` Prop `empresaNombre` muerto en `ProductCard` y `ProductDrawer`: se recibe y se
   anula con `void empresaNombre;`, nunca se usa. Reemplazo: quitar la prop de ambos
   componentes y de sus 4 call sites. (-~8 + tests)
   - Evidencia: `components/ProductCard.tsx:15,22`; `components/ProductDrawer.tsx:25,34`;
     callers `app/(app)/precios/client_page.tsx:364,378`.
   - Los tests la pasan (`ProductDrawer.test.tsx:57-255`, `components/__tests__/ProductCard.test.tsx:36`,
     `precio-mayorista-ui.test.tsx:20`) — hay que borrarla también ahí; no es costura de test.

4. `delete` `precio_referencia` de `pedido_items` está sin escritores: ninguna INSERT lo llena
   (el pedido inserta `precio` y `precio_lista` desde la migración 047). Las 3 lecturas en
   `convertir.ts` son fallback a un valor siempre NULL. Reemplazo: quitar el COALESCE/ternario.
   (-~3 líneas de código)
   - Evidencia: `lib/pedidos/convertir.ts:91,132,145`; escritores → `grep 'INSERT INTO public.pedido_items'` → 0 menciones.
   - **Riesgo (migración destructiva, requiere aprobación explícita):** la columna
     `pedido_items.precio_referencia` (`migrations/034_pedidos.sql:33`) queda muerta; DROP
     aparte en una migración nueva, nunca editando 034.

5. `delete` `stock?` y `umed?` en `ProductoPedido` nunca se leen (`grep 'item.stock|item.umed'`
   → 0) pero los 2 call sites los envían. Reemplazo: quitarlos del tipo y de los callers. (-~4)
   - Evidencia: `components/BotonAgregarPedido.tsx:8-19`; `app/productos/client_page.tsx:88`;
     `app/catalogo/[slug]/client_page.tsx:96`.

6. `shrink` `app/pedido/[id]/page.tsx` repite el mismo inline type con `precio_lista` 3 veces
   (en `ahorroTotal` y en el map de items). Reemplazo: un `type ItemPedido` local. (-~6)
   - Evidencia: `app/pedido/[id]/page.tsx:101-107` y `:148-158` (el shape se repite idéntico).

7. `delete` `cantcaja` muerto en tipos que no lo leen:
   - `PedidoItem.cantcaja` (`app/(app)/pedidos/client_page.tsx:18`): el GET de pedidos no
     devuelve la columna (`grep cantcaja app/api/pedidos` → 0). (-1)
   - `ProductoPrecio.cantcaja?` (`lib/pedidos/precios.ts:22`): nunca se lee; además ahora es
     engañoso (no hay venta por caja). (-1)
   - `AgregarANotaVentaModal` `producto.cantcaja: number` (`components/AgregarANotaVentaModal.tsx:17`): nunca se lee. (-1)

8. `delete` `UbicacionBodega.saldocajas` (`types/index.ts:60`) no tiene lectores:
   `grep saldocajas` → solo la declaración. (-1)

9. `shrink` Tipo `Modalidad` duplicado: `lib/pedidos/precios.ts:11` es idéntico a
   `ModalidadTienda` (`lib/precio-tienda.ts:6`). Reemplazo: `export type Modalidad = ModalidadTienda`.
   (-2)

10. `delete` Columna muerta `catalogos.margen_precio` (`migrations/019_catalogos_columnas.sql:7`):
    sin lectores ni escritores; el route lo documenta (`app/api/catalogos/[id]/route.ts:43`).
    (-0 código)
    - **Riesgo (migración destructiva, requiere aprobación explícita):** DROP en una migración
      nueva, nunca editando 019. `productos.margen_pct` **NO** se toca: tiene lectores
      (`components/ProductDrawer.tsx:535`, servidor lo deriva en `app/api/productos/*`).

11. `delete` `costo` en la respuesta de `GET /api/catalogos/public/[slug]` (`route.ts:52`): su
    único consumidor (admin de catálogo) ya no lo lee tras quitar margen. (-1, bajo impacto)

## Revisado y limpio (sin recorte)

- **Duplicación entre `lib/precio-tienda.ts`, `lib/precio-catalogo.ts`, `lib/calcular-precio.ts`
  y `lib/precio-mayor.ts`: no hay solapamiento real.** Son 4 reglas distintas con múltiples
  callers cada una: `precioLineaTienda` (detalle/mayor por cantidad: carrito + `calcularPedido`),
  `precioEnCatalogo` (override vs prcventa: route público, `data.ts`, pedidos), `calcularMargen`
  (costo↔precio: 2 rutas API + 2 UI), `esPrecioMayorValido`/`esMinimoMayorValido` (validación
  body: POST y PATCH de productos). Lo único compartido es la unión de tipos (hallazgo 9).
- `convertir.ts:80-100` (CTE atómica para `pagado` reservado) vs `:165-185` (INSERT por ítem
  para `pendiente`): no se deduplican sin romper la atomicidad documentada en `:65-66`.
- `convertidos[].cajas` siempre 0 (`convertir.ts:116,183`) es candidato a borrar, pero
  `pedidos-convertir.test.ts:116-137,194` y `pedidos-convertir-lib.test.ts:45` lo exigen;
  no es "sin lectores". Mismo caso para el `CASE ... IN ('mayor','caja')` de `convertir.ts:92,144`
  (lo fija `pedidos-convertir.test.ts:207`) — restos legacy, pero blindados por tests.
- `contexts/CarritoContext.tsx:54` (descarta líneas `'caja'/'mayor'` de localStorage viejo) es
  saneamiento de carritos persistidos de usuarios reales, no código muerto: se queda.
- `app/(app)/catalogo/admin/client_page.tsx:217` deja una línea en blanco con espacios al
  borrar `setEditMargen(0)`; ruido trivial, no vale un hallazgo.
- `lib/precio-mayor.ts`, `lib/calcular-precio.ts` y `scripts/migrations-order.ts` (incluye 045/046/047)
  están completos y con lectores; sin recorte.

net: -~130 líneas, -2 columnas muertas (DROP opcional, riesgo), 0 deps.
