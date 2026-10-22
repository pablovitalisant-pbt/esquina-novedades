# Slice: Usuarios — single-tenant + RUT → Documento de identidad

## Fase A — Contrato

**Fecha:** 2026-07-04

---

## Revisión de impacto lateral (obligatorio)

### `usuario_empresa` en el proyecto

La tabla `usuario_empresa` y `session.user.empresas` son usadas por 7 rutas de API como
check de autorización (`user.empresas.includes(empresaId)`):

| Archivo | Línea | Uso |
|---------|-------|-----|
| `lib/auth.ts` | 36 | NextAuth session callback: `SELECT empresa_id FROM usuario_empresa WHERE usuario_id = ...` → populates `session.user.empresas` |
| `inventario/route.ts` | 19 | `user.empresas.includes(parseInt(empresaId, 10))` |
| `inventario/bulk-save/route.ts` | 21 | `user.empresas.includes(parseInt(empresaId, 10))` |
| `productos/route.ts` | 21 | `const empresaIds = (session.user as any).empresas \|\| []` |
| `productos/[id]/route.ts` | 47 | `user.empresas.includes(existing[0].empresa_id)` |
| `ubicaciones/route.ts` | 18 | `user.empresas.includes(parseInt(empresaId, 10))` |
| `ubicaciones/[id]/route.ts` | 23 | `user.empresas.includes(existing[0].empresa_id)` |
| `bodega/despachos/page.tsx` | 9 | `(session.user as any)?.empresas?.[0] ?? 1` |

**Decisión:** NO tocar `lib/auth.ts` ni las 7 rutas de autorización. La tabla
`usuario_empresa` se mantiene. El seed ya asigna empresa_id=1 a todos los usuarios.
La UI de Usuarios simplemente **deja de mostrar el selector y siempre envía
`empresas: [1]` al backend.** El comportamiento de autorización existente sigue
funcionando sin cambios — con una sola empresa, `empresas.includes(x)` siempre es
true para `x=1`.

### `formatRut` y columna `rut`

`formatRut` es usado en `client_page.tsx` (placeholder, formateo visual). La columna
DB `usuarios.rut` se mantiene con su nombre actual — solo cambia el label visible
en la UI a "Documento de identidad". Sin migración.

---

## Archivos del slice

| # | Archivo | Tipo | Líneas | Descripción |
|---|---------|------|--------|-------------|
| 1 | `app/(app)/admin/usuarios/client_page.tsx` | EDIT | ~-40 | Eliminar sección "Aplica a Empresas" (checklist SANJH/VIDA DIGITAL). Renombrar label RUT → "Documento de identidad", eliminar `formatRut()`, placeholder sin máscara chilena. Hardcodear `empresas: [1]` en creación y edición. |
| 2 | `app/api/admin/usuarios/route.ts` | EDIT | ~-3 | Eliminar validación `if (!empresas \|\| empresas.length === 0) return 400`. Siempre usar `empresas: [1]`. |
| 3 | `app/api/admin/usuarios/[id]/route.ts` | EDIT | ~-3 | Mismo hardcodeo. Eliminar validación de `empresas` del body. |

**Total: ~46 líneas eliminadas. Muy por debajo de 200. Sin sub-slices.**

---

## Diff propuesto

### Archivo 1: `client_page.tsx`

- Eliminar el bloque "Aplica a Empresas" completo (checklist con checkboxes SANJH/VIDA DIGITAL)
- Cambiar `formatRut` por texto libre sin formato: placeholder `"Ej: 12345678"`, sin máscara
- Cambiar label `"RUT"` → `"Documento de identidad"`
- En `handleCrear` y `handleActualizar`: `empresas: [1]` hardcodeado en vez de leer del estado `selectedEmpresas`
- Eliminar estado `selectedEmpresas` y `toggleEmpresa`

### Archivo 2: `route.ts` (POST)

```diff
-    const { rut, nombre, password, rol, empresas } = await request.json();
-    if (!rut || !nombre || !password || !empresas || empresas.length === 0) {
+    const { rut, nombre, password, rol } = await request.json();
+    if (!rut || !nombre || !password) {
       return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
     }
-    for (const empId of empresas) {
-       await sql`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (${userId}, ${empId})`;
-    }
+    await sql`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (${userId}, 1)`;
     return NextResponse.json({ data: { ...inserted[0], empresas: [1] } });
```

### Archivo 3: `[id]/route.ts` (PUT)

```diff
-    const { rut, nombre, password, rol, activo, empresas } = await request.json();
+    const { rut, nombre, password, rol, activo } = await request.json();
     // ... update user fields ...
-    if (empresas && Array.isArray(empresas)) {
-      await sql`DELETE FROM usuario_empresa WHERE usuario_id = ${uid}`;
-      for (const empId of empresas) {
-        await sql`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (${uid}, ${eid})`;
-      }
-    }
+    // Single tenant: siempre empresa_id = 1
+    await sql`DELETE FROM usuario_empresa WHERE usuario_id = ${uid}`;
+    await sql`INSERT INTO usuario_empresa (usuario_id, empresa_id) VALUES (${uid}, 1)`;
```

---

## Fuera de scope

| Ítem | Motivo |
|------|--------|
| `lib/auth.ts` session callback | Sigue consultando `usuario_empresa` — funciona con empresa_id=1 |
| 7 rutas con `user.empresas.includes()` | Sin cambios — con una sola empresa siempre pasan |
| Renombrar columna `usuarios.rut` | Sin migración — solo cambia label visible |
| Eliminar tabla `usuario_empresa` | La usan auth + 7 rutas; limpieza de schema es slice futuro |

---

## Criterio de éxito

```
npx tsc --noEmit    # 0 errores nuevos
npm run test        # sin regresiones
```

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Archivos | 3 |
| Líneas netas | ≈ -46 (más eliminación que adición) |
| Riesgo de regresión | Bajo — no se toca auth ni autorización |
