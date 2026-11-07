# Auditoría de rendimiento de notas y precios

Claude-Deep revisó el paralelismo de lecturas, el debounce de precios, la carga diferida de PDF y la protección de BUG-008. El DT contrastó los cambios con el diff, las pruebas, el build y los smokes.

- Se preservan permisos, estados 400/401/403/404, cálculos de pagos y saldos y recarga silenciosa de la nota. La consulta de saldo disponible se omite cuando no hay cliente.
- Las respuestas antiguas de precios siguen descartándose por identificador de petición. El temporizador se cancela al seguir escribiendo.
- PDF y WhatsApp usan el mismo constructor diferido. El smoke genera un PDF real con contacto y totales.
- Se corrigieron colas incompletas de SQL en pruebas de nota y la liberación de una promesa de prueba pendiente.
- La revisión de carga inicial identificó una segunda petición del navegador. La página y la API comparten ahora el lector de detalle. La sesión y el rol se comprueban antes de leer los datos.
- Los datos iniciales solo se consumen si el ID coincide con la URL. Ausencia o error de lectura conserva la consulta de respaldo. La tabla se habilita después de hidratar para evitar perder el primer clic.
- Se conservaron las dos tareas cron al configurar la región `gru1`. Se confirmó la región mediante el encabezado HTTP de producción.
