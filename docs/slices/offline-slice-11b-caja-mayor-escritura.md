# Slice 11b (Offline, Fase 1) — Caja Mayor: escritura offline real (registrar + imputación manual)

Contrato Fase A propuesto por Claude (Director Técnico). Depende de
Slice 11a (`caja_movimientos.id` y la FK de `caja_movimiento_notas` ya
son UUID, migración 028 aplicada y verificada en producción — commit
`378fcf2`). Alcance confirmado por Pablo (opción B2): registrar
cobro/gasto **y** imputación manual a nota, offline, en el mismo slice.
Tipo de cambio: Opción B (capturar el valor que el usuario vio al
momento de la entrada, no re-derivar del servidor al sincronizar).

## Prerrequisito manual (Pablo, antes de Fase C)

Agregar `caja_config` al Sync Stream de PowSync Cloud (mismo
procedimiento que Slice 14 para las tablas de Notas de Venta) — sin
esto, `db.getAll`/`db.get` sobre `caja_config` en el cliente siempre
devuelve vacío.

## Hallazgo durante el diseño — bug latente en Slice 8 (lectura)

`AppSchema.ts` declara `caja_movimiento_notas.movimiento_id` como
`column.integer`. El query local de `notas_imputadas`
(`client_page.tsx` línea 190, `WHERE cmn.movimiento_id = m.id`) compara
contra `m.id`, que es el id especial de PowerSync — **siempre texto**.
Antes de la migración 028 esto "funcionaba" solo por la afinidad
dinámica de SQLite (comparar el texto `"42"` contra el entero `42`
coincide); con `id` ahora un UUID real, la comparación deja de
coincidir y `notas_imputadas` quedaría vacío para todo movimiento en
lectura offline — una regresión silenciosa de Slice 8, no causada por
este slice pero expuesta por él. Se corrige acá (ver Contrato).

## Contrato

### `lib/powersync/AppSchema.ts`

- Agregar tabla `caja_config`:
  ```ts
  caja_config: new Table({
    clave: column.text,
    valor: column.text,
    updated_at: column.text,
    updated_por: column.text,
  }),
  ```
- Corregir `caja_movimiento_notas.movimiento_id`: `column.integer` →
  `column.text` (bugfix, ver hallazgo arriba).

### `app/(app)/caja-mayor/page.tsx`

Agregar prop nueva `userId={parseInt((session.user as any).id, 10)}` a
`<CajaMayorClient>` — necesaria para poblar `usuario_id` en el INSERT
local (el servidor, en el flujo online, siempre lo deriva de la sesión;
para el INSERT local offline no hay sesión de servidor disponible en
ese momento, así que viaja como prop, igual que `userName` ya viaja
hoy).

### `app/(app)/caja-mayor/client_page.tsx`

- `CajaMayorClient`/`CajaMayorContent`: recibir y pasar `userId: number`.
- **`refrescarDolar`** (efecto de `dolarVigente`): si `OFFLINE_READ &&
  db`, reemplazar el `fetch('/api/caja/config')` por lectura local:
  ```ts
  const row = await db.get<{ valor: string }>(
    `SELECT valor FROM caja_config WHERE clave = 'dolar_dia'`
  );
  const valor = parseFloat(row?.valor ?? '0');
  if (valor > 0) setDolarVigente(valor);
  ```
  Este es el valor que queda "capturado" en el estado del componente —
  es lo que el usuario ve en el formulario en el momento de registrar,
  offline u online.
- **Efecto de `notasPendientes`**: si `OFFLINE_READ && db`, reemplazar
  el `fetch('/api/caja/notas/${cliente.cliente_id}')` por lectura local
  que replica la misma query (`prenotas` + `prenota_items` +
  `caja_movimiento_notas`, agrupado por nota, mismo orden pendientes-
  primero/fecha ASC que hoy):
  ```ts
  const notas = await db.getAll(
    `SELECT p.id, p.created_at AS fecha, p.cliente_id, p.nombre_cliente,
       COALESCE(SUM(pi.unidades * pi.precio), 0) AS total
     FROM prenotas p
     LEFT JOIN prenota_items pi ON pi.prenota_id = p.id
     WHERE p.cliente_id = ?
     GROUP BY p.id`,
    [cliente.cliente_id]
  );
  const pagos = await db.getAll(
    `SELECT prenota_id, SUM(monto_aplicado) AS total
     FROM caja_movimiento_notas GROUP BY prenota_id`
  );
  // merge en JS: total_pagado = pagos[nota.id] ?? 0, saldo_pendiente = total - total_pagado
  // mismo filtro (saldo_pendiente > 0.005, empresa) y mismo sort que el fetch online.
  ```
- **`handleSubmit`**: si `OFFLINE_READ && db`, antes del `fetch(POST
  /api/caja/movimientos)`, rama offline:
  1. Si `moneda === 'ARS'` y `dolarVigente <= 0`: `toast.error('Dólar
     del día no disponible offline')`, `return` (mismo criterio de
     bloqueo que el 422 del servidor hoy, pero validado client-side
     porque no hay round-trip disponible).
  2. `const movimientoId = crypto.randomUUID();`
  3. Calcular localmente lo que hoy calcula el servidor:
     ```ts
     const tipoCambio = moneda === 'ARS' ? dolarVigente : null;
     const montoUsd = moneda === 'ARS'
       ? roundUpToHalf(parseFloat(monto) / dolarVigente)
       : parseFloat(monto);
     ```
  4. `db.execute(INSERT INTO caja_movimientos (id, fecha, tipo, kcodcli2, nombre_cliente, cuenta_id, moneda, monto, monto_usd, tipo_cambio, forma_pago, observaciones, empresa, es_credito, usuario_id, usuario_nombre, created_at, updated_at) VALUES (...))`
     con los mismos valores que arma `body` hoy (línea 570-582) más
     `tipoCambio`/`montoUsd` calculados, `userId`/`userName`, y
     timestamps `new Date().toISOString()`.
  5. Imputación manual (mismo bloque de condición que hoy, línea 595:
     `imputacionManual && notaSeleccionada && tipo === 'cobro' &&
     montoUSD`): reutilizar el cálculo de `notasParaImputar` **tal
     cual** (es JS puro, no depende de red) y, en vez del `fetch(POST
     .../notas)`, hacer un `db.execute(INSERT INTO
     caja_movimiento_notas (movimiento_id, prenota_id, monto_aplicado)
     VALUES (?, ?, ?))` por cada entrada — `id` propio de la fila no se
     especifica (PowerSync lo autogestiona, nada más lo referencia).
  6. Reset de formulario, `toast.success(...)`, refetch — igual que la
     rama online.

### `app/api/caja/movimientos/route.ts` (POST)

Aceptar `tipo_cambio_capturado` opcional del body crudo (mismo patrón
que `id` en Slice 11a — fuera del schema Zod, que descarta campos
desconocidos):
```ts
const tipoCambioCapturado = body?.tipo_cambio_capturado ?? null;
```
Si `moneda === 'ARS'` y `tipoCambioCapturado` viene presente y > 0: usar
ese valor directo (`tipo_cambio = tipoCambioCapturado`, `monto_usd =
roundUpToHalf(monto / tipoCambioCapturado)`), **sin** consultar
`caja_config`. Si no viene (flujo online normal, sin cambios): mismo
comportamiento de hoy, deriva de `caja_config`.

**Retry-safety del INSERT** (hallazgo de diseño, no estaba en el
contrato de 11a): si este `uploadData` sube el movimiento y **después**
falla la subida de la imputación (network/500), toda la transacción de
PowerSync se reintenta — incluido el INSERT del movimiento, que ya se
aplicó. Sin protección, el reintento choca contra la PK UUID y el
endpoint no tiene `try/catch`, lo que devolvería un 500 no
recuperable (bucle infinito de reintento). Se agrega idempotencia:
```sql
INSERT INTO caja_movimientos (id, ...) VALUES (...)
ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
RETURNING ...
```
(update no-op sobre sí mismo, solo para que `RETURNING` funcione tanto
en el insert real como en un reintento). El endpoint `.../notas` ya es
idempotente por diseño (`DELETE` + reinsert), no necesita cambio.

### `lib/powersync/BackendConnector.ts`

Dos cambios:

1. Nueva rama `else if (op.table === 'caja_movimientos')`: mismo patrón
   que `prenota_items` (POST a `/api/caja/movimientos` con `id: op.id`
   + todos los campos de `data`, incluyendo `tipo_cambio_capturado:
   data.moneda === 'ARS' ? data.tipo_cambio : undefined`). 400/404/422 →
   descartar + reportar a la bandeja; 401/500/red → no completar,
   reintento.

2. **Post-proceso, después del `for` principal**: agrupar los ops de
   `caja_movimiento_notas` por `movimiento_id` (no se procesan dentro
   del loop principal — se recolectan en un `Map<string, Array<{op,
   data}>>` mientras el loop principal los salta con `continue`). Al
   terminar el loop, por cada grupo: `POST
   /api/caja/movimientos/${movimiento_id}/notas` con `{notas:
   group.map(g => ({prenota_id: g.data.prenota_id, monto_aplicado:
   g.data.monto_aplicado}))}`. Mismo criterio de status: 400/404/422 →
   reportar conflicto (payload = el array completo del grupo, entidad_id
   = movimiento_id) + no bloquear; 401/500/red → `shouldComplete =
   false`, no completar la transacción (el `finally` sigue siendo el
   único lugar donde se decide completar o no, ahora cubriendo ambas
   pasadas).

### No se toca

`app/api/caja/movimientos/[id]/route.ts`, `.../notas/route.ts`,
`caja/resumen/[kcodcli2]/route.ts` (ya adaptados en 11a, sin relación
con escritura offline), edición/eliminación de movimientos (siguen
100% online, no generan ops locales), `caja_cuentas`/`caja_cierres`
(no se crean offline).

## Riesgos a cubrir en Fase B

- **Regresión Slice 8** (bug latente encontrado): `notas_imputadas` en
  lectura local debe seguir funcionando tras el fix de tipo de
  `movimiento_id` — test explícito contra datos con imputaciones reales.
- **Validación de dólar no disponible offline**: intentar registrar un
  cobro en ARS con `dolarVigente <= 0` (nunca se sincronizó
  `caja_config`) → bloquea client-side, no genera INSERT local.
- **Retry-safety**: simular que el INSERT de `caja_movimientos` se
  sube pero la subida de `caja_movimiento_notas` falla con 500 →
  reintento → confirmar que el segundo intento NO duplica el movimiento
  (idempotencia del `ON CONFLICT`).
- **INSERT a DB (remoto) — stock/nota/dólar inconsistente al sync**:
  400/404/422 del endpoint de movimientos → conflicto reportado,
  transacción completa igual (no bloquea cola).
- **Imputación manual — validaciones de negocio (R11-R15)**: solo se
  descubren al sincronizar (offline no valida contra el servidor) —
  test de que un 422 de `.../notas` (ej. nota ya pagada por otro
  dispositivo mientras el primero seguía offline) se reporta a la
  bandeja sin bloquear.
- **Doble evento async**: `handleSubmit` ya tiene `saving` como guard
  — test de regresión de que la rama offline lo respeta igual.
- **Variable/dato requerido ausente**: `caja_config` nunca sincronizado
  (Sync Stream no configurado) → `dolarVigente` en 0 → mismo camino que
  el primer riesgo, cubierto por el mismo test.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios (regresión).
2. Sync Stream con `caja_config` confirmado por Pablo antes de probar.
3. Flag `true`, online: registrar cobro ARS, confirmar en Neon que
   `tipo_cambio`/`monto_usd` coinciden con lo esperado (mismo cálculo
   que hoy, ahora también válido para la rama offline).
4. Flag `true`, offline: registrar cobro ARS sin red → aparece al
   instante con el `tipo_cambio` capturado. Reconectar, confirmar en
   Neon que llegó con ese mismo tipo de cambio (no uno recalculado al
   momento del sync).
5. Offline, cobro con imputación manual a una nota → reconectar →
   confirmar en Neon que `caja_movimiento_notas` tiene el vínculo
   correcto, con el mismo `movimiento_id` generado localmente.
6. Suite completa sin regresiones, `npm run build` limpio.

## Seguimiento (fuera de alcance de este slice)

El mismo problema de retry-safety (INSERT no idempotente ante reintento
parcial de una transacción con múltiples ops) existe también en
`prenota_items` (Slice 10b) — no se corrige acá para no tocar Notas de
Venta sin necesidad. Candidato a slice de limpieza / próximo ponytail
audit.
