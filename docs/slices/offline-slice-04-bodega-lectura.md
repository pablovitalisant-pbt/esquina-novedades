# Slice 4 (Offline, Fase 1) — Bodega, lectura offline real

Contrato Fase A aprobado por Pablo el 2026-08-01. Ver `docs/ARQUITECTURA-OFFLINE.md`
para el contexto completo. Fase 0 (infraestructura) cerrada en los commits
`a32aa09`, `cb922af`, `b3a161c` — todos verificados en producción. Este es
el primer slice de **Fase 1**: primer módulo real del MVP que se toca.

## Objetivo

Migrar la búsqueda de `/bodega` (hoy `fetch('/api/ubicaciones?...')`) a
leer desde el SQLite local sincronizado por PowerSync. **Solo lectura**:
el guardado de conteo físico (`PUT /api/ubicaciones/codigo/[codigo]`)
queda en su fetch actual — se migra en el Slice 5. Declarado, no resuelto
en este slice.

Primer módulo real tocado → va detrás de feature flag en `false` por
defecto (protocolo del proyecto, Fase D). Con el flag apagado, el
comportamiento de producción no cambia.

## Contrato

### Archivos modificados

- **`lib/powersync/AppSchema.ts`** — expandir columnas (verificado contra
  el uso real en `components/BodegaCard.tsx` y
  `app/(app)/bodega/client_page.tsx`, no contra `migrations/` — riesgo de
  drift ya registrado en PRD §10):
  - `productos`: agregar `imagen_url` (`column.text`), `cantcaja`
    (`column.integer`), `umed` (`column.text`), `es_nuevo`
    (`column.integer`, 0/1)
  - `ubicaciones_bodega`: agregar `fisico_cajas` (`column.integer`),
    `fisico_unidades` (`column.integer`), `diferencia` (`column.real`),
    `observaciones` (`column.text`)

- **`app/(app)/bodega/client_page.tsx`** — dentro del `useEffect` de
  búsqueda (líneas ~47-76 actuales): si
  `config/feature-flags.json['bodega-offline-lectura']` es `true`,
  reemplazar el `fetch('/api/ubicaciones?...')` por una consulta local
  vía `usePowerSync()` / `useQuery()` (de `@powersync/react`) que
  replique el mismo `LEFT JOIN` de `app/api/ubicaciones/route.ts`:
  ```sql
  SELECT p.codigo, p.detalle, p.imagen_url as producto_imagen_url, p.saldo, p.cantcaja, p.umed, p.es_nuevo,
         u.id as ubicacion_id, u.ubicacion, u.fisico, u.fisico_cajas, u.fisico_unidades, u.diferencia, u.observaciones
  FROM productos p
  LEFT JOIN ubicaciones_bodega u ON u.codigo = p.codigo
  WHERE (? = '' OR lower(p.codigo) LIKE ? OR lower(p.detalle) LIKE ?)
    AND (? = 0 OR p.saldo > 0)
    AND (? = 0 OR p.es_nuevo = 1)
  ORDER BY p.codigo ASC LIMIT 100
  ```
  Sin filtro de `empresa_id` — redundante en single-tenant, ya excluido
  del schema local. Con el flag en `false`, el código toma el camino
  actual (fetch) sin cambios.
  - Requiere envolver el componente (o un ancestro) en
    `PowerSyncProvider`. Evaluar en Fase C si conviene promover
    `PowerSyncProvider` a `app/(app)/layout.tsx` ahora que hay un segundo
    consumidor real (Slice 2 lo usó solo en `/admin/powersync-status`) —
    si se hace, declararlo explícitamente con justificación en el
    resumen de cierre, no colarlo sin mencionar.

- **`config/feature-flags.json`** — agregar `"bodega-offline-lectura": false`.

### No se toca

`app/api/ubicaciones/route.ts` (sigue existiendo, usado cuando el flag
está en `false`; el Sync Stream no depende de este endpoint, sincroniza
directo desde Neon), `UbicacionEditor` / guardado (Slice 5),
`BodegaCard.tsx` (mismo shape `UbicacionBodegaAgrupada`, sin cambios de
props).

## Revisión de impacto lateral (ya hecha en Fase A, confirmada)

- **Sync Stream `bodega_test`** (PowerSync Dashboard): ya es
  `SELECT * FROM productos` / `SELECT * FROM ubicaciones_bodega` (todas
  las columnas). No requiere cambio de config para que las columnas
  nuevas del schema local lleguen — **pero verificar en Fase D que
  realmente sincronizan**, no asumir solo porque el schema las declara.
- **`app/(app)/layout.tsx`**: pendiente de decidir en Fase C (ver arriba).
- **`types/index.ts`** (`UbicacionBodegaAgrupada`): sin cambios — el
  resultado de la query local debe mapear al mismo shape que ya consume
  `BodegaCard`.
- Ningún otro módulo del MVP se toca.

## Riesgos a cubrir en Fase B

- Con el flag en `false` (default): el build y el comportamiento actual
  de `/bodega` no deben cambiar — test de regresión explícito.
- Con el flag en `true`: la búsqueda local debe devolver los mismos
  resultados que hoy devuelve `/api/ubicaciones` para el mismo término
  (comparar con dato real, no solo con la forma de la query).
- `LIKE` + `lower()` en SQLite local vs. Postgres — verificar que
  resuelve igual (case-insensitivity, acentos si aplica).
- Line count: si el total supera 200 líneas entre schema + hook +
  branching, proponer sub-slices (ej. 4a schema, 4b hook+flag) antes de
  implementar.

## Verificación esperada (Fase D)

1. Flag en `false`: `/bodega` funciona exactamente igual que antes
   (regresión).
2. Flag en `true` (manual, local): buscar un código conocido y comparar
   contra lo que devuelve hoy `/api/ubicaciones?empresa=1&search=<código>`
   — mismos resultados.
3. Confirmar en las DevTools (Network) que con el flag en `true` **no**
   se llama a `/api/ubicaciones` — la búsqueda es 100% local.
4. Simular offline (Network → Offline) con el flag en `true`: la
   búsqueda debe seguir funcionando (dato ya sincronizado localmente).
