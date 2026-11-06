# N01 — Evidencia DT, 2026-11-06

- Rojo ejecutado DT: carrito 4 fallan / 15 pasan. Casos fallidos: 200/201 navegan directo a MP y respuesta sin UUID pierde carrito.
- Verde DT: 4 suites / 49 tests (carrito, checkout-entrega, pedido-publico, pedido-descuento). Lint y tsc exit 0. Build exit 0. Next informa deprecación de next lint; ESLint sin errores/warnings.
- Smoke Playwright: 1 passed (24.2 s), tienda real -> contacto -> carrito -> POST real -> reserva PostgreSQL TEST -> página real /pedido/UUID -> botón de pago -> proveedor MP fake local. Stock 25 ->24. Sin peticiones de navegador a MP real. Fixture y configuración temporal eliminados/restaurados.
- Proveedor externo simulado en servidor; esto prueba navegación/reserva, NO cobro real ni webhook. No se usaron credenciales MP reales.
- Harness privado local: ~/.pbt-runner/n01-e2e; ejecución node setup.cjs y node runner.cjs, con flag temporal activo restaurado a false. Logs ~/.pbt-runner/n01-{red-real,green,lint,tsc,build}.log y n01-e2e-run3.log.
- Revisión DT detectó DIFF inicialmente no aplicado y dos problemas de infraestructura de smoke (navegador faltante y slash final de ruta SDK); corregidos antes del resultado verde.
- Cambio de app+tests+flag: 111 líneas agregadas/eliminadas. Flag pedido-confirmacion-antes-pago false. Sin cambios DB de producción.
- Recorrido desde catálogo pendiente de la verificación integrada de tienda/catálogo; comparte CarritoDrawer y no cambia su interfaz. No se afirma smoke del catálogo ejecutado.
- Contador: 2 slices desde audit 2026-10-31b (1 anterior + N01).
