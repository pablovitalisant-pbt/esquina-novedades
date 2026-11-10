# Contratos de Caja Mayor, Pedidos y POS

Fase A. Base limpia `eeb965a`. Orden de entrega: POS, Caja Mayor, Pedidos. POS es el ajuste inmediato de operación. Caja reutiliza lectura existente. Pedidos requiere validar una migración aditiva antes de activar el archivo.

Pablo aprobó los tres contratos y el inicio de la Fase B el 10 de noviembre de 2026. Después de verificar los rojos, Pablo autorizó la Fase C de los tres cambios.

## 1. POS compacto

- Usar el tamaño normal de Button (32 px) para Cobrar y Guardar / Imprimir, tanto en el panel de escritorio como en la venta móvil. Compactar también el acceso inferior que abre la venta en móvil, conservando cantidad y total. El diálogo de pago conserva sus acciones.
- Mostrar nombre completo, código, modalidad, precio unitario, cantidad y subtotal por línea. Usar el ancho disponible para reducir alturas y agrupar los controles. Los nombres largos pueden envolver sin solaparse.
- En 1280×720 y 1366×768, ver al menos cuatro líneas normales completas con cliente, total y acciones. En 390×844, ver al menos tres. Comprobar también 320×700 con texto largo y monto grande. Si una venta excede la altura disponible, desplazar solo la lista y mantener total y acciones visibles. Las dos acciones del panel son de tamaño normal, con foco visible y espacio para pulsarlas.
- Ejemplo: venta de cuatro productos normales en 1280×720 muestra las cuatro líneas sin desplazamiento. Al agregar más, se llega a la última línea sin perder Cobrar. Teclado, cantidades, modalidad, quitar, cliente, guardar y cobro se verifican con las regresiones existentes.
- Archivos: `app/(app)/pos/client_page.tsx`, `__tests__/pos4-ui.test.tsx` y arnés visual existente `C:/Users/pablo/.pbt-runner/n01-e2e/pos-panel.spec.cjs`. Impacto: panel compartido con Sheet, acceso móvil y espacio inferior de la grilla. Usar el flag existente `pos-v1`. Sin cambios a rutas, lógica de negocio, estado, permisos, datos ni Button compartido. Preservar BUG-007, BUG-011 y BUG-014.

## 2. Nota desde Caja Mayor

- Bajo `caja-detalle-nota`, cada ID de Notas imputadas abre un modal de lectura para ese ID. Un movimiento con dos imputaciones permite abrir cada nota por separado. Un movimiento sin nota conserva el indicador vacío.
- Reutilizar GET /api/notas-venta/[id]. Ejemplo: clic en 123 abre «Nota de venta #123» con cliente y contacto disponibles, fecha, productos, código, modalidad, cantidad, precio unitario, subtotal, total, pagado, saldo a favor aplicado y pendiente. Mostrar carga, error y nota ausente; una respuesta anterior queda descartada al cerrar o cambiar de nota. El contenido desplaza dentro del modal y devuelve el foco al cerrarlo.
- Archivos: `app/(app)/caja-mayor/client_page.tsx`, nuevo `components/CajaDetalleNotaDialog.tsx`, `app/(app)/caja-mayor/client_page.test.tsx`, `config/feature-flags.json` y smoke local. Impacto: tabla de movimientos y modal; la lectura actual ya entrega los importes calculados. Mantener GET, autenticación, exportación, cálculos y schema. Flag inicial false.

## 3. Archivar pedidos expirados

- Bajo `pedidos-archivar-expirados`, la tabla ofrece «Archivar» en expirados elegibles. Tras confirmar y recibir éxito desaparecen de la tabla, también al recargar. Si falla la petición se conserva la fila y se informa el error.
- PATCH /api/pedidos/[id] con `{ "accion": "archivar" }`. Autorizar admin y vendedor, como usuarios operativos de Pedidos. UPDATE condicional y atómico sobre UUID válido: estado expirado, stock ya liberado y sin revisión de pago pendiente. Guardar fecha de archivo sin cambiar estado. Reintento del mismo expirado mantiene la fecha y responde 200. Pedido no elegible responde 409, sin sesión 401, rol no permitido 403, UUID inválido 400. Mantener el contrato PATCH de descarte.
- GET /api/pedidos excluye solo los pedidos archivados que siguen expirados sin revisión pendiente, incluso con filtro estado=expirado. Si un webhook lo cambia a pagado_tardio o revisión, el pedido vuelve a verse. Probar esta transición y la ausencia de cambios a stock, caja o nota. Preservar referencias e historial del pedido.
- Archivos: migración `migrations/053_pedidos_archivado.sql`, `scripts/migrations-order.ts`, `app/api/pedidos/[id]/route.ts`, `app/api/pedidos/route.ts`, `app/(app)/pedidos/client_page.tsx`, `config/feature-flags.json`, `__tests__/api/pedidos-id.test.ts`, `__tests__/api/pedidos.test.ts`, `__tests__/app/pedidos/client_page.test.tsx` y smoke local. Separar migración/API de UI si hace falta para mantener ≤200 líneas por corte. Probar migración en TEST y verificar columna en producción antes de activar el flag. Flag inicial false.
- Impacto lateral: solo cambia la consulta de listado interno, compartida con el filtro de revisión. El POST público y el detalle público conservan sus contratos. Expiración, reserva, webhook y conversión conservan sus rutas, datos y lógica.

## Pruebas y gates

- POS: riesgo de regresión de layout al renderizar escritorio/Sheet y compartir la venta. Smoke Playwright con geometría, varias líneas y botones reales, más pruebas POS. Caja: render por flag y estados, respuesta tardía y navegación con teclado. Pedidos: mutación duplicada, concurrencia con cambio de estado, permisos, filtro y errores. Probar persistencia y concurrencia en PostgreSQL TEST.
- Comandos del repo: `npx jest --runInBand` con las suites de cada corte, `npm run lint`, `npx tsc --noEmit` y `npm run build`. Un smoke E2E por corte, con datos sintéticos o TEST y sin ventas de prueba en producción.
- Director Técnico presenta este contrato para aprobación antes de Fase B. Claude-Deep escribe los tests y el código según los gates de Pablo. El Director revisa el DIFF, reproduce rojo y verde y comprueba el resultado antes de la publicación.

## Fase B verificada

- Regresión inicial: 46 pruebas verdes en POS, Caja Mayor y Mercado Pago. Jest final: 64 verdes y 11 rojos esperados (3 Caja, 8 Pedidos). POS Jest verifica semántica y regresiones; los tamaños y filas se verifican con navegador. El mock de Pedidos fija explícitamente cobro manual para aislar casos existentes.
- POS Playwright: 6 rojos esperados. Escritorio, 3 filas completas y ambos botones de 48 px. Móvil, botones de 64 y 56 px y acceso inferior de 64 px. A 390×844 ya hay 3 filas completas; a 320×700 se comprobó ausencia de desborde y acceso a la última fila.
- Caja y Pedidos Playwright: un rojo esperado por corte. Cargan filas de prueba y falla el clic por ausencia del botón de la nota 123 o de Archivar, respectivamente.
- Desde el repo: `npx jest --runInBand --runTestsByPath __tests__/pos4-ui.test.tsx 'app/(app)/caja-mayor/client_page.test.tsx' __tests__/api/pedidos-id.test.ts __tests__/api/pedidos.test.ts __tests__/app/pedidos/client_page.test.tsx --silent`.
- Desde `C:/Users/pablo/.pbt-runner/n01-e2e`: `node node_modules/playwright/cli.js test --config pos-panel.config.cjs`, `--config caja-nota.config.cjs --timeout 35000` y `--config pedidos-archivar.config.cjs --timeout 35000` con el mismo comando. Usar un servidor del arnés a la vez.
- Pendiente en Fase D: smoke de PostgreSQL mediante API real, `$env:PBT_PEDIDOS_DB='1'` y `node node_modules/playwright/cli.js test --config pedidos-archivar-db.config.cjs`, con flag local activo y migración aplicada en TEST. Usa fixtures propios y limpia por UUID y marca. No se ejecutó la migración ni se escribieron datos en esta fase.
- DIFF de pruebas de repo: `C:/Users/pablo/.pbt-runner/2026-11-10-fase-b.diff`. Alcance final verificado: solo tests y contrato. Presupuesto de implementación restante antes de 200 líneas por corte: POS 112, Caja 103, API Pedidos 106, UI Pedidos 108. Medir el DIFF real antes de cerrar cada corte.

## Fases C y D verificadas

- Claude-Deep implementó. El DT revisó el diff y verificó la versión final. POS conserva el alto dentro de pantalla, compacta las filas y pliega la ayuda de teclado bajo «Atajos de teclado». A 1280×720 se ven cinco líneas completas en el fixture, una de nombre largo. A 1366×768 se ven seis. A 390×844 se ven cuatro y a 320×700 dos, con el resto accesible dentro de la lista. Ambos botones miden 32 px y la barra móvil 48 px. Los seis escenarios del arnés pasaron.
- Caja Mayor reutiliza la API de notas y muestra el detalle en un modal de lectura. Prueba de navegador verde con dos notas, Escape y foco devuelto. Regresiones de error, ausencia y respuesta tardía verificadas en Jest.
- Pedidos conserva el estado y guarda `archivado_en`. Se aplicó 053 únicamente en PostgreSQL TEST y se verificó la columna nullable de tipo TIMESTAMPTZ. Pasaron la prueba de la tabla y el smoke de la API real. Dos PATCH simultáneos conservaron la misma fecha, un pedido en revisión fue rechazado y un pago tardío volvió al listado. Los datos sintéticos se limpiaron por UUID y marca.
- Regresión final: 216/216 pruebas en 24 suites. `npm run lint`, `npm run build` y `npx tsc --noEmit` exitosos. Smokes finales: 6 POS, 1 Caja, 1 Pedidos UI y 1 Pedidos DB. Caja y Pedidos con flags activados solo en un checkout aislado de QA.
- Líneas modificadas por corte, sin este documento ni arnés privado: POS 135, Caja 196, API/migración Pedidos 154, UI Pedidos 131. Flags nuevos false en el repo. Se solicita autorización explícita para commits y publicación, incluida migración 053 en producción antes de activar Pedidos.
