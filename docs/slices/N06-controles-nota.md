# N06 — Controles legibles al editar una línea

DT aprueba por delegación. Unidades, Modalidad y Precio usan tokens existentes de fondo, texto y borde, foco visible y altura cómoda en móvil. Sus etiquetas quedan asociadas a los campos. Se conserva teclado nativo y flujo de edición. Sin cambios de negocio.

Files-to-touch: app/(app)/notas-venta/[id]/client_page.tsx y __tests__/slice3b-ui-modalidad-detalle-mayor.test.tsx. Revisar design-skill antes de JSX. No cambia API, estilos globales, schema ni permisos. Se apoya en flag notas-venta-modalidad existente.

Fase B: los tres controles tienen nombre accesible. Smoke navegador con fixture de nota, móvil y escritorio, tema oscuro y claro. Verificar fondo/texto calculados y edición; guardar screenshot sin datos reales. Máximo 200 líneas.
