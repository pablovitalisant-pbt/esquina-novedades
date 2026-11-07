# N13 — Línea base de latencia

Se midieron solicitudes autenticadas con Playwright contra Next dev local y PostgreSQL TEST, usando una nota de venta y 55 productos sintéticos. Para cada ruta se hicieron seis GET consecutivos con respuesta 200, descartando el primero para reducir el efecto del arranque en frío.

| Operación | Muestras | Mediana | Mínimo | Máximo |
|---|---:|---:|---:|---:|
| Detalle de nota | 5 | 441 ms | 437 ms | 483 ms |
| Primera página de precios | 5 | 189 ms | 171 ms | 209 ms |
| Búsqueda por prefijo de productos | 5 | 172 ms | 155 ms | 184 ms |

Los tiempos incluyen la solicitud HTTP, autenticación y acceso a la base de pruebas. El detalle de nota fue la operación más lenta de las tres medidas. Esta muestra local no permite identificar la causa de la lentitud reportada por Paola ni medir la experiencia en producción. La paginación reduce el volumen de la primera respuesta a un máximo de 50 productos. No hay una medición equivalente anterior al cambio para cuantificar la mejora.

## Diagnóstico y contrato de optimización

Se midieron tres búsquedas de COLCHON en producción, partiendo de un resultado vacío y esperando el encabezado de un producto existente. Se midieron tres aperturas de la primera nota existente desde el listado hasta que aparece el botón PDF. Las mediciones incluyen la automatización del navegador y corresponden a esta sesión.

| Flujo en producción antes del ajuste | Muestras en ms | Mediana |
|---|---|---:|
| Búsqueda de precios | 1106, 862, 850 | 862 ms |
| Apertura de nota | 551, 445, 429 | 445 ms |

Se verificaron tres causas en código y se dividieron en cortes separados.

- Precios espera 400 ms antes de consultar. El contrato reduce a 160 ms desde la última tecla y conserva cancelación del temporizador, paginación y descarte de respuestas antiguas.
- La API de detalle espera sucesivamente cuatro lecturas independientes tras encontrar la nota. El contrato las despacha en paralelo y conserva permisos, respuesta 404, orden de ítems y cálculos de pagos y saldos.
- La pantalla importa jsPDF y autotable antes de usarlos. El contrato carga ambos al generar el PDF, incluyendo compartir por WhatsApp y acciones del POS. Un fallo de descarga muestra aviso y libera el estado de carga.

Archivos de implementación delimitados por corte.

1. `app/(app)/precios/client_page.tsx` y su prueba.
2. `app/api/notas-venta/[id]/route.ts` y `__tests__/api/prenotas.test.ts`.
3. `app/(app)/notas-venta/[id]/client_page.tsx` y `__tests__/notas-venta-exportar-pdf.test.tsx`.

El DT verificó pruebas rojas de espera de búsqueda, paralelismo y evaluación temprana de los módulos PDF antes de autorizar las implementaciones de Claude-Deep. Los riesgos revisados incluyen eventos simultáneos, estados compartidos, roles, consultas con JOIN y fallos de descarga. Se conserva el comportamiento funcional existente.

Como contraste de solo lectura, las mismas cinco consultas ejecutadas desde el equipo contra producción tardaron 674/458/445/441/456 ms en serie y 404/205/195/192/181 ms con las cuatro últimas en paralelo. Esta comparación incluye el acceso desde el equipo y difiere de la latencia entre Vercel y Neon.

Después del cambio, el harness local con PostgreSQL TEST midió el GET de detalle en 280 ms de mediana, frente a 441 ms de la línea base. Pasaron los smokes de edición de unidades, exportación real de PDF, paginación e inventario. El PDF generado conserva dirección, teléfono, modalidad y totales.

La revisión ampliada de consumidores de la página y API de detalle pasó con 31 suites y 367 pruebas. TypeScript, lint y build pasaron. El build reporta que el detalle de nota baja de 147 kB a 9,41 kB de ruta y de 308 kB a 171 kB de JavaScript de primera carga. Las librerías PDF siguen disponibles al exportar.
