# Slice 9a (Offline, Fase 2) — Bandeja de conflictos: tabla + API

Contrato Fase A propuesto por Claude (Director Técnico). Diseño aprobado
por Pablo el 2026-08-01, ver `docs/ARQUITECTURA-OFFLINE.md` sección
"Fase 2 — Conflictos y observabilidad".

## Objetivo

Backend puro (sin PowerSync, sin UI): tabla `sync_conflictos` en Neon +
3 endpoints para crear, listar y resolver conflictos de sincronización.
Es la base sobre la que Slice 9b (wiring de `BackendConnector`) y 9c
(pantalla admin) se apoyan.

## Por qué esto no es un slice "offline" como los anteriores

Esta bandeja es una pantalla de administración 100% online — un
conflicto solo existe porque un dispositivo offline recuperó conexión e
intentó sincronizar (en ese momento hay red). No requiere PowerSync,
`AppSchema.ts`, ni Sync Stream. Es CRUD estándar sobre Postgres, mismo
patrón que cualquier endpoint existente del proyecto (`getServerSession`
+ `sql` tagged template de `lib/db.ts`).

## Contrato

### Archivos nuevos

- **`migrations/026_sync_conflictos.sql`**:
  ```sql
  CREATE TABLE IF NOT EXISTS public.sync_conflictos (
    id                  SERIAL PRIMARY KEY,
    tabla               TEXT NOT NULL,
    operacion           TEXT NOT NULL,        -- 'PUT' | 'PATCH' | 'DELETE'
    entidad_id          TEXT,                 -- codigo/id de la fila afectada (clave libre, varía por tabla)
    payload             JSONB NOT NULL,
    http_status         INTEGER,
    error_mensaje       TEXT,
    usuario_id          INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario_nombre      TEXT,
    estado              TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'resuelto'
    resuelto_en         TIMESTAMPTZ,
    resuelto_por        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    resuelto_por_nombre TEXT,
    accion_tomada       TEXT,                 -- 'descartado' (única acción del MVP, ver §Fase 2)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sync_conflictos_estado
    ON sync_conflictos(estado, created_at DESC);
  ```
  Siguiente número de migración disponible: `026` (verificado, la última
  es `025_backfill_ubicaciones_bodega.sql`).

- **`app/api/sync-conflictos/route.ts`**:
  - `POST`: cualquier usuario autenticado (no solo admin — el dispositivo
    que reporta el conflicto puede ser de un bodeguero o vendedor). Body:
    `{ tabla, operacion, entidad_id, payload, http_status, error_mensaje }`.
    El servidor completa `usuario_id`/`usuario_nombre` desde la sesión y
    `estado: 'pendiente'`. Validar que `tabla`, `operacion` y `payload`
    estén presentes (400 si falta alguno) — este endpoint lo llama código,
    no un formulario, así que la validación es defensiva pero simple.
  - `GET`: **admin-only** (403 para el resto). Query param opcional
    `?estado=pendiente|resuelto` (default `pendiente`). Devuelve lista
    ordenada por `created_at DESC`.

- **`app/api/sync-conflictos/[id]/route.ts`**:
  - `PATCH`: **admin-only**. Body `{ accion: 'descartar' }` (única acción
    válida en este MVP — rechazar cualquier otro valor con 400, deja la
    puerta abierta para agregar `'reintentar'`/`'editar'` en el futuro sin
    romper el contrato). Efecto: `estado = 'resuelto'`, `accion_tomada =
    'descartado'`, `resuelto_en = NOW()`, `resuelto_por`/`resuelto_por_nombre`
    desde la sesión. 404 si el id no existe. 409 si ya estaba resuelto
    (idempotencia — evitar doble clic con dos resultados distintos).

### No se toca

`lib/powersync/**` (se toca en 9b, no acá), ningún otro endpoint
existente, ninguna UI todavía (9c).

## Riesgos a cubrir en Fase B

- **INSERT/UPDATE a DB**: sí hay — `POST` inserta, `PATCH` actualiza.
  Riesgo de duplicados: no aplica (cada conflicto es un evento único, sin
  constraint de unicidad necesaria — dos intentos fallidos del mismo
  registro son dos conflictos distintos, información válida).
- **Auth**: `POST` para cualquier autenticado, `GET`/`PATCH` admin-only —
  cubrir los 3 casos con tests (401 sin sesión, 403 no-admin en GET/PATCH,
  200/201 con el rol correcto).
- **Payload arbitrario en JSONB**: `payload` viene de código (no de un
  formulario de usuario), pero igual validar que sea JSON serializable
  antes del INSERT (evitar que un objeto circular o similar rompa la
  ruta con un 500 feo).
- **Idempotencia del PATCH**: doble clic en "descartar" no debe romper
  ni sobreescribir `resuelto_por`/`resuelto_en` de la primera resolución
  — 409 si ya estaba resuelto (cubierto arriba).

## Verificación esperada (Fase D)

1. `POST /api/sync-conflictos` sin sesión → 401. Con sesión (cualquier
   rol) → 201, fila creada con `estado='pendiente'`.
2. `GET /api/sync-conflictos` sin admin → 403. Con admin → lista
   correcta, filtrada por `estado` default `pendiente`.
3. `PATCH .../[id]` con `accion: 'descartar'` → 200, estado pasa a
   `resuelto`. Segundo `PATCH` sobre el mismo id → 409.
4. `PATCH .../[id]` con `accion` inválida → 400.
5. `npm run build` y suite completa sin regresiones.
