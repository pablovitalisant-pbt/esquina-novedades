# N11 — Ingreso de inventario desde el cajón de precios

DT aprueba por delegación. En el cajón, usuarios que ya pueden operar Bodega pueden abrir Ingresar mercadería con el producto precargado. Usa el mismo formulario, validación, POST /api/ingresos y registro de auditoría que Bodega. Ocultar acción si el producto no corresponde a la empresa que usa la operación o si el listado agrupa varias empresas. Proteger doble envío. Al terminar, refrescar saldo y unidades por caja con datos de la transacción.

N11a files-to-touch app/api/ingresos/route.ts y prueba existente. UPDATE de producto RETURNING saldo y cantcaja. Respuesta añade saldo_actual y cantcaja_actual, conserva registro original. Sin cambios de permisos, tabla o semántica. Prueba DB TEST de incremento y registro.

N11b files-to-touch app/(app)/bodega/ingresos/client_page.tsx, components/ProductDrawer.tsx, config/feature-flags.json y pruebas relevantes. Flag precios-ingreso-stock false. IngresosClient admite producto inicial y modo compacto sin búsqueda, devuelve resultado al cajón. Conserva funcionamiento de Bodega. Guard de doble envío y errores recuperables. Smoke TEST desde /precios con registro y saldo comprobados. Dividir si excede 200 líneas.
