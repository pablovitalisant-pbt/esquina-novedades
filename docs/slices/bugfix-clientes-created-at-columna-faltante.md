# Bugfix — clientes local vacío: falta columna created_at en AppSchema

Causa raíz confirmada con evidencia real de consola (no hipótesis):

```
[DEBUG clientes] Error: no such column: created_at
    at p (_next/static/chunks/8724...js:1:7137)
    at async R.execute (...)
```

Instrumentación previa (commit `63b5068`) confirmó que el `catch` vacío en
`fetchClientes` (`app/(app)/clientes/client_page.tsx`) estaba tragando esta
excepción en silencio desde que se activó el flag
`clientes-offline-lectura`.

## Causa raíz

`lib/powersync/AppSchema.ts`, tabla `clientes` (línea 81-86), declara solo
`nombre`, `telefono`, `direccion`, `notas` — le falta `created_at`, a
diferencia de todas las demás tablas del schema (`prenotas`,
`caja_movimientos`, etc.), que sí lo declaran. La consulta local en
`app/(app)/clientes/client_page.tsx:60` (`SELECT id, nombre, telefono,
direccion, notas, created_at FROM clientes ...`) referencia una columna
que no existe en la tabla SQLite local — PowerSync solo crea las columnas
declaradas explícitamente en el schema. La consulta explota con `no such
column: created_at`, capturada en silencio, dejando `clientes` en `[]`
para siempre, sin importar cuántos datos hayan sincronizado.

Esto también explica por qué el buscador de clientes de Caja Mayor no los
encontraba: no es que esos clientes no tengan notas asociadas (aunque esa
lógica de negocio del JOIN sigue siendo válida), sino que cualquier
consulta local a `clientes` que dependa de la tabla completa fallaba de la
misma forma.

## Fix

`lib/powersync/AppSchema.ts` — agregar la columna faltante a la tabla
`clientes`:

```ts
clientes: new Table({
  nombre: column.text,
  telefono: column.text,
  direccion: column.text,
  notas: column.text,
  created_at: column.text,
}),
```

Con el schema cambiado, PowerSync recrea la base local automáticamente en
el siguiente load de la app — no requiere acción manual del usuario (ya
confirmamos antes que el "Clear site data" no altera el schema declarado
en el código, que es lo que realmente cambia acá).

Adicionalmente, revertir la instrumentación temporal del commit `63b5068`
ya que cumplió su propósito (encontrar la causa raíz):

- `app/(app)/clientes/client_page.tsx:74` — volver a `catch { /* empty */
  }` **o**, mejor, dejar el `console.error` permanentemente (más seguro
  para el futuro, evita que un bug similar vuelva a quedar invisible). Se
  deja a criterio de Claude Code cuál conviene — si se deja, ajustar el
  comentario para que no diga "DEBUG" sino algo definitivo, ej.
  `console.error('[clientes] fetchClientes:', e);`.
- `app/(app)/caja-mayor/client_page.tsx` (branch offline de la búsqueda
  unificada) — mismo criterio.

## No se toca

- `docs/specs/caja-mayor.spec.ts`, rutas API online de `/api/clientes` —
  no tienen este problema (no pasan por PowerSync).
- La lógica de negocio del buscador de Caja Mayor (JOIN contra
  `prenotas`) — sigue siendo válida tal cual, un cliente sin notas
  asociadas seguirá sin aparecer ahí por diseño, eso no es un bug.

## Verificar

1. Recargar `/clientes` tras el deploy → deben aparecer "Toni la
   baratera" y "Pablo" sin necesidad de limpiar storage manualmente.
2. Buscador de Caja Mayor → buscar "Pablo" o "Toni" → deben aparecer (si
   tienen alguna nota asociada; si no tienen notas, no van a aparecer ahí
   por diseño del JOIN — verificar cuál es el caso antes de marcar esto
   como fallo).
3. Crear un cliente nuevo offline, confirmar que sigue funcionando
   (columnas sin tocar, solo se agregó una).
4. `npm run build` limpio, suite sin regresiones. DIFF antes de commit.

## Zona frágil (agregar a BUGS.md)

Cualquier columna que una consulta local (`db.get`/`db.getAll`) referencie
debe estar declarada en `AppSchema.ts` — si no lo está, la consulta falla
en tiempo de ejecución (no en build ni en tsc, porque las queries son
strings). Auditar el resto de queries locales del proyecto contra sus
tablas declaradas es candidato a ponytail audit (fuera de alcance de este
commit).
