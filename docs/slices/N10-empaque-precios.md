# N10 — Quitar peso y cubicaje del cajón

DT aprueba por delegación. /precios conserva unidades por caja. La creación actual no ofrece peso ni cubicaje. El cajón deja de mostrar esos datos y sus inputs y deja de enviarlos al guardar. Los valores históricos y el contrato PUT se conservan.

Files-to-touch components/ProductDrawer.tsx y components/ProductDrawer.test.tsx. Único consumidor de aplicación /precios. No cambios de esquema, roles, tipos compartidos, formulario de creación, variables o navegación. Riesgo: preservar datos omitidos al guardar. Fase B prueba vista y edición y que PUT no incluye las dos claves. Smoke en /precios con fixture. Retiro de UI, sin flag nuevo. Máximo 200 líneas.
