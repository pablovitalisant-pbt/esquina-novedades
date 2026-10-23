# Ponytail audit — 2026-10-23

Solo lista; no se aplicó nada. Alcance: archivos no-test cambiados desde el audit anterior
(`git diff --name-only f097823..HEAD -- app components contexts hooks lib utils types scripts middleware.ts next.config.mjs package.json config`, sin `*.test.*`).
Flags intencionales (`tienda-pago-online`, `precio-mayorista-ui`, `notas-venta-modalidad`, `clientes-etiqueta`, `mp-webhook-ignorar-ipn-legacy`, `pedido-confetti`, `registro_notas_bodega_ui`) NO se tocan.
"Sin lectores" = 0 coincidencias en Grep sobre el alcance (excluyendo tests).

## Resultado (Director Técnico)
Aplicados: 1, 2, 3, 4, 7. **Rechazado 5**: `data-confetti` sí tiene lectores (los tests SSR de `/pedido/[id]` lo usan como marcador; el audit excluyó tests). **Revertido 6**: 11 archivos de test pasan `params` a `PrenotaDetallePage` (+26 errores de `tsc`). Ajustado `__tests__/next-config.test.ts` al nuevo `import.meta.dirname` (verificado: resuelve a la raíz del proyecto).

## Hallazgos (mayor recorte primero)

1. `native` `next.config.mjs`: `dirname(fileURLToPath(import.meta.url))` reemplazado por `import.meta.dirname` (Node ≥20.11). Borra los 2 imports y 3 líneas de boilerplate. [next.config.mjs:1-5] (-4)
   - Evidencia: `node -v` → `v22.20.0`; no hay `engines.node` en package.json; el ESM de `next.config.mjs` ya soporta `import.meta.dirname`.
2. `yagni` Props que ya no se apagan: `mostrarPrecioVenta` (ProductCard) y `mostrarPrecioEnShare` (ProductDrawer) tenían flag y ahora el único caller de producción los pasa siempre `true`. Borrar prop, default `false`, rama falsa y los 2 props en precios. Tests a actualizar: `components/__tests__/ProductCard.test.tsx:86`, `components/ProductDrawer.test.tsx:239-293`. (-4 src, ~-8 tests)
   - Evidencia: `grep "<ProductCard\|<ProductDrawer"` (sin tests) → solo `app/(app)/precios/client_page.tsx:346` y `:360`; props fijos en `:353` y `:368`; defaults `false` en `components/ProductCard.tsx:22` y `components/ProductDrawer.tsx:32`; ramas muertas en `ProductCard.tsx:73,76` y `ProductDrawer.tsx:405`.
3. `shrink` Error de envío del carrito por dos canales con el mismo texto: `setErrorEnvio(mensaje)` + `toast.error(mensaje)`. El comentario dice que el inline existe porque el toast puede quedar tapado → sobra el toast en las 2 ramas de error. [-2]
   - Evidencia: `components/CarritoDrawer.tsx:95-96` y `:101-102`; el `toast` se sigue usando en el éxito (`:91`), el import queda.
4. `delete` Lookups de un solo uso: `TOPICS_IPN_LEGACY` (webhook) y `CON_CONFETTI` (página de pedido) se leen una sola vez cada uno; inline con `.includes`. [-2]
   - Evidencia: `app/api/mercadopago/webhook/route.ts:14` usado solo en `:30`; `app/pedido/[id]/page.tsx:36` usado solo en `:100`.
5. `delete` `<span data-confetti="" hidden aria-hidden="true" />` como valor de retorno: nodo muerto, sin lectores. `return null`. [components/ConfettiCompra.tsx:24] (-1)
   - Evidencia: Grep `data-confetti` en app/ y components/ → solo la definición.
6. `delete` `params?: { id: string }` muerto en el tipo de `PrenotaDetallePage`: el caller no lo pasa y el id sale de `useParams`. [app/(app)/notas-venta/[id]/client_page.tsx:254; caller app/(app)/notas-venta/[id]/page.tsx:564] (-1)
   - Evidencia: Grep `params` en el archivo → solo la firma del tipo y un comentario; `useParams()` en `:257`.
7. `shrink` Sin newline final en los 3 archivos nuevos (`app/pedido/[id]/page.tsx`, `components/ConfettiCompra.tsx`, `lib/pedidos/reserva-stock.ts`). (higiene, 0 líneas)

## Revisado y limpio (sin recorte)
- Módulo `bodega/despachos` eliminado completo: `grep -rin despachos` en app/, components/, lib/, scripts/, config/ → 0 referencias; no quedan links ni flags.
- 12 flags retirados (`notas-venta-prefetch-hover`, `precios-precio-venta-card`, `drawer-compartir-precio`, `carrito-pedidos-ui`, `pedidos-staff-ui`, `ingreso-mercaderia`, `bodega-conciliacion-stock`, `inversion-mercaderia`, `notas-venta-whatsapp-pdf`, `despachos-ia`, `nueva-paleta-colores`, `pedidos-publicos`): 0 lectores en código (única coincidencia de `drawer-compartir-precio`: el título de un `describe` en test).
- `config/feature-flags.json`: solo quedan las claves intencionales; todas tienen lector.
- `lib/pedidos/reserva-stock.ts`: no es capa de un caller — lo usan `app/api/pedidos/route.ts:284` y `__tests__/integration/reserva-stock-guard.test.ts`; el guard `1 / COUNT(*)` está documentado por BUG-003.
- `components/ConfettiCompra.tsx` (resto), `components/CarritoCheckoutForm.tsx`, `components/CarritoGateModal.tsx`, `app/pedido/[id]/page.tsx` (mapa de estados, query, footer), `app/catalogo/[slug]/{page,client_page}.tsx`, `app/productos/client_page.tsx`, `app/(app)/{bodega,caja-mayor,clientes,deudores,precios,notas-venta}/client_page.tsx`, `app/api/{pedidos,ingresos,categorias,clientes,caja/movimientos,admin/usuarios}/**`, `next.config.mjs` (resto), `lib/test-safeguards.ts`: cambios de params async de Next 15, textos o flag removido; sin código muerto nuevo.
- `package.json`: `canvas-confetti` lo usa ConfettiCompra y no trae tipos propios (`types` ausente → `@types/canvas-confetti` justificado); `dotenv` lo usa `jest.env-setup.ts:15`; `xlsx`, `sharp` y `shadcn` ya retirados; no quedan imports de `xlsx`/`sharp`.
- `date-fns` sigue en deps solo por `bodega/registro-notas` (módulo conservado por decisión de Pablo): no se toca.
- Consistencia: `style={{ maxWidth: '1152px' }}` en la página de pedido repite el patrón ya usado en `LandingPage.tsx` y `productos/client_page.tsx`; no se propone `max-w-6xl` para no romper la convención existente.

net: -~14 líneas src (≈-8 tests adicionales si se aplica el hallazgo 2), 0 deps.
