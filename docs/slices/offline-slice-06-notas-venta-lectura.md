# Slice 6 (Offline, Fase 1) — Notas de Venta, lectura offline

Contrato Fase A aprobado por Pablo el 2026-08-01. Ver `docs/ARQUITECTURA-OFFLINE.md`
sección 5 (Fase 1) y `docs/slices/offline-slice-04-bodega-lectura.md` (mismo
patrón aplicado a Bodega, commit `0908f16`, ya verificado en producción).

## Objetivo

Lectura offline de Notas de Venta: lista propia del usuario (`GET
/api/notas-venta`) y detalle con items (`GET /api/notas-venta/[id]`), vía
SQLite local PowerSync. Módulo 2 de 11 del MVP en Fase 1.

## Decisión de alcance (aprobada explícitamente por Pablo, no diferida en silencio)

**Solo lectura.** La escritura (agregar/editar/eliminar ítems, anular nota,
marcar como pagada) queda fuera de este slice. Razón: toda escritura que
afecta stock necesita la bandeja de revisión de conflictos definida en
`ARQUITECTURA-OFFLINE.md` sección 4, que es Fase 2 y todavía no existe. Los
endpoints de escritura (`items/route.ts`, `items/[itemId]/route.ts`) validan
stock server-side con `UPDATE ... WHERE saldo >= cantidad` — un write local
sin esa validación podría sobrevender stock sin forma de resolverlo. Se
retoma cuando exista la bandeja de conflictos.

## Señal 1 del protocolo — zona frágil conocida (registrada, no bloqueante aquí)

`app/api/notas-venta/[id]/items/[itemId]/route.ts` (DELETE) tiene entrada en
`PRD.md` sección 10: ventana de carrera que puede duplicar la restauración de
stock si un DELETE de item individual coincide con la anulación de la nota
completa. Este slice **no toca ese archivo** (cero cambios en `app/api/`).
Queda registrado: cuando se diseñe escritura offline de Notas de Venta en un
slice futuro, revisar ese fix antes de proceder (Señal 1 se activa de verdad
recién ahí).

## Drift de schema conocido (no confiar en `migrations/`)

`migrations/001_prenotas.sql` no incluye la columna `estado`, que sí se usa
en el código real (`WHERE p.estado != 'anulada'`, `estado = 'activa'`).
`migrations/002_prenota_items.sql` tiene `saldo_zofri`, pero el código real
usa `stock_referencia` (renombrado en migración 017, ver PRD §9.3.12). El
schema local de PowerSync se diseña contra el **uso real en el código**
(`app/api/notas-venta/**`, `client_page.tsx`), replicando el mismo criterio
ya aplicado en `AppSchema.ts` para `productos`/`ubicaciones_bodega`.

## Contrato

### Archivos modificados

- **`lib/powersync/AppSchema.ts`** — agregar 5 tablas:

  ```ts
  prenotas: new Table({
    titulo: column.text,
    titulo_base: column.text,
    usuario_id: column.integer,
    cliente_id: column.integer,
    nombre_cliente: column.text,
    estado: column.text,
    updated_at: column.text,
  }),
  prenota_items: new Table({
    prenota_id: column.integer,
    codigo: column.text,
    descripcion: column.text,
    imagen_url: column.text,
    empresa_id: column.integer,
    cajas: column.integer,
    unidades: column.integer,
    precio: column.real,
    stock_referencia: column.integer,
    created_at: column.text,
  }),
  clientes: new Table({
    nombre: column.text,
    telefono: column.text,
    direccion: column.text,
    notas: column.text,
  }),
  caja_movimientos: new Table({
    tipo: column.text,
  }),
  caja_movimiento_notas: new Table({
    movimiento_id: column.integer,
    prenota_id: column.integer,
    monto_aplicado: column.real,
  }),
  ```

  `caja_movimientos`/`caja_movimiento_notas` solo necesitan las columnas que
  participan del cálculo de `total_pagado` (join + `CASE WHEN tipo =
  'reembolso'`) — no se replica la tabla completa de caja, sería alcance de
  un slice de Caja Mayor futuro.

- **`app/(app)/notas-venta/client_page.tsx`**: cuando el flag
  `notas-venta-offline-lectura` está activo y hay `db` (`usePowerSync()`),
  reemplazar el `fetch('/api/notas-venta')` por una query local que replique
  `GET /api/notas-venta`:
  ```sql
  SELECT p.*,
    COALESCE((SELECT SUM(pi.unidades * pi.precio) FROM prenota_items pi WHERE pi.prenota_id = p.id), 0) as total,
    COALESCE((SELECT SUM(cmn.monto_aplicado) FROM caja_movimiento_notas cmn WHERE cmn.prenota_id = p.id), 0) as total_pagado
  FROM prenotas p
  WHERE p.usuario_id = ? AND p.estado != 'anulada'
  ORDER BY p.estado ASC, p.updated_at DESC
  ```
  Ojo: la query real de referencia resta reembolsos (`CASE WHEN cm.tipo =
  'reembolso' THEN -monto ELSE monto`) en el detalle pero NO en la lista
  (bug preexistente o intencional del código actual — replicar tal cual
  está en `/api/notas-venta/route.ts`, no “corregirlo” en este slice).
  Con `offline=false` el `fetch` original queda intacto.

- **`app/(app)/notas-venta/[id]/client_page.tsx`**: mismo flag, reemplazar
  `fetch('/api/notas-venta/[id]')` por queries locales replicando `GET
  /api/notas-venta/[id]` (prenota + items + join a clientes para
  `cliente_nombre` + cálculo de `total_pagado` con el `CASE WHEN tipo =
  'reembolso'` sí incluido, tal como está en el endpoint real).

- **`config/feature-flags.json`**: agregar `"notas-venta-offline-lectura":
  false`.

### No se toca

Ningún archivo bajo `app/api/notas-venta/`, ningún archivo de escritura de
stock (`items/route.ts`, `items/[itemId]/route.ts`, `reembolsar/route.ts`,
`pagar/route.ts`), el flag `bodega-offline-lectura`.

### Prerrequisito manual (Pablo, dashboard de PowerSync)

Ampliar el Sync Stream para incluir las 5 tablas nuevas:

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
```

(Se mantiene el nombre `bodega_test` por continuidad con Fase 0 — es un
stream de todo el negocio, single-tenant, no específico de un módulo. Un
rename es cosmético y no bloquea este slice.)

## Riesgos a cubrir en Fase B

- **Renderizado condicional según rol** (`bodeguero` recibe 403 en el
  endpoint real) — la query local debe excluir notas a un usuario con rol
  `bodeguero`, o el guard de UI debe bloquear el acceso antes de correr la
  query. Verificar cuál de los dos mecanismos aplica y cubrirlo con test.
- **Query con más de un JOIN** (detalle: `prenota_items` +
  `caja_movimiento_notas` + `caja_movimientos` + `clientes`) — validar
  `COUNT` antes de renderizar, evitar row explosion.
- **Paridad de cálculo** `total` / `total_pagado` / `saldo_pendiente` entre
  SQL server (Neon) y réplica local (SQLite) — mismo patrón de riesgo que
  Bodega Slice 4, pero con un join encadenado adicional.
- **Discrepancia intencional lista vs. detalle** (reembolsos restados solo
  en detalle, no en lista) — test que confirme que la réplica local
  preserva esa asimetría en vez de "corregirla".
- Variable de entorno / flag requerido — verificar que
  `notas-venta-offline-lectura: false` no rompe el comportamiento actual
  (regresión).

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios (regresión).
2. Flag `true`, online: lista y detalle de Notas de Venta coinciden
   exactamente con lo que devuelve la API (paridad byte a byte, mismo
   criterio que Bodega Slice 4).
3. Flag `true`, offline (sin visitar antes en esta sesión): lista y detalle
   cargan desde SQLite local sin red.
4. Usuario con rol `bodeguero`: confirmar que no ve notas de venta offline
   (paridad con el 403 del endpoint real).
