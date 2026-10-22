# Slice S1 — Seguridad: xlsx → exceljs

- Motivo: `xlsx` 0.18.5 con 2 vulnerabilidades altas (prototype pollution, ReDoS) sin versión corregida.
- Cambio: `exportarExcel` en `app/(app)/notas-venta/[id]/client_page.tsx` ahora usa `exceljs` (import dinámico, patrón de caja-mayor). Hojas `Info`/`Items`, mismas columnas, valores numéricos y nombre de archivo sin cambios.
- `xlsx` eliminado de `package.json` (pendiente: `npm install` del DT para el lockfile).
- Tests: `slice5cd-detalle-modalidad` (exceljs mockeado, verifica hojas y columnas; mock virtual de `xlsx` que lanza si se importa), `slice5-deps-smoke` (xlsx pasa a REMOVED_DEPS). Eliminados los mocks de `xlsx` en 6 tests que ya no lo necesitan.
- Fase B: rojo confirmado (2 fallos). Fase D: 16 suites / 120 tests verdes; `tsc --noEmit` sin errores nuevos fuera de tests.
