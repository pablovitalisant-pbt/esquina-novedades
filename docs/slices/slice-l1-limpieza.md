# Slice L1 — Limpieza (auditoría ponytail 2026-10-22)

Excepción aprobada: se CONSERVAN registro-notas de bodega (UI, API, flag `registro_notas_bodega_ui`) y `date-fns`.

## Aplicado
1. Borrado `app/(app)/bodega/despachos` (+ test co-ubicado), `__tests__/despachos-guard-smoke.test.ts`, flag `despachos-ia`. `/api/despachos` no existe ni se referencia.
2. Flags: quitadas `nueva-paleta-colores`, `pedidos-publicos`, `notas-venta-prefetch-hover` (con su rama y `useRef`), y los siempre-true `notas-venta-whatsapp-pdf` (rama legacy wa.me borrada), `precios-precio-venta-card`, `drawer-compartir-precio`, `ingreso-mercaderia`, `bodega-conciliacion-stock`, `carrito-pedidos-ui`, `pedidos-staff-ui`, `inversion-mercaderia` (comportamiento true). Quedan 5: `registro_notas_bodega_ui`, `precio-mayorista-ui`, `notas-venta-modalidad`, `clientes-etiqueta`, `tienda-pago-online`.
3. package.json: quitadas `sharp` y `shadcn` (0 imports). Falta `npm install` (DT) para actualizar package-lock.
4. `name` → `esquina-novedades`.
5. Comentarios PowerSync/Bazar borrados en categorias, clientes, caja/movimientos, ingresos. No se tocaron los de `notas-venta/[id]/items/route.ts` (no estaban en la lista de la auditoría).

## Tests ajustados
- Borrados: `notas-venta-prefetch-hover.test.tsx`, test "WhatsApp legacy" (slice5cd, rama eliminada), tests de flag-off (bodega conciliación, bottomnav inversión), guards de sharp.
- Reescritos: `ingresos-guard-smoke` (solo navs), `slice-03` (5 flags), `slice22` (sin ítem 5).
- Mocks de flags quitados (catalog-footer, whatsapp, bodega); `catalog-footer` ahora renderiza el carrito, mock de utils con `requireActual`.

## Verificación
- jest (tocados, co-ubicados y que mencionan flags/archivos): verde.
- `npx tsc --noEmit`: sin errores nuevos fuera de tests (queda `app/page.tsx` Set iteration, preexistente; `.next/types` obsoleto por despachos se regenera con build).
