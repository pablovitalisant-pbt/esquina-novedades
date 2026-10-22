# Slice 8 (Offline, Fase 1) — Caja Mayor, lectura offline (vista principal)

Contrato Fase A propuesto por Claude (Director Técnico). Ver
`docs/ARQUITECTURA-OFFLINE.md` sección 5 (Fase 1) y los slices de lectura
ya cerrados (Bodega Slice 4, Notas de Venta Slice 6, Precios Slice 7) —
mismo patrón.

## Objetivo

Lectura offline de la vista principal de Caja Mayor: lista de movimientos
paginada con filtros (`GET /api/caja/movimientos`) + saldos por cuenta
(`GET /api/caja/resumen-cuentas`) — los dos únicos fetches que corren al
montar la página, antes de cualquier interacción del usuario. Módulo 4 de
11 del MVP en Fase 1.

## Decisión de alcance — slice dividido explícitamente

Caja Mayor es el módulo más grande y con más historial de bugs del
proyecto (BUG-001, 004, 005, 006, 008, 009, 010, 013 — todos en este
módulo, ver `BUGS.md`). `client_page.tsx` tiene 1436 líneas y 15 endpoints
API asociados. Migrar todo de una vez violaría el límite de slice
manejable. Se divide así:

- **Slice 8 (este contrato):** vista principal al montar — movimientos +
  saldos por cuenta. Es lo que el usuario ve apenas entra a `/caja-mayor`,
  sin buscar nada.
- **Diferido a Slice 8b (futuro):** resumen de notas por cliente
  (`GET /api/caja/resumen/[kcodcli2]`) y notas pendientes por cliente
  (`GET /api/caja/notas/[kcodcli2]`) — se disparan solo cuando el usuario
  selecciona un cliente.
- **Diferido a Slice 8c (futuro):** búsqueda unificada (`GET
  /api/caja/nota-busqueda`, `GET /api/caja/clientes`) — autocompletado de
  cliente/nota al crear un movimiento.
- **Fuera de alcance de todo Fase 1 offline hasta que exista Fase 2:**
  cualquier escritura (crear/editar/eliminar movimiento, crear/editar
  cierre de período, cargar saldos iniciales). Es dinero — el mismo
  argumento que Notas de Venta (bandeja de conflictos de Fase 2, no
  construida) aplica con más razón acá. No se toca ningún endpoint POST/
  PATCH/DELETE de `app/api/caja/**`.

## Señal 1 del protocolo — zonas frágiles conocidas (registradas, no bloqueantes aquí)

`PRD.md` sección 10 y `BUGS.md` documentan un historial largo de bugs en
este módulo (filtro por vendedor vs cliente, JSX corrupto, tipos rotos,
schemas Zod over-stripped, `saldoAnterior` centinela). Todos ya
**RESUELTOS** según sus entradas — los datos en Neon deberían estar
correctos. Este slice es de solo lectura y no toca ninguno de los
archivos donde ocurrieron esos bugs (`movimientos/route.ts` POST,
`cierres/route.ts` POST, `movimientos/[id]/notas/route.ts`). Se registra
la referencia por si algo se ve inconsistente en la verificación — no
asumir que es un bug nuevo sin revisar primero si coincide con un patrón
ya documentado.

## Drift de schema

`migrations/011_caja_cuentas.sql`, `013_caja_saldos_iniciales.sql`,
`014_caja_movimientos.sql`, `016_caja_cierres.sql` — verificadas contra el
uso real en `app/api/caja/movimientos/route.ts` y
`app/api/caja/resumen-cuentas/route.ts`, coinciden (a diferencia de
`productos`/`prenotas`, este módulo no tiene drift conocido). Aun así,
diseño del schema local contra el código, no contra las migraciones —
mismo criterio que los slices anteriores.

## Contrato

### Archivos modificados

- **`lib/powersync/AppSchema.ts`** — 4 tablas nuevas:
  ```ts
  caja_cuentas: new Table({
    nombre: column.text,
    moneda: column.text,
    activa: column.integer,
    orden: column.integer,
  }),
  caja_movimientos: new Table({
    fecha: column.text,
    tipo: column.text,
    kcodcli2: column.integer,
    nombre_cliente: column.text,
    cuenta_id: column.integer,
    moneda: column.text,
    monto: column.real,
    monto_usd: column.real,
    tipo_cambio: column.real,
    forma_pago: column.text,
    observaciones: column.text,
    empresa: column.text,
    es_credito: column.integer,
    usuario_id: column.integer,
    usuario_nombre: column.text,
    created_at: column.text,
    updated_at: column.text,
  }),
  caja_cierres: new Table({
    fecha_desde: column.text,
    fecha_hasta: column.text,
    resumen: column.text,
    usuario_id: column.integer,
    usuario_nombre: column.text,
    created_at: column.text,
  }),
  caja_saldos_iniciales: new Table({
    cuenta_id: column.integer,
    saldo: column.real,
  }),
  ```
  `caja_movimiento_notas` **ya existe** (Slice 6, Notas de Venta) — se
  reutiliza tal cual para el `ARRAY_AGG` de `notas_imputadas`.

- **`app/(app)/caja-mayor/client_page.tsx`**: cuando el flag
  `caja-mayor-offline-lectura` está activo y hay `db`, reemplazar:
  - `fetchMovimientos`: replicar el filtro NULL-safe de la API
    (`(? IS NULL OR col = ?)` funciona igual en SQLite) + `ORDER BY fecha
    DESC, id DESC LIMIT/OFFSET` + subquery para `notas_imputadas` (SQLite
    no tiene `ARRAY_AGG`, usar `GROUP_CONCAT(prenota_id)` y parsear a
    array en JS) + query separada para `caja_cierres` en el rango de
    fechas (misma lógica de `minFecha`/`maxFecha` que la API).
  - `fetchSaldos`: replicar el `GROUP BY cuenta_id` con `SUM(CASE WHEN
    tipo = ...)` (soportado en SQLite) + join a `caja_saldos_iniciales`
    para el saldo base.
  - Con `offline=false` ambos `fetch` originales quedan intactos.

- **`config/feature-flags.json`**: agregar `"caja-mayor-offline-lectura":
  false`.

### No se toca

`app/api/caja/**` completo (los 15 endpoints, ningún cambio), `resumen/`,
`notas/`, `nota-busqueda/`, `clientes/`, `config/` (quedan para 8b/8c o
fuera de alcance de offline), los flags de los slices anteriores.

### Prerrequisito manual (Pablo, dashboard de PowerSync)

Ampliar el Sync Stream con las 4 tablas nuevas:

```yaml
config:
  edition: 3

streams:
  bodega_test:
    auto_subscribe: true
    queries:
      - SELECT * FROM productos
      - SELECT * FROM ubicaciones_bodega
      - SELECT * FROM prenotas
      - SELECT * FROM prenota_items
      - SELECT * FROM clientes
      - SELECT * FROM caja_movimientos
      - SELECT * FROM caja_movimiento_notas
      - SELECT * FROM caja_cuentas
      - SELECT * FROM caja_cierres
      - SELECT * FROM caja_saldos_iniciales
```

(`caja_movimientos` y `caja_movimiento_notas` ya estaban en el stream
desde Slice 6 — se listan igual por completitud del YAML.)

## Riesgos a cubrir en Fase B

- **Query con más de un JOIN + subquery agregada**: `movimientos` (join a
  `caja_cuentas` + subquery `ARRAY_AGG`/`GROUP_CONCAT`) y `resumen-cuentas`
  (join a `caja_cuentas` + `caja_saldos_iniciales`) — validar `COUNT`
  antes de renderizar, verificar que `GROUP_CONCAT` produce el mismo
  resultado que `ARRAY_AGG` tras parsear en JS.
- **Filtros NULL-safe**: los 6 filtros de `fetchMovimientos` (moneda,
  cuenta, tipo, empresa, desde, hasta) deben comportarse igual vacíos y
  combinados — cubrir con test cada combinación relevante, no solo el
  caso sin filtros.
- **Paginación**: `LIMIT`/`OFFSET` + `total`/`totalPages` deben coincidir
  exactamente con la API para que los controles de paginación no rompan.
- **Cierres dentro del rango de fechas**: replicar la lógica de
  `minFecha`/`maxFecha` (default `2000-01-01` / hoy) — cubrir el caso sin
  filtro de fecha explícito.
- **`resumen` es JSONB en Postgres, texto en SQLite local**: confirmar que
  el `JSON.parse` que ya hace el código funciona igual sobre el valor que
  llega de PowerSync (debería, ya maneja el caso `typeof === "string"`).
- **Rol**: el endpoint permite `admin` y `vendedor`, bloquea el resto — la
  query local debe respetar el mismo control de acceso (verificar cómo:
  ¿guard en `page.tsx` como en Notas de Venta, o solo en el endpoint?).

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios (regresión).
2. Flag `true`, online: movimientos y saldos coinciden exactamente contra
   la API — incluyendo `notas_imputadas`, cierres en rango, y al menos
   una combinación de filtros activos.
3. Flag `true`, offline: misma vista, sin red.
4. Verificar acceso: un rol sin permiso (si aplica un tercer rol adicional
   a admin/vendedor) no debe ver datos de caja offline.
