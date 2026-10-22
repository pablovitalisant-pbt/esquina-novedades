# Slice: Config de caja — limpieza post-Verificación (PRD §3 fila 7)

## Fase A — Contrato

**Fecha:** 2026-07-05

---

## Revisión de impacto lateral (obligatorio)

### `formatMonto()` en `caja-mayor.spec.ts`

`formatMonto()` es importado por `caja-config/client_page.tsx` (línea 24) y usado
en la UI de admin/caja-config para mostrar saldos. También es usado por
`caja-mayor/client_page.tsx` (1438 líneas) para formatear montos en la vista de
movimientos. Cambiar `es-CL` → `es-BO` afecta el formato visible de TODOS los
montos en ambas pantallas.

**Verificación empírica (Node del proyecto, 2026-07-05):**

| | `es-CL` | `es-BO` |
|---|---------|---------|
| ARS (sin decimales) | `1.234.567` | `1.234.567` |
| USD (2 decimales) | `1.234,5` | `1.234,5` |
| Date (`toLocaleString`) | `05-07-2026, 7:37:41 a. m.` | `5/7/2026, 7:39:59 a. m.` |

- **Números:** idénticos entre `es-CL` y `es-BO` (punto de miles, coma decimal).
- **Fecha:** SÍ hay diferencia visible (guiones vs barras en `es-CL`, formato
  distinto de AM/PM). La línea 369 de `client_page.tsx` muestra el timestamp de
  "Última actualización" — el formato cambia visiblemente. Es una corrección
  intencional (el locale debe reflejar Bolivia, donde está el negocio), no una
  regresión.

**Decisión:** `es-BO` sobre `es-AR`. El negocio está en Bermejo, Bolivia — usan
ARS por comercio fronterizo, pero los usuarios son bolivianos y el locale debe
representar la convención regional del usuario. `es-BO` es el locale semánticamente
correcto. Verificado que Node.js en este proyecto soporta `es-BO` (incluido en ICU).

**Conclusión:** cambio seguro. Números sin cambio visual. Fecha con cambio visible
pero correcto (formato boliviano). Sin regresión funcional.

### Ruta `/api/caja/dolar-observado`

La ruta fue eliminada en Slice 2. El botón "Dólar observado" en `client_page.tsx`
llama a un endpoint que no existe → siempre falla con error toast. Eliminar el
botón no afecta ninguna otra funcionalidad: el tipo de cambio se ingresa
manualmente (el input numérico y el botón "Guardar" son independientes del botón
eliminado).

### `RefreshCw` en imports

`RefreshCw` solo se usa en el botón "Dólar observado" (línea 346). Al eliminar
ese botón, el import queda huérfano. Se elimina del import de lucide-react.

---

## Archivos del slice

| # | Archivo | Tipo | Δ líneas | Descripción |
|---|---------|------|----------|-------------|
| 1 | `app/(app)/admin/caja-config/client_page.tsx` | EDIT | ≈ -30 | Eliminar botón "Dólar observado" + estado `dolarObsLoading`/`dolarObsMeta` + función `handleObtenerDolarObservado` + párrafo `dolarObsMeta`. `es-CL` → `es-BO` en línea 369. `RefreshCw` del import. |
| 2 | `docs/specs/caja-mayor.spec.ts` | EDIT | ≈ 5 | `es-CL` → `es-BO` en `formatMonto()` (líneas 109, 112). Corregir comentarios: "monto_clp" → "monto_ars" (línea 93), "formato chileno" → "formato boliviano" (línea 101). Corregir comentario stale de `kcodcli2` (líneas 120-122). |

**Total: ≈ -30 líneas netas. Sin sub-slices.**

---

## Diff propuesto

### Archivo 1: `caja-config/client_page.tsx`

```diff
-  const [dolarObsLoading, setDolarObsLoading] = useState(false);
-  const [dolarObsMeta, setDolarObsMeta] = useState<{
-    fecha: string;
-    fuente: string;
-  } | null>(null);

-  const handleObtenerDolarObservado = async () => {
-    setDolarObsLoading(true);
-    setDolarObsMeta(null);
-    try {
-      const res = await fetch("/api/caja/dolar-observado");
-      if (res.ok) {
-        const json = await res.json();
-        setDolarDia(String(json.data.valor));
-        setDolarObsMeta({ fecha: json.data.fecha, fuente: json.data.fuente });
-        toast.success(`Dólar observado: $${json.data.valor}`);
-      } else {
-        const err = await res.json();
-        toast.error(err.error || "Error al obtener dólar observado");
-      }
-    } catch {
-      toast.error("Error al obtener el tipo de cambio");
-    }
-    setDolarObsLoading(false);
-  };
```

```diff
-              <Button
-                variant="outline"
-                size="sm"
-                onClick={handleObtenerDolarObservado}
-                disabled={dolarObsLoading}
-                className="whitespace-nowrap"
-              >
-                {dolarObsLoading ? (
-                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
-                ) : (
-                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
-                )}
-                Dólar observado
-              </Button>
```

```diff
-        {dolarObsMeta && (
-          <p className="text-xs text-blue-700 dark:text-blue-300">
-            Valor de referencia · Tasa manual · {dolarObsMeta.fecha}
-          </p>
-        )}
```

```diff
-            {new Date(dolarInfo.updated_at).toLocaleString("es-CL")} por{" "}
+            {new Date(dolarInfo.updated_at).toLocaleString("es-BO")} por{" "}
```

```diff
-import { Pencil, Plus, Save, Loader2, Trash2, RefreshCw } from "lucide-react";
+import { Pencil, Plus, Save, Loader2, Trash2 } from "lucide-react";
```

### Archivo 2: `docs/specs/caja-mayor.spec.ts`

```diff
- * ROUNDUP(monto_clp / dolar_dia, 0.5)
+ * ROUNDUP(monto_ars / dolar_dia, 0.5)
```

```diff
- * Formatea un monto en formato chileno.
+ * Formatea un monto en formato boliviano.
```

```diff
-    return n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
+    return n.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
```

```diff
-  return n.toLocaleString("es-CL", {
+  return n.toLocaleString("es-BO", {
```

```diff
-// ponytail: Slice 13 — kcodcli2 y empresa removidos del schema Zod,
-// pero la DB y la API aún retornan estos campos. Se declaran como opcionales
-// para que el cliente no rompa al leerlos (BUG-004).
+// kcodcli2 y empresa están presentes en los schemas Zod (CajaMovimientoCreateSchema,
+// CajaMovimientoUpdateSchema) porque la DB y la API los retornan y el POST/PUT los
+// necesita (BUG-004, BUG-006). Se declaran como opcionales para compatibilidad.
```

---

## Fuera de scope

| Ítem | Motivo |
|------|--------|
| BUG-008 (`cliente_id` vs `kcodcli2` en caja-mayor) | Registrado en BUGS.md. Toca archivos de caja-mayor, no caja-config. Slice separado. |
| `caja-mayor.spec.ts` sin tests (H5) | Es un archivo de tipos y utilidades, no de tests. No le corresponden tests. Si molesta en la suite, se excluye en jest.config — tarea de housekeeping futuro. |
| Refactor del archivo de 628 líneas | PRD §9.11 item deuda técnica. Requiere slice dedicado. |
| `formatMonto()` en `docs/specs/` | Moverlo a `lib/utils.ts` es deuda PRD §9.11 item 9.24. No se toca ahora. |
| `Loader2` en imports | Se usa en 4 lugares más (loading states de Guardar, saldos, cuentas). Se mantiene. |

---

## Criterio de éxito

```
npx tsc --noEmit    # 0 errores nuevos
npm run test        # 26/26 tests caja pasan, sin regresiones
```

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Archivos | 2 |
| Líneas netas | ≈ -30 (eliminación > adición) |
| Riesgo de regresión | Nulo — código muerto eliminado (botón roto). Fecha con cambio visual intencional (formato boliviano correcto), números sin cambio. |
