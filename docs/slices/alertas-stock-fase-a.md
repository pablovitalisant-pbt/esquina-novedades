# Slice: Alertas de stock bajo — Fase A

**Fecha:** 2026-07-04

**Nota Fase C — cambio de control de acceso:** los 3 endpoints (`route.ts`, `lista/route.ts`,
`[id]/route.ts`) cambiaron el chequeo de rol de `['admin', 'vendedor']` a `['admin', 'bodeguero']`.
Razón: PRD §2 asigna "alertas de stock bajo" al rol Bodega, no a Ventas. El permiso original
para `vendedor` era herencia no revisada del código de Vida Digital. Corregido junto con la
reescritura de los endpoints (mismo principio de "eliminar código legacy sin adaptarlo" de
BUG-004). El rol `bodeguero` existe en `seed.ts` (usuario 'Bodeguero User').

---

## Diseño (verificado contra código, no asumido)

- **Ninguna ruta escribe `productos.saldo`** — confirmado revisando `bodega/registro-notas`,
  `inventario/bulk-save`, `productos/[id]`, `productos/upload`. La detección de "stock bajo"
  es 100% dinámica (query contra el valor actual de `saldo`), no un estado materializado
  que alguien deba mantener.
- **`alertas_stock_bajo` cambia de semántica**: deja de ser "alertas activas" y pasa a ser
  una lista de "productos silenciados" (dismissed). Un row presente = no mostrar esta alerta
  aunque la condición `saldo < stock_minimo` siga cumpliéndose.
- **`productos.no_reponer`**: confirmado que NO existe en `seed.ts`. Se crea con
  `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- **`productos.stock_minimo`**: no existe. Se crea — es el umbral configurable por producto.
- **Schemas `vida`/`sanjh`**: confirmado que no existen en `seed.ts` ni `migrations/`.
  El JOIN de `total_clientes` en `lista/route.ts` se elimina por completo.

---

## Revisión de impacto lateral

- **`bodega/registro-notas`**: no escribe `productos.saldo`. Sin impacto.
- **`inventario/bulk-save`**: no escribe `productos.saldo`. Sin impacto.
- **`productos/[id]/route.ts` (PATCH)**: no toca `no_reponer` ni `stock_minimo`. Sin impacto.
- **`productos/upload`**: no escribe `saldo`. Sin impacto.
- **Kardex** (`app/api/kardex/route.ts`): depende de schemas WinFac — está roto igual,
  no se toca en este slice (deuda registrada en PRD §10).
- **Tests existentes**: `__tests__/api/alertas-stock-china.test.ts` existe —
  habrá que adaptarlo a la nueva semántica.

---

## Archivos del slice

| # | Archivo | Tipo | Líneas estimadas | Descripción |
|---|---------|------|-----------------|-------------|
| 1 | `migrations/010_alertas_stock_bajo.sql` | NEW | ~8 | `ALTER TABLE productos ADD COLUMN IF NOT EXISTS` (no_reponer, stock_minimo) + `CREATE TABLE IF NOT EXISTS alertas_stock_bajo` |
| 2 | `app/api/alertas-stock/route.ts` | EDIT | ~30 (era 24) | GET: contar productos bajo stock mínimo no silenciados |
| 3 | `app/api/alertas-stock/lista/route.ts` | EDIT | ~35 (era 52) | GET: listar productos bajo stock mínimo, eliminar bloque WinFac completo |
| 4 | `app/api/alertas-stock/[id]/route.ts` | EDIT | ~30 (era 48) | PUT: `:id` = `producto_id`. `ignorar` → INSERT en alertas_stock_bajo. `no_reponer` → UPDATE productos SET no_reponer = true |
| 5 | `app/(app)/alertas-stock/page.tsx` | NEW | ~10 | Server component wrapper |
| 6 | `app/(app)/alertas-stock/client_page.tsx` | NEW | ~180 | Tabla con filtros, badge de severidad, botones ignorar/no reponer |
| 7 | `__tests__/api/alertas-stock-china.test.ts` | EDIT | adaptación | Actualizar mocks a nueva semántica (producto_id, no_reponer, stock_minimo) |

**Total: 7 archivos, ~300 líneas nuevas + adaptación de tests existentes.**

---

## Diff propuesto

### Archivo 1: `migrations/010_alertas_stock_bajo.sql`

```sql
-- Slice Alertas de stock bajo: umbral de stock mínimo + tabla de silenciados
-- IF NOT EXISTS en todo — el schema real de productos no es confiable (PRD §10)

ALTER TABLE productos ADD COLUMN IF NOT EXISTS no_reponer BOOLEAN DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo INTEGER;

CREATE TABLE IF NOT EXISTS alertas_stock_bajo (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Archivo 2: `app/api/alertas-stock/route.ts`

```sql
SELECT COUNT(*)::int AS count
FROM productos p
WHERE p.stock_minimo IS NOT NULL
  AND p.saldo < p.stock_minimo
  AND p.no_reponer = false
  AND NOT EXISTS (
    SELECT 1 FROM alertas_stock_bajo a WHERE a.producto_id = p.id
  )
```

Eliminar referencia a `activa` (columna que no existirá en la nueva tabla).

### Archivo 3: `app/api/alertas-stock/lista/route.ts`

```sql
SELECT
  p.id AS producto_id,
  p.codigo,
  p.detalle,
  p.saldo,
  p.stock_minimo,
  (p.stock_minimo - p.saldo) AS deficit
FROM productos p
WHERE p.stock_minimo IS NOT NULL
  AND p.saldo < p.stock_minimo
  AND p.no_reponer = false
  AND NOT EXISTS (
    SELECT 1 FROM alertas_stock_bajo a WHERE a.producto_id = p.id
  )
ORDER BY deficit DESC
```

Eliminar completamente el bloque `vida.itemdcto`/`sanjh.itemdcto` (líneas 24-43 actuales) y la columna `total_clientes`.

### Archivo 4: `app/api/alertas-stock/[id]/route.ts`

Cambio de semántica: `params.id` es `producto_id` (no alerta.id).

```
PUT { accion: "ignorar" }
  → INSERT INTO alertas_stock_bajo (producto_id) VALUES (:id)
    ON CONFLICT (producto_id) DO NOTHING

PUT { accion: "no_reponer" }
  → UPDATE productos SET no_reponer = true WHERE id = :id
    (ya no hace falta SELECT previo a alertas_stock_bajo para sacar el codigo)
```

Eliminar `empresa_id` del SELECT (no existe en la nueva tabla).

### Archivo 5-6: UI nueva

Página `/alertas-stock` con:
- Tabla: código, detalle, saldo, stock mínimo, déficit, badge de severidad
- Severidad: `deficit / stock_minimo` → color (verde < 25%, amarillo 25-50%, rojo > 50%)
- Botón "Ignorar" → PUT `{ accion: "ignorar" }` con `producto_id`
- Botón "No reponer" → PUT `{ accion: "no_reponer" }` con `producto_id`
- Acceso: admin y bodeguero (rol bodega)

### Archivo 7: Tests

`__tests__/api/alertas-stock-china.test.ts` — adaptar mocks:
- `sql` mock debe devolver filas con `producto_id`, `codigo`, `detalle`, `saldo`, `stock_minimo`, `deficit`
- El PUT usa `producto_id` en vez de `alerta.id`
- Eliminar referencias a `empresa_id`, `activa`, `total_clientes`

---

## Fuera de scope

| Ítem | Motivo |
|------|--------|
| Módulo de movimiento de stock (Bodega/despachos) | No existe todavía — `saldo` es estático del seed |
| `empresa_id` en productos | Deuda PRD §9.3.1 |
| Kardex roto (WinFac) | Deuda registrada en PRD §10, slice futuro |
| UI para configurar `stock_minimo` por producto | Se setea directo en la DB por ahora; la UI de edición de producto puede exponerlo en otro slice |

---

## Criterio de éxito

```
npx tsc --noEmit    # 0 errores nuevos en archivos del slice
npm run test        # tests de alertas-stock pasan, sin regresiones en suite completa
```

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Archivos | 7 (1 migración, 3 API, 2 UI, 1 test) |
| Líneas netas | ~300 nuevas |
| Riesgo de regresión | Bajo — `saldo` no lo escribe nadie, detección 100% dinámica |
| Schema riesgoso | Mitigado con `IF NOT EXISTS` en toda la migración |
