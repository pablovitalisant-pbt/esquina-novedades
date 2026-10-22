# Fase A — Refresco reactivo de la tabla de Caja Mayor (fetch manual → db.onChangeWithCallback)

## Objetivo

Que la tabla de movimientos y los saldos de Caja Mayor se actualicen
solos ante CUALQUIER cambio real en las tablas locales relevantes — sea
por una escritura local (offline) o por una sincronización que termina
en segundo plano — sin depender de que el código adivine el momento
correcto para volver a pedir los datos.

## Diagnóstico (evidencia, no hipótesis)

`fetchMovimientos()` y `fetchSaldos()` (`app/(app)/caja-mayor/
client_page.tsx`) son consultas manuales (`db.getAll()`) disparadas solo
en momentos puntuales: montaje, cambio de `filtros`, y justo después de
un submit (línea 793-794). No hay ninguna suscripción a cambios de la
base local — si algo cambia en segundo plano (ej. la sincronización de
un cobro registrado offline termina de reconciliarse recién al
reconectar), nada le avisa a la UI que hay que volver a consultar. Por
eso hace falta un refresh manual, y a veces dos (si el primero cae antes
de que la sincronización termine).

## API verificada

Confirmado contra `node_modules/@powersync/common/lib/client/
CommonPowerSyncDatabase.d.ts` (no asumido):

```ts
onChangeWithCallback(handler?: WatchOnChangeHandler, options?: SQLOnChangeOptions): () => void;
```

`WatchOnChangeHandler.onChange` se invoca ante cualquier cambio en las
tablas especificadas en `options.tables` — cubre tanto escrituras
locales como cambios que llegan por sync-down. Devuelve una función de
`dispose` para cancelar la suscripción (usar en el cleanup del
`useEffect`).

## Cambios

`app/(app)/caja-mayor/client_page.tsx` — agregar un `useEffect` que,
cuando `OFFLINE_READ && db`, se suscribe a cambios de las tablas que
afectan la tabla de movimientos y los saldos, y llama a
`fetchMovimientos(paginaActual)` + `fetchSaldos()` cada vez que algo
cambie:

```ts
useEffect(() => {
  if (!(OFFLINE_READ && db)) return;
  const dispose = db.onChangeWithCallback(
    {
      onChange: () => {
        fetchMovimientos(pagination.page);
        fetchSaldos();
      },
    },
    { tables: ['caja_movimientos', 'caja_movimiento_notas', 'caja_saldos_iniciales', 'caja_cierres'] }
  );
  return () => dispose();
}, [OFFLINE_READ, db, pagination.page, fetchMovimientos, fetchSaldos]);
```

(Ajustar el nombre exacto del estado de página actual —`pagination.page`
según lo ya visto en el archivo— y los nombres de las 4 tablas contra
`AppSchema.ts` antes de implementar, para no asumir.)

Esto NO reemplaza las llamadas manuales existentes a
`fetchMovimientos(1)`/`fetchSaldos()` después del submit (línea 793-794)
— se dejan como están, sirven para el caso feliz de "ya sé que algo
cambió, actualizo ya". El watcher es una red de seguridad adicional para
cualquier cambio que no pase por ese camino (sync en segundo plano,
cambios desde otro dispositivo, etc.).

## Revisión de impacto lateral

- **Throttle**: `SQLOnChangeOptions.throttleMs` existe — no usarlo en un
  primer intento (no hay evidencia de que haga falta); si en Fase B/D
  se ve que dispara demasiado seguido (ej. durante una sincronización
  masiva), agregarlo ahí con evidencia, no preventivamente.
- **Otras pantallas con el mismo patrón** (Notas de Venta, Bodega, etc.)
  — probablemente tienen el mismo gap. **Fuera de alcance de este
  slice** — Pablo pidió específicamente Caja Mayor. Se anota como
  hallazgo para una ronda futura.
- **`notasPendientes`** (el fetch de notas para imputación manual,
  línea 471+) — no está en el alcance pedido, pero comparte el mismo
  problema de fondo. No se toca sin autorización explícita.
- Confirmar que agregar este watcher no genere un loop (el watcher
  dispara `fetchMovimientos`, que hace un `db.getAll` de LECTURA — no
  debería re-disparar `onChange` a sí mismo, ya que `onChange` solo
  reacciona a escrituras, no a lecturas. Confirmar esto contra la doc/
  comportamiento real en Fase B con un test, no asumirlo).

## Ejemplos

- Offline: registrar un cobro → aparece de inmediato en la tabla (ya
  funciona hoy vía el fetch manual post-submit — sigue funcionando).
- Reconectar después de registrar offline → en cuanto la sincronización
  de esa fila termina en segundo plano (sin que el usuario haga nada),
  la tabla se actualiza sola con el monto/estado final, sin necesitar
  ningún refresh manual.
- Dos pestañas abiertas (mismo usuario, mismo dispositivo) — cambios en
  una deberían reflejarse en la otra sin refrescar (efecto colateral
  positivo, no el objetivo principal pero válido verificarlo).

## No se toca

- La lógica de `handleSubmit`, `fetchMovimientos`, `fetchSaldos` en sí
  — solo se agrega el watcher que las invoca automáticamente además de
  los triggers manuales existentes.
- Otras pantallas del proyecto.

---

Pendiente de tu aprobación antes de pasar a Fase B (análisis de riesgos
+ tests).
