# Slice: Notas de Venta — migrar cliente_id + limpieza Zofri en detalle

## Fase A — Contrato

**Fecha:** 2026-07-04

---

## Revisión de impacto lateral

### Caja Mayor (módulo ya funcional)

Caja Mayor ya lee `prenotas.cliente_id` en 6 rutas:

| Ruta | Uso de cliente_id |
|------|-------------------|
| `caja/clientes/route.ts:34` | `JOIN public.clientes c ON c.id = p.cliente_id` |
| `caja/nota-busqueda/route.ts:46` | `p.cliente_id` en SELECT |
| `caja/resumen/[kcodcli2]/route.ts:52` | `WHERE p.cliente_id = ${kcodcli2}` |
| `caja/notas/[kcodcli2]/route.ts:42` | `WHERE p.cliente_id = ${kcodcli2}` |
| `caja/movimientos/route.ts:177` | `SELECT 1 FROM public.prenotas WHERE cliente_id = ${kcodcli2}` |
| `caja/movimientos/[id]/notas/route.ts:87` | `p.cliente_id = ${kcodcli2}` |

Caja Mayor también lee `prenotas.nombre_cliente` en `caja/nota-busqueda` y `caja/notas/[kcodcli2]`.

**Conclusión: cero impacto.** La columna `cliente_id` ya existe (migración 009), ya se puebla (POST `/api/notas-venta` desde Slice 18b), y Caja Mayor ya la consume. Este slice solo pone al día el PATCH y la UI de detalle. `nombre_cliente` se preserva — Caja Mayor lo necesita para búsqueda por texto.

### `components/AgregarANotaVentaModal.tsx`

Ya usa `POST /api/notas-venta` con `{ cliente_id }` y busca en `/api/clientes?q=`. Es el **patrón de referencia** para este slice. No se modifica.

### `app/api/clientes/route.ts`

Lista, limpia, single-tenant. Sin cambios necesarios. La UI de detalle migrará a este endpoint.

### Tipos del spec (`docs/specs/caja-mayor.spec.ts`)

`NotaVentaConSaldo` (línea 164) y `NotaBusquedaResult` (línea 179) ya tienen `cliente_id`. Sin cambios necesarios. BUG-004 ya los restauró.

---

## Archivos del slice

| # | Archivo | Tipo | Descripción |
|---|---------|------|-------------|
| 1 | `app/api/notas-venta/[id]/route.ts` | EDIT | PATCH: aceptar `cliente_id`, auto-poblar `nombre_cliente` desde tabla clientes. Eliminar `kcodclie_factura`/`nombre_cliente_factura`/`tipo_documento` del PATCH. GET: JOIN clientes para devolver `cliente_nombre` real. |
| 2 | `app/(app)/notas-venta/[id]/client_page.tsx` | EDIT | Reemplazar búsqueda legacy (`/api/ventas/clientes?empresaSlug=vida`) → `/api/clientes?q=`. Eliminar UI de factura, tipo_documento, warning `saldo_zofri`. Limpiar exports (Excel/PDF/WhatsApp). |
| 3 | `app/api/notas-venta/route.ts` | EDIT | POST: eliminar `tipo_documento`/`kcodclie_factura`/`nombre_cliente_factura` del INSERT (columnas quedan en DB, se deja de escribir). |

---

## Diff propuesto

### Archivo 1: `app/api/notas-venta/[id]/route.ts`

#### GET — agregar JOIN con clientes

```diff
   const id = Number(params.id);
   const prenotas = await sql`
-    SELECT * FROM public.prenotas WHERE id = ${id} AND usuario_id = ${auth.usuarioId}
+    SELECT p.*, c.nombre AS cliente_nombre
+    FROM public.prenotas p
+    LEFT JOIN public.clientes c ON c.id = p.cliente_id
+    WHERE p.id = ${id} AND p.usuario_id = ${auth.usuarioId}
   `;
```

Motivo: la UI de detalle necesita mostrar el nombre real del cliente (vía FK), no depender de `nombre_cliente` (texto libre desnormalizado que puede estar stale).

#### PATCH — reemplazar campos legacy por cliente_id

```diff
 export async function PATCH(request: NextRequest, { params }: RouteContext) {
   const auth = await validarSesion();
   if (auth.error) return auth.error;

   const id = Number(params.id);
   const body = await request.json();
   const current = await sql`
-    SELECT titulo_base FROM public.prenotas WHERE id = ${id} AND usuario_id = ${auth.usuarioId}
+    SELECT titulo_base, cliente_id FROM public.prenotas WHERE id = ${id} AND usuario_id = ${auth.usuarioId}
   `;
-  const tituloBase = (current as any)[0]?.titulo_base;
-  const nuevoTitulo = body?.nombre_cliente !== undefined
-    ? (body.nombre_cliente ? `${tituloBase} — ${body.nombre_cliente}` : tituloBase)
-    : undefined;
+  const row = (current as any)[0];
+  const tituloBase = row?.titulo_base;

+  // ─── cliente_id → actualizar nombre_cliente desde tabla clientes ───
+  let nombre_cliente: string | null | undefined = undefined;
+  if (body?.cliente_id !== undefined) {
+    if (body.cliente_id === null) {
+      nombre_cliente = null;
+    } else {
+      const clientRows = await sql`
+        SELECT nombre FROM public.clientes WHERE id = ${Number(body.cliente_id)}
+      `;
+      nombre_cliente = (clientRows as any)[0]?.nombre ?? null;
+    }
+  }
+
+  // ─── Actualizar titulo si cambió el nombre_cliente ───
+  const nuevoNombre = nombre_cliente !== undefined ? nombre_cliente : undefined;
+  const nuevoTitulo = nuevoNombre !== undefined
+    ? (nuevoNombre ? `${tituloBase} — ${nuevoNombre}` : tituloBase)
+    : undefined;

   const rows = await sql`
     UPDATE public.prenotas
     SET
       titulo         = CASE WHEN ${nuevoTitulo !== undefined} THEN ${nuevoTitulo ?? null} ELSE titulo END,
-      kcodclie       = CASE WHEN ${body?.kcodclie !== undefined} THEN ${body?.kcodclie ?? null} ELSE kcodclie END,
-      nombre_cliente = CASE WHEN ${body?.nombre_cliente !== undefined} THEN ${body?.nombre_cliente ?? null} ELSE nombre_cliente END,
-      tipo_documento = CASE WHEN ${body?.tipo_documento !== undefined} THEN ${body?.tipo_documento ?? null} ELSE tipo_documento END,
-      kcodclie_factura = CASE WHEN ${body?.kcodclie_factura !== undefined} THEN ${body?.kcodclie_factura ?? null} ELSE kcodclie_factura END,
-      nombre_cliente_factura = CASE WHEN ${body?.nombre_cliente_factura !== undefined} THEN ${body?.nombre_cliente_factura ?? null} ELSE nombre_cliente_factura END,
+      cliente_id     = CASE WHEN ${body?.cliente_id !== undefined} THEN ${body?.cliente_id === null ? null : Number(body.cliente_id)}::int ELSE cliente_id END,
+      nombre_cliente = CASE WHEN ${nombre_cliente !== undefined} THEN ${nombre_cliente ?? null} ELSE nombre_cliente END,
       updated_at     = now()
     WHERE id = ${id} AND usuario_id = ${auth.usuarioId}
     RETURNING *
   `;

   return NextResponse.json((rows as any)[0] ?? null);
 }
```

**Input de ejemplo del PATCH (nuevo):**
```json
{ "cliente_id": 5 }
```
→ busca `clientes WHERE id = 5`, obtiene `nombre`, actualiza `prenotas.cliente_id = 5, prenotas.nombre_cliente = 'Juan Pérez'`.

```json
{ "cliente_id": null }
```
→ quita el cliente: `prenotas.cliente_id = NULL, prenotas.nombre_cliente = NULL`.

**Qué se deja de aceptar:** `kcodclie`, `tipo_documento`, `kcodclie_factura`, `nombre_cliente_factura`. Las columnas siguen en la tabla (no se dropean), solo se deja de escribir desde el PATCH.

---

### Archivo 2: `app/(app)/notas-venta/[id]/client_page.tsx`

#### State — eliminar 6 estados legacy, agregar 3 nuevos

```diff
   const [prenota, setPrenota] = useState<any>(null);
   const [loading, setLoading] = useState(true);
-  const [searchCliente, setSearchCliente] = useState('');
-  const [debouncedSearch, setDebouncedSearch] = useState('');
-  const [clienteResults, setClienteResults] = useState<any[]>([]);
-  const [searchClienteFactura, setSearchClienteFactura] = useState('');
-  const [debouncedSearchFactura, setDebouncedSearchFactura] = useState('');
-  const [clienteFacturaResults, setClienteFacturaResults] = useState<any[]>([]);
+  const [clienteQuery, setClienteQuery] = useState('');
+  const [clienteResults, setClienteResults] = useState<any[]>([]);
+  const [clientesLoading, setClientesLoading] = useState(false);
+  const abortRef = useRef<AbortController | null>(null);
```

#### Efectos — reemplazar 4 useEffect por 1 (patrón AgregarANotaVentaModal)

```diff
-  useEffect(() => {
-    const timer = setTimeout(() => setDebouncedSearch(searchCliente), 400);
-    return () => clearTimeout(timer);
-  }, [searchCliente]);
-
-  useEffect(() => {
-    const timer = setTimeout(() => setDebouncedSearchFactura(searchClienteFactura), 400);
-    return () => clearTimeout(timer);
-  }, [searchClienteFactura]);
-
-  useEffect(() => {
-    async function buscarClientes() {
-      if (debouncedSearch.trim().length < 2) {
-        setClienteResults([]);
-        return;
-      }
-      try {
-        const res = await fetch(`/api/ventas/clientes?q=${encodeURIComponent(debouncedSearch)}&empresaSlug=vida`);
-        if (res.ok) {
-          const { data } = await res.json();
-          setClienteResults(data || []);
-        } else {
-          setClienteResults([]);
-        }
-      } catch {
-        setClienteResults([]);
-      }
-    }
-    buscarClientes();
-  }, [debouncedSearch]);
-
-  useEffect(() => {
-    async function buscarClientesFactura() {
-      if (debouncedSearchFactura.trim().length < 2) {
-        setClienteFacturaResults([]);
-        return;
-      }
-      try {
-        const res = await fetch(`/api/ventas/clientes?q=${encodeURIComponent(debouncedSearchFactura)}&empresaSlug=vida`);
-        if (res.ok) {
-          const { data } = await res.json();
-          setClienteFacturaResults(data || []);
-        } else {
-          setClienteFacturaResults([]);
-        }
-      } catch {
-        setClienteFacturaResults([]);
-      }
-    }
-    buscarClientesFactura();
-  }, [debouncedSearchFactura]);
+  // Búsqueda de clientes con debounce + AbortController (patrón AgregarANotaVentaModal)
+  useEffect(() => {
+    if (clienteQuery.trim().length < 2) {
+      setClienteResults([]);
+      return;
+    }
+    if (abortRef.current) abortRef.current.abort();
+    const controller = new AbortController();
+    abortRef.current = controller;
+    setClientesLoading(true);
+    const timer = setTimeout(async () => {
+      try {
+        const res = await fetch(`/api/clientes?q=${encodeURIComponent(clienteQuery)}`, {
+          signal: controller.signal,
+        });
+        if (res.ok) {
+          const { data } = await res.json();
+          setClienteResults(data || []);
+        }
+      } catch (err: any) {
+        if (err.name !== 'AbortError') setClienteResults([]);
+      } finally {
+        setClientesLoading(false);
+      }
+    }, 200);
+    return () => clearTimeout(timer);
+  }, [clienteQuery]);
```

#### Funciones — reemplazar asignarCliente, quitarCliente, eliminar factura/tipo

```diff
-  const asignarCliente = async (c: any) => {
-    try {
-      await fetch(`/api/notas-venta/${id}`, {
-        method: 'PATCH',
-        headers: { 'Content-Type': 'application/json' },
-        body: JSON.stringify({ kcodclie: Number(c.kcodclie), nombre_cliente: c.nombress }),
-      });
-      setSearchCliente('');
-      setClienteResults([]);
-      await fetchPrenota();
-    } catch {
-      toast.error('No se pudo asignar cliente');
-    }
-  };
-
-  const quitarCliente = async () => {
-    try {
-      await fetch(`/api/notas-venta/${id}`, {
-        method: 'PATCH',
-        headers: { 'Content-Type': 'application/json' },
-        body: JSON.stringify({ kcodclie: null, nombre_cliente: null }),
-      });
-      await fetchPrenota();
-    } catch {
-      toast.error('No se pudo quitar cliente');
-    }
-  };
-
-  const asignarClienteFactura = async (c: any) => {
-    try {
-      await fetch(`/api/notas-venta/${id}`, {
-        method: 'PATCH',
-        headers: { 'Content-Type': 'application/json' },
-        body: JSON.stringify({
-          kcodclie_factura: Number(c.kcodclie),
-          nombre_cliente_factura: c.nombress,
-        }),
-      });
-      setSearchClienteFactura('');
-      setClienteFacturaResults([]);
-      await fetchPrenota();
-    } catch {
-      toast.error('No se pudo asignar cliente de factura');
-    }
-  };
-
-  const quitarClienteFactura = async () => {
-    try {
-      await fetch(`/api/notas-venta/${id}`, {
-        method: 'PATCH',
-        headers: { 'Content-Type': 'application/json' },
-        body: JSON.stringify({ kcodclie_factura: null, nombre_cliente_factura: null }),
-      });
-      await fetchPrenota();
-    } catch {
-      toast.error('No se pudo quitar cliente de factura');
-    }
-  };
-
-  const cambiarTipoDocumento = async (tipo: string) => {
-    try {
-      await fetch(`/api/notas-venta/${id}`, {
-        method: 'PATCH',
-        headers: { 'Content-Type': 'application/json' },
-        body: JSON.stringify({ tipo_documento: tipo || null }),
-      });
-      await fetchPrenota();
-    } catch {
-      toast.error('No se pudo actualizar tipo de documento');
-    }
-  };
+  const asignarCliente = async (c: any) => {
+    try {
+      await fetch(`/api/notas-venta/${id}`, {
+        method: 'PATCH',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ cliente_id: c.id }),
+      });
+      setClienteQuery('');
+      setClienteResults([]);
+      await fetchPrenota();
+    } catch {
+      toast.error('No se pudo asignar cliente');
+    }
+  };
+
+  const quitarCliente = async () => {
+    try {
+      await fetch(`/api/notas-venta/${id}`, {
+        method: 'PATCH',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ cliente_id: null }),
+      });
+      await fetchPrenota();
+    } catch {
+      toast.error('No se pudo quitar cliente');
+    }
+  };
```

#### Exports — limpiar referencias Zofri/multi-empresa

**exportarExcel:** quitar separación SANJH/VIDA DIGITAL, quitar infoRows de factura/tipo, quitar columna Stock Zofri.

```diff
   const exportarExcel = () => {
     if (!prenota?.items?.length) return;
-    const sanjhItems = prenota.items.filter((i: any) => i.empresa_id === 1);
-    const vidaItems = prenota.items.filter((i: any) => i.empresa_id === 2);
     const infoRows = [
       { Campo: 'Título', Valor: prenota.titulo },
       { Campo: 'Cliente comprador', Valor: prenota.nombre_cliente || prenota.cliente_nombre || '-' },
-      { Campo: 'A quién va el documento', Valor: prenota.nombre_cliente_factura || '-' },
-      { Campo: 'Tipo de documento', Valor: prenota.tipo_documento || '-' },
     ];
     const toRows = (items: any[]) => items.map(i => ({
       'Código': i.codigo,
       'Descripción': i.descripcion,
       'Cajas': Number(i.cajas),
       'Unidades': Number(i.unidades),
       'Precio USD': Number(i.precio),
-      'Stock Zofri': Number(i.saldo_zofri),
       'Total USD': Number(i.unidades) * Number(i.precio),
     }));
     const wb = XLSX.utils.book_new();
     XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infoRows), 'Info');
-    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(vidaItems)), 'VIDA DIGITAL');
-    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(sanjhItems)), 'SANJH');
+    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toRows(prenota.items)), 'Items');
     ...
   };
```

**exportarPDF:** reemplazar header "VidaDigital" → "Bazar Naty", quitar factura/tipo.

```diff
-    doc.text('VidaDigital — Pre-Nota de Venta', 14, 20);
+    doc.text('Bazar Naty — Nota de Venta', 14, 20);
     ...
-    if (prenota.nombre_cliente) {
-      doc.text(`Cliente: ${prenota.nombre_cliente}`, 14, y);
+    if (prenota.nombre_cliente || prenota.cliente_nombre) {
+      doc.text(`Cliente: ${prenota.nombre_cliente || prenota.cliente_nombre}`, 14, y);
       y += 7;
     }
-    if (prenota.nombre_cliente_factura) {
-      doc.text(`A quién va: ${prenota.nombre_cliente_factura}`, 14, y);
-      y += 7;
-    }
-    if (prenota.tipo_documento) {
-      doc.text(`Tipo: ${prenota.tipo_documento}`, 14, y);
-      y += 7;
-    }
```

**compartirWhatsApp:** quitar factura/tipo, quitar badge SANJH/VD.

```diff
     const mensaje = [
       `*${prenota.titulo}*`,
-      prenota.nombre_cliente ? `Cliente: ${prenota.nombre_cliente}` : null,
-      prenota.nombre_cliente_factura ? `A quién va: ${prenota.nombre_cliente_factura}` : null,
-      prenota.tipo_documento ? `Tipo: ${prenota.tipo_documento}` : null,
+      (prenota.nombre_cliente || prenota.cliente_nombre) ? `Cliente: ${prenota.nombre_cliente || prenota.cliente_nombre}` : null,
       ``,
       lineas,
       ``,
       `*Total: $${totalStr}*`,
     ].filter(l => l !== null).join('\n');
```

Y en `lineas`:
```diff
-    `• ${i.codigo} — ${i.descripcion || ''} (${i.cajas} cajas / ${i.unidades} uds) $${Number(i.precio).toFixed(2)} [${i.empresa_id === 1 ? 'SANJH' : 'VD'}]`
+    `• ${i.codigo} — ${i.descripcion || ''} (${i.cajas} cajas / ${i.unidades} uds) $${Number(i.precio).toFixed(2)}`
```

#### Render — reemplazar sección Cliente, eliminar Tipo documento y A quién va

Sección Cliente (usa `prenota.cliente_nombre` del JOIN en GET):
```diff
-        {prenota?.nombre_cliente ? (
+        {(prenota?.nombre_cliente || prenota?.cliente_nombre) ? (
           <div className="flex items-center gap-3">
-            <div className="font-medium">Cliente: {prenota.nombre_cliente}</div>
+            <div className="font-medium">Cliente: {prenota.nombre_cliente || prenota.cliente_nombre}</div>
             <button onClick={quitarCliente} className="text-sm text-red-500 hover:text-red-700">✕</button>
           </div>
         ) : (
           <>
             <div className="relative max-w-md">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
               <Input
                 placeholder="Buscar cliente..."
-                value={searchCliente}
-                onChange={e => setSearchCliente(e.target.value)}
+                value={clienteQuery}
+                onChange={e => setClienteQuery(e.target.value)}
                 className="pl-9"
               />
             </div>
+            {clientesLoading && <p className="text-xs text-zinc-400">Buscando...</p>}
             {clienteResults.length > 0 && (
               <div className="flex flex-col gap-2">
                 {clienteResults.map(c => (
                   <button
-                    key={c.kcodclie}
+                    key={c.id}
                     onClick={() => asignarCliente(c)}
                     className="text-left p-3 rounded-lg border border-border hover:bg-zinc-50 dark:hover:bg-zinc-800"
                   >
-                    {c.nombress}
+                    <span className="font-medium">{c.nombre}</span>
+                    {c.telefono && <span className="text-zinc-400 ml-2">{c.telefono}</span>}
                   </button>
                 ))}
               </div>
             )}
           </>
         )}
```

Eliminar completamente:
- Bloque "Tipo de documento" (`<select>` con Traspaso/SRF/etc.)
- Bloque "A quién va el documento" (searchClienteFactura + quitarClienteFactura)

#### Items table — eliminar warning saldo_zofri

```diff
                   <div className="font-medium">{item.descripcion}</div>
-                  {Number(item.unidades) > Number(item.saldo_zofri ?? 0) && (
-                    <div className="text-xs text-red-500 mt-1">⚠ Supera stock disponible</div>
-                  )}
                 </td>
```

> Nota: los badges `SANJH`/`VIDA DIGITAL` en la columna Empresa y la separación por `empresa_id` en exports quedan **FUERA de scope** — deuda de arquitectura PRD §9.3.1, slice futuro.

---

### Archivo 3: `app/api/notas-venta/route.ts`

#### POST — eliminar campos Zofri del INSERT

```diff
   let body: any = {};
   try { body = await request.json(); } catch { body = {}; }

-  const tipo_documento = body?.tipo_documento;
-  const kcodclie_factura = body?.kcodclie_factura;
-  const nombre_cliente_factura = body?.nombre_cliente_factura;
   const cliente_id = body?.cliente_id ? parseInt(body.cliente_id, 10) || null : null;

   const usuarioId = getUsuarioId(session);
   ...
   const rows = await sql`
-    INSERT INTO public.prenotas (titulo, titulo_base, usuario_id, tipo_documento, kcodclie_factura, nombre_cliente_factura, cliente_id)
-    VALUES (${titulo}, ${titulo}, ${usuarioId}, ${tipo_documento ?? null}, ${kcodclie_factura ?? null}, ${nombre_cliente_factura ?? null}, ${cliente_id})
+    INSERT INTO public.prenotas (titulo, titulo_base, usuario_id, cliente_id)
+    VALUES (${titulo}, ${titulo}, ${usuarioId}, ${cliente_id})
     RETURNING *
   `;
```

> Las columnas `tipo_documento`, `kcodclie_factura`, `nombre_cliente_factura` quedan en la tabla (no se dropean). Simplemente se deja de escribir en ellas. Si existen filas legacy con datos, se preservan.

---

## Fuera de scope (explícito)

| Ítem | Motivo |
|------|--------|
| `empresa_id` / badges SANJH/VIDA DIGITAL en items | Deuda PRD §9.3.1 — toca Productos, Precios, Catálogo, Kardex. Slice futuro. |
| Separación de hojas Excel por empresa | Misma deuda. |
| `saldo_zofri` en la columna de DB | Columna legacy de Vida Digital. No se dropea en este slice. |
| Dropear columnas `tipo_documento`, `kcodclie_factura`, `nombre_cliente_factura` de la DB | Migración separada cuando se confirme que Caja Mayor no las referencia. |

---

## Criterio de éxito

```
npx tsc --noEmit    # 0 errores nuevos
npm run test        # sin regresiones (mismas 10 FAIL pre-existentes)
```

La UI de detalle debe:
1. Buscar clientes en `/api/clientes?q=` (no en `/api/ventas/clientes?empresaSlug=vida`)
2. Asignar/quitar cliente vía `PATCH { cliente_id }` (no `kcodclie`/`nombre_cliente`)
3. No mostrar tipo de documento ni "A quién va el documento"
4. No mostrar warning "Supera stock disponible"
5. Exportar Excel con una sola hoja (no separada SANJH/VIDA DIGITAL)
6. Exportar PDF con header "Bazar Naty" (no "VidaDigital")

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Archivos tocados | 3 |
| Líneas netas | ≈ −120 (más eliminación que adición) |
| Riesgo de regresión | Bajo — APIs de Caja Mayor no se tocan, `cliente_id` ya existe y se usa |
| Patrón de referencia | `AgregarANotaVentaModal.tsx` — misma búsqueda, mismo endpoint, misma forma de guardar `cliente_id` |
