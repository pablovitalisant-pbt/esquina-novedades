# Slice 10b (Offline, Fase 1) — Notas de Venta: escritura offline real ("agregar producto")

Contrato Fase A propuesto por Claude (Director Técnico). Depende de Slice
10a (`prenota_items.id` ya es UUID, migración 027 aplicada y verificada en
producción — commit `446660b`). Habilita el primer caso de escritura
offline real de Notas de Venta: agregar un producto a una nota sin red.
Editar y eliminar items **siguen 100% online** (fetch) — quedan fuera de
este slice, ver "No se toca".

## Dato verificado (búsqueda activa, no asumido)

PowerSync SQLite expone la función `uuid()` para generar ids client-side
en INSERTs locales — es el mecanismo documentado por PowerSync para este
caso exacto (no hay auto-generación implícita de `id` en un INSERT crudo
sin especificarlo). Fuente: [Client ID - PowerSync docs](https://docs.powersync.com/usage/sync-rules/client-id).
Se usa `crypto.randomUUID()` en JS en vez de `uuid()` en SQL, por
simplicidad: permite tener el id disponible de inmediato para
`setAutoFocusItemId` sin un `SELECT` de vuelta.

## Contrato

### Archivo modificado — `app/(app)/notas-venta/[id]/client_page.tsx`

`agregarProducto`: si `OFFLINE_READ && db` (mismo flag
`notas-venta-offline-lectura`, sin flag nuevo — mismo patrón que Bodega
Slice 5, un flag cubre lectura + escritura del módulo), reemplazar el
`fetch(POST .../items)` por:

```ts
const itemId = crypto.randomUUID();
const createdAt = new Date().toISOString();
await db.execute(
  `INSERT INTO prenota_items (id, prenota_id, codigo, descripcion, imagen_url, empresa_id, cajas, unidades, precio, stock_referencia, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [itemId, Number(id), prod.codigo, prod.detalle, prod.imagen_url, prod.empresa_id, 1, prod.cantcaja ?? 1, prod.prcventa, prod.saldo, createdAt]
);
setAutoFocusItemId(itemId);
setProductoQuery('');
setProductoResults([]);
setShowResults(false);
await fetchPrenota();
toast.success('Producto agregado');
```

Con `offline=false` el `fetch` original queda intacto (misma rama
`if/else` que ya usa `fetchPrenota`).

**Decisión explícita — sin decremento de `productos.saldo` local:** a
diferencia de Bodega (que sí escribe su propio stock local), acá el saldo
descontado en Postgres (`UPDATE productos SET saldo = saldo - cantidad
WHERE saldo >= cantidad`) no se replica en la tabla local `productos`.
Si el usuario agrega el mismo producto dos veces offline por encima del
stock real, ambos inserts locales se ven "bien" en la UI; el conflicto
recién se detecta al sincronizar (ver abajo). Alternativa (decrementar
`productos.saldo` local de forma optimista) se descarta por ahora: exige
lógica de reversa si el sync falla, fuera de alcance de este slice.

### Archivo modificado — `lib/powersync/BackendConnector.ts`

Agregar una segunda rama dentro del mismo `for (const op of
transaction.crud)`, junto a la de `ubicaciones_bodega`:

```ts
if (op.table === 'prenota_items') {
  const data = op.opData ?? {};
  let res: Response;
  try {
    res = await fetch(`/api/notas-venta/${data.prenota_id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: op.id,
        codigo: data.codigo,
        descripcion: data.descripcion,
        imagen_url: data.imagen_url,
        empresa_id: data.empresa_id,
        cajas: data.cajas,
        unidades: data.unidades,
        precio: data.precio,
        stock_referencia: data.stock_referencia,
      }),
    });
  } catch (e) {
    console.error(`uploadData: excepción de red para item ${op.id} — se reintentará`, e);
    shouldComplete = false;
    throw e;
  }

  if (res.ok) continue;

  // 400 (stock insuficiente), 404 (nota no encontrada) y 422 (nota anulada)
  // son las tres respuestas de negocio permanentes de este endpoint — a
  // diferencia de ubicaciones_bodega (que solo tiene 400), acá hay que
  // tratar los tres igual: no reintentar, descartar, reportar a la
  // bandeja de conflictos.
  if ([400, 404, 422].includes(res.status)) {
    console.error(`uploadData: item ${op.id} ${res.status} (permanente) — se descarta`);
    if ((flags as any)['sync-conflictos-reporte']) {
      await reportarConflicto({
        tabla: op.table,
        operacion: op.op,
        entidad_id: op.id,
        payload: data,
        http_status: res.status,
        error_mensaje: await extraerMensajeError(res),
      });
    }
    continue;
  }

  // 401, 500 u otro status reintentable → no completar, reintento.
  console.error(`uploadData: item ${op.id} ${res.status} — se reintentará`, res.status);
  shouldComplete = false;
  throw new Error(`uploadData: item ${op.id} falló con ${res.status}`);
}
```

Nota: `continue` dentro del `for` en la rama existente de
`ubicaciones_bodega` usa `if (op.table !== 'ubicaciones_bodega') continue;`
al principio del loop — hay que reestructurar ese primer filtro (ya no
puede ser un solo `continue` temprano) para que ambas tablas se evalúen
dentro del mismo loop. Forma más limpia: reemplazar el filtro temprano
por un `if (op.table === 'ubicaciones_bodega') { ... } else if (op.table
=== 'prenota_items') { ... }` — Claude Code decide el detalle de
refactor siempre que el comportamiento de `ubicaciones_bodega` quede
idéntico (cero regresión, cubierto por tests existentes de Slice 9b).

### No se toca

`app/api/notas-venta/[id]/items/route.ts` (ya acepta `id` opcional desde
Slice 10a, se reutiliza sin cambios), `lib/powersync/AppSchema.ts` (ya
tiene todas las columnas de `prenota_items` desde Slice 6, `id` no se
declara — PowerSync lo maneja solo), `eliminarItem`/`handleGuardar`
(edición y borrado de items siguen 100% online, sin rama offline — no
generan ops `PATCH`/`DELETE` de `prenota_items` en la cola local, así que
`BackendConnector` no necesita manejarlos todavía), `config/feature-flags.json`
(se reutiliza `notas-venta-offline-lectura`, sin flag nuevo).

## Riesgos a cubrir en Fase B

- **INSERT a DB (local)**: duplicados — `id` es UUID generado por
  `crypto.randomUUID()`, colisión no es un riesgo real; el PK de
  PowerSync más el PK UUID de Postgres previenen duplicado aunque
  `uploadData` se reintentara con el mismo `op.id`.
- **INSERT a DB (remoto, al sync)**: stock insuficiente — riesgo
  específico de este slice, no cubierto por el checklist estándar. Test:
  simular 400 de stock insuficiente en el POST del sync → confirmar que
  se llama `reportarConflicto` con `http_status: 400` y que la
  transacción se completa igual (no bloquea la cola).
- **Nota no encontrada (404) / nota anulada (422)**: mismo tratamiento
  que el 400 — test explícito para cada uno, confirmar que NO se
  reintenta indefinidamente (caso real: usuario anula la nota desde otro
  dispositivo mientras el primero sigue offline).
- **Llamada a API externa (nuestro propio backend) — timeout/500**: ya
  cubierto por el patrón `shouldComplete` existente, test de regresión
  (no debe cambiar para `ubicaciones_bodega`).
- **Más de un evento async simultáneo**: `agregandoRef` ya bloquea doble
  submit en `agregarProducto` (código existente, sin cambios) — test de
  regresión de que la rama offline respeta el mismo guard.
- **Modificación de estado compartido**: `productos.saldo` local NO se
  toca (decisión explícita arriba) — test que confirma que la tabla local
  `productos` queda intacta tras un insert offline de `prenota_items`.

## Verificación esperada (Fase D)

1. Flag `false`: comportamiento actual sin cambios (regresión).
2. Flag `true`, online: agregar producto, confirmar en Neon que
   `prenota_items` tiene el mismo `id` que se generó localmente (no uno
   distinto de `gen_random_uuid()` del servidor).
3. Flag `true`, offline: agregar producto sin red → aparece al instante
   en la UI local. Reconectar, esperar sync, confirmar en Neon que llegó
   con el mismo id y que `productos.saldo` se descontó server-side.
4. Offline, agregar más unidades de las que hay stock real → reconectar →
   confirmar que aparece en `/admin/sync-conflictos` con `http_status:
   400`, y que el item queda "fantasma" en la UI local (no se corrige
   solo — limitación conocida de este MVP, documentar en
   `ARQUITECTURA-OFFLINE.md` junto con la nota ya existente sobre
   "descartar" como única acción de la bandeja).
5. Suite completa sin regresiones, `npm run build` limpio.
