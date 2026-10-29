/**
 * Fase B — BUG-010 y BUG-011: Tests que fuerzan las condiciones.
 *
 * BUG-010: selectNota() → notaSeleccionada sobrevive al fetch de notasPendientes.
 *          Cambiar cliente → notaSeleccionada se limpia.
 * BUG-011: Cambiar editCajas → editUnidades se recalcula con el ratio.
 */

import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CAJA_UI = 'app/(app)/caja-mayor/client_page.tsx';
const NOTAS_UI = 'app/(app)/notas-venta/[id]/client_page.tsx';

describe('BUG-010 — Caja Mayor: notasPendientes no pisa notaSeleccionada', () => {

  const cajaContent = fs.readFileSync(path.join(PROJECT_ROOT, CAJA_UI), 'utf-8');

  test('NO hay setNotaSeleccionada(null) incondicional ANTES del fetch de notasPendientes', () => {
    // La línea 278 (ahora eliminada) tenía setNotaSeleccionada(null) entre
    // el cierre del if-guard y el fetch. Con el fix, entre el cierre del guard
    // y "setNotasPendientesLoading(true)" no debe haber setNotaSeleccionada(null).
    //
    // Verificamos buscando el patrón específico: después de "return;\n    }"
    // (fin del guard), antes del fetch, no hay setNotaSeleccionada(null).
    const afterGuardMatch = cajaContent.match(/return;\s*\}\s*(setNotaSeleccionada\s*\(\s*null\s*\))?\s*setNotasPendientesLoading/);
    // Si el grupo 1 existe → el reset incondicional todavía está ahí → FAIL
    const hasResetAfterGuard = afterGuardMatch && afterGuardMatch[1];
    expect(hasResetAfterGuard).toBeFalsy();
  });

  test('Existe validación de notaSeleccionada contra pendientes después del fetch', () => {
    // Después del fetch y setNotasPendientes, debe validar si la selección
    // actual sigue en la lista: pendientes.some(...)
    const afterSetPendientes = cajaContent.split('setNotasPendientes(pendientes);')[1]?.split('.finally')[0] || '';
    // Debe contener una validación que preserve notaSeleccionada si sigue en pendientes
    expect(afterSetPendientes).toMatch(/setNotaSeleccionada|pendientes\.some/);
  });
});

describe('BUG-011 — Notas de Venta: cantidad se edita directamente en unidades', () => {

  const notasContent = fs.readFileSync(path.join(PROJECT_ROOT, NOTAS_UI), 'utf-8');

  // Slice 3b: se eliminó la venta por caja. Ya no hay ratio cajas→unidades:
  // el vendedor edita unidades directamente (y elige detalle/mayor por línea).
  test('el formulario edita unidades directamente, sin cajas', () => {
    expect(notasContent).toContain('setEditUnidades');
    expect(notasContent).not.toContain('setEditCajas');
    expect(notasContent).not.toMatch(/item\.unidades\s*\/\s*item\.cajas/);
  });
});
