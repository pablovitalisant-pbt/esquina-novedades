# Slice 16 (Offline, Fase 1) — Usuarios: solo lectura offline + bloqueo claro en escritura

Contrato Fase A propuesto por Claude (Director Técnico). Alcance
confirmado por Pablo: **lectura offline sí, escritura no** — gestionar
contraseñas offline es un riesgo de seguridad real (el hash con
`bcrypt` corre server-side, no se puede replicar en el cliente sin
exponer texto plano en la cola local) y de valor práctico bajo (un
usuario creado offline no puede loguearse hasta que el dispositivo
sincronice). A pedido de Pablo: la escritura offline debe mostrar un
mensaje claro, no fallar en silencio ni con un error genérico.

## ⚠️ Prerrequisito de seguridad para el Sync Stream (crítico)

**El query del Sync Stream para `usuarios` NO debe ser `SELECT *`.**
A diferencia de todas las tablas anteriores, `usuarios` tiene una
columna `password` (hash `bcrypt`). Sincronizar esa columna la replica
al SQLite local de cada dispositivo logueado — una exposición real,
aunque esté hasheada (permite ataque offline de fuerza bruta contra el
hash si el dispositivo se compromete). El query debe listar columnas
explícitas, **sin `password`**:

```yaml
- SELECT id, rut, nombre, rol, activo, created_at FROM usuarios
```

Te paso la línea exacta para el editor cuando aprobemos esto — no
uses `SELECT * FROM usuarios` bajo ninguna circunstancia.

## Contrato

### `lib/powersync/AppSchema.ts`

Nueva tabla, sin `password` (ni declarada ni sincronizada):
```ts
usuarios: new Table({
  rut: column.text,
  nombre: column.text,
  rol: column.text,
  activo: column.integer,
  created_at: column.text,
}),
```
`usuario_empresa` **no se sincroniza** — single-tenant, siempre
`empresa_id = 1` para todos los usuarios (mismo criterio ya usado en
`usuarios-single-tenant` — el flag existente `usuarios-single-tenant:
true` confirma que esto ya es la fuente de verdad asumida por el
código). La lectura local arma `empresas: [1]` sin consultar nada.

### `app/(app)/admin/usuarios/client_page.tsx`

- Nuevo flag `usuarios-offline-lectura`, envolver en `PowerSyncProvider`
  (wrapper + contenido).
- `fetchUsuarios`: si `OFFLINE_READ && db`, reemplazar el fetch por:
  ```sql
  SELECT id, rut, nombre, rol, activo, created_at FROM usuarios ORDER BY nombre ASC
  ```
  Mapear cada fila con `empresas: [1]` fijo (sin query adicional) **y
  `id: Number(row.id)`**. Es obligatorio: el `id` interno de PowerSync
  es siempre `text` sin importar el tipo real en Postgres (patrón ya
  visto en Caja Mayor y Clientes), y `usuarios.id` nunca se migra a
  UUID en este slice (no hay INSERT offline de usuarios, no aplica el
  riesgo de duplicación). Sin este cast, `currentUserId === u.id` (línea
  159, badge "Tú"), `currentUserId !== u.id` (línea 172, botón
  eliminar) y `currentUserId === formId` / `!== formId` (líneas 213 y
  220, disable de rol y estado de cuenta al autoeditarse) comparan
  `number` contra `string` y siempre dan `false` en el camino offline —
  bug silencioso, no truena, solo se comporta mal (deja ver el botón
  eliminar sobre uno mismo, entre otras cosas).
- **Bloqueo de escritura con mensaje claro** — antes de cualquier
  `fetch` en `handleSave` y `handleDelete`, chequear conectividad real:
  ```ts
  if (!navigator.onLine) {
    toast.error('La gestión de usuarios requiere conexión a internet. Conectate para crear, editar o eliminar usuarios.');
    return;
  }
  ```
  Además, envolver el `fetch` existente para que, si falla por una
  excepción de red (`navigator.onLine` puede dar falso positivo — dice
  "hay red local" aunque no haya salida real a internet), el mismo
  mensaje se muestre en vez del genérico `err.message` actual:
  ```ts
  } catch (err: any) {
    if (err instanceof TypeError) {
      // fetch falla con TypeError ante error de red (sin response)
      toast.error('La gestión de usuarios requiere conexión a internet. Conectate para crear, editar o eliminar usuarios.');
    } else {
      toast.error(err.message);
    }
  }
  ```

### `config/feature-flags.json`

Nuevo flag `usuarios-offline-lectura: false`.

### No se toca

`app/api/admin/usuarios/route.ts`, `app/api/admin/usuarios/[id]/route.ts`
(sin cambios — siguen siendo el único camino de escritura, siempre
online), `lib/powersync/BackendConnector.ts` (sin rama nueva — no hay
ninguna escritura offline de `usuarios` que subir).

## Riesgos a cubrir en Fase B

- **Verificar que `password` nunca llega al cliente**: test/verificación
  manual de que el Sync Stream real (una vez que Pablo lo actualice) no
  incluye la columna — confirmar contra el SDK de PowerSync en el
  navegador (inspeccionar la base local, no debe existir la columna ni
  el valor).
- **Bloqueo offline — creación**: test de que `handleSave` con
  `navigator.onLine = false` (mockeado) muestra el toast claro y NO
  intenta el `fetch`.
- **Bloqueo offline — edición y eliminación**: mismo test para
  `handleDelete` y la rama de edición de `handleSave`.
- **Regresión online**: crear/editar/eliminar usuario online sigue
  funcionando exactamente igual.
- **Falso positivo de `navigator.onLine`**: test de que un `fetch` que
  falla con `TypeError` (simulando red reportada como "online" pero sin
  salida real) también muestra el mensaje claro, no el error genérico.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios.
2. Sync Stream actualizado por Pablo con el query explícito (sin
   `password`) — prerrequisito manual antes de probar.
3. Flag `true`, online: ver lista de usuarios, crear/editar/eliminar —
   igual que hoy.
4. Flag `true`, offline: ver lista de usuarios (lectura local, al
   instante). Intentar crear/editar/eliminar → mensaje claro,
   inmediato, sin intento de red.
5. Verificar manualmente que la base SQLite local (DevTools) no
   contiene la columna `password` de `usuarios`.
6. Suite completa sin regresiones, `npm run build` limpio.
