# BUG-004 — Fase A: Contrato

**Fecha:** 2026-07-04
**Archivo:** `app/(app)/caja-mayor/client_page.tsx` (único archivo)
**Causa raíz:** commit `319075f` (Slice 13 follow-up) reemplazó expresiones de código reales por strings literales `"Bazar Naty"` al intentar limpiar la UI de multi-empresa, rompiendo sintaxis JSX en 3 lugares e introduciendo referencias a campos inexistentes (`_legacy`, `.true`, `."Bazar Naty"`, `empresas`, `LABELS`).

---

## Revisión de impacto lateral

- **`_legacy`**, **`cliente.true`**, **`cliente."Bazar Naty"`**: no existen en ningún otro archivo del proyecto.
- **`ClienteOption`**: definida y usada exclusivamente en `client_page.tsx`.
- **`LABELS`**: no definida en ningún archivo del proyecto.
- **`docs/specs/caja-mayor.spec.ts` línea 53**: ya documenta `empresa removido` desde Slice 13 — el spec ya es single-tenant.
- **API routes** (`app/api/caja/movimientos/`, `app/api/caja/export/`): el campo `empresa` se envía en query params para filtros y en el body de POST/PATCH. El Zod schema lo ignora (strip por defecto). No se tocan en este slice — limpiar el payload de `empresa` es deuda separada.
- **Ningún otro archivo requiere cambios.** El impacto está 100% contenido en `client_page.tsx`.

---

## Archivos del slice

| # | Archivo | Tipo | Descripción |
|---|---------|------|-------------|
| 1 | `app/(app)/caja-mayor/client_page.tsx` | EDIT | Eliminar código multi-empresa roto, 14 errores TS → 0 |

---

## Diff propuesto por sitio

### Sitio 1 — Líneas 232-243: Eliminar `useEffect` roto

El bloque completo es sintácticamente inválido (`cliente.true`, `cliente."Bazar Naty"`). En single-tenant, `empresa` se setea solo desde `selectNota` (vía `n.origen`), no necesita auto-detección.

```diff
-  // Auto-select empresa when client has only one
-  useEffect(() => {
-    if (cliente) {
-      if (cliente.true) {
-        setEmpresa(cliente."Bazar Naty");
-      } else {
-        setEmpresa("");
-      }
-    } else {
-      setEmpresa("");
-    }
-  }, [cliente]);
-
   // Auto-select first available cuenta when moneda changes
```

### Sitio 2 — Línea 264: Remover `empresa` de `ClienteOption` en `selectNota`

`empresa` no existe en la interfaz `ClienteOption`. El valor no se lee en ningún lado (la card de nota usa string literal `{"Bazar Naty"}` en línea 726).

```diff
     const clienteOpt: ClienteOption = {
       cliente_id: n.cliente_id,
       nombre: n.nombre_cliente,
-      empresa: "Bazar Naty",
       total_compras: 0,
       ultima_compra: "",
     };
```

### Sitio 3 — Línea 331: Remover `empresas` de `setEditCliente` en `openEditModal`

`empresas` no existe en `ClienteOption`.

```diff
-    if (mov.cliente_id) {
-      setEditCliente({ cliente_id: mov.cliente_id, nombre: mov.nombre_cliente || "", empresas: mov.empresa ? [mov.empresa as "bazar-naty"] : [], total_compras: 0, ultima_compra: "" });
+    if (mov.cliente_id) {
+      setEditCliente({ cliente_id: mov.cliente_id, nombre: mov.nombre_cliente || "", total_compras: 0, ultima_compra: "" });
```

### Sitio 4 — Línea 739: Reemplazar `cliente._legacy.map(...)` por literal

`_legacy` no existe en `ClienteOption`. Single-tenant → "Bazar Naty" fijo.

```diff
                     <div className="text-xs text-zinc-500">
-                      {cliente._legacy.map((e) => "Bazar Naty").join(" + ")} · {cliente.total_compras} compras · última {cliente.ultima_compra}
+                      Bazar Naty · {cliente.total_compras} compras · última {cliente.ultima_compra}
                     </div>
```

### Sitio 5 — Líneas 777-781: Reparar JSX roto en badge de búsqueda

El `.map()` sobre `empresas` fue reemplazado por texto literal que rompió la sintaxis JSX (`r.<span>Bazar Naty<`). Reemplazar por un solo `<Badge>` estático.

```diff
                           <div className="text-xs text-zinc-500 flex items-center gap-1 ml-7">
-                            {r.<span>Bazar Naty<
-                              <Badge key={e} variant="outline" className="text-[10px] px-1 py-0">
-                                {"Bazar Naty"}
-                              </Badge>
-                            ))}
+                            <Badge variant="outline" className="text-[10px] px-1 py-0">
+                              Bazar Naty
+                            </Badge>
                             <span>· {r.cliente.total_compras} compras · {r.cliente.ultima_compra}</span>
```

### Sitio 6 — Línea 841: Reemplazar `LABELS[empresa]` (indefinido)

`LABELS` no existe. Single-tenant → simplificar el mensaje.

```diff
-                  <p className="text-sm text-zinc-400 italic">No hay notas pendientes para este cliente{empresa ? " en " + LABELS[empresa] : ""}.</p>
+                  <p className="text-sm text-zinc-400 italic">No hay notas pendientes para este cliente.</p>
```

### Sitio 7 — Línea 868: Simplificar ternario de empresa en preview de imputación

```diff
-                      <>Se imputarán <strong>${formatMonto(montoUSD, "USD")} USD</strong> a la nota #{notaSeleccionada.id} ({notaSeleccionada.empresa === "bazar-naty" ? "Vida Digital" : "SANJH"}).</>
+                      <>Se imputarán <strong>${formatMonto(montoUSD, "USD")} USD</strong> a la nota #{notaSeleccionada.id} (Bazar Naty).</>
```

### Sitio 8 — Líneas 882-897: Eliminar bloque selector de empresa

La condición `cliente._legacy.length === 2` nunca es `true` (campo inexistente). El JSX interno está roto (`<span>Bazar Naty<`). Bloque muerto.

```diff
-        {/* ─── Empresa ──────────────────────────────── */}
-        {cliente && cliente._legacy.length === 2 && (
-          <div className="space-y-1">
-            <label className="text-sm font-medium">Empresa</label>
-            <select
-              value={empresa}
-              onChange={(e) => setEmpresa(e.target.value as "bazar-naty")}
-              className="w-full h-9 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-900"
-            >
-              <option value="">Seleccionar empresa</option>
-              {<span>Bazar Naty<
-                <option key={e} value={e}>{"Bazar Naty"}</option>
-              ))}
-            </select>
-          </div>
-        )}
```

### Sitio 9 — Línea 610: Reparar ternario de `"Org."` en export Excel

Ambas ramas comparan contra `"bazar-naty"` — la segunda nunca se alcanza. Simplificar.

```diff
-            "Org.": m.empresa === "bazar-naty" ? "Vida Digital" : m.empresa === "bazar-naty" ? "SANJH" : "",
+            "Org.": m.empresa ? "Bazar Naty" : "",
```

### Sitio 10 — Líneas 1039-1041: Eliminar filtro de empresa (dropdown con valores duplicados)

Ambos `<option>` tienen `value="bazar-naty"` con distintos labels — no filtra nada útil.

```diff
-              <select value={filtros.empresa} onChange={(e) => setFiltros((f) => ({ ...f, empresa: e.target.value }))} className="h-8 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-900">
-                <option value="">Todas empresas</option><option value="bazar-naty">Vida Digital</option><option value="bazar-naty">SANJH</option>
-              </select>
```

*Nota: `filtros.empresa` se mantiene en el estado y en `fetchMovimientos` (línea 134) porque la API aún lo acepta como query param. Solo se elimina el control de UI.*

### Sitio 11 — Línea 1186: Simplificar badge de empresa en tabla de movimientos

```diff
-                          {item.data.empresa ? <Badge variant="outline" className="text-[10px] px-1 py-0">{item.data.empresa === "bazar-naty" ? "VD" : "SJ"}</Badge> : "—"}
+                          {item.data.empresa ? <Badge variant="outline" className="text-[10px] px-1 py-0">BN</Badge> : "—"}
```

### Sitio 12 — Línea 1310: Simplificar badge de origen en tabla de notas del cliente

```diff
-                                {n.origen === "bazar-naty" ? "VD" : "SJ"}
+                                BN
```

### Sitio 13 — Líneas 1416-1418: Reparar select de empresa en modal de edición

Ambos `<option>` tienen `value="bazar-naty"`. Unificar.

```diff
               <select value={editEmpresa} onChange={(e) => setEditEmpresa(e.target.value as "bazar-naty" | "")} className="w-full h-9 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 text-sm">
-                <option value="">—</option><option value="bazar-naty">Vida Digital</option><option value="bazar-naty">SANJH</option>
+                <option value="">—</option><option value="bazar-naty">Bazar Naty</option>
               </select>
```

---

## Criterio de éxito

```
npx tsc --noEmit   # 0 errores en caja-mayor/client_page.tsx (hoy: 14)
npm run test       # sin regresiones nuevas
```

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Archivos tocados | 1 |
| Sitios de cambio | 13 |
| Líneas netas | ≈ −25 (más eliminación que adición) |
| Errores TS resueltos | 14 → 0 |
| Riesgo de regresión | Bajo — solo se elimina código muerto/roto, sin cambios de lógica |
