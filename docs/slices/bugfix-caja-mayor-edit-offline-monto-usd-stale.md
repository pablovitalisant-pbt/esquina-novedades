# Bugfix — Editar movimiento offline no actualiza monto_usd (tabla muestra monto viejo)

Causa raíz confirmada con evidencia dura (sondas DIAG-canary, commits
`9290f85`/`c26ca59`, a revertir en este mismo fix):

- Sonda 1 (`handleEditSave`): el `UPDATE` bindea `monto: 7` correctamente.
- Sonda 2 (watcher, lectura directa a SQLite post-UPDATE): confirma
  `monto: 7` ya en la DB local, sin demora.
- El watcher de BUG-055 (`onChangeWithCallback`) se dispara correctamente
  y `fetchMovimientos` corre de nuevo — la reactividad funciona bien.

El dato está bien desde el primer instante. El bug está en qué campo se
muestra: `app/(app)/caja-mayor/client_page.tsx:1708` renderiza
`formatMonto((item.data.monto_usd ?? item.data.monto), "USD")` — prioriza
`monto_usd` sobre `monto`. El `UPDATE` offline de `handleEditSave`
(línea ~750-762) **no incluye `monto_usd` en su SET** — solo actualiza
`monto`, dejando `monto_usd` con el valor de cuando se creó el
movimiento. Como `monto_usd` nunca es `null`, el `??` nunca cae al valor
nuevo — la tabla sigue mostrando el monto_usd viejo indefinidamente
(hasta que la sincronización a Postgres, que sí recalcula bien, vuelve a
bajar la fila corregida — de ahí que "se vea bien después de reconectar
y refrescar varias veces").

Confirmado que la ruta online (`app/api/caja/movimientos/[id]/route.ts`,
líneas 61-96) SÍ recalcula `monto_usd`/`tipo_cambio` correctamente al
editar:
- Moneda USD → `monto_usd = monto`, `tipo_cambio = null`.
- Moneda ARS y (cambió moneda o cambió monto) → `monto_usd =
  roundUpToHalf(monto / dolar_dia)`, `tipo_cambio = dolar_dia` (lee
  `caja_config`, 422 si no está configurado).
- ARS sin cambios → preserva `monto_usd`/`tipo_cambio` existentes.

La rama offline nunca replicó esta lógica — hueco real del fix original
de BUG-054, no relacionado con BUG-055.

## Fix

`app/(app)/caja-mayor/client_page.tsx`, `handleEditSave` (rama offline):
calcular `monto_usd`/`tipo_cambio` con la misma lógica que la ruta
online, usando el `dolarVigente` que el módulo ya trackea (mismo patrón
usado en `handleSubmit` para crear un movimiento), e incluirlos en el
`UPDATE`:

```ts
if (OFFLINE_READ && db) {
  let montoUsdEdit: number;
  let tipoCambioEdit: number | null;
  if (editMoneda === "USD") {
    montoUsdEdit = parseFloat(editMonto);
    tipoCambioEdit = null;
  } else {
    if (dolarVigente <= 0) {
      toast.error("Dólar del día no disponible offline");
      setEditSaving(false);
      return;
    }
    montoUsdEdit = roundUpToHalf(parseFloat(editMonto) / dolarVigente);
    tipoCambioEdit = dolarVigente;
  }

  const updateParams = [
    body.fecha, body.tipo, body.cliente_id, body.nombre_cliente, body.cuenta_id,
    body.moneda, body.monto, montoUsdEdit, tipoCambioEdit, body.forma_pago,
    body.observaciones, body.empresa, body.es_credito ? 1 : 0,
    new Date().toISOString(), editMov.id,
  ];
  await db.execute(
    `UPDATE caja_movimientos SET
       fecha = ?, tipo = ?, kcodcli2 = ?, nombre_cliente = ?, cuenta_id = ?,
       moneda = ?, monto = ?, monto_usd = ?, tipo_cambio = ?, forma_pago = ?,
       observaciones = ?, empresa = ?, es_credito = ?, updated_at = ?
     WHERE id = ?`,
    updateParams
  );
  toast.success("Movimiento actualizado offline — se sincronizará cuando haya conexión");
  setEditModalOpen(false);
}
```

Ajustar nombres exactos de variables (`editMonto`, `editMoneda`,
`dolarVigente`, `roundUpToHalf`) contra el archivo real — ya están en
scope del componente (usados en otras partes del mismo archivo,
confirmado por lectura directa).

Nota: **no** se replica R27 (auto-ajuste de imputaciones si `monto_usd`
baja) offline — es lógica server-side compleja que consulta
`caja_movimiento_notas` y no está en el alcance de este bugfix. Si el
usuario reduce el monto de un cobro con imputación ya aplicada estando
offline, el ajuste de imputaciones va a quedar pendiente hasta que
sincronice (mismo patrón de "no replicar lógica compleja offline" usado
en Slice 17/18).

## Limpieza (mismo commit)

Revertir las sondas DIAG-canary de los commits `9290f85` y `c26ca59` —
ya cumplieron su propósito (confirmaron causa raíz). Volver:
- El watcher a su forma de `7e778eb` (sin logs, sin lectura extra a
  SQLite, sin `editedMovIdRef`).
- `handleEditSave` sin el `console.log` del UPDATE.
- Sacar el `useRef` agregado si ya no se usa para nada más.

## No se toca

- El watcher de BUG-055 (`onChangeWithCallback`) en sí — funciona
  correctamente, confirmado por evidencia.
- La ruta online — ya está bien.
- `handleSubmit` (creación) — ya calcula `monto_usd` bien desde el
  inicio (confirmado, Opción B ya implementada).

## Verificar

1. Offline, moneda USD: editar el monto de un movimiento → la tabla
   muestra el monto nuevo de inmediato, sin reconectar ni refrescar.
2. Offline, moneda ARS: editar el monto → `monto_usd` se recalcula con
   `dolarVigente` local, se ve de inmediato.
3. Offline, ARS, `dolarVigente` no disponible (0) → bloquear con
   mensaje claro, igual que en creación.
4. Reconectar → confirmar en Neon que `monto`, `monto_usd` y
   `tipo_cambio` quedaron consistentes con lo que la ruta online habría
   calculado.
5. Regresión: editar online sigue funcionando igual que antes.
6. `npm run build` limpio, suite sin regresiones. DIFF antes de commit.
