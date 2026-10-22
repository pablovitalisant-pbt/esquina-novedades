# Sub-slice 1 Backend — Fase B: Análisis de riesgos

## Riesgo 1: GET lista/route.ts — query sin WinFac

**Código actual:** JOIN monstro con `vida.itemdcto`/`vida.movidcto` UNION `sanjh.*`, columna `total_clientes`.
**Código nuevo:** query contra `productos` con `stock_minimo`, `deficit`, `NOT EXISTS alertas_stock_bajo`.

**Test:** Inspeccionar `sql.mock.calls` y verificar que la query:
- Contiene `stock_minimo` y `deficit` (nuevo)
- NO contiene `vida`, `sanjh`, `total_clientes` (eliminado)
- Tiene `NOT EXISTS (SELECT 1 FROM alertas_stock_bajo)`
→ **Falla ahora** (la query actual tiene `vida.itemdcto`, no tiene `stock_minimo` ni `deficit` ni `NOT EXISTS`).

## Riesgo 2: GET route.ts — contar productos bajo stock mínimo

**Código actual:** `SELECT COUNT(*) FROM alertas_stock_bajo WHERE activa = true`
**Código nuevo:** `SELECT COUNT(*) FROM productos WHERE stock_minimo IS NOT NULL AND saldo < stock_minimo AND no_reponer = false AND NOT EXISTS alertas_stock_bajo`

**Test:** Inspeccionar `sql.mock.calls` y verificar que la query contiene `productos`, `stock_minimo`, `no_reponer`.
→ **Falla ahora** (la query actual consulta `alertas_stock_bajo` con `activa`).

## Riesgo 3: PUT [id]/route.ts — semántica producto_id

**Código actual:** `UPDATE alertas_stock_bajo SET activa = false WHERE id = :id` (ignorar)
**Código nuevo:** `INSERT INTO alertas_stock_bajo (producto_id) VALUES (:id) ON CONFLICT DO NOTHING` (ignorar)

**Test:** Inspeccionar `sql.mock.calls` y verificar que la acción "ignorar" usa `INSERT INTO alertas_stock_bajo` con `ON CONFLICT`.
→ **Falla ahora** (la query actual usa `UPDATE alertas_stock_bajo SET activa = false`).

## Riesgo 4: PUT no_reponer — UPDATE productos sin SELECT previo

**Código actual:** `SELECT codigo, empresa_id FROM alertas_stock_bajo WHERE id = :id`, luego `UPDATE productos SET no_reponer = true WHERE codigo = :codigo`
**Código nuevo:** `UPDATE productos SET no_reponer = true WHERE id = :id` (directo, :id = producto_id)

**Test:** Inspeccionar `sql.mock.calls` y verificar que "no_reponer" hace `UPDATE productos SET no_reponer = true WHERE id = :id` sin SELECT previo.
→ **Falla ahora** (el código actual hace SELECT + UPDATE con codigo).

## Riesgo 5: Respuesta 401 sin sesión (regresión)

**Test:** Mismo test existente (línea 49-53 de alertas-stock-china.test.ts). Debe seguir pasando.
→ **Safety net** — debe pasar ahora y después.

## Riesgo 6: `stock_minimo` NULL para todos los productos → 0 resultados

**Test:** Mockear `sql` para que la query de count devuelva `[{ count: 0 }]` cuando no hay productos con `stock_minimo` configurado.
→ **Safety net** — sin falsos positivos.

## Plan de tests

Reemplazar `__tests__/api/alertas-stock-china.test.ts` completamente. El test de 401 se preserva.
4 tests en rojo (riesgos 1-4) + 2 safety nets (riesgos 5-6) = 6 tests.
