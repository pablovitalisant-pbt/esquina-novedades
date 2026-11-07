# BUG-013 — Acción de compra junto al precio correspondiente

Base limpia `d944b8c`. Pablo transmite que bajo «desde 3 unidades» debe aparecer solo la compra mayorista; captura móvil con dos botones superpuestos. Código: BotonAgregarPedido fuerza dos columnas y Button impone whitespace-nowrap. TarjetaProductoTienda agrupa ambas acciones al pie de los dos precios.

Contrato delegado: en modo tienda-medios-compra, precio detalle con una sola acción al detalle; precio mayor y mínimo con una sola acción por mayor. Nunca dos botones juntos debajo del mínimo. Conservar la compra de una unidad y la compra mayor que completa el mínimo, gate de contacto, precios y validación del servidor. No eliminar la compra al detalle de productos mayoristas. Texto completo dentro de botones, sin solapamiento ni desborde en móvil 320/390, claro/oscuro. Catálogo/portada comparten tarjeta; precios ocultos no muestran acciones.

Dos cortes de bug, cada uno ≤50 líneas de implementación y ≤200 totales:

1. V01: `components/BotonAgregarPedido.tsx`: prop opcional modalidadVisible detalle/mayor (omitida conserva ambas), botones con ancho completo, ajuste de línea y alto mínimo tocable. Pruebas semánticas de cantidad/gate y filtro de acción. Sin cambiar lógica de agregarItem.
2. V02: `components/TarjetaProductoTienda.tsx`: cada acción dentro de su bloque de precio; extracción de item reutilizable y footer legado intacto. Pruebas de ubicación, flags, stock bajo mínimo y precios ocultos.

Tests permitidos: `__tests__/carrito.test.tsx`, `__tests__/tarjeta-tienda-precios.test.tsx`, nueva `__tests__/tarjeta-tienda-acciones.test.tsx` solo si se necesita tarjeta con carrito real. Smokes privados tienda.spec/config existentes: fixture exclusivo TEST, verificar bloques/precios/acciones, geometría de texto a 320/390 y ambos temas, compra mayor 6 + detalle 1 y limpieza del fixture. No pedidos ficticios en producción. DT verifica rojo antes de cada implementación, DIFF, regresiones, tipos/lint y despliegue.

Revisión lateral: portada (nuevos, categorías, ahorro mayor y grilla), catálogo público, gate/carrito y defaults de BotonAgregarPedido usados por otros consumidores. No cambios de schema, rutas, API, precios, stock ni flags nuevos. Auditoría de tienda previa al corte por acumulación de mantenimiento; no reabrir BUG-003/BUG-010 ni cálculo de mayor por cantidades.

V01: DT obtuvo 2 rojos de acción extra antes de implementar; después las 23 pruebas de carrito pasan. El smoke N08 real TEST pasó con mayor 6 + detalle 1 y limpieza propia. V02: 2 pruebas de ubicación rojas y 2 controles verdes, además smoke de ubicación rojo antes de mover acciones a los precios. La auditoría previa consta en `../audits/ponytail-audit-2026-11-07-tienda-botones.md`.

Controles finales compartidos: `npx tsc --noEmit` y `npm run lint` verdes, sin errores ni advertencias ESLint. V01 se entrega separado de V02; la publicación conjunta evita exponer una transición de ubicación incompleta.
