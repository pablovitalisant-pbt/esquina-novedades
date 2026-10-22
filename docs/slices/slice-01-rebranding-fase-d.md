# Slice 1 — Rebranding Chile — Fase D

## Alcance entregado
- `lib/empresa.ts` (`EMPRESA`: nombre, razonSocial, slug `la-esquina-de-las-novedades`, dirección, ciudad, horario, WhatsApp, redes solo texto).
- Quitado Bazar Naty / Bermejo / Tarija / Bolivia de app, components, lib, contexts, hooks, utils y `public/manifest.json`.
- Literal `'bazar-naty'` (empresa/origen en caja y notas) → `EMPRESA.slug` en todos los escritores y lectores (grep exhaustivo).
- Logos PNG reemplazados por wordmark de texto (landing, TopNav, AppShell móvil, login, PDF de notas). Los PNG de `public/` no se borraron; nota en PRD §10.4.
- `fechaBoliviaHoy` → `fechaHoyChile` (America/Santiago vía `toLocaleDateString`; antes UTC-4 fijo). El cron de Vercel no se tocó.
- `"Documento de identidad"` → `"RUT"` (login, usuarios). `es-BO`: ya no quedaba en producción.
- `STORAGE_KEY` del carrito: `bazarnaty:pedido` → `esquina:pedido`.

## Fuera de alcance (a propósito)
- `migrations/` (aplicadas; 018 aún escribe slug `bazar-naty` en `empresas`). El código usa fallback `EMPRESA.slug`; la fila real de `empresas.slug` en Neon debe revisarse al aplicar el schema (slice 0).
- `package.json` / `package-lock.json` (`name`), docs y tests.
- Redes sociales sin URL (no verificadas).

## Verificación
- Guard `__tests__/slice-01-rebranding-guard.test.ts`: verde.
- Tests actualizados: appshell-smoke, nav-mvp, landing-v2, landing-page-public, notas-venta-exportar-pdf, carrito, slice20/22, subslice-b.
- Jest completo: fallan solo 5 suites preexistentes y ajenas (catalogo-precio-override, 42p18-handler, productos-crear-smoke, productos-stock-minimo-ui, notas-venta/[id]/items route.test).
- `npx tsc --noEmit`: 2 errores fuera de tests (sin cambio): `app/page.tsx` (Set iteration) y `.next/types/.../catalogo/[slug]/page.ts`.
- Feature flag: no aplica (cambio de textos/branding).
