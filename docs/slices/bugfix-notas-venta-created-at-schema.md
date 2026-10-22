# Bugfix — `created_at` ausente en tabla local `prenotas` (Protocolo PBT-IA-DEBUGGING)

Detectado durante verificación manual post-Slice 6 (offline Notas de Venta,
commit `79c75f0`). Antes de tocar código: **verificar el número de bug
correcto en `BUGS.md` completo** (907 líneas, no leído entero en esta sesión
— confirmar que `BUG-026` no está ya usado más abajo del archivo antes de
numerar la entrada de cierre).

## 1. FREEZE

Último commit limpio: `79c75f0` (Slice 6). Working tree al momento de
detectar el bug: solo `config/feature-flags.json` (flag
`notas-venta-offline-lectura` en `true`, cambio local de prueba, no
commitear) y `docs/ARQUITECTURA-OFFLINE.md` (actualización de progreso, no
relacionada) modificados sin commitear. Ningún cambio de código en curso —
no hace falta `git stash`.

## 2. CLASIFICAR

**B — integridad/renderizado de datos.** No es visual puro: además de la
fecha rota, hay un bug latente de ordenamiento (ver Hipótesis).

## 3. REPRODUCIR

Con el flag `notas-venta-offline-lectura` en `true` y sesión iniciada:

1. Navegar a `/notas-venta` (lista).
2. La fecha de cada nota se muestra como **"Invalid Date"** en vez de, por
   ejemplo, "31 jul 2026".
3. Reproducible tanto online como offline (el flag activa la lectura local
   en ambos casos — ver `client_page.tsx`, la rama offline no depende de
   conectividad real, solo del flag).
4. Reproducido 100% con evidencia automatizada (script Puppeteer, sesión
   real contra `localhost:3000`, usuario `11.111.111-1`): DOM capturado
   con `document.body.innerText` mostró literalmente `Invalid Date` en la
   posición donde `formatFecha(prenota.created_at)` debería renderizar la
   fecha.

## 4. EVIDENCIA

Fragmento real del DOM capturado (lista, vía SQLite local):
```
Nota de Venta #7 — 31 jul 2026 — Pablo

Invalid Date

Pablo

Total: $164.79
```

Comparación con la API real (`GET /api/notas-venta`, fuente Postgres):
```json
{"id":40,"titulo":"Nota de Venta #7 — 31 jul 2026 — Pablo", ...,
 "created_at":"2026-07-31T16:38:45.775Z", ...}
```

El campo `created_at` existe y es válido en Postgres. El problema está solo
en la réplica local.

## 5. HIPÓTESIS

**Causa raíz:** `lib/powersync/AppSchema.ts`, tabla `prenotas`, no declara
la columna `created_at`:

```ts
prenotas: new Table({
  titulo: column.text,
  titulo_base: column.text,
  usuario_id: column.integer,
  cliente_id: column.integer,
  nombre_cliente: column.text,
  estado: column.text,
  updated_at: column.text,
  // created_at: FALTA
}),
```

PowerSync solo expone en el SQLite local las columnas declaradas en el
schema — aunque la query local haga `SELECT p.*`, `created_at` no está en
la tabla local y llega `undefined`/`null` al componente.

**Archivos afectados:**
- `lib/powersync/AppSchema.ts` — falta la columna (causa raíz).
- `app/(app)/notas-venta/client_page.tsx` — consume `prenota.created_at`
  en dos sitios: `formatFecha(prenota.created_at)` (línea ~190, síntoma
  visible) y `new Date(b.created_at).getTime()` en el `.sort()` de
  `fetchPrenotas` (línea ~76-78, **bug latente**: con una sola nota no se
  nota, pero con 2+ notas el orden de la lista offline queda indefinido
  porque `new Date(undefined).getTime()` es `NaN`).
- `app/(app)/notas-venta/[id]/client_page.tsx` — **verificar si también
  consume `created_at`** en algún punto (no visible en la captura de
  evidencia del detalle, pero confirmar con grep antes de dar por cerrado
  el alcance).

**Criterio de éxito:** con el flag en `true`, la lista y el detalle de
Notas de Venta muestran la fecha correcta (no "Invalid Date") y, con 2+
notas de distintas fechas, el orden coincide con el de la API (más
reciente primero).

## 6. FIX MÍNIMO

Una línea en `lib/powersync/AppSchema.ts`:

```ts
prenotas: new Table({
  titulo: column.text,
  titulo_base: column.text,
  usuario_id: column.integer,
  cliente_id: column.integer,
  nombre_cliente: column.text,
  estado: column.text,
  updated_at: column.text,
  created_at: column.text,  // ← agregar
}),
```

Cero archivos fuera de este scope. No tocar `app/api/notas-venta/**`, no
tocar el flag en `feature-flags.json` (ya está en `false` en el commit
`79c75f0`, correcto).

## 7. VERIFICAR

- `npx jest` — suite completa, confirmar 0 regresiones nuevas frente al
  baseline conocido (118 pasan / 13 fallas preexistentes al cierre de
  Slice 6).
- Verificación manual (Pablo, con el flag en `true` localmente): recargar
  `/notas-venta`, confirmar que la fecha se ve correcta. Si hay forma de
  probar con 2+ notas de fechas distintas, mejor — para confirmar también
  el fix del sort.
- No hace falta re-tocar el Sync Stream (la columna ya replica desde
  Postgres vía `SELECT *` del stream existente; el problema era solo la
  proyección del schema local).

## 8. REGISTRAR

Agregar entrada en `BUGS.md` seccion — **verificar primero el número
correcto contra el archivo completo (907 líneas)**, no asumir `BUG-026` sin
confirmar que no hay una entrada posterior ya usando ese número. Incluir:
causa raíz, archivo/línea, fix, evidencia de verificación, commit hash.

No hacer commit sin aprobación explícita de Pablo (regla de oro del
protocolo).
