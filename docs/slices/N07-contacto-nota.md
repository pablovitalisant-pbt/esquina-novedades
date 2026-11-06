# N07 — Dirección y teléfono en la nota imprimible

DT aprueba por delegación. Nombre actual de la nota, dirección y teléfono del comprador en el bloque de destinatario. Si la nota viene de un pedido convertido, usar su dirección de entrega y teléfono de contacto si están disponibles. Completar lo que falte desde la ficha cliente. Si falta un dato, omitir su línea. Dirección del negocio continúa en cabecera y pie.

N07a files-to-touch app/api/notas-venta/[id]/route.ts y nuevo __tests__/integration/nota-datos-contacto.test.ts. GET autorizado agrega cliente_direccion y cliente_telefono, con JOIN LATERAL al pedido vinculado más reciente en orden created_at DESC, id DESC, LIMIT 1. Ignorar cadenas vacías con trim. Una nota sigue siendo una fila. POST/PATCH y exposición pública conservan su contrato. Test en DB TEST para pedido, fallback ficha y sin datos, con sesión simulada y fixtures propios. Riesgos: autorización y cardinalidad.

N07b files-to-touch app/(app)/notas-venta/[id]/client_page.tsx y __tests__/notas-venta-exportar-pdf.test.tsx. Usar splitTextToSize con ancho disponible para nombre y datos; altura del recuadro crece con líneas y startY de tabla sigue el recuadro. PDF descargado y PDF compartido usan el mismo generador. Prueba unitaria de datos, valores ausentes y posición de tabla. Smoke real PDF con texto largo y revisión renderizada. Máximo 200 líneas por corte.

Impacto N07b: adaptar también mocks jsPDF de __tests__/notas-venta-compartir-whatsapp.test.tsx, __tests__/slice5cd-detalle-modalidad.test.tsx y __tests__/slice5-textos-por-mayor-menor.test.tsx. Esos recorridos generan el mismo PDF y deben seguir comprobando sus resultados. No cambiar acción WhatsApp, API ni permisos.
