# Slice 0 — Fase D (verificación)

Contrato: `docs/slices/slice-00-neon-schema-fase-a.md`. Evidencia ejecutada por el Director Técnico.

- **Branch descartable `slice0-test`:** 35/35 migraciones OK, seed x2 idempotente, empresa id=1 slug `la-esquina-de-las-novedades`, admin con rol `admin`, hash bcrypt válido. Branch eliminado.
- **Verificación contra DB real:** 29 tablas y 217 columnas usadas en INSERT/UPDATE del código existen. Único hallazgo: `productos.diferencia` = falso positivo del extractor (comentario en `conciliaciones/route.ts`).
- **production:** 0 tablas previas → 35/35 migraciones, 31 tablas, seed OK.
- **`.env.local`:** creado con `DATABASE_URL` pooled (`-pooler`) + `NEXTAUTH_SECRET`.
- **`npm run build`:** OK. Único warning: wasm de PowerSync no precacheado (se elimina en Slice 3). Nota: `next build` hace "Skipping validation of types / linting" → revisar en Señal 3.
- **E2E:** `next start` + login con credenciales admin → sesión rol admin; password incorrecta → sin sesión; `GET /api/categorias` autenticado → 200.
- **jest `__tests__/slice-00`:** 25/25.
- **Feature flag:** no aplica (scripts de infraestructura, sin cambio de comportamiento en runtime). Decisión explícita.
- **Neon:** CLI global, skill `neon` y `.mcp.json` (OAuth, sin secretos) instalados a nivel proyecto; futuros `neon init` deben usar `--no-agent-setup`.
