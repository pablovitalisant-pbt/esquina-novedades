# Bugfix — Notas de Venta: race lectura local tras crear + retry infinito en items

Encontrado durante verificación manual de Task #2/#5 (Caja Mayor / Notas de
Venta). Dos bugs distintos, causa raíz confirmada por evidencia directa de
código (no hipótesis) — no relacionados entre sí más que por vivir en el
mismo módulo.

## Bug 1 (bloqueante — impide crear y probar notas de venta)

`notas-venta-offline-lectura` está en `true`. La página de detalle
(`app/(app)/notas-venta/[id]/client_page.tsx:302`) **siempre** lee de
SQLite local vía `OFFLINE_READ && db`, incluso estando online — no hay
rama que distinga "estoy online, mejor pido directo a Postgres".

Crear una nota (`app/(app)/notas-venta/client_page.tsx:122`, `handleCrear`)
sigue siendo un POST directo a `/api/notas-venta`, que escribe solo en
Postgres — no toca el SQLite local. El sync-down de PowerSync (que bajaría
esa fila nueva al cache local) no es instantáneo.

Secuencia real observada: crear nota → Postgres la tiene → `router.push`
a `/notas-venta/[id]` → `fetchPrenota()` busca en SQLite local → fila
todavía no sincronizada → `!prenota` → `toast.error('No se pudo cargar la
nota de venta')`, `prenota` queda `null`. La interfaz igual renderiza el
shell de la página (por eso "sí carga la interfaz"), pero sin `prenota`
cargada no se pueden agregar productos.

### Fix

`app/(app)/notas-venta/client_page.tsx`, `handleCrear` — si
`OFFLINE_READ && db`, espejar la fila recién creada directo al SQLite
local antes de navegar, usando exactamente los campos que devuelve el
POST (`RETURNING *` de Postgres, mismos nombres que `AppSchema.ts`
declara para `prenotas`):

```ts
const handleCrear = async () => {
  setCreating(true);
  try {
    const res = await fetch('/api/notas-venta', { method: 'POST' });
    if (!res.ok) {
      toast.error('No se pudo crear la nota de venta');
      return;
    }
    const data = await res.json();

    if (OFFLINE_READ && db) {
      // Espejo local inmediato: el sync-down de PowerSync no es instantáneo,
      // y la pagina de detalle siempre lee de SQLite local (incluso online).
      // Sin este INSERT, fetchPrenota() no encuentra la fila recien creada
      // hasta que el sync real la baje (carrera, ver bugfix de esta fecha).
      await db.execute(
        `INSERT OR REPLACE INTO prenotas (id, titulo, titulo_base, usuario_id, cliente_id, nombre_cliente, estado, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(data.id), data.titulo, data.titulo_base, data.usuario_id,
          data.cliente_id ?? null, data.nombre_cliente ?? null,
          data.estado, data.created_at, data.updated_at,
        ]
      );
    }

    router.push(`/notas-venta/${data.id}`);
  } catch {
    toast.error('No se pudo crear la nota de venta');
  } finally {
    setCreating(false);
  }
};
```

Nota: `db.execute` en una tabla de PowerSync genera automáticamente una
entrada en el CRUD queue para sync — pero como esta fila YA existe en
Postgres (la creó el POST), `uploadData()` la va a reintentar de más una
vez sin efecto real (mismo `id`, incluye `RETURNING *` en el server,
UPSERT-safe si el endpoint de creación es idempotente por id — **si no lo
es, hay que revisar `POST /api/notas-venta` antes de mandar esto a Claude
Code**; confirmar antes de implementar).

Confirmar explícitamente: ¿`op.table === 'prenotas'` en
`BackendConnector.ts` maneja un `PUT` (insert) además del `PATCH` que ya
existe (línea 327, para anular)? Si no hay rama para `PUT` en `prenotas`,
este INSERT local generaría una operación en el CRUD queue que
`uploadData()` no sabe procesar (cae al branch genérico/fallback, revisar
comportamiento exacto antes de aprobar implementación).

## Bug 2 (festival de errores en Vercel — retry infinito)

`app/api/notas-venta/[id]/items/route.ts:20` y
`app/api/notas-venta/[id]/route.ts:31` hacen `Number((await
params).id)` sin validar el resultado. Si `id` no es un entero válido
(observado: literal `"undefined"` en la URL, de una fila local vieja con
`prenota_id` vacío — root cause de cómo llegó a estar vacío, no
confirmado, probablemente el mismo Bug 1 en una prueba anterior antes de
este fix), `Number(...)` da `NaN`, y la primera query
(`items/route.ts:36`: `WHERE id = ${id}`) explota con
`invalid input syntax for type integer: NaN` → 500 sin capturar.

Un 500 se clasifica como reintentable en `BackendConnector.ts`
(`shouldComplete = false; throw`) → esa operación local corrupta se
reintenta en cada ciclo de sync, para siempre. Eso es el "festival de
errores" en los logs de Vercel — no son intentos nuevos de Pablo, es una
fila vieja atascada.

### Fix

`app/api/notas-venta/[id]/items/route.ts` y
`app/api/notas-venta/[id]/route.ts` (ambos handlers que leen `params.id`)
— validar como entero finito antes de cualquier query:

```ts
const idRaw = (await params).id;
const id = Number(idRaw);
if (!Number.isInteger(id) || id <= 0) {
  return NextResponse.json({ error: 'ID de nota inválido' }, { status: 400 });
}
```

Con esto, la fila local corrupta pasa de "reintentar 500 para siempre" a
"descartar con 400 + reportar a `sync_conflictos`" (mismo mecanismo ya
usado en Caja Mayor) — se puede revisar y limpiar manualmente desde ahí,
en vez de seguir golpeando producción.

## No se toca

- El resto de rutas de `notas-venta` que no leen `params.id` (ej.
  `GET /api/notas-venta` lista completa).
- `AppSchema.ts` (los tipos ya son correctos).
- La lógica de negocio de creación (numeración por usuario, título) —
  sigue siendo exclusivamente server-side, no se replica offline.

## Verificar

1. Online: crear una nota nueva → confirmar que la página de detalle
   carga sin el toast de error y permite agregar productos de inmediato
   (sin esperar ni refrescar).
2. Confirmar en Neon que la nota creada y sus items llegan bien, sin
   duplicados por el mirror-insert local.
3. Revisar `sync_conflictos` después del fix — la fila vieja con
   `prenota_id` indefinido debería aparecer ahí una sola vez (400) y dejar
   de reintentarse. Confirmar en los logs de Vercel que el festival de
   errores se detiene.
4. Offline: crear... **no aplica** — crear nota sigue requiriendo red
   (fuera de alcance, no cambia con este fix).
5. Regresión: notas ya existentes (sincronizadas hace tiempo) se siguen
   viendo y editando bien, online y offline.
6. `npm run build` limpio, suite sin regresiones. DIFF antes de commit.
