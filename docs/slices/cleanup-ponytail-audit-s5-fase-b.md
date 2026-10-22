# Slice: Limpieza post-audit S5 — Ponytail Audit Señal 2

## Fase B — Análisis de riesgos

**Fecha:** 2026-07-05

---

## 1. Riesgos que NO aplican (decisión consciente, no omisión)

El protocolo PBT-IA Fase B exige analizar 7 categorías de riesgo para cada slice.
Para este slice de eliminación pura, ninguna aplica. Se documenta cada una
explícitamente:

### 1.1 Renderizado condicional / UI flickering

**No aplica.** No se modifica ningún JSX, componente, página o ruta de UI. Los 5
archivos eliminados (`button.tsx`, `tabs.tsx`, `useNumericInput.ts`, `useNumericInput.test.ts`,
`diag.txt`) no son importados por ningún componente visible. El usuario no puede
percibir su ausencia.

### 1.2 INSERT / UPDATE / DELETE en base de datos

**No aplica.** No se toca ninguna ruta API, query SQL, migración, seed, ni schema.
Las eliminaciones son exclusivamente de archivos del sistema de archivos.

### 1.3 JOIN o integridad referencial entre tablas

**No aplica.** Sin cambios en queries, schema, o migraciones.

### 1.4 API externa / network failure

**No aplica.** No se agregan ni eliminan llamadas a APIs externas. `lib/cloudinary.ts`
mantiene `uploadImage()` (el único export consumido, por 3 archivos). El wrapper
`getCloudinary()` que se elimina solo llamaba a `cloudinary.config()` — una
operación de configuración local, no de red.

### 1.5 Async / condiciones de carrera / concurrencia

**No aplica.** Sin cambios en lógica asincrónica. `calcDiff()` y `generateSlug()`
son funciones síncronas puras (aritmética y manipulación de strings) sin consumidores.

### 1.6 Variables de entorno

**No aplica.** `getCloudinary()` leía `process.env.CLOUDINARY_*` — la nueva
configuración a nivel módulo lee exactamente las mismas variables, en el mismo
orden, con los mismos defaults. Sin cambio de comportamiento.

### 1.7 Estado compartido / Context / Store

**No aplica.** `useNumericInput` es un hook local sin consumidores.
`AlertasContext` no se toca.

---

## 2. El "test que intenta romper" para este slice

En un slice de eliminación pura sin riesgos de los tipos usuales, el "test que
intenta romper" es la **comparación exacta de la suite completa antes/después**:

- La suite de tests DEBE producir exactamente las mismas 10 suites fallando
  (FAIL) y los mismos 7 tests fallando (FAIL) que en el baseline.
- `npx tsc --noEmit` DEBE producir el mismo conjunto de errores pre-existentes
  que en el baseline, con una excepción: los 3 errores de
  `hooks/useNumericInput.test.ts` (TS2554) DEBEN desaparecer porque el archivo
  se elimina.
- Los 3 errores TS2554 en `hooks/useNumericInput.test.ts` están documentados
  en `_evidencia/alertas-stock-ui-tsc.txt` y `_evidencia/notas-venta-tsc.txt`
  — su desaparición es esperada y correcta.

Si la suite muestra **más** de 10 FAIL, o **más** de 7 tests fallando, o si
`tsc --noEmit` muestra **nuevos** errores (fuera de la desaparición documentada
de TS2554 en useNumericInput), el slice introdujo una regresión y debe
revertirse.

### Baseline pre-cleanup (capturado 2026-07-05)

```
Jest:  Test Suites: 10 failed, 83 passed, 93 total
       Tests:       7 failed, 628 passed, 635 total
tsc:   87 líneas de errores (todos pre-existentes)
       Incluye 3 errores TS2554 en hooks/useNumericInput.test.ts
```

**Nota:** `hooks/useNumericInput.test.ts` NO aparece en la suite de Jest (el
directorio `hooks/` no está en los patrones de testMatch). Su eliminación no
afecta el conteo de tests. Los 3 errores TS2554 en tsc SÍ desaparecerán,
lo cual es esperado y correcto.

### Baseline esperado post-cleanup

```
Jest:  Test Suites: 10 failed, 83 passed, 93 total  (sin cambios)
       Tests:       7 failed, 628 passed, 635 total  (sin cambios)
tsc:   84 líneas de errores (-3 TS2554 de useNumericInput.test.ts eliminado)
       0 errores nuevos
```

---

## 3. Riesgos específicos de eliminación de archivos

### 3.1 Import fantasma desde un tercer archivo no detectado por grep

**Riesgo:** un archivo importa `@/hooks/useNumericInput` con una sintaxis que
el grep no capturó (dynamic import, `require()`, string template, alias de path).

**Mitigación:** `tsc --noEmit` y `jest` detectarían cualquier import roto.
Si un archivo importa un módulo eliminado, TypeScript falla en compilación y
Jest falla en resolución de módulos. El baseline post-cleanup lo confirmará.

**Probabilidad:** baja. Los grep se corrieron con patrones que cubren tanto
imports estáticos (`from '...'`) como patrones de path con y sin alias `@/`.
No se usan imports dinámicos en este proyecto para hooks o componentes UI.

### 3.2 Smoke test que lee el archivo eliminado con `fs.readFileSync`

**Riesgo:** un smoke test lee el contenido de un archivo eliminado y falla
porque `fs.readFileSync` lanza `ENOENT`.

**Mitigación:** se verificó con grep que ningún smoke test referencia los
archivos a eliminar (`button.tsx`, `tabs.tsx`, `useNumericInput`, `calcDiff`,
`generateSlug`, `deleteImage`, `diag.txt`). 0 matches.

**Probabilidad:** descartada por grep.

### 3.3 package-lock.json desincronizado

**Riesgo:** al mover `shadcn` de `dependencies` a `devDependencies` en
`package.json`, el `package-lock.json` queda desactualizado.

**Mitigación:** ejecutar `npm install` después del cambio manual para regenerar
el lockfile. Si CI usa `npm ci`, el lockfile debe estar sincronizado.

**Probabilidad:** mitigada con `npm install` post-cambio.

---

## 4. Criterio de salida de Fase B

- [x] 7 categorías de riesgo analizadas — ninguna aplica (documentado en §1)
- [x] Estrategia de "test que rompe" definida (§2): diff exacto de suite antes/después
- [x] Baseline pre-cleanup capturado (`_evidencia/cleanup-s5-*.txt`)
- [x] Riesgos específicos de eliminación analizados (§3)

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Riesgos de los 7 tipos | 0 (todos documentados como no aplicables) |
| Riesgos específicos de eliminación | 3 (todos mitigados o descartados) |
| Estrategia de verificación | Diff exacto de suite completa antes/después |
| Baseline | `_evidencia/cleanup-s5-baseline-antes.txt` + `cleanup-s5-tsc-antes.txt` |
