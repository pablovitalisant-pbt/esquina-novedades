# Slice 18 (Offline, Fase 1) — Catálogo admin

Contrato Fase A. Alcance confirmado por Pablo: **lectura offline sí**
(lista de catálogos existentes, con QR y enlace público — ya 100%
cálculo local); **crear / editar / eliminar catálogo, 100% online**,
bloqueado offline con mensaje claro. Motivos técnicos (no de
preferencia):

1. **Crear**: el slug de la URL pública se genera en el servidor con
   un loop que consulta unicidad contra la base (`titulo`, `titulo-1`,
   `titulo-2`...). Replicarlo offline arriesga colisión real de slug
   entre catálogos creados en distinto momento/dispositivo — un
   catálogo podría pisar la URL pública de otro. No hay mitigación
   con id local generado por el cliente, el conflicto es sobre el
   slug, no sobre el id (distinto a todos los casos anteriores).
2. **Editar**: el modal de edición carga los productos vigentes desde
   `/api/catalogos/public/[slug]`, que recalcula en el servidor qué
   productos matchean según categoría, palabras incluir/excluir,
   solo-stock, solo-nuevo — la misma lógica que arma la página pública
   del catálogo. No está replicada en el cliente. Guardar además hace
   un DELETE+INSERT completo de `catalogo_precio_override`. Portarlo
   offline sería desarrollar de nuevo esa lógica de filtrado, no una
   escritura incremental.
3. **Eliminar** es simple, pero como editar ya queda online, no se
   aísla solo el DELETE — todo el CRUD de escritura queda online.

## Hallazgo aparte, fuera de alcance (no se toca en este slice)

`cat.user_id === (session?.user as any)?.id` en `client_page.tsx`
(línea 310, control de visibilidad del botón "Editar") compara un
`number` (Postgres, vía Neon) contra un `string` (`session.user.id`
es `String(user.id)` en `lib/auth.ts`) — luce como un bug pre-existente
ajeno a offline, no introducido por este slice. Lo dejo anotado, no lo
toco sin que Pablo lo pida explícitamente.

## Contrato

### `lib/powersync/AppSchema.ts`

```ts
catalogos: new Table({
  titulo: column.text,
  descripcion: column.text,
  slug: column.text,
  activo: column.integer,
  user_id: column.integer, // mismo tipo que devuelve Postgres — no se
                            // corrige acá el bug de comparación arriba,
                            // se preserva el comportamiento actual tal cual.
  created_at: column.text,
}),
```
Sin `margen_precio`/`palabras_excluir`/etc. — no se usan en la lista,
solo en edición (que queda online).

### `app/(app)/catalogo/admin/client_page.tsx`

- Nuevo flag `catalogo-admin-offline-lectura`. Wrapper
  `CatalogoAdminClient` gatea `PowerSyncProvider`; contenido actual pasa
  a `CatalogoAdminContent` (mismo patrón que Usuarios/Categorías/Caja-config).
- `fetchCatalogos`: si `OFFLINE_READ && db`, reemplazar el fetch por:
  ```sql
  SELECT id, titulo, descripcion, slug, activo, user_id, created_at
  FROM catalogos ORDER BY created_at DESC
  ```
  Mapeo: `activo: !!Number(r.activo)`, `user_id: Number(r.user_id)`
  (preserva el tipo que ya devuelve el path online, no "arregla" el
  bug de comparación de arriba).
- `handleDelete`: bloqueo offline con mensaje claro antes del fetch:
  ```ts
  if (!navigator.onLine) {
    toast.error('Eliminar un catálogo requiere conexión a internet.');
    return;
  }
  ```
- `handleOpenEdit`: mismo bloqueo, mismo criterio (no se abre el modal
  de edición offline porque no se puede calcular la lista de productos
  del catálogo sin conexión):
  ```ts
  if (!navigator.onLine) {
    toast.error('Editar un catálogo requiere conexión a internet.');
    return;
  }
  ```
- QR (`downloadQR`), enlace público (`getPublicUrl`), copiar enlace,
  botones "Ver"/"PDF" (abren `window.open` a la URL pública): sin
  cambios — ya son 100% cálculo/navegador local, funcionan offline en
  cuanto la lista de catálogos está cargada (aunque el destino de "Ver"/
  "PDF" en sí requiera que *el dispositivo que abre ese link* tenga
  conexión — eso es responsabilidad de quien lo abre, no de esta
  pantalla).

### `components/CrearCatalogoDialog.tsx`

- `handleCreate`: bloqueo offline con mensaje claro antes del fetch:
  ```ts
  if (!navigator.onLine) {
    toast.error('Crear un catálogo nuevo requiere conexión a internet.');
    return;
  }
  ```
- El `useEffect` que precarga categorías (`fetch('/api/categorias')`)
  no se toca — ya tiene `.catch(() => {})`, offline simplemente no
  puebla el dropdown de categoría, no bloquea nada.

### `lib/powersync/BackendConnector.ts`

Sin cambios. No hay ninguna escritura offline de `catalogos` que
subir — la UI bloquea las tres acciones de escritura antes de llegar a
generar cualquier operación local.

### `config/feature-flags.json`

Nuevo flag `catalogo-admin-offline-lectura: false`.

## Riesgos a cubrir en Fase B

- **Lectura offline**: `fetchCatalogos` con flag true + `db` mockeado
  devuelve la lista mapeada (`activo` boolean real, no `0`/`1`).
- **Crear bloqueado offline**: `handleCreate` con `navigator.onLine =
  false` muestra el mensaje y no hace `fetch`.
- **Editar bloqueado offline**: `handleOpenEdit` con `navigator.onLine
  = false` muestra el mensaje y no abre el modal ni hace `fetch`.
- **Eliminar bloqueado offline**: mismo patrón para `handleDelete`.
- **Regresión online**: los tres flujos (crear/editar/eliminar) siguen
  funcionando igual que hoy con el flag en cualquier valor, estando
  online.
- **QR/enlace siguen funcionando offline**: smoke de que
  `downloadQR`/`getPublicUrl` no dependen de `fetch`.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios.
2. Flag `true`, online: todo igual que hoy.
3. Flag `true`, offline: ver lista de catálogos (lectura local), QR y
   enlace funcionan. Crear/editar/eliminar → mensaje claro, sin
   intento de red.
4. `npm run build` limpio, suite sin regresiones.
