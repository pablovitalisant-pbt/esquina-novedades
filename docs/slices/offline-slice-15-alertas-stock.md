# Slice 15 (Offline, Fase 1) — Alertas de stock: lectura + escritura offline

Contrato Fase A propuesto por Claude (Director Técnico).

## Por qué es una de las más simples hasta ahora

- `alertas_stock_bajo` tiene FK a `productos(id)`, pero `productos.id`
  nunca se migró a UUID (ningún slice necesitó crear productos offline,
  solo `UPDATE`) y no hace falta acá tampoco: la única escritura nueva
  de `alertas_stock_bajo` es un INSERT idempotente por `producto_id`
  (`ON CONFLICT (producto_id) DO NOTHING`), reutilizando el endpoint
  `PUT /api/alertas-stock/[id]` existente — no hace falta un endpoint
  nuevo.
- La otra acción ("no reponer") es un `UPDATE productos SET no_reponer
  = true` — mismo perfil de riesgo que la reasignación de categoría
  (Slice 12): columna aislada, sin invariante anti-drift.
- Riesgo de duplicado local (visto en sesiones anteriores): si el `id`
  propio de `alertas_stock_bajo` no coincide entre dispositivo y
  servidor, al sincronizar hacia abajo podría aparecer una fila
  duplicada localmente. Acá es inofensivo — ninguna query filtra por el
  `id` de `alertas_stock_bajo`, solo por `producto_id` (`NOT EXISTS
  ... WHERE producto_id = p.id`), así que un duplicado no cambia ningún
  resultado. No se migra a UUID por esto (no se justifica el costo).

## Hallazgo — bug cruzado con Slice 12 (Categorías)

La rama `op.table === 'productos' && op.op === 'PATCH'` en
`BackendConnector.ts` (agregada en Slice 12) hoy manda **siempre**
`{categoria: data.categoria}` como body del `PUT`, sin importar qué
columna cambió realmente. Si este slice agrega una segunda columna
editable offline (`no_reponer`) sobre la misma tabla, un `UPDATE
productos SET no_reponer = ...` local generaría un op que esa rama
interceptaría igual (mismo `table`/`op`) y mandaría `{categoria:
undefined}` — el servidor no vería ningún campo del whitelist presente
y respondería "Nada que actualizar", **el cambio de `no_reponer` nunca
llegaría a Postgres, sin error visible**. Se corrige generalizando la
rama para reenviar `opData` completo (`PUT /api/productos/${op.id}`
con `JSON.stringify(data)` en vez de `{categoria: data.categoria}`) —
el endpoint ya filtra por whitelist server-side, reenviar el objeto
entero es seguro y correcto para cualquier columna aislada futura.

## Contrato

### `lib/powersync/AppSchema.ts`

- `productos.no_reponer: column.integer` (booleano, mismo patrón que
  `es_credito` en `caja_movimientos`).
- Nueva tabla:
  ```ts
  alertas_stock_bajo: new Table({
    // producto_id es el id de PowerSync de `productos` (texto, aunque
    // productos.id sea SERIAL en Postgres) — declarar como texto para
    // que la comparación `a.producto_id = p.id` funcione (mismo bug ya
    // encontrado dos veces: movimiento_id en 11b, cliente_id en 13a).
    producto_id: column.text,
  }),
  ```

### `app/(app)/alertas-stock/client_page.tsx`

- Nuevo flag `alertas-stock-offline-lectura`, envolver en
  `PowerSyncProvider` (wrapper + contenido, mismo patrón).
- `fetchAlertas`: si `OFFLINE_READ && db`, reemplazar el fetch por:
  ```sql
  SELECT p.id AS producto_id, p.codigo, p.detalle, p.imagen_url,
    COALESCE(ub.saldo, p.saldo, 0) AS saldo, p.stock_minimo,
    (p.stock_minimo - COALESCE(ub.saldo, p.saldo, 0)) AS deficit
  FROM productos p
  LEFT JOIN ubicaciones_bodega ub ON ub.codigo = p.codigo
  WHERE p.stock_minimo IS NOT NULL
    AND COALESCE(ub.saldo, p.saldo, 0) < p.stock_minimo
    AND p.no_reponer = 0
    AND NOT EXISTS (SELECT 1 FROM alertas_stock_bajo a WHERE a.producto_id = p.id)
  ORDER BY deficit DESC
  ```
  Sin `empresa_id` (single-tenant, mismo criterio que Bodega/Categorías
  — ni `productos` ni `ubicaciones_bodega` lo exponen localmente).
- `handleAccion`: si offline:
  - `'ignorar'`: `db.execute(INSERT INTO alertas_stock_bajo (producto_id) VALUES (?))`.
  - `'no_reponer'`: `db.execute(UPDATE productos SET no_reponer = 1 WHERE id = ?)`.
  - Ambos casos: mismo `setProductos(prev => prev.filter(...))` +
    `refreshStockBajo()` + toast que ya existen.

### `lib/powersync/BackendConnector.ts`

- **Corregir** la rama existente `productos` PATCH (hallazgo arriba):
  `body: JSON.stringify(data)` en vez de `{categoria: data.categoria}`.
- Nueva rama `op.table === 'alertas_stock_bajo' && op.op === 'PUT'`:
  reutiliza el endpoint existente, sin crear uno nuevo:
  ```ts
  fetch(`/api/alertas-stock/${data.producto_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion: 'ignorar' }),
  });
  ```
  `res.ok` → continue. 401/500/red → reintento. (El endpoint no tiene
  ningún camino de error de negocio para `accion: 'ignorar'` — el
  `INSERT ... ON CONFLICT DO NOTHING` es idempotente por diseño — no
  hace falta rama 400/404.)

### `config/feature-flags.json`

Nuevo flag `alertas-stock-offline-lectura: false`.

### Fuera de alcance — `contexts/AlertasContext.tsx`

El contador de la campanita (`stockBajoCount`, usado en nav) sigue
siendo un `fetch('/api/alertas-stock')` puro, sin rama offline. Ya
falla en silencio (`catch {}`) y mantiene el último valor conocido — no
se rompe, pero tampoco se actualiza offline. Corregirlo bien requeriría
un `PowerSyncProvider` montado globalmente en el layout raíz (hoy cada
módulo monta el suyo por separado, scopeado a su propia página) — un
cambio de arquitectura más grande que este slice. Lo dejo señalado, no
resuelto: decime si querés que lo aborde como slice aparte.

### No se toca

`app/api/alertas-stock/lista/route.ts`, `app/api/alertas-stock/route.ts`,
`app/api/alertas-stock/[id]/route.ts` (los tres se reutilizan tal cual).

## Riesgos a cubrir en Fase B

- **INSERT idempotente**: test de que "ignorar" offline, sincronizado
  dos veces (ej. reintento), no falla — `ON CONFLICT DO NOTHING` ya lo
  cubre server-side, test de regresión de que el flujo no rompe la cola
  ante un posible reintento.
- **Regresión Categorías (hallazgo)**: test explícito de que un `UPDATE
  productos SET categoria = ...` (Slice 12) sigue funcionando
  exactamente igual después de generalizar la rama a `opData` completo.
- **UPDATE a DB (no_reponer)**: test de que el local `opData` de esta
  columna llega correctamente al servidor tras el fix.
- **Doble evento async**: `savingId` ya es guard existente, sin cambios
  — test de regresión de que la rama offline lo respeta.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios.
2. Flag `true`, online: "Ignorar" y "No reponer" sobre un producto de
   prueba — funcionan igual.
3. Flag `true`, offline: mismas dos acciones sin red → producto
   desaparece de la lista local al instante. Reconectar, confirmar en
   Neon que `alertas_stock_bajo`/`productos.no_reponer` quedaron
   correctos.
4. Regresión cruzada: reasignar categoría de un producto (Slice 12)
   sigue funcionando tras el fix de la rama `productos` PATCH.
5. Suite completa sin regresiones, `npm run build` limpio.
