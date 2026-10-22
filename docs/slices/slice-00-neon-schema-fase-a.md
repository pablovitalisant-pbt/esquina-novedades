# Slice 0 — Neon + schema desde DB vacía + seed — FASE A (Contrato)

Estado: **APROBADO por Pablo** con las decisiones de abajo (reemplazan lo dicho en §3 y "Preguntas abiertas").

## Decisiones aprobadas

1. Script de migraciones con orden explícito (003, 001, 002, 008…039), se detiene en el primer error y registra lo aplicado. **Sin psql**: se ejecuta con `Pool` de `@neondatabase/serverless` (ya instalado). Reemplaza `apply-migrations.ps1` por `scripts/apply-migrations.ts` + `scripts/migrations-order.ts` (lista exportada `MIGRATION_ORDER`, función `applyMigrations({files, readFile, exec, log})` → `{applied, failed}`).
2. Tipos de `registro_notas_bodega` y `app_audit_log`: inferidos del código (§3.4).
3. Slug: `la-esquina-de-las-novedades`.
4. Primero branch Neon descartable, después `production`.
5. Admin inicial por env: `ADMIN_RUT`, `ADMIN_NOMBRE`, `ADMIN_PASSWORD` (reemplaza `SEED_ADMIN_*` del §3.5/§4; nunca hardcodeado; contraseña ≥ 10 caracteres).
6. Seed testeable: lógica en `scripts/seed-core.ts` (`validateSeedEnv(env)`, `runSeed(sql, env, hash)`); `scripts/seed.ts` queda como entrypoint delgado.
7. `scripts/verify-schema.sql` se descarta como archivo: la cobertura código↔migraciones la cubre el test `__tests__/slice-00-schema.test.ts`; la verificación contra la DB real usa `information_schema` desde el script de migraciones.

Antiguo estado: pendiente de aprobación. No se escribió código, no se ejecutó
ninguna migración, no se corrió `neon init` ni `npm install`.
Fuentes: `CLAUDE.md`, `PRD.md` §9, §10.1–10.3, código en `app/`, `lib/`, `scripts/`
(sin tests) y `migrations/*.sql` (34 archivos; faltan 004–007 por herencia de bazar-naty).

## 1. Objetivo y criterio de éxito

Objetivo: dejar el proyecto Neon `steep-shape-55022986` / branch `production` con el
schema completo creado **solo** desde `migrations/` (más las migraciones nuevas que
este slice agregue) y con el seed mínimo (empresa + admin), de modo que la app
arranque y las rutas que hoy consultan la DB no fallen por tabla/columna inexistente.

Criterio de éxito (todo verificable contra la DB real):

1. `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` contiene
   las 31 tablas (29 de migraciones existentes + `registro_notas_bodega` y
   `app_audit_log` por migración nueva; 2 de ellas sin uso en código: `despachos`, `inventario_conteo`).
2. Cero diferencias entre las columnas que el código escribe/lee (§2.2) y
   `information_schema.columns` (check mecánico, §6).
3. Las migraciones se aplican de punta a cabo en la DB vacía sin error, en el orden del §3.3.
4. `empresas` tiene exactamente 1 fila con `id = 1` y nombre "La Esquina de las Novedades"
   (el código asume `empresa_id = 1`, ver §2.4).
5. Existe 1 usuario `admin` activo, vinculado a la empresa 1 en `usuario_empresa`, y el login
   por NextAuth funciona con él en local contra la DB nueva.
6. El seed es idempotente (2ª ejecución: 0 filas nuevas).
7. `npx tsc --noEmit`, `npm run lint`, `npm run test` sin regresiones respecto al baseline
   que se mida en Fase B (el baseline actual no se midió: no se ejecutó nada).

## 2. Inventario código vs migraciones

Método: grep de `FROM/JOIN/INSERT INTO/UPDATE/DELETE FROM` en `app/`, `lib/`, `scripts/`
excluyendo `*.test.*` y `__tests__`; lectura de todas las listas de columnas de
INSERT y de todos los `UPDATE ... SET`; para SELECT se cruzaron las columnas
calificadas con alias de `productos` (`p.*`, ~330 ocurrencias) y de `prenotas`.
Límite declarado: los SELECT de otras tablas y los `SELECT *` no se enumeraron columna
por columna; el check mecánico del §6 (paso 5) cierra ese hueco contra la DB real.

### 2.1 Tablas que el código consulta

`productos, prenotas, prenota_items, caja_movimiento_notas, clientes, caja_movimientos,
caja_cuentas, ubicaciones_bodega, catalogos, caja_config, usuarios,
clientes_saldo_favor_movimientos, categorias, caja_saldos_iniciales, caja_cierres, empresas,
usuario_empresa, pedidos, pedido_items, catalogo_precio_override, alertas_stock_bajo,
sync_conflictos, catalogo_items, snapshots_inversion_mercaderia(+_detalle),
ingresos_mercaderia, conciliaciones_stock, registro_notas_bodega, app_audit_log`.

### 2.2 Diferencias EXACTAS (código usa, migraciones no crean)

| # | Falta | Dónde se usa |
|---|---|---|
| D1 | tabla `public.registro_notas_bodega` (columnas usadas: `id, folio, empresa_id, usuario_id, usuario_nombre, observacion, created_at`) | `app/api/bodega/registro-notas/route.ts:23` (SELECT), `:50-51` (INSERT folio, empresa_id, usuario_id, usuario_nombre, observacion); `app/api/bodega/registro-notas/[id]/route.ts:29` (SELECT *), `:52` (DELETE) |
| D2 | tabla `public.app_audit_log` (columnas usadas: `id` text, `"actorUserId"`, `action`, `entity`, `"entityId"`, `diff` jsonb, `"createdAt"`; camelCase entre comillas) | `app/api/bodega/registro-notas/[id]/route.ts:35-36` (INSERT) |

Ambas dependen del flag `registro_notas_bodega_ui` (`config/feature-flags.json:3`, hoy `false`).
Nota: tipos de `registro_notas_bodega.id` y de `app_audit_log.*` no están en ninguna
migración; se infieren solo del uso (`id` se castea `String(id)` y `${id}` → ver Q2 abajo).

**Columnas: 0 diferencias detectadas** en INSERT/UPDATE (todos los listados contra
las migraciones 001–038 considerando renombres de 027–030: `id` UUID en `prenota_items`,
`caja_movimientos`, `categorias`, `clientes`; `prenotas.cliente_id` y
`caja_movimientos.kcodcli2` pasan a UUID) ni en `p.*` de `productos`.

### 2.3 Tablas que crean las migraciones y el código NO consulta

`despachos`, `inventario_conteo` (003). Sin uso en SQL de `app/`/`lib/` (solo existe la
ruta fetch `/api/despachos/*` que no tiene backend, ver PRD heredado 9.26). No se tocan.

### 2.4 Problemas de aplicación sobre DB vacía (detectados al leer, no ejecutados)

| # | Problema | Evidencia |
|---|---|---|
| P1 | **Orden numérico no sirve**: `001_prenotas.sql` referencia `usuarios(id)` y `002_prenota_items.sql` referencia `empresas(id)`, tablas que crea `003_core_tables.sql`. Aplicar 001→002→003 falla en DB vacía. | `001:usuarios(id)`, `002:empresas(id)`, `003` crea ambas |
| P2 | `018_unificar_empresas.sql` es solo de datos (UPDATE/DELETE con `empresa_id = 2`, `UPDATE empresas ... WHERE id = 1`). Sobre DB vacía es no-op: **no crea la empresa ni cambia su nombre**. La empresa la crea el seed. | `018` pasos 1–8 |
| P3 | El código asume `empresa_id = 1` fijo: `app/page.tsx:22,40,64`, `app/productos/page.tsx:22`, `app/api/admin/usuarios/route.ts:58`, `app/api/admin/usuarios/[id]/route.ts:36`, `activeEmpresaId = 1` en `bodega/client_page.tsx:63`, `catalogo/admin/client_page.tsx:53`, `admin/categorias/client_page.tsx:234`, `empresaId = 1` en `bodega/registro-notas/client_page.tsx:34`. Con `SERIAL`, la empresa solo queda con `id=1` si el seed es el **primer** INSERT en `empresas`. | ver archivos |
| P4 | 019, 021, 027–030 usan `ADD COLUMN`/`DROP CONSTRAINT`/`RENAME` **sin** `IF [NOT] EXISTS`: solo son aplicables una vez. Un fallo a mitad deja el schema a medias y no se puede re-correr. | 019, 021, 027–030, 036 |
| P5 | Nombres de constraints que 028–030 dropean dependen del nombre autogenerado de Postgres (`prenota_items_pkey`, `caja_movimientos_pkey`, `categorias_pkey`, `clientes_pkey`, `caja_movimiento_notas_movimiento_id_fkey`, `prenotas_cliente_id_fkey`). Coinciden con la convención de Postgres para los CREATE de 001/002/003/009/011-016/020, pero **no se verificó** (no se corrió nada). | 027–030 |
| P6 | `gen_random_uuid()` (027–030, 034) requiere PG ≥ 13 (o pgcrypto). Versión de Neon sin verificar. | 027–030, 034 |
| P7 | `036` crea índice único sin `IF NOT EXISTS`; igual que P4. | 036 |

## 3. Plan de ejecución propuesto

### 3.1 Neon (PRD §10.2, comandos tal cual)

```
npx neon@latest init -y --org-id org-lucky-math-65013365 --project-id steep-shape-55022986 --branch production --services postgres
neon deploy
```

Antes de aplicar nada: confirmar con Pablo que `production` está **vacía** (CLAUDE.md
fija este branch como destino; PRD §10.1 asume DB vacía). Verificar con
`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` = 0.

### 3.2 Env var

PRD §10.2: `neon deploy` escribe en `.env.local` (o `.env` si existe). El nombre real de
la variable que genera Neon **no está verificado** (no se corrió). Plan: tras `neon deploy`,
leer los **nombres** (no valores) en `.env.local`; si no es `DATABASE_URL`, agregar
`DATABASE_URL=<valor>` en `.env.local` (el código solo lee `process.env.DATABASE_URL`:
`lib/db.ts:3-8`, `scripts/seed.ts:4`). No se modifica `lib/db.ts`. Nunca imprimir el valor.
Ya existe `.env.example` (con `POWERSYNC_*`, sin `MP_*`/`CRON_SECRET`); no existe `.env.local`.

### 3.3 Orden de aplicación

Sin editar migraciones existentes (regla dura): **003 → 001 → 002 → 008 → 009 → 010 … 038**
(resto en orden numérico, incluyendo 018 que queda como no-op). Más las nuevas (§3.4).
Herramienta: el driver HTTP de Neon no ejecuta archivos multi-statement (hay `DO $$`,
`BEGIN/COMMIT` en 020, varias sentencias por archivo) → usar `psql -v ON_ERROR_STOP=1 -f`
archivo por archivo, parando en el primer error. Precondición: `psql` instalado
(no verificado). Se propone una lista explícita de orden en un script `scripts/apply-migrations.ps1`
(no es un "runner": no lleva tabla de control; ejecución manual y deliberada). Decisión de Pablo
en Q1.

### 3.4 Migración nueva

`039_registro_notas_bodega_app_audit_log.sql` (siguiente número libre), `CREATE TABLE IF NOT EXISTS`:

- `registro_notas_bodega(id SERIAL PK, folio TEXT NOT NULL, empresa_id INTEGER NOT NULL REFERENCES empresas(id), usuario_id INTEGER NOT NULL REFERENCES usuarios(id), usuario_nombre TEXT NOT NULL, observacion TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
- `app_audit_log(id TEXT PK, "actorUserId" INTEGER, action TEXT NOT NULL, entity TEXT NOT NULL, "entityId" TEXT, diff JSONB, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`

Tipos inferidos solo del uso; los tipos de `registro_notas_bodega.id` y de `actorUserId`
se confirman en Fase B leyendo `docs/referencia-bazar-naty/` y los tests existentes
(`app/api/bodega/registro-notas/route.test.ts`, `__tests__/bug012-registro-notas-fix.test.ts`).
Si el schema real de bazar-naty es distinto, se ajusta antes de aplicar.

### 3.5 Cambios al seed (`scripts/seed.ts`)

Hoy el seed es de demo de bazar-naty (empresa "Bazar Naty", 3 usuarios con contraseñas fijas
`admin123/bodega123/venta123`, 10 productos, catálogo, 3 clientes, `caja_config.dolar_dia`,
cuentas USD/ARS). Corriéndolo contra `production` ensuciaría la DB real. Propuesta mínima:

- Empresa: `('La Esquina de las Novedades', slug)` con `ON CONFLICT (slug) DO NOTHING`.
  Slug propuesto: `la-esquina-de-las-novedades` (**decisión Pablo, Q3**).
- Admin inicial: RUT, nombre y contraseña desde env (`SEED_ADMIN_RUT`, `SEED_ADMIN_NOMBRE`,
  `SEED_ADMIN_PASSWORD`), hash con `bcryptjs` (ya instalado), rol `admin`, + fila en `usuario_empresa`.
  El login compara el RUT **literal** (`lib/auth.ts:22-26`): el formato del env debe ser el que se tipea.
- Eliminar del seed: productos demo, catálogo demo, clientes demo, `caja_config.dolar_dia`,
  cuentas `Caja chica` USD / `Caja fuerte` ARS (la moneda es Slice 2; no sembrar moneda extranjera).
  `ubicaciones_bodega` demo se va con los productos.
- Abortar con mensaje si faltan las env del admin o si `empresas` ya tiene filas con otro `id` mínimo
  (protege P3).
- Los otros 3 usuarios (PRD §10.4) quedan pendientes de la clienta; se crean por UI admin.

## 4. Revisión de impacto lateral

Archivos YA EXISTENTES que deben cambiar para integrar el slice:

| Archivo | Cambio | Líneas aprox. |
|---|---|---|
| `scripts/seed.ts` | reescritura a seed mínimo (§3.5) | ~60 netas (hoy ~170 → ~60; borra más de lo que agrega) |
| `.env.example` | agregar `SEED_ADMIN_RUT/NOMBRE/PASSWORD`; **no** tocar `POWERSYNC_*` (Slice 3) | +3 |
| `package.json` | script `"seed"` ya apunta a `.env.local`; sin cambio. Opcional `"db:migrate"`: NO (Q1) | 0 |
| `CLAUDE.md` (proyecto) | agregar la regla de orden 003→001→002 (hallazgo P1) en sección Neon | +3 |
| `PRD.md` | §9 fila Slice 0: marcar hecho al cerrar; §10.1 anotar P1/P2 | +4 |
| `BUGS.md` | registrar P1 (orden) y D1/D2 (tablas sin migración) como hallazgos | +10 |

Revisados y sin cambio en este slice (justificación): `lib/db.ts` (lee `DATABASE_URL`, ya es el
nombre que mapeamos), `lib/auth.ts` y `middleware.ts` (no dependen del slug ni del nombre de empresa),
`types/` (no hay tipos nuevos de DB), rutas/navegación (no cambia UI), feature flags
(`registro_notas_bodega_ui` sigue `false`; se activa solo después de verificar D1/D2 aplicados),
`vercel.json` (cron de snapshots ya existente; `CRON_SECRET` es de otro slice), tests existentes
(mockean `sql`; no tocan DB). **Diferido explícito a Slice 1/2 (no es de este slice)**: strings
"Bazar Naty" en `app/layout.tsx:9-15`, `login/page.tsx:46`, `catalogo/[slug]/page.tsx:145`,
`notas-venta/[id]/client_page.tsx:666`; literal `'bazar-naty'` escrito en `caja_movimientos.empresa` /
`caja_movimiento_notas.empresa` (`pagar/route.ts:149,171`, `reembolsar/route.ts:93,99`,
`movimientos/[id]/notas/route.ts:135`) y props `empresaSlug="bazar-naty"`; fallback
`'bazar-naty'` en `app/page.tsx:22` y `app/productos/page.tsx:8`. Efecto de cambiar el slug de DB
a otro valor: `components/ImageWithFallback.tsx:35` arma una URL de Cloudinary de fallback con
`empresaSlug`; solo afecta fallback de imágenes, sin datos aún.

### Files-to-touch (≤200 líneas del slice)

| Archivo | Tipo | Líneas |
|---|---|---|
| `migrations/039_registro_notas_bodega_app_audit_log.sql` | nuevo | ~30 |
| `scripts/apply-migrations.ps1` | nuevo (lista explícita de orden, `psql ON_ERROR_STOP`) | ~35 |
| `scripts/verify-schema.sql` (consulta de columnas esperadas vs reales) | nuevo | ~40 |
| `scripts/seed.ts` | modificar | ~60 netas |
| `.env.example`, `CLAUDE.md`, `PRD.md`, `BUGS.md` | modificar | ~20 |
| `__tests__/slice-00-schema.test.ts` | nuevo (Fase B) | ~60 |
| **Total** | | **~245 incluyendo tests; código de producción ~165** |

Si excede 200 con tests, se parte en 0a (migración 039 + orden + verificación) y 0b (seed + docs).

## 5. Riesgos para Fase B y tests propuestos

Checklist PBT-IA (intentar romper el slice):

- [ ] **Orden**: aplicar 001 antes que 003 sobre DB vacía falla (P1). Test: el script de orden lista 003 antes que 001/002.
- [ ] **Idempotencia**: 2ª corrida del seed no crea filas; 039 con `IF NOT EXISTS` re-aplicable.
- [ ] **Falla a mitad (P4)**: migración que falla deja schema parcial. Mitigación: `ON_ERROR_STOP`, aplicar en branch Neon descartable primero (ver Q4), no en `production` directo.
- [ ] **Empresa id≠1 (P3)**: seed aborta si la empresa no queda con `id=1`.
- [ ] **Secretos**: el seed no loguea `DATABASE_URL` ni la contraseña; env faltante → exit ≠ 0 con mensaje claro.
- [ ] **Hash**: contraseña nunca en texto plano en DB; `bcrypt.compare` verifica.
- [ ] **RUT con formato distinto** al tipeado en login → no autentica (documentar formato).
- [ ] **Constraint names (P5)**: verificar nombres reales antes de 027–030 (solo se ve en la corrida).
- [ ] **Tablas D1/D2 con tipos incorrectos**: un `INSERT` real de registro-notas y su DELETE con auditoría sobre la DB.
- [ ] **Regresión**: `npm run test` y `tsc` iguales al baseline.
- [ ] **Zonas frágiles**: el slice toca schema de `caja_movimientos`/`clientes` solo en lectura; no se edita ninguna migración aplicada.

Tests propuestos (Jest, sin DB real salvo el paso de verificación manual):

1. `scripts/apply-migrations`: la lista de orden contiene exactamente los archivos de `migrations/*.sql` (más 039), sin faltantes ni duplicados, con 003 antes de 001/002.
2. `039`: contiene `CREATE TABLE IF NOT EXISTS` para ambas tablas y las columnas que usan los INSERT de `registro-notas` (parseo de texto).
3. Seed: con `DATABASE_URL`/`SEED_ADMIN_*` ausentes sale con código ≠ 0 y no imprime secretos; con `neon` mockeado, 2ª corrida no hace INSERT efectivos.
4. Cobertura código↔schema: test que extrae tablas de `INSERT INTO` en `app/api/**` y falla si alguna no aparece en `CREATE TABLE` de `migrations/` (hoy fallaría para D1/D2 → rojo → verde con 039).

## 6. Comandos exactos de verificación

```
# 0. precondiciones
psql --version
Get-ChildItem .env.local   # existe tras neon deploy
# 1. DB vacía (rellenar $env:DATABASE_URL desde .env.local, sin imprimirla)
psql $env:DATABASE_URL -tAc "select count(*) from information_schema.tables where table_schema='public'"   # esperado 0
psql $env:DATABASE_URL -tAc "show server_version"
# 2. aplicar (orden: 003,001,002,008..039)
pwsh scripts/apply-migrations.ps1
# 3. tablas
psql $env:DATABASE_URL -tAc "select count(*) from information_schema.tables where table_schema='public'"   # esperado 31
# 4. tablas del código presentes
psql $env:DATABASE_URL -f scripts/verify-schema.sql   # 0 filas faltantes
# 5. columnas (introspección: SELECT * de cada tabla vía \d)
psql $env:DATABASE_URL -c "\d+ public.registro_notas_bodega" -c "\d+ public.app_audit_log"
# 6. seed y idempotencia
npm run seed ; npm run seed
psql $env:DATABASE_URL -tAc "select id,nombre,slug from empresas"            # 1 fila, id=1
psql $env:DATABASE_URL -tAc "select rut,rol,activo from usuarios"           # 1 admin
psql $env:DATABASE_URL -tAc "select count(*) from usuario_empresa"          # 1
# 7. código
npx tsc --noEmit
npm run lint
npm run test
# 8. login manual
npm run dev   # login con SEED_ADMIN_RUT / SEED_ADMIN_PASSWORD
```

## Preguntas abiertas para Pablo (bloquean Fase B)

- **Q1** ¿OK a `scripts/apply-migrations.ps1` con lista de orden explícita (sin tabla de control), o prefieres aplicar los 35 archivos a mano?
- **Q2** ¿Existe el schema real de `registro_notas_bodega` / `app_audit_log` en el Neon de bazar-naty (para copiar tipos exactos)? Si no, uso los inferidos del §3.4.
- **Q3** Slug de la empresa: ¿`la-esquina-de-las-novedades`?
- **Q4** ¿Probar primero en un branch Neon descartable (hijo de `production`) y recién después en `production`? Recomendado por P4/P5.
- **Q5** RUT, nombre y contraseña del admin inicial (se pasan por env, no se commitean).
