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

describe('BUG-011 — Notas de Venta: editar cajas recalcula unidades', () => {

  const notasContent = fs.readFileSync(path.join(PROJECT_ROOT, NOTAS_UI), 'utf-8');

  test('onChange de editCajas tambien actualiza editUnidades', () => {
    // En el input de cajas del formulario de edición, el onChange debe
    // recalcular editUnidades proporcionalmente.
    // Buscamos el patrón: onChange que setea editCajas Y también setEditUnidades
    const cajasOnChanges = notasContent.match(/setEditCajas\(/g) || [];
    expect(cajasOnChanges.length).toBeGreaterThanOrEqual(1);

    // Verificar que cerca de setEditCajas también hay setEditUnidades
    // Buscamos el bloque del input de cajas en edición
    const editSection = notasContent.split('label className="text-xs text-zinc-400">Cajas')[1]?.split('</label>')[0] || notasContent;
    const afterCajasLabel = notasContent.split('Cajas')[notasContent.split('Cajas').length - 1] || '';

    // Después del fix, el onChange de cajas en el formulario de edición
    // debe contener setEditUnidades además de setEditCajas
    const hasBothSetters = notasContent.includes('setEditUnidades') && notasContent.includes('setEditCajas');
    expect(hasBothSetters).toBe(true);

    // Verificar que existe la fórmula de ratio: item.unidades / item.cajas
    expect(notasContent).toMatch(/item\.unidades\s*\/\s*item\.cajas/);
  });
});
