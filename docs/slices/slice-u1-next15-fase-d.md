# Slice U1 — Fase D

## U1.1 — params Promise en los 5 archivos (sin cambiar next)
Archivos: `app/api/admin/usuarios/[id]/route.ts` (tipo `Promise`), `app/(app)/notas-venta/[id]/page.tsx` (ya no pasa params), `.../client_page.tsx` (`params?` opcional), `app/catalogo/[slug]/page.tsx` (`await params` x2), `app/pedido/[id]/page.tsx` (`await params`). Test nuevo: `__tests__/next15-params-async.test.ts`.
Resultado: rojo inicial (4 variantes Promise) -> verde. Jest sobre tests del corte + co-ubicados + referenciantes: 39/41 suites verdes. Fallan 2 preexistentes/ajenos: `catalogo-precio-override` (requiere BD real) y `app/api/notas-venta/[id]/items/route.test.ts` (archivo no tocado).
tsc fuera de tests: 2 errores (baseline 3, no sube).
Nota (U1.1): `jest.env-setup.ts` requiere `dotenv`, ausente en node_modules y package.json; se corrio con config temporal sin ese setup (borrada). Pendiente para el DT.

## U1.3 + U1.4 — outputFileTracingRoot, revision de config, docs
Archivos: `next.config.mjs` (`outputFileTracingRoot` via `fileURLToPath`), `CLAUDE.md` y `PRD.md` §6 (Next.js 15.5 + React 18), test nuevo `__tests__/next-config.test.ts`.
Revision de `next.config.mjs`: sin opciones obsoletas en Next 15 (`eslint.ignoreDuringBuilds`, `typescript.ignoreBuildErrors`, `images.remotePatterns` siguen vigentes). Aviso: `ignoreBuildErrors: true` oculta errores de tipos en build.
Evidencia del DT (next 15.5.28 + eslint-config-next 15.5.28 + `npm audit fix`): audit prod 0 criticas, 1 alta (postcss interno de next, solo build); suite 5 suites heredadas (= baseline); tsc no-test 2 errores; build OK; smoke E2E OK (login, 12 pantallas, rutas dinamicas 404, webhook/cron sin secreto 500 por diseno).
Resultado del corte: test de config rojo (sin outputFileTracingRoot) -> verde.
