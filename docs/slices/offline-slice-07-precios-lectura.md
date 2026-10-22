# Slice 7 (Offline, Fase 1) — Precios/Productos, lectura offline

Contrato Fase A propuesto por Claude (Director Técnico). Ver
`docs/ARQUITECTURA-OFFLINE.md` sección 5 (Fase 1) y los dos slices de
lectura ya cerrados (`offline-slice-04-bodega-lectura.md`,
`offline-slice-06-notas-venta-lectura.md`) — mismo patrón.

## Objetivo

Lectura offline del buscador de Precios (`GET /api/productos?search=...`,
mínimo 2 caracteres) vía SQLite local PowerSync. Módulo 3 de 11 del MVP en
Fase 1.

## Decisión de alcance (misma lógica que Slices 4/6 — solo lectura)

**Solo lectura.** Quedan explícitamente fuera de este slice:

1. **Editar precio/costo/margen** (`PUT /api/productos/[id]`): el servidor
   es la única fuente del cálculo de `prcventa` (invariante anti-drift,
   función `calcularPrecio`) y además propaga el cambio a
   `ubicaciones_bodega.detalle` y a `prenota_items` (descripción, imagen,
   precio) de notas activas sin pagos — tres tablas en una transacción.
   Replicar esto en escritura local violaría el invariante anti-drift
   (un local write no recalcula `prcventa` ni propaga) — no se intenta.
2. **Crear producto** (`POST /api/productos`): admin-only, con chequeo de
   duplicado `(empresa_id, codigo)` server-side. Además casi siempre
   incluye subida de imagen a Cloudinary, que `ARQUITECTURA-OFFLINE.md`
   sección 3 ya declara explícitamente como **no funciona offline**
   (excepción física inevitable). Sin sentido ofrecer creación offline
   cuando la imagen de todos modos requiere red.

## Señal 1 del protocolo — zona frágil conocida (registrada, no bloqueante aquí)

`PRD.md` sección 10: *"`app/api/productos/route.ts` (POST) — Detección de
duplicado `(empresa_id, codigo)` solo probada por regex sobre el código
fuente, no por ejecución real contra DB"*. No aplica a este slice (cero
cambios en `app/api/productos/**`). Queda registrado para cuando se
diseñe creación/escritura offline de Productos en un slice futuro.

## Drift de schema conocido (PRD §10)

`productos.categoria` y `productos.public_id` se usan en código real
(`productos/[id]/route.ts`, `productos/upload/route.ts`) pero no existen
en ninguna migración versionada. El schema local se diseña contra el uso
real en `ProductCard.tsx`/`ProductDrawer.tsx`/`client_page.tsx`, no contra
`migrations/` — mismo criterio ya aplicado en `AppSchema.ts`.

## Contrato

### Archivos modificados

- **`lib/powersync/AppSchema.ts`** — la tabla `productos` ya existe (de
  Bodega, Slice 4) pero le faltan columnas que Precios necesita. Ampliar:
  ```ts
  productos: new Table({
    codigo: column.text,
    detalle: column.text,
    imagen_url: column.text,
    saldo: column.real,
    cantcaja: column.integer,
    umed: column.text,
    es_nuevo: column.integer,
    // — nuevas para Precios —
    prcventa: column.real,
    prcminimo: column.real,
    costo: column.real,
    margen_pct: column.real,
    categoria: column.text,
    stock_minimo: column.real,
    pesocaja: column.real,
    cubicaja: column.real,
  }),
  ```
  No se agrega `cif` ni `nroingreso`: verificado por grep, ningún `.tsx`
  del proyecto los consume — la API los selecciona pero la UI nunca los
  renderiza. No se agrega `empresa_id` ni una tabla `empresas` para
  `nombre_empresa`: `ProductCard.tsx:20` hace `void empresaNombre;` — el
  prop se recibe pero nunca se usa, es dead prop confirmado.
  **Ojo:** esta tabla ya la usa Bodega (Slice 4/5) con flag
  `bodega-offline-lectura` — ampliar columnas no debe romper esa lectura
  existente (es aditivo, columnas nuevas nullable, sin tocar las 7 que
  Bodega ya usa).

- **`app/(app)/precios/client_page.tsx`**: cuando el flag
  `precios-offline-lectura` está activo y hay `db` (`usePowerSync()`,
  requiere montar `PowerSyncProvider` igual que en Bodega/Notas de
  Venta), reemplazar `fetch('/api/productos?...')` en `fetchProducts` por
  una query local que replique el `GROUP BY` de la API:
  ```sql
  SELECT
    p.codigo,
    MAX(p.id) as id,
    MAX(p.detalle) as detalle,
    SUM(p.saldo) as saldo,
    MAX(p.prcventa) as prcventa,
    MAX(p.prcminimo) as prcminimo,
    MAX(p.costo) as costo,
    MAX(p.margen_pct) as margen_pct,
    MAX(p.umed) as umed,
    MAX(p.imagen_url) as imagen_url,
    MAX(p.es_nuevo) as es_nuevo,
    MAX(p.cantcaja) as cantcaja,
    MAX(p.pesocaja) as pesocaja,
    MAX(p.cubicaja) as cubicaja,
    MAX(p.stock_minimo) as stock_minimo,
    MAX(p.categoria) as categoria
  FROM productos p
  WHERE (LOWER(p.codigo) LIKE ? OR LOWER(p.detalle) LIKE ?)
  GROUP BY p.codigo
  HAVING (? = 0 OR SUM(p.saldo) > 0)
     AND (? = 0 OR MAX(p.es_nuevo) = 1)
  ORDER BY p.codigo ASC
  LIMIT 200
  ```
  Ojo: `p.id` en la query local es el `id` autogenerado por PowerSync
  (UUID de texto), no el `SERIAL` de Postgres — en este slice solo se usa
  como `key` de React (`ProductCard`) y no se envía a ningún endpoint de
  escritura (fuera de alcance). No confundir con el caso de Bodega
  Slice 5, donde si importaba el id real por ser parte de una escritura.

  Ojo: `empresa_id` no se filtra (single-tenant, ver PRD §2 — a diferencia
  de la API real que sigue filtrando por `ANY(empresaIds)`, deuda
  heredada). Mantener el mismo umbral de 2+ caracteres antes de
  disparar la query (ya existe en el componente, sin cambios).
  Con `offline=false` el `fetch` original queda intacto.

- **`config/feature-flags.json`**: agregar `"precios-offline-lectura":
  false`.

### No se toca

`app/api/productos/**` completo (GET, POST, PUT, upload), `ProductDrawer.tsx`
(el drawer de detalle sigue leyendo del objeto `producto` ya cargado en
memoria por `client_page.tsx` — no hace fetch propio), los flags
`bodega-offline-lectura` y `notas-venta-offline-lectura`.

### Prerrequisito manual (Pablo, dashboard de PowerSync)

La tabla `productos` **ya está en el Sync Stream** desde Fase 0 (Bodega).
No hace falta tocar el YAML — las columnas nuevas de `productos` replican
automáticamente vía el `SELECT * FROM productos` ya existente.

## Riesgos a cubrir en Fase B

- **Paridad del `GROUP BY`/`HAVING`**: la query real agrupa por `codigo`
  con `SUM(saldo)`, `MAX(...)` y `BOOL_OR(es_nuevo)` — SQLite no tiene
  `BOOL_OR`, usar `MAX(es_nuevo)` sobre el entero (`es_nuevo: column.integer`,
  0/1). Verificar con datos reales que el resultado es idéntico al de
  Postgres, mismo criterio de paridad que Bodega/Notas de Venta.
- **No filtrar por `empresa_id`**: como es single-tenant esto no debería
  cambiar el resultado, pero si en algún momento se reactiva
  multiempresa esto sería una discrepancia real — dejar comentado en el
  código como se hizo con la asimetría de Notas de Venta.
- **Umbral de 2+ caracteres**: confirmar que el guard `debouncedSearch.trim().length >= 2`
  sigue aplicando igual en la rama offline (evitar que la query local
  corra con 0-1 caracteres y devuelva de más).
- **Coexistencia con Bodega**: ampliar `AppSchema.ts` no debe romper
  `bodega-offline-lectura` (test de regresión explícito).
- **`ocultarPrecios`**: es un toggle 100% client-side (localStorage), sin
  lógica de servidor — confirmar que no interfiere con la rama offline
  (no debería, pero vale un test).

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios (regresión), incluida
   la lectura de Bodega si el flag de Bodega está en `true` en el mismo
   entorno de prueba.
2. Flag `true`, online: buscar un producto conocido, comparar resultado
   exacto (todos los campos) contra `GET /api/productos?search=...`.
3. Flag `true`, offline: mismo buscador, sin red, mismos resultados.
4. Producto con `saldo = 0` y checkbox "Solo con stock": confirmar que se
   excluye igual que en la API (paridad del `HAVING`).
