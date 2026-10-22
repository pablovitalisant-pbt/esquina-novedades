# Slice U1 — Fase D

## U1.1 — params Promise en los 5 archivos (sin cambiar next)
Archivos: `app/api/admin/usuarios/[id]/route.ts` (tipo `Promise`), `app/(app)/notas-venta/[id]/page.tsx` (ya no pasa params), `.../client_page.tsx` (`params?` opcional), `app/catalogo/[slug]/page.tsx` (`await params` x2), `app/pedido/[id]/page.tsx` (`await params`). Test nuevo: `__tests__/next15-params-async.test.ts`.
Resultado: rojo inicial (4 variantes Promise) -> verde. Jest sobre tests del corte + co-ubicados + referenciantes: 39/41 suites verdes. Fallan 2 preexistentes/ajenos: `catalogo-precio-override` (requiere BD real) y `app/api/notas-venta/[id]/items/route.test.ts` (archivo no tocado).
tsc fuera de tests: 2 errores (baseline 3, no sube).
Nota: `jest.env-setup.ts` requiere `dotenv`, ausente en node_modules y package.json; se corrio con config temporal sin ese setup (borrada). Pendiente para el DT.
