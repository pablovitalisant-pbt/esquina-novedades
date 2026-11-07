# BUG-012 — Texto legible en Agregar a Nota de Venta

Base limpia `247bdc9`. Reporte de Pablo: texto escrito en cliente y demás campos casi invisible. Revisión estática: input cliente, select nota y números cantidad/precio no declaran color de texto ni fondo. En tema oscuro se hereda texto claro; no depender del fondo nativo del navegador.

Reproducción DT antes de implementación: Chromium escritorio y móvil, media oscuro, texto `rgb(233,223,240)` sobre blanco en los cuatro campos, contraste 1.29:1. Placeholder `rgb(156,163,175)` sobre blanco, 2.54:1 también en claro. Capturas revisadas y conservadas fuera de Git. Los cuatro casos del contrato tinta/fondo fallaron antes de modificar el componente; en claro el texto anterior sí tenía contraste suficiente (13.1:1), pero no era la tinta solicitada y el placeholder seguía fallando.

## Contrato autorizado

Texto escrito/seleccionado en los cuatro campos usa tinta de marca `#21002F` sobre fondo blanco explícito, en ambos temas. Placeholder distinguible y legible; títulos y resultados usan tokens correspondientes al fondo del modal. Contraste de texto normal ≥4.5:1. Mantener cantidades, precios, búsqueda, selección de cliente y operación de agregar existentes.

## Alcance y riesgos

Única implementación: `components/AgregarANotaVentaModal.tsx`, ≤50 líneas. Prueba visual de navegador privada `C:/Users/pablo/.pbt-runner/n01-e2e/contraste-nota.spec.cjs`, usando arnés TEST, JWT sintético y APIs interceptadas, sin escrituras reales. Revisión lateral: ProductCard y ProductDrawer usan el mismo modal; BUG-007 precio numérico y BUG-011 corte de error deben conservarse. Sin schema, permisos, env ni flags nuevos.

Riesgo de renderizado según tema: comprobar estilos computados y contraste en claro/oscuro, escritorio/móvil, con texto escrito y campos numéricos. Obtener rojo antes de editar componente y captura de reproducción. No agregar pruebas unitarias que solo espejen clases CSS. Regresión funcional con AgregarAPrenotaModal y smoke M01 existentes. DT ejecuta pruebas, tipos/lint y verifica captura final antes de commit/publicación.

## Verificación DT

- `node node_modules/playwright/cli.js test --config contraste-nota.config.cjs`, arnés privado: cuatro casos verdes tras cuatro rojos. Los cuatro campos tienen tinta rgb(33,0,47) sobre blanco, contraste 18.99:1; placeholder 6.28:1. Capturas escritorio/móvil oscuro revisadas visualmente.
- `npx jest --silent --runInBand --runTestsByPath __tests__/AgregarAPrenotaModal.test.tsx __tests__/lib/api-notas.test.ts`: 2 suites, 21 pruebas verdes.
- `node node_modules/playwright/cli.js test --config mantenimiento.config.cjs --grep M01`: smoke verde, HTTP500 no envía ítems y reintento manual agrega una sola vez con precio numérico. APIs interceptadas; sin cambios de datos de producción.
- Corrección visual activa sin flag nuevo; no cambia contratos de API, estados ni datos. Publicar solo después de tipos/lint verdes y verificar estado Vercel del commit.
- `npx tsc --noEmit` y `npm run lint`: código0, sin errores ni advertencias ESLint. DT revisó DIFF: cinco líneas de estilos, sin cambios funcionales.
