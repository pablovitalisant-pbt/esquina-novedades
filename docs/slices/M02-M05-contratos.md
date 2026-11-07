# Contratos de mantenimiento M02–M05

Autorización delegada vigente de Pablo. Sin funciones nuevas, sin flags nuevos, sin cambios de DB. Cada corte tiene su commit y ≤200 líneas cambiadas. Tests rojos antes de implementación cuando cambia comportamiento. Limpiezas que no cambian comportamiento se verifican con regresiones existentes.

## M02 — Cuentas activas

`cargarCuentasActivas()` mantiene URL y resultado en éxito; HTTP no-ok lanza ErrorPago sin consumir data engañosa. Eliminar soloSiOk del helper y del POS. Ambos catch existentes conservan su responsabilidad (POS vacía lista, diálogo de nota avisa). Payload de pagarNota intacto.

Files-to-touch: `lib/api-pagos.ts`, `components/PosCobrarDialog.tsx`, `__tests__/lib/api-pagos.test.ts`; pruebas de diálogos existentes. Revisión lateral: PagarNotaDialog, cuenta predeterminada/manual del POS, montos, vuelto y doble envío. Riesgo asíncrono: no exponer cuentas de una respuesta HTTP fallida. Test rojo con 401/500 que contengan data y JSON que no debe leerse; éxito/red conservados. Smoke de apertura/cobro con API interceptada en TEST; no cobrar en producción.

## M03 — Error compartido compatible

Crear ErrorApi extends Error con mensaje y nombre parametrizable. ErrorNota y ErrorPago siguen exportados como clases distintas que heredan ErrorApi: conservar name, message, instanceof propio y separación entre ambas. Evitar alias que vuelva indistinguibles sus catch.

Files-to-touch: `lib/api-error.ts`, `lib/api-notas.ts`, `lib/api-pagos.ts`, `__tests__/lib/api-error.test.ts`. Sin cambios en consumidores. Riesgo: clasificación compartida de excepciones; probar compatibilidad, separación y errores de red no envueltos. Reejecutar smokes de M01/M02.

## M04 — Comentarios Kardex

Quitar únicamente los bloques comentados de reactivación de Kardex en `components/TopNav.tsx` y `components/BottomNav.tsx`. Conservar navegación, ruta, permisos y saludo estable de BUG-009. Riesgo: ninguno nuevo, no tocar JSX ejecutable; pruebas existentes `slice-textos-kardex` y `topnav-hidratacion`, más smoke de navegación sin enlace Kardex. No agregar tests que espejen comentarios.

## M05 — Flags en pruebas de precios

Files-to-touch: `__tests__/precios-eliminar-producto-ui.test.tsx`, `app/(app)/precios/client_page.test.tsx`. Fijar precios-paginados de forma explícita para ambas suites. La eliminación debe probarse con ON y OFF; en OFF no consultar catálogo sin búsqueda, en ON cargar automáticamente. Mantener pruebas de paginación, descarte de respuestas viejas y debounce. No cambiar código de aplicación ni mockFlags compartido.

Riesgo conocido BUG-004: herencia de flags globales altera ramas ejecutadas. Documentar la rama antes/después y agregar comprobaciones de URL/ausencia de consulta; no considerar rojo una corrección a lógica que ya funciona. Smoke de precios con navegación y grilla para integración real.

## Verificación y cierre

Jest por archivos tocados y consumidores; `npx tsc --noEmit`, `npm run lint`. Revisión independiente del DT y auditoría al superar cinco cortes desde la última revisión. Build y despliegue verificados antes de declarar producción actualizada. M06 reconcilia documentos y registra evidencia sin eliminar historial.
