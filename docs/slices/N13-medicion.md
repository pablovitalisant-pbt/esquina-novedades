# N13 — Línea base de latencia

Se midieron solicitudes autenticadas con Playwright contra Next dev local y PostgreSQL TEST, usando una nota de venta y 55 productos sintéticos. Para cada ruta se hicieron seis GET consecutivos con respuesta 200, descartando el primero para reducir el efecto del arranque en frío.

| Operación | Muestras | Mediana | Mínimo | Máximo |
|---|---:|---:|---:|---:|
| Detalle de nota | 5 | 441 ms | 437 ms | 483 ms |
| Primera página de precios | 5 | 189 ms | 171 ms | 209 ms |
| Búsqueda por prefijo de productos | 5 | 172 ms | 155 ms | 184 ms |

Los tiempos incluyen la solicitud HTTP, autenticación y acceso a la base de pruebas. El detalle de nota fue la operación más lenta de las tres medidas. Esta muestra local no permite identificar la causa de la lentitud reportada por Paola ni medir la experiencia en producción. La paginación reduce el volumen de la primera respuesta a un máximo de 50 productos. No hay una medición equivalente anterior al cambio para cuantificar la mejora.
