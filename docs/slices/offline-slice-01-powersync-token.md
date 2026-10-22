# Slice 1 (Offline) — Endpoint de tokens PowerSync

Contrato Fase A aprobado por Pablo el 2026-08-01. Ver `docs/ARQUITECTURA-OFFLINE.md`
para el contexto completo del proyecto offline-first. Este archivo es la
fuente de verdad de este slice específico para Claude Code.

## Objetivo

Endpoint backend que emite el JWT que el SDK cliente de PowerSync usa para
autenticarse contra la instancia (`fetchCredentials()`), firmado con el
secreto HS256 ya configurado en el dashboard de PowerSync (KID
`bazar-naty-hs256-v1`).

## Contrato

**`GET /api/powersync/token`**

- Requiere sesión next-auth válida: mismo patrón que
  `app/api/alertas-stock/route.ts` (`getServerSession(authOptions)`),
  sin restricción de rol — los tres roles (`admin`, `bodeguero`,
  `vendedor`) pueden sincronizar; el Sync Stream decide qué datos ven,
  no este endpoint.
- Sin sesión → `401 { "error": "No autorizado" }`.
- Con sesión → firma un JWT HS256:
  - header: `{ alg: 'HS256', kid: 'bazar-naty-hs256-v1' }`
  - payload: `{ sub: session.user.id, aud: process.env.POWERSYNC_INSTANCE_URL, rol: session.user.rol, iat, exp }`
  - expiración: 30 minutos desde `iat` (rango recomendado por PowerSync: 5-60 min)
  - firma: `Buffer.from(process.env.POWERSYNC_JWT_SECRET, 'base64url')`
- Respuesta `200`: `{ "token": "<jwt>", "endpoint": "<POWERSYNC_INSTANCE_URL>" }`
  — shape exacto que espera `fetchCredentials()` según la
  [documentación oficial de PowerSync](https://docs.powersync.com/configuration/app-backend/client-side-integration).

### Ejemplo

- Input: cookie de sesión next-auth válida, usuario `bodeguero` id `7`.
- Output: `{ "token": "eyJhbGc...", "endpoint": "https://6a6df4a491ecf2aec48f3e78.powersync.journeyapps.com" }`

## Revisión de impacto lateral (ya hecha en Fase A, confirmada)

Archivos a crear/modificar:
- **Nuevo**: `app/api/powersync/token/route.ts`
- **`.env.example`**: agregar `POWERSYNC_JWT_SECRET=` y `POWERSYNC_INSTANCE_URL=` (sin valores reales)
- **`package.json`**: agregar dependencia `jose`

Confirmado sin impacto (revisado en Fase A):
- `middleware.ts` — su matcher excluye `api/`, las rutas API se autoprotegen con `getServerSession()`
- `lib/auth.ts` — se lee, no se modifica
- `lib/rutas-por-rol.ts` — rige navegación de páginas, no rutas API
- `types/index.ts` — el payload del JWT es interno a este endpoint

No hay archivos fuera de este slice a tocar.

## Variables de entorno reales

Pablo configura manualmente (no via código, no compartidas en el chat de
Director Técnico, siguiendo la regla de secretos del proyecto):
- `POWERSYNC_JWT_SECRET` — el secreto HS256 generado en la sesión de
  infraestructura (mismo valor que está en PowerSync Dashboard → Client
  Auth → HS256 Authentication Tokens, KID `bazar-naty-hs256-v1`)
- `POWERSYNC_INSTANCE_URL` — `https://6a6df4a491ecf2aec48f3e78.powersync.journeyapps.com`

En Vercel: agregar ambas como Sensitive. En local: agregar a `.env.local`
(no versionado).

## Siguiente paso (Claude Code)

Ejecutar Fase B (análisis de riesgos + tests que intentan romper el
slice) según protocolo PBT-IA-DEBUGGING/`~/.claude/CLAUDE.md`. Riesgos
esperables a cubrir como mínimo: JWT sin sesión (401), variable de
entorno `POWERSYNC_JWT_SECRET` ausente (¿falla al arrancar o en
runtime?), expiración correcta del token (`exp - iat` == 1800s).
