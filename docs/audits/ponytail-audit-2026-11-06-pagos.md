# Revisión de complejidad — Tramo de pagos N03b2–N04b1

- Reutilizar el CTE de caja de lib/pedidos/cobro-pedido.ts parametrizando cuenta, actor y forma de pago. N04c evita copiar unas 25 líneas. La conversión reservada de lib/pedidos/convertir.ts ya admite el estado que deja N04b1.
- Compartir el UUID canónico cuando se agregue la ruta de confirmación. Conservar la validación más restrictiva del carrito.
- Mantener una lista de entregas en efectivo para SQL y presentación. Se deja como limpieza acotada posterior a la protección de cobros.

Hallazgos de claude-deep contrastados con los consumidores reales. Sin dependencias nuevas. Contador reiniciado tras N04b1.
