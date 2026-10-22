# Slice: Limpieza post-audit S5 — Ponytail Audit Señal 2

## Fase A — Contrato

**Fecha:** 2026-07-05

---

## Revisión de impacto lateral (obligatorio)

Los 7 ítems a eliminar no tienen consumidores activos (verificado con grep real abajo).
Ningún archivo de producción, ruta API, componente o test importa o referencia estos
símbolos/archivos. La eliminación es segura: si el build pasa y los tests pasan, no
hay riesgo de regresión en runtime.

**Conclusión:** sin impacto lateral. Cero archivos existentes necesitan cambios
(excepto los propios archivos editados en sub-slice B).

---

## Sub-slice A: Archivos completos a eliminar

| # | Archivo | Líneas | Evidencia grep |
|---|---------|--------|----------------|
| A1 | `hooks/useNumericInput.ts` | 27 | Solo su propio test lo importa. 0 imports en `app/`, `components/`, `lib/` |
| A2 | `hooks/useNumericInput.test.ts` | 37 | Sin el hook, el test pierde su sujeto |
| A3 | `components/button.tsx` | 61 | 0 imports en todo el proyecto. Duplicado huérfano de `components/ui/button.tsx` |
| A4 | `components/ui/tabs.tsx` | 83 | 0 imports en todo el proyecto. 4 exports sin consumidores |
| A5 | `diag.txt` | 2466 | 0 referencias en código fuente, config, o build. Dump de diagnóstico |

**Sub-total: ≈ 2,674 líneas eliminadas**

---

## Sub-slice B: Líneas sueltas en archivos que se mantienen

| # | Archivo | Δ | Qué se elimina | Evidencia grep |
|---|---------|---|----------------|----------------|
| B1 | `lib/utils.ts` | -12 | `calcDiff()` (líneas 26-29) + `generateSlug()` (líneas 31-40) | 0 imports de `calcDiff` ni `generateSlug` en todo el proyecto |
| B2 | `lib/cloudinary.ts` | -6 | `deleteImage()` (líneas 28-30) + `export default cloudinary` (línea 12) + wrapper `getCloudinary()` (líneas 3-9, config se mueve a nivel módulo) | 0 imports de `deleteImage`, 0 imports del default. `uploadImage` se mantiene (3 consumidores) |
| B3 | `package.json` | ±0 | `"shadcn"` de `dependencies` → `devDependencies` | 0 imports de `shadcn` en source code. Es CLI tool, no runtime |

**Sub-total: ≈ -18 líneas**

---

## Total: ≈ -2,692 líneas, -0 deps runtime

---

## Fuera de scope

| Ítem | Motivo |
|------|--------|
| `__tests__/bodega-client_page.test.tsx` | **Falso positivo del audit.** No es duplicado: prueba search/filter (3 tests), el co-ubicado `app/(app)/bodega/client_page.test.tsx` prueba sync (10 tests). Ambos corren en Jest |
| `hooks/useEmpresaId.ts` | Diferido — PRD §9.11 item 9.17 |
| `PasoProductoDeseado.tsx` | Diferido — PRD §9.11 item 9.18 |
| `ProductDrawer.tsx` DISABLED_V2 | Diferido — PRD §9.11 item 9.19 |
| `CrearCatalogoDialog.tsx` campo hidden | Diferido — PRD §9.11 item 9.20 |
| `spell-checker.tsx` → native `spellcheck` | Diferido — PRD §9.11 item 9.21 |
| `TopNav.tsx` + `BottomNav.tsx` config compartida | Diferido — PRD §9.11 item 9.22 |
| `RouteContext` duplicado 7× | Diferido — PRD §9.11 item 9.23 |
| Tipos duplicados (`Cuenta`, `Producto`, `Despacho`) | Diferido — PRD §9.11 item 9.24 |
| `sharp` en dependencies | Smoke test `slice5-deps-smoke.test.ts` lo verifica explícitamente como "kept" (Next.js image optimization) |
| Archivos grandes (caja-mayor, kardex, caja-config) | Requieren slice de refactor dedicado, no limpieza trivial |

---

## Criterio de éxito

```
npx tsc --noEmit    # 0 errores nuevos (useNumericInput.test.ts ya era error preexistente)
npm run test        # mismas 10 FAIL pre-existentes, sin nuevas fallas
```

---

## Verificación grep (evidencia)

### A1/A2 — useNumericInput
```
$ grep -rn "useNumericInput" --glob="*.{ts,tsx}" app/ components/ lib/
  (0 resultados fuera de hooks/useNumericInput.ts y su propio .test.ts)
```

### A3 — components/button.tsx
```
$ grep -rn "components/button\|@/components/button" --glob="*.{ts,tsx}"
  (0 resultados)
```

### A4 — components/ui/tabs.tsx
```
$ grep -rn "components/ui/tabs\|@/components/ui/tabs" --glob="*.{ts,tsx}"
  (0 resultados)
```

### A5 — diag.txt
```
$ grep -rn "diag\.txt" --glob="*.{ts,tsx,js,json,mjs,md}"
  (0 resultados en código fuente; solo aparece en git status de _evidencia/)
```

### B1 — calcDiff + generateSlug
```
$ grep -rn "calcDiff" --glob="*.{ts,tsx}"
  lib/utils.ts:26:export function calcDiff(...)
  (0 resultados en app/, components/, __tests__/)

$ grep -rn "generateSlug" --glob="*.{ts,tsx}"
  lib/utils.ts:31:export function generateSlug(...)
  (0 resultados en app/, components/, __tests__/)
```

### B2 — deleteImage + export default cloudinary
```
$ grep -rn "deleteImage" --glob="*.{ts,tsx}"
  lib/cloudinary.ts:28:export async function deleteImage(...)
  (0 resultados en app/, components/, __tests__/)

$ grep -rn "import cloudinary\|require.*cloudinary" --glob="*.{ts,tsx,js}"
  (0 resultados — nadie importa el default export)
```

### B3 — shadcn
```
$ grep -rn '"shadcn"' --glob="*.{ts,tsx,js,mjs}"
  package.json:32:    "shadcn": "^4.0.8",
  (0 resultados en app/, components/, lib/)
```

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Archivos eliminados | 5 |
| Archivos editados | 3 |
| Líneas netas | ≈ -2,692 |
| Riesgo de regresión | Nulo — todos los símbolos eliminados tienen 0 consumidores |
