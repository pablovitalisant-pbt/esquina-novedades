# N05 — Conservar cantidad en edición al cambiar modalidad

DT aprueba reproducir por delegación. FREEZE del alcance: sin cambios locales en página y test. Punto de retorno Git 6597617, bug aún presente en esa base. Tipo A, interacción que desmonta editor.

Precondición: nota con línea de una unidad, modo edición. Escribir seis unidades sin guardar y seleccionar Por mayor. Esperado: seis sigue en el editor mientras se actualizan modalidad/precio. Guardar explícito persiste las seis. Diagnóstico de código: PATCH de modalidad llama onActualizar, que enciende loading y desmonta PrenotaItemsTable. La cantidad en borrador vive en su estado local. Reproducir antes de confirmar hipótesis.

Files-to-touch: app/(app)/notas-venta/[id]/client_page.tsx, __tests__/slice3b-ui-modalidad-detalle-mayor.test.tsx y BUGS.md al cierre. Propuesta: recarga en segundo plano tras cambio de modalidad sin desmontar editor. Mantener PATCH parcial, precio manual, guards y refresco tras guardar. Sin cambios API, schema, permisos, entorno o navegación. Máximo 50 líneas de fix, 200 para el slice. Reparación bajo control existente notas-venta-modalidad, sin flag adicional.

Riesgos: estado compartido durante refresh y cambio de modalidad simultáneo. Test rojo: escribe seis, cambia modalidad, espera respuesta/recarga, verifica editor con seis y precio correcto, guarda y verifica PATCH. Smoke de navegador en TEST con nota fixture, sin editar datos reales.
