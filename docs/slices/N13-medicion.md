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

## Región y viaje inicial de la nota

Producción devolvía `X-Vercel-Id: gru1::iad1` y una respuesta 401 sin consulta DB tardó 579–768 ms. Se configuró `regions: ["gru1"]` en `vercel.json`, conservando ambos crons. El despliegue confirmó `gru1::gru1`. Cuatro respuestas 401 posteriores tardaron 544, 461, 482 y 340 ms.

La medición visible de notas varió entre tandas y no acreditó una mejora con los tres primeros cortes. Se identificó además la navegación RSC seguida de un GET inicial desde el cliente. El siguiente contrato elimina ese GET mediante lectura en servidor y datos iniciales, reutilizando la misma función para la API.

Se conserva el ID de la URL como fuente de verdad. Si falta el dato inicial, no coincide con la URL o falla la lectura en servidor, el cliente consulta como antes. Los datos de la nota se activan tras hidratar para evitar mostrar botones sin eventos conectados. Las mutaciones conservan su recarga y el estado de edición de BUG-008. Se agrega un estado de carga de ruta accesible.

El cambio se divide en lector reutilizable, integración API, consumo en cliente e integración de página y estado de carga. Cada corte tiene un alcance inferior a 200 líneas. La auditoría está en `docs/audits/ponytail-audit-2026-11-07-rendimiento.md`.

Se corrigió el criterio de la medición visible. El botón PDF existe antes de cargar datos y puede quedar deshabilitado en notas vacías, por lo que su presencia no acredita que la nota esté lista. Antes de publicar los datos iniciales se midió desde Abrir hasta que el encabezado contiene el título real de la nota seleccionada. Con la región São Paulo activa y el doble viaje aún presente se obtuvieron 1483, 1303 y 1439 ms, mediana 1439 ms.

El smoke de la nueva carga verifica cero GET iniciales del navegador al detalle, el primer clic de edición, la persistencia de seis unidades al cambiar modalidad y la exportación real de PDF. Pasó tras corregir que la tabla solo se habilite después de hidratar.

La primera tanda de producción con datos iniciales midió 1522, 1635, 1262, 1175 y 1476 ms hasta el título real, mediana 1476 ms. El HTML directo confirmó los datos iniciales. Esta tanda no demuestra reducción de latencia visible frente a los 1439 ms anteriores.

El siguiente corte cambia Abrir de navegación imperativa a `Link` con prefetch automático de Next y la frontera `loading.tsx` existente. Esto permite preparar la estructura de navegación de las notas visibles. Se mantiene el prefetch parcial predeterminado de rutas dinámicas. Fuente de comportamiento de Next, https://nextjs.org/docs/app/getting-started/linking-and-navigating .
