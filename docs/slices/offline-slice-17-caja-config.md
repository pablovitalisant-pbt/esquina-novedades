# Slice 17 (Offline, Fase 1) — Config de Caja

Contrato Fase A. Alcance confirmado por Pablo — Opción B:

- **Dólar del día**: lectura + escritura offline completa (tabla
  `caja_config` ya existe en `AppSchema.ts` desde 11b, sin migración).
- **Cuentas bancarias**: lectura offline completa; editar/activar/
  desactivar una cuenta **existente** offline; **crear cuenta nueva**
  bloqueado offline con mensaje claro (evita migrar `caja_cuentas.id`
  a UUID — está referenciada en `caja_movimientos`, `notas-venta
  pagar/reembolsar`, `caja/export`, `caja/resumen-cuentas` — cascada
  del tamaño de Clientes 13a para una acción de configuración inicial
  que casi nunca se repite).
- **Saldos iniciales**: lectura offline completa; editar (upsert sobre
  fila existente) y eliminar un saldo **existente** offline; **crear
  saldo nuevo** bloqueado offline con el mismo mensaje claro (mismo
  motivo: nueva fila con id server-generado).

## Hallazgo de impacto lateral — obligatorio, no opcional

`app/(app)/admin/caja-config/page.tsx` es un **Server Component**: hace
las 3 queries (`caja_config`, `caja_cuentas`, `caja_saldos_iniciales`)
en el servidor y pasa los datos como props a `CajaConfigClient`. Es el
único módulo offline hasta ahora con este patrón — todos los demás son
Client Component con `fetch` en `useEffect`, que es donde se intercepta
la rama offline. Acá no hay ningún `fetch` que interceptar, así que la
pantalla no puede funcionar offline sin refactor. Cambio obligatorio:

- `page.tsx` queda solo con el guard de admin + `getServerSession` (para
  pasar `currentUserNombre`) y renderiza `<CajaConfigClient
  currentUserNombre={...} />` sin las 3 queries ni el resto de props.
- La carga inicial (dólar, cuentas, saldos) se mueve a `useEffect`
  dentro de `CajaConfigClient` — online: 3 `fetch` en paralelo a los
  endpoints existentes; offline: 3 queries locales.

## Contrato

### `lib/powersync/AppSchema.ts`

`caja_cuentas` y `caja_saldos_iniciales` ya existen (declaradas en
Slice 8 para lectura de nombres/monedas dentro de Caja Mayor) pero les
faltan columnas para esta pantalla. Se agregan, no se reemplazan:

```ts
caja_cuentas: new Table({
  nombre: column.text,
  moneda: column.text,
  activa: column.integer,
  orden: column.integer,
  created_at: column.text, // nuevo
}),
...
caja_saldos_iniciales: new Table({
  cuenta_id: column.integer,
  saldo: column.real,
  fecha: column.text,          // nuevo
  observaciones: column.text,  // nuevo
  creado_por: column.text,     // nuevo
  created_at: column.text,     // nuevo
}),
```

`cuenta_id` se queda `integer` (no `text`) a propósito: bajo Opción B
`caja_cuentas.id` nunca migra a UUID, así que no aplica el patrón de
bug latente de ids-siempre-texto (que sí aplicaría si algún día se
migrara). No tocar.

### `app/(app)/admin/caja-config/page.tsx`

Reescribir a solo:
```tsx
export default async function CajaConfigPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "admin") redirect("/dashboard");
  return <CajaConfigClient currentUserNombre={(session.user as any).nombre} />;
}
```
Se eliminan las 3 queries `sql` y los props `initialConfig`/
`initialCuentas`/`initialSaldos`.

### `app/(app)/admin/caja-config/client_page.tsx`

- Nuevo flag `caja-config-offline-lectura`. Wrapper `CajaConfigClient`
  gatea `PowerSyncProvider` igual que Usuarios/Categorías; el contenido
  actual pasa a `CajaConfigContent`.
- `CajaConfigContent` ya no recibe `initialConfig`/`initialCuentas`/
  `initialSaldos` como props — los tres arrancan vacíos/`null` y se
  cargan en un `useEffect` al montar:
  - **Online** (u `OFFLINE_READ` false): 3 `fetch` en paralelo —
    `GET /api/caja/config`, `GET /api/caja/cuentas`, `GET
    /api/caja/saldos-iniciales` — igual a lo que hacía `page.tsx`.
  - **Offline** (`OFFLINE_READ && db`):
    ```sql
    -- dólar del día
    SELECT valor, updated_at, updated_por FROM caja_config WHERE clave = 'dolar_dia'

    -- cuentas
    SELECT id, nombre, moneda, activa, orden, created_at
    FROM caja_cuentas ORDER BY orden ASC, id ASC

    -- saldos iniciales
    SELECT si.id, si.cuenta_id, si.fecha, si.saldo, si.observaciones, si.created_at,
      cc.nombre AS cuenta_nombre, cc.moneda AS cuenta_moneda
    FROM caja_saldos_iniciales si
    JOIN caja_cuentas cc ON cc.id = si.cuenta_id
    ORDER BY cc.orden ASC
    ```
    Mapeo obligatorio (mismo patrón id-texto-a-number ya usado en
    Usuarios, aplicado acá a `activa`/`id`/`cuenta_id` por ser booleano
    0/1 e ids que ya son int en Postgres pero llegan como texto desde
    PowerSync): `id: Number(r.id)`, `activa: !!Number(r.activa)`,
    `cuenta_id: Number(r.cuenta_id)`.

- **`handleSaveDolar`** — offline permitido siempre (no crea fila
  nueva, es upsert por `clave` fija, la fila ya existe localmente por
  sync). Rama offline:
  ```ts
  if (OFFLINE_READ && db) {
    await db.execute(
      `UPDATE caja_config SET valor = ?, updated_at = ?, updated_por = ? WHERE clave = 'dolar_dia'`,
      [String(num), new Date().toISOString(), currentUserNombre]
    );
    setDolarInfo({ dolar_dia: num, updated_at: new Date().toISOString(), updated_por: currentUserNombre });
    toast.success(`Dólar actualizado a $${num} (se sincronizará)`);
    setDolarSaving(false);
    return;
  }
  ```
  Nota: si la fila `clave='dolar_dia'` no existe aún localmente
  (dispositivo nunca sincronizó antes de ir offline — caso borde, la
  config siempre se sincroniza en el primer login online) el UPDATE
  afecta 0 filas y no genera operación CRUD; no se resuelve en este
  slice, mismo criterio que ya se aceptó para `refrescarDolar` en 11b.

- **`handleSaveCuenta`** — bloqueo offline solo al crear
  (`!editingCuenta`):
  ```ts
  if (!editingCuenta && !navigator.onLine) {
    toast.error('Crear una cuenta nueva requiere conexión a internet.');
    return;
  }
  ```
  Rama offline de edición (`editingCuenta` truthy, `OFFLINE_READ && db`):
  ```ts
  await db.execute(
    `UPDATE caja_cuentas SET nombre = ?, moneda = ?, orden = ? WHERE id = ?`,
    [formNombre.trim(), formMoneda, parseInt(formOrden, 10) || 0, editingCuenta.id]
  );
  ```
  actualiza estado local optimista, `setModalOpen(false)`.
  Catch existente agrega fallback `TypeError` → mismo mensaje, solo
  relevante en la rama de creación (la de edición no llega a `fetch`).

- **`handleToggleActiva`** — offline permitido siempre (existente):
  ```ts
  if (OFFLINE_READ && db) {
    await db.execute(`UPDATE caja_cuentas SET activa = ? WHERE id = ?`, [cuenta.activa ? 0 : 1, cuenta.id]);
    // actualizar estado local optimista
    return;
  }
  ```

- **`handleSaveSaldo`** — bloqueo offline solo al crear
  (`!editingSaldo`), mismo mensaje ("Crear un saldo inicial nuevo
  requiere conexión a internet."). Rama offline de edición: UPDATE
  **con los 4 campos explícitos siempre**, incluido `cuenta_id` aunque
  no cambie — es obligatorio para que `BackendConnector` reciba
  `cuenta_id` en `opData` (PowerSync solo incluye en el PATCH las
  columnas que el propio `UPDATE` menciona; si se omite `cuenta_id`
  del SET porque "no cambió", el POST de sync después no tendría ese
  campo requerido):
  ```ts
  await db.execute(
    `UPDATE caja_saldos_iniciales SET cuenta_id = ?, fecha = ?, saldo = ?, observaciones = ? WHERE id = ?`,
    [parseInt(saldoFormCuentaId, 10), saldoFormFecha, parseFloat(saldoFormSaldo) || 0, saldoFormObs.trim() || null, editingSaldo.id]
  );
  ```

- **`handleDeleteSaldo`** — offline permitido siempre (existente):
  ```ts
  if (OFFLINE_READ && db) {
    await db.execute(`DELETE FROM caja_saldos_iniciales WHERE id = ?`, [id]);
    setSaldos((prev) => prev.filter((s) => s.id !== id));
    return;
  }
  ```

### `lib/powersync/BackendConnector.ts`

Tres ramas nuevas:

- **`caja_config`** (solo PATCH — nunca hay INSERT desde esta
  pantalla): `POST /api/caja/config` con `{ dolar_dia:
  parseFloat(opData.valor) }`. 400 → discard + `reportarConflicto()`;
  401/500/red → retry.
- **`caja_cuentas`** (solo PATCH — la creación está bloqueada en la UI,
  nunca debería llegar un INSERT; si llegara por algún camino no
  previsto, no hay rama INSERT y `BackendConnector` no sabría subirlo —
  aceptable, es un caso que la UI ya impide): `PATCH
  /api/caja/cuentas/${op.id}` con los campos presentes en `opData`
  (`nombre`, `moneda`, `orden` como vienen; `activa` convertido
  `!!Number(opData.activa)` si está presente). 404 → discard
  silencioso (convergencia); 409 (R4: tiene movimientos, no se puede
  desactivar) → discard + reportar conflicto real; 400 → discard +
  reportar; 401/500/red → retry.
- **`caja_saldos_iniciales`**:
  - PATCH → `POST /api/caja/saldos-iniciales` (mismo endpoint que
    crear — es upsert por `cuenta_id` en el servidor) con `{cuenta_id:
    Number(opData.cuenta_id), fecha: opData.fecha, saldo:
    parseFloat(opData.saldo), observaciones: opData.observaciones ??
    null}`. 400 → discard + reportar; 401/500/red → retry.
  - DELETE → `DELETE /api/caja/saldos-iniciales/${op.id}`. 404 →
    discard silencioso (convergencia); 401/500/red → retry.

### `config/feature-flags.json`

Nuevo flag `caja-config-offline-lectura: false`.

## Riesgos a cubrir en Fase B

- **Refactor Server→Client no rompe el guard de admin**: test/verificación
  de que `page.tsx` sigue redirigiendo a `/dashboard` si no es admin,
  ahora sin las queries `sql`.
- **Dólar offline**: UPDATE local + BackendConnector branch, con
  `flag=true`+offline.
- **Crear cuenta bloqueado offline**: test de que `handleSaveCuenta`
  sin `editingCuenta` y `navigator.onLine=false` muestra el mensaje y
  no hace `fetch` ni `db.execute`.
- **Editar cuenta / activar-desactivar offline**: no bloqueado, UPDATE
  local correcto.
- **`caja_cuentas` PATCH con 409 (R4)**: test de que un intento de
  desactivar una cuenta con movimientos, aplicado localmente y luego
  rechazado en sync, termina reportado como conflicto (no se pierde
  silenciosamente).
- **Crear saldo bloqueado offline**: mismo patrón que cuentas.
- **Editar/eliminar saldo offline**: UPDATE/DELETE local correctos,
  incluyendo que el UPDATE siempre mande `cuenta_id` en el opData.
- **Mapeo `activa`/`id`/`cuenta_id`**: test de que la lectura offline
  de cuentas devuelve `activa` como boolean real (no `0`/`1`) y que el
  toggle no se rompe por eso.
- **Smoke E2E**: flujo completo online (regresión, ya cubierto por
  tests existentes) sigue funcionando tras el refactor de `page.tsx`.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios (ojo: el refactor de
   `page.tsx`/`client_page.tsx` es real incluso con el flag en false —
   verificar que la carga inicial vía `fetch` en `useEffect` se vea y
   comporte igual que la carga SSR anterior, sin parpadeo raro).
2. Flag `true`, online: dólar/cuentas/saldos, todo igual que hoy.
3. Flag `true`, offline: ver dólar/cuentas/saldos (lectura local).
   Editar dólar → funciona. Editar/activar/desactivar cuenta existente
   → funciona. Crear cuenta nueva → mensaje claro, sin intento de red.
   Editar/eliminar saldo existente → funciona. Crear saldo nuevo →
   mensaje claro.
4. `npm run build` limpio, suite sin regresiones.
