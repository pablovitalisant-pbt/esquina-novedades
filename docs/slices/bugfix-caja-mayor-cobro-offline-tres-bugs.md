# Bugfix — Caja Mayor: pérdida de datos + doble registro + feedback offline

Encontrado durante verificación manual de Task #2 (Caja Mayor), rama de
registro de "cobro" en modo offline. Tres problemas relacionados, en el
mismo flujo (`handleSubmit`, rama `OFFLINE_READ && db`), todos con causa
raíz confirmada por evidencia directa (código + Neon), no por hipótesis.

## Bug 1 (crítico — pérdida de datos permanente)

`app/(app)/caja-mayor/client_page.tsx:753` guarda `es_credito` como boolean
JS crudo:

```ts
tipo === "cobro" ? esCredito : false,
```

`lib/powersync/AppSchema.ts:104` declara esa columna `column.integer`. Al
armar el payload de sync, PowerSync serializa el valor como `0`/`1`.
`lib/powersync/BackendConnector.ts:188` reenvía ese valor tal cual al POST
`/api/caja/movimientos`. El schema del servidor
(`docs/specs/caja-mayor.spec.ts:68`) exige `z.boolean()` estricto → rechaza
`0`/`1` con 400 `{"fieldErrors":{"es_credito":["Invalid input"]}}`.

Confirmado en Neon: 3 registros en `sync_conflictos`, todos
`tabla: caja_movimientos`, `http_status: 400`, mismo `error_mensaje`,
timestamps coincidentes con las pruebas manuales de hoy. Los movimientos
nunca llegaron a Postgres — se descartaron per el manejo estándar de
errores permanentes de `uploadData()`. Como la fila padre nunca se creó,
la imputación a la nota tampoco pudo persistir (vive en la misma
transacción lógica) — no es un bug aparte, es consecuencia directa de este.

### Fix

`app/(app)/caja-mayor/client_page.tsx:753` — bindear como entero:

```ts
(tipo === "cobro" ? esCredito : false) ? 1 : 0,
```

## Bug 2 (doble registro)

`app/(app)/caja-mayor/client_page.tsx:1388` — el botón de submit:

```tsx
disabled={!canSubmit}
```

No incluye `saving`. Nada impide un segundo click mientras el primer
submit todavía está en proceso (offline: mientras se ejecutan los
`db.execute` locales). Confirmado como causa del "cobro duplicado x2"
reportado.

### Fix

```tsx
disabled={!canSubmit || saving}
```

## Bug 3 (feedback insuficiente en offline)

El `toast.success` de la rama offline (línea 787) usa el mismo mensaje
genérico que la rama online, sin indicar que el registro fue local y está
pendiente de sincronizar. Combinado con el Bug 2, esto llevó a reintentar
el registro por falta de confirmación clara.

### Fix

Mismo `toast.success` de la rama offline (línea 787), mensaje explícito y
duración mayor:

```ts
toast.success(
  `${tipo === "cobro" ? "Cobro" : "Gasto"} guardado offline — se sincronizará cuando haya conexión ($${formatMonto(parseFloat(monto), moneda)} ${moneda})`,
  { duration: 6000 }
);
```

## No se toca

- `AppSchema.ts` (la convención `column.integer` es correcta y consistente
  con el resto del código — el bug está en quién le pasa un boolean crudo,
  no en el schema).
- `docs/specs/caja-mayor.spec.ts` (el `z.boolean()` estricto del servidor
  es correcto — no se relaja validación, se corrige el emisor).
- `BackendConnector.ts` (reenvía correctamente lo que recibe; el problema
  es el dato que recibe).
- Rama online de `handleSubmit` (no tiene ninguno de estos tres problemas:
  el submit ahí también carece de `disabled={saving}` pero ese archivo no
  fue reportado con el mismo síntoma — **fuera de alcance de este bugfix**,
  no tocar sin autorización explícita de Pablo).

## Verificar

1. Offline: registrar un cobro con "Imputación manual" a una nota →
   reconectar → esperar sync → confirmar en Neon que
   `caja_movimientos` tiene la fila nueva con `es_credito` correcto
   (`true`/`false` según corresponda) y que `caja_movimiento_notas` tiene
   la fila de imputación vinculada al mismo `movimiento_id`.
2. Offline: doble click rápido en "Registrar cobro" → confirmar que solo
   se crea UN registro local (verificar con `db.getAll` o refrescando la
   página offline).
3. Offline: registrar un cobro → confirmar que aparece el toast con el
   mensaje "guardado offline — se sincronizará..." y que dura visible
   varios segundos.
4. Offline: después de registrar, confirmar que el botón queda
   deshabilitado durante el guardado y vuelve a habilitarse (para el
   siguiente cobro) una vez que el usuario complete los campos de nuevo.
5. Regresión: registrar un gasto y un cobro sin crédito online, confirmar
   que `es_credito` sigue llegando bien a Postgres como antes.
6. `npm run build` limpio, suite sin regresiones. DIFF antes de commit.
