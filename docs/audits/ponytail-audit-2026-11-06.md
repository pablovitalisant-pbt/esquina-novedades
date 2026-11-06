# Revisión de complejidad — 2026-11-06

Inventario de archivos versionados y revisión de las fronteras de pedidos, pagos y migraciones hasta 76433b5.

- shrink: preflight de Mercado Pago repetido en app/api/pedidos/route.ts y app/api/pedidos/[id]/pagar/route.ts. Unificar cuando termine la transición del flag y se retire la ruta de creación inmediata. ~9 líneas.
- shrink: validación UUID repetida en la página pública, webhook y ruta pagar. Usar un validador común al sumar rutas de métodos de pago, conservando formatos admitidos. ~2 líneas netas.
- yagni: conservar el adaptador lib/redirigir.ts por ahora. Tiene dos consumidores y permite probar navegación sin mutar location en jsdom.

Claude confirmó los duplicados del preflight y del UUID. También señaló la lógica de vigencia distribuida entre página y API y el retiro de peso y cubicaje ya previsto en N10. Para N03 se mantiene la configuración bancaria del lado servidor y se pospone cualquier UI de configuración hasta contar con los datos reales y decidir quién la opera.

Ningún recorte bloquea N03b. Contador del tramo actual reiniciado después de N03a.
