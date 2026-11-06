# Revisión de complejidad — Cobros y notas

DT revisó el tramo desde el audit de pagos, incluyendo diff, consumidores de caja, ruta de notas y pruebas de exportación/WhatsApp.

- El cobro manual y MP ya comparten el CTE de movimiento. Mantener separados los adaptadores que determinan cuenta y actor.
- GET de pedidos incorpora una segunda consulta solo para admin con flag activo. La proyección se puede incorporar al SELECT mediante un fragmento condicionado si la medición N13 muestra latencia. El resto de consumidores conserva el query previo.
- PDF y WhatsApp ya comparten generador, incluido el bloque de contacto. Mantener esa fuente única. Evitar duplicar cálculo de precio mayor en tarjetas, usar precioLineaTienda.

Sin recorte necesario para avanzar. Contador reiniciado en 21c9f47, antes del cierre N07b.
