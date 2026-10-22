# Fase A — Refresco reactivo de Categorías (mismo patrón que BUG-055/056 de Caja Mayor)

## Objetivo

Que la lista de categorías (`/admin/categorias`) se mantenga consistente
con la base local sin necesitar un refresh manual — mismo objetivo que
el fix ya aplicado en Caja Mayor, aplicado acá.

## Diagnóstico (evidencia, no hipótesis)

`app/(app)/admin/categorias/client_page.tsx`:
- La lista arranca de `initialCategorias` (prop server-side, calculado en
  `page.tsx:14-21` con `COUNT(DISTINCT p.codigo) FROM categorias c LEFT
  JOIN productos p ON p.categoria = c.nombre`).
- De ahí en más, **no existe ninguna función de refetch** — todas las
  mutaciones (`handleCrearCategoria`, `handleEliminarCategoria`, asignar/
  quitar productos de una categoría) actualizan el estado React
  directamente vía `setCategorias(prev => ...)`, de forma optimista.
- Cuando una categoría se crea offline (`db.execute(INSERT INTO
  categorias ...)`, línea 521-524) y luego sincroniza al reconectar, no
  hay ningún watcher que vuelva a leer la tabla local `categorias` — el
  estado de React sigue siendo el que quedó de la mutación optimista, sin
  reconciliar con lo que finalmente existe en SQLite/Postgres. Verificado
  por Pablo en producción (Task #8): la categoría desaparece de la UI
  hasta refrescar manualmente.

## Cambios

`app/(app)/admin/categorias/client_page.tsx`:

### 1. Nueva función `fetchCategorias` (local-read, replica la query de `page.tsx`)

```ts
const fetchCategorias = useCallback(async () => {
  if (!(OFFLINE_READ && db)) return;
  const rows = (await db.getAll(
    `SELECT c.id, c.nombre, c.created_at,
       (SELECT COUNT(DISTINCT p.codigo) FROM productos p WHERE p.categoria = c.nombre) AS total_productos
     FROM categorias c
     ORDER BY c.nombre ASC`
  )) as any[];
  setCategorias((rows || []).map((r) => ({ id: r.id, nombre: r.nombre, total_productos: Number(r.total_productos) })));
}, [db, OFFLINE_READ]);
```

(Verificar contra `AppSchema.ts` que `categorias` y `productos` están
declaradas con las columnas usadas acá — `id`, `nombre`, `created_at`
para categorías; `categoria`, `codigo` para productos — antes de asumir
que existen.)

### 2. Watcher reactivo

```ts
useEffect(() => {
  if (!(OFFLINE_READ && db)) return;
  const dispose = db.onChangeWithCallback(
    { onChange: () => { fetchCategorias(); } },
    { tables: ['categorias', 'productos'] }
  );
  return () => dispose();
}, [OFFLINE_READ, db, fetchCategorias]);
```

`productos` se incluye porque `total_productos` depende de la asignación
`productos.categoria`, no solo de la tabla `categorias`.

### 3. Llamada inicial

Igual que en Caja Mayor, un `useEffect(() => { fetchCategorias(); },
[fetchCategorias])` para que, si `OFFLINE_READ && db`, el estado arranque
de la lectura local en vez de quedarse solo con `initialCategorias` (que
puede estar desactualizado si la página se sirvió desde un shell
cacheado — mismo principio que el slice de notas de venta).

## Revisión de impacto lateral

- **Las mutaciones optimistas existentes NO se tocan** — `setCategorias`
  en `handleCrearCategoria`/`handleEliminarCategoria`/asignación de
  productos se dejan como están, dan el feedback instantáneo; el watcher
  es la red de seguridad para cuando la sincronización cambia el estado
  real por detrás.
- **`fetchProductos`** (la lista de productos, línea 283+) no se toca —
  ya tiene su propia rama offline funcionando bien, no reportado como
  problema.
- **Otras pantallas con el mismo patrón** (Usuarios, Config de Caja,
  Catálogo admin — todavía sin verificar en la ronda manual) —
  probablemente comparten el mismo gap. No se tocan en este slice, se
  evalúa cuando lleguemos a esas tasks.

## Ejemplos

- Crear categoría offline → aparece de inmediato (ya funciona, vía el
  `setCategorias` optimista existente).
- Reconectar → en cuanto la sincronización de esa categoría termina en
  segundo plano, la lista se actualiza sola sin refresh manual.
- Asignar un producto a una categoría offline → `total_productos` se
  actualiza solo al reconectar si cambia algo por detrás (ej. otro
  dispositivo tocó la misma categoría).

## No se toca

- La lógica de negocio de crear/eliminar/asignar categorías.
- `fetchProductos` y su paginación.
- Otras pantallas fuera de Categorías.

---

Pendiente de tu aprobación antes de mandarlo a Claude Code.
