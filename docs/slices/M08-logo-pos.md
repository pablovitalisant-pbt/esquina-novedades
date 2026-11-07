# M08 — Logo interno abre POS

Solicitud de Pablo, base limpia `8aa75cb`: al pulsar el logo del área interna, abrir POS en escritorio y móvil. Admin/vendedor con pos-v1 activo → /pos; flag apagado conserva /precios; bodeguero conserva /bodega porque no tiene acceso POS. La tienda pública no cambia.

Revisión lateral: el logo de escritorio está en TopNav y el de móvil en AppShell. Existe rutaInicio compartida: reutilizarla para admin/vendedor/otros y conservar excepción bodeguero independiente del flag. No modificar el helper, login ni middleware. Mantener orden POS primero de M07 y saludo estable BUG-009.

Files-to-touch: `components/TopNav.tsx`, `components/AppShell.tsx`, `__tests__/slice1-appshell-smoke.test.tsx`, este contrato y CONTEXT para cierre. Sin funcionalidades nuevas, flags nuevos, DB ni variables; ≤200 líneas. Riesgo rol/flag: probar los dos logos para admin/vendedor ON/OFF y bodeguero ON/OFF con sesión coherente, sin aserciones que solo validen uno de ellos.

Contrato delegado autorizado; primero tests rojos, después implementación mínima y DIFF. Smoke M04 privado verifica href y click del logo hacia /pos en escritorio y móvil, con APIs interceptadas y sin escrituras. Regresiones: orden POS, hidratación y rutaInicio. DT ejecuta pruebas/tipos/lint y verifica publicación Vercel antes del cierre.

DT verificó 2 rojos (admin/vendedor ON) y 11 verdes antes de implementar; después 4 suites y 29 pruebas verdes (AppShell, orden POS, hidratación, rutaInicio). Smoke M04 ampliado verde: ambos logos muestran href /pos, click navega a /pos y aparece su buscador; escritorio y móvil, cero APIs inesperadas ni escrituras reales. Revisión del diff: únicamente imports y destino de los enlaces, reutilizando helper existente.

`npx tsc --noEmit` y `npm run lint`: código0, sin errores ni advertencias ESLint. Publicar por main y comprobar estado Vercel del commit antes de declarar producción actualizada.
