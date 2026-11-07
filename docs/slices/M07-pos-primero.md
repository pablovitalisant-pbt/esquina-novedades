# M07 — POS primero en navegación

Pablo solicita POS antes de Ventas en la barra superior. Base limpia `ccd6b31`. Orden con acceso POS activo: POS, Ventas, Catálogo, Categorías, Bodega, Administración; conservar las restricciones por rol existentes. Con pos-v1 apagado no aparece POS. La barra móvil ya tiene POS primero: no necesita cambio.

Revisión lateral: TopNav, BottomNav, rutas/roles, flag pos-v1 y BUG-009 de hidratación. Solo cambia posición del bloque POS en `components/TopNav.tsx`; sin cambios en rutas, permisos, saludo ni estilos. Contrato autorizado por delegación vigente. No es funcionalidad nueva ni requiere otro flag.

Riesgo de renderizado por rol/flag: comprobar orden para admin/vendedor, ausencia de POS al apagar flag y para bodeguero. Prueba nueva `__tests__/topnav-pos-orden.test.tsx`, roja antes de mover bloque. Regresiones existentes topnav-hidratacion, pos-detalles-bottomnav y slice-textos-kardex. Smoke privado de navegación M04: verificar primer elemento POS en escritorio y móvil antes de recorrer Ventas. Mantener ≤200 líneas totales. DT ejecuta rojo/verde, tipos/lint, revisa diff y verifica despliegue antes del cierre.

Verificación DT: 2 rojos de orden y 2 casos de acceso verdes antes de implementar. Después, 4 suites/14 pruebas verdes (orden, hidratación, barra móvil, menús). Smoke M04 verde: primer elemento de barra superior POS y navegación a precios/notas de venta en escritorio y móvil; APIs interceptadas, cero escrituras reales. Diff de aplicación limitado a mover el bloque existente, 7 líneas añadidas y 7 retiradas.

`npx tsc --noEmit` y `npm run lint`: código0, sin errores ni advertencias ESLint. Publicación por push a main con comprobación del estado Vercel del commit antes de informar producción actualizada.
